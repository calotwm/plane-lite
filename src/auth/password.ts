// Argon2id password provider with admin provisioning + per-email login rate-limit.
//
// The provider owns three concerns, in order of testing priority:
//
//   1. `hashPassword` / `verifyPassword` — vetted Argon2id with library
//      defaults. Used by the provisioning + authenticate paths only; the
//      seam (provider.ts) never touches the bytes.
//   2. `provisionUser` / `resetPassword` — admin-only account lifecycle.
//      No route exposes these in MVP; they are functions an admin CLI /
//      seed script calls. The test suite drives them directly.
//   3. `createPasswordAuthProvider` — wires 1 + 2 into the AuthProvider
//      interface, adds per-email rate-limit, and returns either a session
//      tuple or a discriminated failure reason consumed by the login
//      route (RATE_LIMITED -> 429, otherwise -> 401).
//
// Admin-only mutation goes through `conditionalUpdate` (src/lib/version.ts)
// so the same optimistic concurrency that protects cards/lists protects
// user records against concurrent admin writes.

import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { conditionalUpdate } from "@/lib/version";
import type {
  AuthProvider,
  AuthResult,
  SessionUser,
  UserRole,
} from "./provider";

export interface PasswordAuthDeps {
  db: PrismaClient;
  rateLimit: LoginRateLimiter;
  clock?: () => Date;
  sessionTtlMs?: number;
}

// Library defaults are the OWASP recommendation for Argon2id as of the
// 2025 PHC string format: m=64 MiB, t=3, p=4. We deliberately do not
// override them — a hand-tuned Argon2id is more dangerous than a vetted
// default. The `argon2` package ships its own parameter string inside
// every hash, so future default changes are picked up automatically.
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed stored hash (corrupted row, accidental rotation to a
    // wrong format) must NOT crash the login path. Treat it as a failed
    // credential so the user is prompted to have their admin reset the
    // password — the same code path as a typo.
    return false;
  }
}

export interface ProvisionUserInput {
  email: string;
  name: string;
  password: string;
  isAdmin?: boolean;
}

export interface ProvisionedUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isActive: boolean;
}

// Creates an account with a fresh Argon2id hash. Throws on duplicate email
// (the underlying Prisma unique constraint). `isActive` defaults to true;
// the spec does not require deactivation at provisioning time.
export async function provisionUser(
  db: PrismaClient,
  input: ProvisionUserInput,
): Promise<ProvisionedUser> {
  const passwordHash = await hashPassword(input.password);
  const created = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      isAdmin: input.isAdmin ?? false,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isActive: true,
    },
  });
  return created;
}

// Replaces a user's password hash through `conditionalUpdate` so a
// concurrent admin write can't silently lose the new hash. Returns the
// refreshed row on success; `STALE_VERSION` on a stale read (caller is
// expected to refetch + retry per the spec of the version helper).
export async function resetPassword(
  db: PrismaClient,
  args: { userId: string; expectedVersion: number; newPassword: string },
): Promise<
  | { ok: true; userId: string }
  | { ok: false; code: "STALE_VERSION" }
> {
  const passwordHash = await hashPassword(args.newPassword);
  const result = await conditionalUpdate(db.user, args.userId, args.expectedVersion, {
    passwordHash,
  });
  if (result.ok) return { ok: true, userId: result.entity.id };
  return { ok: false, code: "STALE_VERSION" };
}

// Deactivates an account. Used by the (de)activate admin action; no public
// route exposes it in MVP. Idempotent: flipping isActive from true to true
// returns ok: true without changing other fields.
export async function setUserActive(
  db: PrismaClient,
  args: { userId: string; expectedVersion: number; isActive: boolean },
): Promise<
  | { ok: true; userId: string; isActive: boolean }
  | { ok: false; code: "STALE_VERSION" }
> {
  const result = await conditionalUpdate(db.user, args.userId, args.expectedVersion, {
    isActive: args.isActive,
  });
  if (result.ok) {
    const entity = result.entity as {
      id: string;
      isActive: boolean;
    };
    return { ok: true, userId: entity.id, isActive: entity.isActive };
  }
  return { ok: false, code: "STALE_VERSION" };
}

// -- Login rate-limit -----------------------------------------------------
//
// 5 consecutive failed attempts per email within a 15-minute sliding window
// -> the (N+1)th attempt returns RATE_LIMITED. A successful login clears
// the counter. This is in-memory by design (single-process MVP); replace
// with a DB-backed `LoginAttempt` table once the deployment grows past
// one instance.
//
// Exposed as a class so each request handler can pin its own instance
// (tests get a fresh limiter; production wires a singleton via
// createPasswordAuthProvider).
export interface LoginRateLimiterConfig {
  maxAttempts: number; // fails BEFORE the lockout (e.g. 5 -> 6th is locked)
  windowMs: number; // rolling window in ms
}

