// Server-side session storage + cookie issue/validate/invalidate.
//
// Three concerns live here, in dependency order:
//
//   1. `SessionStore` interface + `prismaSessionStore` implementation.
//      The store is opaque to callers (token -> userId). The shape is
//      defined so an in-memory variant (tests, future edge-runtime
//      adapter) can drop in next to the Prisma one without touching
//      `getSessionUser`.
//   2. Cookie helpers — `sessionCookieOptions` + Set-Cookie string
//      builders. Routes append the resulting string to a `Response`
//      header; we avoid `NextResponse.cookies.set` so the same code
//      works against a plain Web `Response` (and inside vitest, which
//      doesn't have a Next.js request context).
//   3. `getSessionUser(request)` — the ONLY entry point every protected
//      route uses. Reads the cookie, looks up the token, returns a
//      `SessionUser` (no password hash) or `null`. Per the design the
//      goal is "every route depends ONLY on `getSessionUser`, never on
//      the password provider directly", so an OIDC swap is invisible
//      here.

import { PrismaClient } from "@prisma/client";
import type { CookieSource, SessionUser } from "./provider";

export const SESSION_COOKIE_NAME = "plane_session";

// 7 days, matching the password provider's session TTL by default.
export const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SameSite = "Lax" | "Strict" | "None";

export interface SessionCookieOptions {
  name: string;
  httpOnly: boolean;
  sameSite: SameSite;
  secure: boolean;
  path: string;
  maxAgeSeconds: number;
}

// Decides cookie attributes per environment. `secure: true` over plain
// HTTP leaks the session token to any observer on the wire — only flip
// on when we know the request reached us over TLS.
export function sessionCookieOptions(env: {
  nodeEnv?: string;
}): SessionCookieOptions {
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const secure = nodeEnv === "production";
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/",
    maxAgeSeconds: Math.floor(DEFAULT_SESSION_TTL_MS / 1000),
  };
}

// -- Set-Cookie header construction (RFC 6265) ---------------------------

function formatHttpDate(d: Date): string {
  // RFC 6265 §4.1.1 prefers IMF-fixdate, but RFC 1123 is universally
  // accepted by browsers in practice and ships without a date-format
  // dependency. Argon2id hashes are short; the cookie value carries an
  // expiry instead of an absolute date — `Max-Age` is the primary
  // signalling channel anyway.
  return d.toUTCString();
}

