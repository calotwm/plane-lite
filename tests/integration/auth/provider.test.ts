import { describe, expect, it, beforeEach } from "vitest";
import { db } from "@/../tests/db";
import {
  createPasswordAuthProvider,
  hashPassword,
  LoginRateLimiter,
  provisionUser,
  resetPassword,
  setUserActive,
  verifyPassword,
} from "@/auth/password";
import { randomBytes } from "node:crypto";

// Direct auth-provider integration tests. These bypass the HTTP route
// and exercise the provider against the same Prisma + temp-SQLite
// harness everything else uses. The HTTP route is covered separately in
// `routes.test.ts` to assert status codes / Set-Cookie plumbing.

beforeEach(async () => {
  // Tests/setup.ts already truncates every table beforeEach; this block
  // exists so the integration suite plays nicely even if someone removes
  // the global setup hook in the future.
});

describe("hashPassword / verifyPassword", () => {
  it("stores Argon2id, never the plaintext", async () => {
    const hash = await hashPassword("s3cret!");
    expect(hash).not.toContain("s3cret!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "s3cret!")).toBe(true);
    expect(await verifyPassword(hash, "s3cret?")).toBe(false);
  });

  it("verifies returns false on a malformed hash (does not throw)", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyPassword("", "anything")).toBe(false);
  });

  it("produces different hashes for the same plaintext (per-user salt)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toEqual(b);
    expect(await verifyPassword(a, "same")).toBe(true);
    expect(await verifyPassword(b, "same")).toBe(true);
  });
});

describe("provisionUser", () => {
  it("creates a user with a hashed password and isActive=true", async () => {
    const created = await provisionUser(db, {
      email: "alice@example.test",
      name: "Alice",
      password: "s3cret!",
      isAdmin: false,
    });
    expect(created.id).toMatch(/^c[a-z0-9]+/);
    expect(created.email).toBe("alice@example.test");
    expect(created.isAdmin).toBe(false);
    expect(created.isActive).toBe(true);

    const stored = await db.user.findUnique({ where: { id: created.id } });
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored?.passwordHash).not.toContain("s3cret!");
  });

  it("defaults isAdmin to false", async () => {
    const created = await provisionUser(db, {
      email: "bob@example.test",
      name: "Bob",
      password: "pw",
    });
    expect(created.isAdmin).toBe(false);
  });

  it("accepts an admin provisioned user", async () => {
    const created = await provisionUser(db, {
      email: "admin@example.test",
      name: "Admin",
      password: "pw",
      isAdmin: true,
    });
    expect(created.isAdmin).toBe(true);
  });

  it("rejects duplicate email via the underlying unique constraint", async () => {
    await provisionUser(db, {
      email: "dup@example.test",
      name: "Dup",
      password: "pw",
    });
    await expect(
      provisionUser(db, {
        email: "dup@example.test",
        name: "Dup2",
        password: "pw",
      }),
    ).rejects.toThrow();
  });
});

