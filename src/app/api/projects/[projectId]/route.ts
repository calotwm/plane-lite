// GET/PATCH/DELETE /api/projects/:projectId
//
// GET/PATCH/DELETE require team access (owning team member or admin) per
// specs/projects/spec.md §"Project CRUD authorization". DELETE hard-
// cascades boards/lists/cards/cycles/labels via the schema's onDelete
// rules on Project's direct children (Board, Cycle, Label, Card all
// cascade off `projectId`) — no manual cleanup needed here.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
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
  params: Promise<{ projectId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound();
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  return NextResponse.json({ project });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound();
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  if (!isRecord(raw) || typeof raw.version !== "number") {
    return badRequest("version is required");
  }
  const data: Record<string, unknown> = {};
  if (typeof raw.name === "string" && raw.name.trim()) data.name = raw.name.trim();

  const result = await conditionalUpdate(db.project, projectId, raw.version, data);
  if (!result.ok) {
    return conflictResponse({
      code: "STALE_VERSION",
      message: "Stale version",
      entity: result.entity,
    });
  }
  return NextResponse.json({ project: result.entity });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound();
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  await db.project.delete({ where: { id: projectId } });
  return new NextResponse(null, { status: 204 });
}
