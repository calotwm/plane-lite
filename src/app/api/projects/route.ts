// GET  /api/projects?archived=false (default) -> scoped listing
// POST /api/projects { name, teamId }          -> create
//
// Scoping per specs/projects/spec.md §"Project listing scoping": only
// projects owned by a team the caller belongs to, plus every project for
// admins. `archived` defaults to false (exclude archived); pass
// `archived=true` to see the archived-projects view instead.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { unauthorized, forbidden, badRequest, isRecord, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const showArchived = url.searchParams.get("archived") === "true";

  const projects = await db.project.findMany({
    where: {
      archivedAt: showArchived ? { not: null } : null,
      ...(user.role === "admin" ? {} : { teamId: { in: user.teamIds } }),
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ projects });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  const name = isRecord(raw) && typeof raw.name === "string" ? raw.name.trim() : "";
  const teamId = isRecord(raw) && typeof raw.teamId === "string" ? raw.teamId : "";
  if (!teamId) return badRequest("teamId is required");
  if (!name) return badRequest("name is required");

  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return badRequest("teamId does not reference an existing team");
  if (!hasTeamAccess(user, teamId)) return forbidden();

  const project = await db.project.create({ data: { name, teamId } });
  return NextResponse.json({ project }, { status: 201 });
}
