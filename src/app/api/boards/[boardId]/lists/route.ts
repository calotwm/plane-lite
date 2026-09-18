// GET  /api/boards/:boardId/lists
// POST /api/boards/:boardId/lists { name } -> appended at the end
//
// Creating a list is a write targeting the board, so an archived board
// or its project rejects with 409 ARCHIVED (boards spec §"Archived
// board mutation guard").

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
  params: Promise<{ boardId: string }>;
}

export const dynamic = "force-dynamic";

async function loadBoardWithProject(boardId: string) {
  const board = await db.board.findUnique({ where: { id: boardId } });
  if (!board) return null;
  const project = await db.project.findUniqueOrThrow({ where: { id: board.projectId } });
  return { board, project };
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { boardId } = await params;
  const loaded = await loadBoardWithProject(boardId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  const lists = await db.list.findMany({ where: { boardId }, orderBy: { position: "asc" } });
  return NextResponse.json({ lists });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { boardId } = await params;
  const loaded = await loadBoardWithProject(boardId);
  if (!loaded) return notFound();
  const { board, project } = loaded;
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const writable = assertWritable(board, project);
  if (!writable.ok) return conflictResponse(writable.conflict);

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  const name = isRecord(raw) && typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return badRequest("name is required");

  const count = await db.list.count({ where: { boardId } });
  const list = await db.list.create({ data: { name, boardId, position: count } });
  return NextResponse.json({ list }, { status: 201 });
}
