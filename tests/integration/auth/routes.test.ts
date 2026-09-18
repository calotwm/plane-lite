import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { db } from "@/../tests/db";
import { provisionUser } from "@/auth/password";
import { POST as login } from "@/app/api/auth/login/route";
import { __resetRateLimitForTesting } from "@/auth/loginRateLimiter";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import {
  SESSION_COOKIE_NAME,
  prismaSessionStore,
  sessionCookieOptions,
} from "@/auth/session";

function makeLoginRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeLogoutRequest(cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  return new Request("http://localhost/api/auth/logout", {
    method: "POST",
    headers,
  });
}

function makeMeRequest(cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  return new Request("http://localhost/api/auth/me", {
    method: "GET",
    headers,
  });
}

function readSetCookie(response: Response): {
  name: string;
  value: string;
  raw: string;
} | null {
  // `getSetCookie` exists in Node 20+; in older runtimes fall back to
  // the raw header (multiple Set-Cookie entries become a single
  // comma-joined string which we split crudely — sufficient for the
  // single-cookie case the routes emit).
  type MaybeGetSetCookie = Response & {
    getSetCookie?: () => string[];
  };
  const r = response as MaybeGetSetCookie;
  let all: string[] = [];
  if (typeof r.getSetCookie === "function") {
    all = r.getSetCookie();
  } else {
    const header = response.headers.get("set-cookie");
    if (header) all = [header];
  }
  for (const raw of all) {
    const eq = raw.indexOf("=");
    if (eq === -1) continue;
    const sem = raw.indexOf(";", eq);
    const value =
      sem === -1 ? raw.slice(eq + 1) : raw.slice(eq + 1, sem);
    return { name: raw.slice(0, eq), value, raw };
  }
  return null;
}

beforeEach(() => {
  // Reset the module-level rate limiter between tests so the 429 path
  // can be tested deterministically.
  __resetRateLimitForTesting();
});

// -- Login route ---------------------------------------------------------

describe("POST /api/auth/login", () => {
  it("issues an httpOnly, Lax, path=/ cookie on valid credentials", async () => {
    await provisionUser(db, {
      email: "alice@example.test",
      name: "Alice",
      password: "s3cret!",
      isAdmin: true,
    });

    const response = await login(
      makeLoginRequest({
        email: "alice@example.test",
        password: "s3cret!",
      }),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { user: { email: string; role: string } };
    expect(body.user.email).toBe("alice@example.test");
    expect(body.user.role).toBe("admin");

    const cookie = readSetCookie(response);
    expect(cookie).not.toBeNull();
    if (!cookie) return;
    expect(cookie.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie.value).toBeTruthy();
    expect(cookie.raw).toContain("HttpOnly");
    expect(cookie.raw).toContain("SameSite=Lax");
    expect(cookie.raw).toContain("Path=/");
  });

  it("does not set Secure in non-production environments", async () => {
    await provisionUser(db, {
      email: "bob@example.test",
      name: "Bob",
      password: "s3cret!",
    });
    const response = await login(
      makeLoginRequest({
        email: "bob@example.test",
        password: "s3cret!",
      }),
    );
    expect(response.status).toBe(200);
    const cookie = readSetCookie(response);
    expect(cookie?.raw).not.toContain("Secure");
  });

  it("returns 401 (no cookie) on wrong password", async () => {
    await provisionUser(db, {
      email: "carol@example.test",
      name: "Carol",
      password: "s3cret!",
    });
    const response = await login(
      makeLoginRequest({
        email: "carol@example.test",
        password: "WRONG",
      }),
    );
    expect(response.status).toBe(401);
    expect(readSetCookie(response)).toBeNull();

    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it("returns 401 on an unknown email (does not leak existence)", async () => {
    const response = await login(
      makeLoginRequest({
        email: "ghost@example.test",
        password: "anything",
      }),
    );
    expect(response.status).toBe(401);
    expect(readSetCookie(response)).toBeNull();
  });

  it("returns 401 (not 429) for an inactive user — does not consume a throttle slot", async () => {
    const created = await provisionUser(db, {
      email: "dave@example.test",
      name: "Dave",
      password: "s3cret!",
    });
    await db.user.update({
      where: { id: created.id },
      data: { isActive: false },
    });

    const response = await login(
      makeLoginRequest({
        email: "dave@example.test",
        password: "s3cret!",
      }),
    );
    expect(response.status).toBe(401);
    expect(readSetCookie(response)).toBeNull();
  });

  it("returns 429 once maxAttempts is exceeded within the window", async () => {
    await provisionUser(db, {
      email: "rl@example.test",
      name: "RL",
      password: "right",
    });

    // The route module uses DEFAULT_LOGIN_RATE_LIMIT: 5 / 15min.
    for (let i = 0; i < 5; i++) {
      const r = await login(
        makeLoginRequest({
          email: "rl@example.test",
          password: "wrong",
        }),
      );
      expect(r.status).toBe(401);
    }
    // 6th attempt — even with the right password — is throttled.
    const blocked = await login(
      makeLoginRequest({
        email: "rl@example.test",
        password: "right",
      }),
    );
    expect(blocked.status).toBe(429);
    expect(readSetCookie(blocked)).toBeNull();
  });

  it("returns 400 on a malformed JSON body", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const response = await login(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when email or password is missing", async () => {
    const r1 = await login(makeLoginRequest({ password: "pw" }));
    const r2 = await login(makeLoginRequest({ email: "x@example.test" }));
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
  });
});

// -- Logout route --------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("invalidates the session and clears the cookie", async () => {
    const created = await provisionUser(db, {
      email: "logout@example.test",
      name: "Logout",
      password: "right",
    });
    const loginResponse = await login(
      makeLoginRequest({
        email: "logout@example.test",
        password: "right",
      }),
    );
    expect(loginResponse.status).toBe(200);
    const cookie = readSetCookie(loginResponse);
    expect(cookie).not.toBeNull();
    if (!cookie) return;

    const logoutResponse = await logout(makeLogoutRequest(`${cookie.name}=${cookie.value}`));
    expect(logoutResponse.status).toBe(200);
    const cleared = readSetCookie(logoutResponse);
    expect(cleared).not.toBeNull();
    if (!cleared) return;
    expect(cleared.name).toBe(SESSION_COOKIE_NAME);
    // Clearing the cookie: empty value + Max-Age=0.
    expect(cleared.value).toBe("");
    expect(cleared.raw).toContain("Max-Age=0");

    // The Session row is gone from the store.
    const store = prismaSessionStore(db);
    expect(await store.resolve(cookie.value)).toBeNull();
    void created;
  });

  it("is idempotent: no cookie still returns 200 + clear-cookie", async () => {
    const response = await logout(makeLogoutRequest());
    expect(response.status).toBe(200);
    const cleared = readSetCookie(response);
    expect(cleared).not.toBeNull();
    if (!cleared) return;
    expect(cleared.name).toBe(SESSION_COOKIE_NAME);
  });

  it("ignores a stale (invalid) token", async () => {
    const response = await logout(
      makeLogoutRequest(`${SESSION_COOKIE_NAME}=does-not-exist`),
    );
    expect(response.status).toBe(200);
  });
});

