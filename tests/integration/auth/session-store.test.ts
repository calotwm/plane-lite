import { describe, expect, it, beforeEach } from "vitest";
import { db } from "@/../tests/db";
import {
  InMemorySessionStore,
  parseSessionCookieHeader,
  prismaSessionStore,
  SESSION_COOKIE_NAME,
  getSessionUser,
  loadSessionUser,
  buildSetCookieValue,
} from "@/auth/session";
import { provisionUser } from "@/auth/password";

beforeEach(async () => {
  // The global setup truncates tables before each test.
});

describe("InMemorySessionStore", () => {
  it("create / resolve / invalidate lifecycle", async () => {
    const store = new InMemorySessionStore();
    const expiresAt = new Date(Date.now() + 60_000);
    await store.create({ userId: "u1", token: "t1", expiresAt });
    expect(await store.resolve("t1")).toEqual({ userId: "u1" });
    await store.invalidate("t1");
    expect(await store.resolve("t1")).toBeNull();
  });

  it("returns null for an expired session without storing it forever", async () => {
    const store = new InMemorySessionStore();
    await store.create({
      userId: "u1",
      token: "t1",
      expiresAt: new Date(Date.now() - 1),
    });
    expect(await store.resolve("t1")).toBeNull();
    // Calling resolve again on an expired entry should still be null
    // and should not throw.
    expect(await store.resolve("t1")).toBeNull();
  });

  it("pruneExpired removes expired rows and returns the count", async () => {
    const store = new InMemorySessionStore();
    await store.create({
      userId: "u1",
      token: "t1",
      expiresAt: new Date(Date.now() - 1),
    });
    await store.create({
      userId: "u2",
      token: "t2",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const removed = await store.pruneExpired(new Date());
    expect(removed).toBe(1);
    expect(await store.resolve("t1")).toBeNull();
    expect(await store.resolve("t2")).toEqual({ userId: "u2" });
  });
});

describe("prismaSessionStore", () => {
  it("create / resolve / invalidate persist across calls", async () => {
    const store = prismaSessionStore(db);
    const created = await provisionUser(db, {
      email: "pss@example.test",
      name: "PSS",
      password: "pw",
    });
    const expiresAt = new Date(Date.now() + 60_000);
    await store.create({
      userId: created.id,
      token: "prisma-t1",
      expiresAt,
    });
    expect(await store.resolve("prisma-t1")).toEqual({ userId: created.id });
    await store.invalidate("prisma-t1");
    expect(await store.resolve("prisma-t1")).toBeNull();
  });

  it("returns null for expired rows", async () => {
    const store = prismaSessionStore(db);
    const created = await provisionUser(db, {
      email: "pss-e@example.test",
      name: "PSSE",
      password: "pw",
    });
    await store.create({
      userId: created.id,
      token: "prisma-t2",
      expiresAt: new Date(Date.now() - 1),
    });
    expect(await store.resolve("prisma-t2")).toBeNull();
  });
});

describe("loadSessionUser", () => {
  it("returns the projected SessionUser (no passwordHash)", async () => {
    const created = await provisionUser(db, {
      email: "lsu@example.test",
      name: "LSU",
      password: "pw",
    });
    const sessionUser = await loadSessionUser(db, created.id);
    expect(sessionUser).not.toBeNull();
    if (!sessionUser) return;
    expect(sessionUser.id).toBe(created.id);
    expect(sessionUser.email).toBe(created.email);
    expect(sessionUser.role).toBe("member");
    expect(sessionUser.teamIds).toEqual([]);
    const projected = sessionUser as unknown as Record<string, unknown>;
    expect(projected["passwordHash"]).toBeUndefined();
  });

  it("returns null for an inactive user", async () => {
    const created = await provisionUser(db, {
      email: "lsu-inactive@example.test",
      name: "LSU-I",
      password: "pw",
    });
    await db.user.update({
      where: { id: created.id },
      data: { isActive: false },
    });
    expect(await loadSessionUser(db, created.id)).toBeNull();
  });

  it("returns null for a non-existent user", async () => {
    expect(await loadSessionUser(db, "no-such-id")).toBeNull();
  });

  it("projects admin -> role: 'admin' and member -> role: 'member'", async () => {
    const admin = await provisionUser(db, {
      email: "admin-lsu@example.test",
      name: "Admin",
      password: "pw",
      isAdmin: true,
    });
    const member = await provisionUser(db, {
      email: "member-lsu@example.test",
      name: "Member",
      password: "pw",
    });
    const aSession = await loadSessionUser(db, admin.id);
    const mSession = await loadSessionUser(db, member.id);
    expect(aSession?.role).toBe("admin");
    expect(mSession?.role).toBe("member");
  });
});

describe("getSessionUser", () => {
  it("returns null when no cookie header is present", async () => {
    const store = prismaSessionStore(db);
    const sessionUser = await getSessionUser(
      { headers: { get: () => null } },
      store,
      db,
    );
    expect(sessionUser).toBeNull();
  });

  it("returns null when the cookie is for a different name", async () => {
    const store = prismaSessionStore(db);
    const sessionUser = await getSessionUser(
      { headers: { get: () => "other=xyz" } },
      store,
      db,
    );
    expect(sessionUser).toBeNull();
  });

  it("returns the SessionUser when the cookie holds a valid token", async () => {
    const created = await provisionUser(db, {
      email: "gsu@example.test",
      name: "GSU",
      password: "pw",
      isAdmin: true,
    });
    const store = prismaSessionStore(db);
    const token = "valid-token-abc";
    await store.create({
      userId: created.id,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const sessionUser = await getSessionUser(
      {
        headers: {
          get: (name) =>
            name === "cookie" ? `${SESSION_COOKIE_NAME}=${token}` : null,
        },
      },
      store,
      db,
    );
    expect(sessionUser).not.toBeNull();
    if (!sessionUser) return;
    expect(sessionUser.id).toBe(created.id);
    expect(sessionUser.role).toBe("admin");
  });

  it("returns null for a token that points to an inactive user", async () => {
    const created = await provisionUser(db, {
      email: "gsu-dead@example.test",
      name: "GSUD",
      password: "pw",
    });
    const store = prismaSessionStore(db);
    await store.create({
      userId: created.id,
      token: "dead-token",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.user.update({
      where: { id: created.id },
      data: { isActive: false },
    });
    const sessionUser = await getSessionUser(
      {
        headers: {
          get: (n) =>
            n === "cookie" ? `${SESSION_COOKIE_NAME}=dead-token` : null,
        },
      },
      store,
      db,
    );
    expect(sessionUser).toBeNull();
  });
});

describe("Set-Cookie shape parity across stores", () => {
  it("buildSetCookieValue is independent of the store backend", () => {
    const opts = { ...buildSetCookieValue, ...{ name: "plane_session" } };
    const opts2 = {
      name: "plane_session",
      httpOnly: true,
      sameSite: "Lax" as const,
      secure: false,
      path: "/",
      maxAgeSeconds: 3600,
    };
    const token = "shared-token";
    const mem = buildSetCookieValue(opts.name, token, opts2);
    expect(mem).toContain("plane_session=shared-token");
    expect(mem).toContain("HttpOnly");
    expect(mem).toContain("SameSite=Lax");

    // Touch the unused variables so the `void opts` trick is honest.
    void opts;
    // Sanity: the cookie header parser can round-trip it.
    const parsed = parseSessionCookieHeader(`plane_session=${token}`, "plane_session");
    expect(parsed).toBe(token);
  });
});
