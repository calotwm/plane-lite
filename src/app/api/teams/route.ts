// GET  /api/teams        -> list all teams (admin only)
// POST /api/teams { name } -> create a team (admin only)
//
// Per openspec specs/teams/spec.md §"Team CRUD": team management is
// admin-only in MVP. Regular members learn their own team membership via
// GET /api/auth/me (SessionUser.teamIds), not this listing.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser } from "@/lib/scope";
import { unauthorized, forbidden, badRequest, isRecord, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const teams = await db.team.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ teams });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  const name = isRecord(raw) && typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return badRequest("name is required");

  const team = await db.team.create({ data: { name } });
  return NextResponse.json({ team }, { status: 201 });
}
