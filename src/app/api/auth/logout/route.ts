// POST /api/auth/logout
//
// Invalidates the current session server-side and clears the cookie on
// the client. The endpoint is idempotent: hitting /logout without a
// valid session still returns 200 with no Set-Cookie clear so clients
// can safely call it on every page load.
//
// `db` is imported here only to wire the session store; route logic
// depends on `clearSessionCookie` + the SessionStore contract, not on
// the password provider (per the auth-seam decision).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  appendClearSessionCookie,
  parseSessionCookieHeader,
  prismaSessionStore,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/auth/session";

export const dynamic = "force-dynamic";

const store = prismaSessionStore(db);

export async function POST(request: Request): Promise<NextResponse> {
  const opts = sessionCookieOptions({});
  const cookieHeader = request.headers.get("cookie");
  const token = parseSessionCookieHeader(cookieHeader, SESSION_COOKIE_NAME);

  if (token) {
    await store.invalidate(token);
  }

  const response = NextResponse.json({ ok: true });
  appendClearSessionCookie(response, opts);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