// -- Me route ------------------------------------------------------------

describe("GET /api/auth/me", () => {
  it("returns the SessionUser when the cookie is valid", async () => {
    const created = await provisionUser(db, {
      email: "me@example.test",
      name: "Me",
      password: "right",
      isAdmin: true,
    });
    const loginResponse = await login(
      makeLoginRequest({
        email: "me@example.test",
        password: "right",
      }),
    );
    const cookie = readSetCookie(loginResponse);
    expect(cookie).not.toBeNull();
    if (!cookie) return;

    const meResponse = await me(makeMeRequest(`${cookie.name}=${cookie.value}`));
    expect(meResponse.status).toBe(200);
    const body = (await meResponse.json()) as { user: { id: string; email: string; role: string } };
    expect(body.user.id).toBe(created.id);
    expect(body.user.email).toBe("me@example.test");
    expect(body.user.role).toBe("admin");
  });

  it("returns 401 with no cookie", async () => {
    const response = await me(makeMeRequest());
    expect(response.status).toBe(401);
  });

  it("returns 401 when the cookie is for a different name", async () => {
    const response = await me(makeMeRequest("sessionid=wrong"));
    expect(response.status).toBe(401);
  });

  it("returns 401 when the token does not exist", async () => {
    const response = await me(makeMeRequest(`${SESSION_COOKIE_NAME}=nope`));
    expect(response.status).toBe(401);
  });

  it("returns 401 after logout", async () => {
    await provisionUser(db, {
      email: "logout-me@example.test",
      name: "LM",
      password: "pw",
    });
    const loginResponse = await login(
      makeLoginRequest({
        email: "logout-me@example.test",
        password: "pw",
      }),
    );
    expect(loginResponse.status).toBe(200);
    const reCookie = readSetCookie(loginResponse);
    if (!reCookie) throw new Error("login did not set cookie");
    await logout(makeLogoutRequest(`${reCookie.name}=${reCookie.value}`));
    const meAfter = await me(
      makeMeRequest(`${reCookie.name}=${reCookie.value}`),
    );
    expect(meAfter.status).toBe(401);
  });
});

// -- Sanity: sessionCookieOptions does NOT silently turn on Secure in tests.

describe("sessionCookieOptions shape for tests", () => {
  it("uses Lax + httpOnly + path=/ in a non-production env", () => {
    const opts = sessionCookieOptions({ nodeEnv: "test" });
    expect(opts.sameSite).toBe("Lax");
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe("/");
    expect(opts.secure).toBe(false);
  });
});

afterAll(async () => {
  await db.$disconnect();
});