export const DEFAULT_LOGIN_RATE_LIMIT: LoginRateLimiterConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
};

export class LoginRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(
    cfg: LoginRateLimiterConfig = DEFAULT_LOGIN_RATE_LIMIT,
    clock: () => number = Date.now,
  ) {
    if (cfg.maxAttempts < 1) {
      throw new Error("LoginRateLimiter: maxAttempts must be >= 1");
    }
    if (cfg.windowMs < 1) {
      throw new Error("LoginRateLimiter: windowMs must be >= 1");
    }
    this.maxAttempts = cfg.maxAttempts;
    this.windowMs = cfg.windowMs;
    this.now = clock;
  }

  // Returns true when `email` has reached the threshold. Counts only FAILED
  // attempts in the current window — a successful login in the window does
  // not count toward the threshold (`recordSuccess` clears the counter).
  isLimited(email: string): boolean {
    return this.failureCount(email) >= this.maxAttempts;
  }

  failureCount(email: string): number {
    const key = email.toLowerCase();
    const cutoff = this.now() - this.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter((t) => t >= cutoff);
    this.attempts.set(key, recent);
    return recent.length;
  }

  recordFailure(email: string): void {
    const key = email.toLowerCase();
    const cutoff = this.now() - this.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter((t) => t >= cutoff);
    recent.push(this.now());
    this.attempts.set(key, recent);
  }

  // Clears the failure counter on success so a legitimate user that fat-
  // fingered a few times isn't permanently stuck behind the throttle.
  recordSuccess(email: string): void {
    this.attempts.delete(email.toLowerCase());
  }

  // Test-only: drop all state. Routes never call this.
  reset(): void {
    this.attempts.clear();
  }
}

// -- Auth provider wiring -------------------------------------------------

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function randomToken(): string {
  // 32 bytes -> 256 bits of entropy, base64url-encoded. Opaque to the
  // client, used as the Session row's unique key and the cookie value.
  return randomBytes(32).toString("base64url");
}

function toSessionUser(row: {
  id: string;
  email: string;
  isAdmin: boolean;
  teamMemberships: { teamId: string }[];
}): SessionUser {
  const role: UserRole = row.isAdmin ? "admin" : "member";
  const teamIds = row.teamMemberships.map((m) => m.teamId);
  return {
    id: row.id,
    email: row.email,
    role,
    teamIds,
  };
}

export function createPasswordAuthProvider(
  deps: PasswordAuthDeps,
): AuthProvider {
  const { db, rateLimit } = deps;
  const now = deps.clock ?? (() => new Date());
  const ttlMs = deps.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;

  return {
    async authenticate({ email, password }): Promise<AuthResult> {
      const normalizedEmail = email.toLowerCase();
      if (rateLimit.isLimited(normalizedEmail)) {
        return { ok: false, reason: "RATE_LIMITED" };
      }

      const user = await db.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          isAdmin: true,
          isActive: true,
          teamMemberships: { select: { teamId: true } },
        },
      });

      if (!user) {
        // Unknown email. We deliberately do NOT run a hash verify here —
        // a side-channel timing oracle is acceptable in MVP (internal
        // tool, admin-provisioned users, no public signup) and skipping
        // the verify keeps the cold path cheap.
        rateLimit.recordFailure(normalizedEmail);
        return { ok: false, reason: "INVALID_CREDENTIALS" };
      }
      const passwordOk = await verifyPassword(user.passwordHash, password);
      if (!passwordOk) {
        rateLimit.recordFailure(normalizedEmail);
        return { ok: false, reason: "INVALID_CREDENTIALS" };
      }
      if (!user.isActive) {
        // Inactive: do NOT count toward the throttle so an admin deacti-
        // vating a user doesn't lock them out if they try to log back in
        // after reactivation.
        return { ok: false, reason: "USER_INACTIVE" };
      }

      rateLimit.recordSuccess(normalizedEmail);
      const token = randomToken();
      const expiresAt = new Date(now().getTime() + ttlMs);
      await db.session.create({
        data: { userId: user.id, token, expiresAt },
      });
      return {
        ok: true,
        sessionUser: toSessionUser(user),
        token,
        expiresAt,
      };
    },
  };
}
