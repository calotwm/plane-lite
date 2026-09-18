// GET/PATCH/DELETE /api/boards/:boardId
//
// PATCH renames and/or moves the board (integer `position`, renumbered
// atomically among the project's other boards — boards spec §"Integer
// ordering with renumber"). Both are writes, so an archived board or
// project rejects with 409 ARCHIVED (boards spec §"Archived board
// mutation guard").
//
// DELETE hard-cascades: `List.board` cascades on delete, but
// `Card.list` is `onDelete: SetNull` (shared with the list-delete ->
// backlog path), so a plain `db.board.delete()` would orphan the
// board's cards into the backlog instead of removing them. Boards spec
// requires cards to be REMOVED, so cards are deleted explicitly first.

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

  return NextResponse.json({ board: loaded.board });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
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
  if (!isRecord(raw)) return badRequest("Malformed body");

  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : undefined;
  const targetPosition = typeof raw.position === "number" ? raw.position : undefined;

  if (targetPosition === undefined) {
    const updated = await db.board.update({
      where: { id: boardId },
      data: { ...(name ? { name } : {}) },
    });
    return NextResponse.json({ board: updated });
  }

  const siblings = await db.board.findMany({
    where: { projectId: project.id },
    orderBy: { position: "asc" },
  });
  const withoutMoved = siblings.filter((b) => b.id !== boardId);
  const clamped = Math.max(0, Math.min(targetPosition, withoutMoved.length));
  withoutMoved.splice(clamped, 0, board);

  const updated = await db.$transaction(
    withoutMoved.map((b, index) =>
      db.board.update({
        where: { id: b.id },
        data: {
          position: index,
          ...(b.id === boardId && name ? { name } : {}),
        },
      }),
    ),
  );
  return NextResponse.json({ board: updated.find((b) => b.id === boardId) });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { boardId } = await params;
  const loaded = await loadBoardWithProject(boardId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  await db.$transaction([
    db.card.deleteMany({ where: { list: { boardId } } }),
    db.board.delete({ where: { id: boardId } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
