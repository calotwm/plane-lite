// GET/PATCH/DELETE /api/teams/:teamId (admin only)
//
// DELETE is rejected (400) when the team still owns projects or has
// members, per specs/teams/spec.md §"Team CRUD" scenario "Delete team
// with members rejected".

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser } from "@/lib/scope";
import {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  conflictResponse,
  isRecord,
  readJson,
} from "@/lib/http";
import { conditionalUpdate } from "@/lib/version";

interface RouteParams {
  params: Promise<{ teamId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const { teamId } = await params;
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return notFound();
  return NextResponse.json({ team });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const { teamId } = await params;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  if (!isRecord(raw) || typeof raw.version !== "number") {
    return badRequest("version is required");
  }

  const data: Record<string, unknown> = {};
  if (typeof raw.name === "string" && raw.name.trim()) data.name = raw.name.trim();

  const result = await conditionalUpdate(db.team, teamId, raw.version, data);
  if (!result.ok) {
    return conflictResponse({
      code: "STALE_VERSION",
      message: "Stale version",
      entity: result.entity,
    });
  }
  return NextResponse.json({ team: result.entity });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const { teamId } = await params;
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { _count: { select: { members: true, projects: true } } },
  });
  if (!team) return notFound();
  if (team._count.members > 0 || team._count.projects > 0) {
    return badRequest("Cannot delete a team that still has members or projects");
  }

  await db.team.delete({ where: { id: teamId } });
  return new NextResponse(null, { status: 204 });
}
