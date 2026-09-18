// GET  /api/projects/:projectId/boards?archived=false (default)
// POST /api/projects/:projectId/boards { name }
//
// Default listing excludes archived boards AND every board of an
// archived project (design.md §Interfaces). `archived=true` switches to
// the archived-board view for this project: every board regardless of
// its own or the project's archive state, per boards spec §"Archived
// board excluded from default view".
//
// Board creation inside an archived project is rejected with 409
// ARCHIVED (projects spec §"Archived project mutation guard").

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { assertWritable } from "@/lib/archive";
import {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  conflictResponse,
  isRecord,
  readJson,
} from "@/lib/http";

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

  const url = new URL(request.url);
  const showArchived = url.searchParams.get("archived") === "true";

  // Default view: hide every board once the project itself is archived,
  // regardless of each board's own archive flag (design.md §Interfaces).
  if (!showArchived && project.archivedAt) {
    return NextResponse.json({ boards: [] });
  }

  const boards = await db.board.findMany({
    where: showArchived ? { projectId } : { projectId, archivedAt: null },
    orderBy: { position: "asc" },
  });
  return NextResponse.json({ boards });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound();
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const writable = assertWritable(null, project);
  if (!writable.ok) return conflictResponse(writable.conflict);

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  const name = isRecord(raw) && typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return badRequest("name is required");

  const count = await db.board.count({ where: { projectId } });
  const board = await db.board.create({
    data: { name, projectId, position: count },
  });
  return NextResponse.json({ board }, { status: 201 });
}