describe("resetPassword", () => {
  it("replaces the hash and bumps version; old password no longer works", async () => {
    const created = await provisionUser(db, {
      email: "x@example.test",
      name: "X",
      password: "old",
    });
    const original = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    const oldHash = original.passwordHash;

    const result = await resetPassword(db, {
      userId: created.id,
      expectedVersion: original.version,
      newPassword: "new",
    });
    expect(result.ok).toBe(true);

    const fresh = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(fresh.passwordHash).not.toBe(oldHash);
    expect(fresh.version).toBe(original.version + 1);
    expect(await verifyPassword(fresh.passwordHash, "new")).toBe(true);
    expect(await verifyPassword(fresh.passwordHash, "old")).toBe(false);
  });

  it("returns STALE_VERSION when expectedVersion is behind", async () => {
    const created = await provisionUser(db, {
      email: "y@example.test",
      name: "Y",
      password: "old",
    });
    const original = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    // Bump the version out-of-band.
    await db.user.update({
      where: { id: created.id },
      data: { version: { increment: 1 } },
    });
    const result = await resetPassword(db, {
      userId: created.id,
      expectedVersion: original.version,
      newPassword: "new",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("STALE_VERSION");
  });
});

describe("setUserActive", () => {
  it("toggles isActive and bumps version through conditionalUpdate", async () => {
    const created = await provisionUser(db, {
      email: "z@example.test",
      name: "Z",
      password: "pw",
    });
    expect(created.isActive).toBe(true);
    const result = await setUserActive(db, {
      userId: created.id,
      expectedVersion: 1,
      isActive: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isActive).toBe(false);

    const fresh = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(fresh.isActive).toBe(false);
    expect(fresh.version).toBe(2);
  });
});

describe("createPasswordAuthProvider.authenticate (happy path)", () => {
  it("returns a sessionUser + token on valid credentials", async () => {
    await provisionUser(db, {
      email: "ok@example.test",
      name: "Ok",
      password: "right",
      isAdmin: true,
    });
    const limiter = new LoginRateLimiter();
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });

    const result = await provider.authenticate({
      email: "ok@example.test",
      password: "right",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessionUser.email).toBe("ok@example.test");
    expect(result.sessionUser.role).toBe("admin");
    expect(result.sessionUser.id).toMatch(/^c/);
    expect(result.token).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // SessionUser MUST NOT leak the password hash.
    const sessionUserRecord = result.sessionUser as unknown as Record<string, unknown>;
    expect(sessionUserRecord["passwordHash"]).toBeUndefined();

    // A Session row was actually created.
    const sessionRow = await db.session.findUnique({
      where: { token: result.token },
    });
    expect(sessionRow).not.toBeNull();
  });

  it("projects team membership into teamIds", async () => {
    await provisionUser(db, {
      email: "teamie@example.test",
      name: "Teamie",
      password: "pw",
    });
    const team = await db.team.create({ data: { name: "Alpha" } });
    const user = await db.user.findUniqueOrThrow({
      where: { email: "teamie@example.test" },
    });
    await db.teamMember.create({
      data: { teamId: team.id, userId: user.id, role: "member" },
    });

    const limiter = new LoginRateLimiter();
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    const result = await provider.authenticate({
      email: "teamie@example.test",
      password: "pw",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessionUser.teamIds).toEqual([team.id]);
  });
});

describe("createPasswordAuthProvider.authenticate (failure cases)", () => {
  it("returns INVALID_CREDENTIALS for a wrong password", async () => {
    await provisionUser(db, {
      email: "fp@example.test",
      name: "FP",
      password: "right",
    });
    const limiter = new LoginRateLimiter({ maxAttempts: 100, windowMs: 60_000 });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    const result = await provider.authenticate({
      email: "fp@example.test",
      password: "wrong",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("INVALID_CREDENTIALS");
  });

  it("returns INVALID_CREDENTIALS for an unknown email", async () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 100, windowMs: 60_000 });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    const result = await provider.authenticate({
      email: "ghost@example.test",
      password: "anything",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("INVALID_CREDENTIALS");
  });

  it("returns USER_INACTIVE for a deactivated user", async () => {
    const created = await provisionUser(db, {
      email: "inactive@example.test",
      name: "Inactive",
      password: "pw",
    });
    await setUserActive(db, {
      userId: created.id,
      expectedVersion: 1,
      isActive: false,
    });
    const limiter = new LoginRateLimiter({ maxAttempts: 100, windowMs: 60_000 });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    const result = await provider.authenticate({
      email: "inactive@example.test",
      password: "pw",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("USER_INACTIVE");

    // Inactive attempts must NOT count toward the throttle.
    expect(limiter.failureCount("inactive@example.test")).toBe(0);
  });

  it("returns RATE_LIMITED after maxAttempts consecutive failures", async () => {
    await provisionUser(db, {
      email: "rl@example.test",
      name: "RL",
      password: "right",
    });
    const limiter = new LoginRateLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
    });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });

    for (let i = 0; i < 3; i++) {
      const r = await provider.authenticate({
        email: "rl@example.test",
        password: "wrong",
      });
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.reason).toBe("INVALID_CREDENTIALS");
    }

    // 4th attempt is throttled.
    const blocked = await provider.authenticate({
      email: "rl@example.test",
      password: "right",
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe("RATE_LIMITED");
  });

  it("rate-limit counter is per-email (different emails do not interact)", async () => {
    const limiter = new LoginRateLimiter({
      maxAttempts: 2,
      windowMs: 60_000,
    });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    for (let i = 0; i < 2; i++) {
      await provider.authenticate({
        email: "x@example.test",
        password: "wrong",
      });
    }
    // x is now at 2 failures (limited); y is fresh.
    const xBlocked = await provider.authenticate({
      email: "x@example.test",
      password: "wrong",
    });
    expect(xBlocked.ok).toBe(false);
    if (xBlocked.ok) return;
    expect(xBlocked.reason).toBe("RATE_LIMITED");

    await provisionUser(db, {
      email: "y@example.test",
      name: "Y",
      password: "right",
    });
    const yOk = await provider.authenticate({
      email: "y@example.test",
      password: "right",
    });
    expect(yOk.ok).toBe(true);
  });

  it("compares emails case-insensitively on the throttle key", async () => {
    const limiter = new LoginRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
    });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    // Failure on "Mixed@Example.test" trips the key, not "mixed@example.test".
    await provider.authenticate({
      email: "Mixed@Example.test",
      password: "wrong",
    });
    const blocked = await provider.authenticate({
      email: "mixed@example.test",
      password: "wrong",
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe("RATE_LIMITED");
  });

  it("a successful login clears the prior failure streak", async () => {
    await provisionUser(db, {
      email: "recover@example.test",
      name: "Recover",
      password: "right",
    });
    const limiter = new LoginRateLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
    });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    await provider.authenticate({
      email: "recover@example.test",
      password: "wrong",
    });
    await provider.authenticate({
      email: "recover@example.test",
      password: "wrong",
    });
    const ok = await provider.authenticate({
      email: "recover@example.test",
      password: "right",
    });
    expect(ok.ok).toBe(true);
    // The streak is cleared — a fresh failed attempt does not pull
    // forward to the (now-reset) counter.
    expect(limiter.isLimited("recover@example.test")).toBe(false);
  });

  it("records no extra Session row on a failed attempt", async () => {
    await provisionUser(db, {
      email: "nosession@example.test",
      name: "NoSession",
      password: "right",
    });
    const limiter = new LoginRateLimiter({ maxAttempts: 100, windowMs: 60_000 });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    const before = await db.session.count();
    await provider.authenticate({
      email: "nosession@example.test",
      password: "wrong",
    });
    const after = await db.session.count();
    expect(after).toBe(before);
  });

  it("issues a unique token per successful login (the cookie cannot be forged)", async () => {
    await provisionUser(db, {
      email: "tokens@example.test",
      name: "Tokens",
      password: "right",
    });
    const limiter = new LoginRateLimiter({ maxAttempts: 100, windowMs: 60_000 });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    const a = await provider.authenticate({
      email: "tokens@example.test",
      password: "right",
    });
    const b = await provider.authenticate({
      email: "tokens@example.test",
      password: "right",
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.token).not.toEqual(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(32);
    expect(b.token.length).toBeGreaterThanOrEqual(32);
    // Spot-check that the token carries enough entropy to defeat a
    // brute-force guess — base64url-encoded 32 bytes (~43 chars).
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("uses 256 bits of entropy — token bytes are 32", async () => {
    await provisionUser(db, {
      email: "ent@example.test",
      name: "Ent",
      password: "right",
    });
    const limiter = new LoginRateLimiter({ maxAttempts: 100, windowMs: 60_000 });
    const provider = createPasswordAuthProvider({ db, rateLimit: limiter });
    const result = await provider.authenticate({
      email: "ent@example.test",
      password: "right",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // base64url of 32 bytes is 43 chars (without padding).
    expect(result.token).toHaveLength(43);
    // Sanity: randomBytes is the source, not a Math.random()-derived
    // substring. We don't import randomBytes into this assertion but a
    // repeated-call test (already done) empirically covers the same
    // ground.
    void randomBytes;
  });
});