// Builds a single Set-Cookie value. Name + value are not escaped here
// because the token we issue is `base64url` (URL-safe alphabet: `[A-Za-
// z0-9_-]` only) and therefore cannot contain `;`, `,`, or whitespace.
// Path defaults to `/`; we never set Domain (host-only cookies by design).
export function buildSetCookieValue(
  name: string,
  value: string,
  opts: SessionCookieOptions,
  expiresAt?: Date,
): string {
  const parts: string[] = [`${name}=${value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`);
  parts.push(`SameSite=${capitalize(opts.sameSite)}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (expiresAt) parts.push(`Expires=${formatHttpDate(expiresAt)}`);
  return parts.join("; ");
}

// Plain Web `Response` and Next.js `NextResponse` both expose
// `response.headers.append('Set-Cookie', value)`. The HTTP spec allows
// multiple Set-Cookie headers per response — exactly what we need for
// a login that sets both a session cookie and (optionally later) a
// CSRF token.
export function appendSessionCookie(
  response: { headers: { append(name: "Set-Cookie", value: string): void } },
  token: string,
  expiresAt: Date,
  opts: SessionCookieOptions = sessionCookieOptions({}),
): void {
  response.headers.append(
    "Set-Cookie",
    buildSetCookieValue(opts.name, token, opts, expiresAt),
  );
}

// Clearing the cookie: same name, empty value, expired Max-Age/Expires.
// Browsers will overwrite the stored cookie and ignore it on subsequent
// requests. The path MUST match the original Set-Cookie path or the
// browser will scope the clear to a different path.
export function appendClearSessionCookie(
  response: { headers: { append(name: "Set-Cookie", value: string): void } },
  opts: SessionCookieOptions = sessionCookieOptions({}),
): void {
  const value = buildSetCookieValue(opts.name, "", {
    ...opts,
    maxAgeSeconds: 0,
  }, new Date(0));
  response.headers.append("Set-Cookie", value);
}

function capitalize(s: SameSite): string {
  return (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()) as Capitalize<SameSite>;
}

// -- Session store --------------------------------------------------------

export interface SessionStore {
  create(args: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<void>;
  resolve(token: string): Promise<{ userId: string } | null>;
  invalidate(token: string): Promise<void>;
  pruneExpired(now: Date): Promise<number>;
}

// Default backend. Pure Prisma — the same DB the rest of the app uses.
// Works against SQLite (test) and PostgreSQL (prod) because the schema
// is provider-portable (string id, DateTime, no native types).
export function prismaSessionStore(db: PrismaClient): SessionStore {
  return {
    async create({ userId, token, expiresAt }) {
      await db.session.create({ data: { userId, token, expiresAt } });
    },
    async resolve(token) {
      const row = await db.session.findUnique({
        where: { token },
        select: { userId: true, expiresAt: true },
      });
      if (!row) return null;
      if (row.expiresAt.getTime() <= Date.now()) return null;
      return { userId: row.userId };
    },
    async invalidate(token) {
      // deleteMany so a concurrent logout after expiry is a no-op rather
      // than an unhandled error. The token's unique index makes this
      // idempotent at the DB level too.
      await db.session.deleteMany({ where: { token } });
    },
    async pruneExpired(now) {
      const result = await db.session.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      return result.count;
    },
  };
}

// An in-memory store the test suite (and any future edge-runtime adapter)
// can use without a Prisma dependency. Same shape, same lifecycle.
export interface InMemorySessionStoreOptions {
  now?: () => Date;
  generateId?: () => string;
}

export class InMemorySessionStore implements SessionStore {
  private readonly rows = new Map<
    string,
    { userId: string; expiresAt: Date }
  >();
  private readonly now: () => Date;

  constructor(opts: InMemorySessionStoreOptions = {}) {
    this.now = opts.now ?? (() => new Date());
  }

  async create({
    userId,
    token,
    expiresAt,
  }: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<void> {
    this.rows.set(token, { userId, expiresAt });
  }

  async resolve(token: string): Promise<{ userId: string } | null> {
    const row = this.rows.get(token);
    if (!row) return null;
    if (row.expiresAt.getTime() <= this.now().getTime()) {
      this.rows.delete(token);
      return null;
    }
    return { userId: row.userId };
  }

  async invalidate(token: string): Promise<void> {
    this.rows.delete(token);
  }

  async pruneExpired(now: Date): Promise<number> {
    let removed = 0;
    for (const [token, row] of this.rows) {
      if (row.expiresAt < now) {
        this.rows.delete(token);
        removed++;
      }
    }
    return removed;
  }
}

// -- getSessionUser -------------------------------------------------------

// SessionUser builder shared by getSessionUser and the password provider
// so both paths project the same identity contract. Filters out inactive
// users so a deactivated user cannot keep a session alive — every
// request re-validates against the current user record.
export async function loadSessionUser(
  db: PrismaClient,
  userId: string,
): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      isActive: true,
      teamMemberships: { select: { teamId: true } },
    },
  });
  if (!user || !user.isActive) return null;
  const teamIds = user.teamMemberships.map((m) => m.teamId);
  const role: SessionUser["role"] = user.isAdmin ? "admin" : "member";
  return { id: user.id, email: user.email, role, teamIds };
}

// Reads `plane_session` from the cookie header (we read the raw header so
// the function works against a Node `Request`, NextRequest, or any test
// stub that exposes `request.headers.get('cookie')`). Invalid/expired
// sessions fall through to `null`, never throw — protected routes are
// expected to redirect / 401 on null per their own policy.
export async function getSessionUser(
  request: CookieSource,
  store: SessionStore,
  db: PrismaClient,
): Promise<SessionUser | null> {
  const token = parseSessionCookieHeader(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME,
  );
  if (!token) return null;
  const session = await store.resolve(token);
  if (!session) return null;
  return loadSessionUser(db, session.userId);
}

// Minimal RFC 6265 cookie header parser. We only need to pick out the
// single named cookie by exact match — no escaping, no quoted values,
// since the token we set is base64url (alphanumeric + `-` and `_`) and
// cannot contain `=`, `;`, or whitespace. RFC 6265 allows OWS around
// both sides of `=`, so we trim each half too.
export function parseSessionCookieHeader(
  header: string | null,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== name) continue;
    return trimmed.slice(eq + 1).trim();
  }
  return null;
}
