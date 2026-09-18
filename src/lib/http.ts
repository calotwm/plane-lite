// Shared response builders for route handlers.
//
// Keeps status-code choices consistent across the API surface: 401 means
// "no valid session" (see auth/session.ts::getSessionUser), 403 means
// "authenticated but not authorized for this resource" (wrong team, not
// admin) per the teams/projects specs' 403 scenarios.

import { NextResponse } from "next/server";
import type { ConflictBody } from "./errors";

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function conflictResponse(body: ConflictBody): NextResponse {
  return NextResponse.json(body, { status: 409 });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function readJson(request: Request): Promise<
  { ok: true; value: unknown } | { ok: false; response: NextResponse }
> {
  try {
    const value = await request.json();
    return { ok: true, value };
  } catch {
    return { ok: false, response: badRequest("Malformed JSON body") };
  }
}
