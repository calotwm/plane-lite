// POST /api/auth/login
//
// Body: { email, password }
// Responses:
//   200 { user: SessionUser } + Set-Cookie: plane_session=<token>
//   401 INVALID_CREDENTIALS | USER_INACTIVE  (collapsed to a single
//       401 to avoid leaking which addresses exist on the system)
//   429 RATE_LIMITED  (after N consecutive failures within window)
//
// No public signup route exists by design (spec §"Admin-provisioned user
// accounts"). Provisioning happens through `src/auth/password.ts::provisionUser`,
// driven by an admin CLI / seed script in MVP — admin routes for it are
// out of scope for the auth slice.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createPasswordAuthProvider,
  LoginRateLimiter,
} from "@/auth/password";
import {
  appendSessionCookie,
  prismaSessionStore,
  sessionCookieOptions,
} from "@/auth/session";

export const dynamic = "force-dynamic";

// One provider per worker — the rate limiter is in-memory and shared
// across requests. Hot reload in dev re-creates the module so the
// counter resets, which is acceptable for the MVP single-process model.
const rateLimiter = new LoginRateLimiter();
const authProvider = createPasswordAuthProvider({
  db,
  rateLimit: rateLimiter,
});

// Test-only: vitest shares modules across files in the same run, so the
// in-memory rate-limit counter survives between `describe` blocks unless
// explicitly reset. Production code MUST NOT call this.
export function __resetRateLimitForTesting(): void {
  rateLimiter.reset();
}

interface LoginRequestBody {
  email: unknown;
  password: unknown;
}

function isLoginRequestBody(value: unknown): value is LoginRequestBody {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Malformed JSON body" }, 400);
  }
  if (!isLoginRequestBody(raw)) {
    return json({ error: "Malformed JSON body" }, 400);
  }
  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  if (!email || !password) {
    return json({ error: "email and password are required" }, 400);
  }

  const result = await authProvider.authenticate({ email, password });
  if (!result.ok) {
    if (result.reason === "RATE_LIMITED") {
      return json({ error: "Too many attempts; try again later" }, 429);
    }
    // INVALID_CREDENTIALS and USER_INACTIVE both map to 401 by design.
    return json({ error: "Invalid credentials" }, 401);
  }

  const opts = sessionCookieOptions({});
  const response = NextResponse.json({ user: result.sessionUser });
  appendSessionCookie(
    response,
    result.token,
    result.expiresAt,
    opts,
  );
  // The Set-Cookie above already encodes max-age / expires; we also set
  // `Cache-Control: no-store` so intermediaries never cache the auth
  // payload even though the body is technically cacheable per status.
  response.headers.set("Cache-Control", "no-store");
  // Surface the cookie name to anything that introspects the response.
  // Avoids surprising the dev who sees a Set-Cookie header without
  // knowing which one to send back.
  void opts;
  return response;
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status });
}
