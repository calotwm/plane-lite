// GET /api/auth/me
//
// The canonical "who am I" probe. Returns the resolved `SessionUser`
// (no password hash) when the request carries a valid, non-expired
// session. Returns 401 otherwise — protected routes MUST depend on
// `getSessionUser` directly rather than chaining through this route.
//
// This handler is also the reference example for "use only getSessionUser,
// never the password provider" — every other protected route in Phase 4
// repeats the same three-line pattern.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, prismaSessionStore } from "@/auth/session";

export const dynamic = "force-dynamic";

const store = prismaSessionStore(db);

export async function GET(request: Request): Promise<NextResponse> {
  const sessionUser = await getSessionUser({ headers: request.headers }, store, db);
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  return NextResponse.json({ user: sessionUser });
}
