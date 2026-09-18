// GET/PATCH/DELETE /api/lists/:listId
//
// PATCH renames and/or moves the list (integer position, renumbered
// atomically among the board's other lists). Rejected 409 ARCHIVED when
// the board or its project is archived (boards spec §"List edit on an
// archived board rejected").
//
// DELETE is soft per boards spec §"Delete list": the list is removed and
// its cards move to the backlog (`listId=null`, `position=null`), reusing
// `toBacklogPatch()` so this path and the move-to-backlog path in
// cards/[cardId]/move stay identical.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { assertWritable } from "@/lib/archive";
import { toBacklogPatch } from "@/lib/reorder";
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
  params: Promise<{ listId: string }>;
}

export const dynamic = "force-dynamic";

async function loadListWithBoardAndProject(listId: string) {
  const list = await db.list.findUnique({ where: { id: listId } });
  if (!list) return null;
  const board = await db.board.findUniqueOrThrow({ where: { id: list.boardId } });
  const project = await db.project.findUniqueOrThrow({ where: { id: board.projectId } });
  return { list, board, project };
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { listId } = await params;
  const loaded = await loadListWithBoardAndProject(listId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  return NextResponse.json({ list: loaded.list });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { listId } = await params;
  const loaded = await loadListWithBoardAndProject(listId);
  if (!loaded) return notFound();
  const { list, board, project } = loaded;
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
    const updated = await db.list.update({
      where: { id: listId },
      data: { ...(name ? { name } : {}) },
    });
    return NextResponse.json({ list: updated });
  }

  const siblings = await db.list.findMany({
    where: { boardId: board.id },
    orderBy: { position: "asc" },
  });
  const withoutMoved = siblings.filter((l) => l.id !== listId);
  const clamped = Math.max(0, Math.min(targetPosition, withoutMoved.length));
  withoutMoved.splice(clamped, 0, list);

  const updated = await db.$transaction(
    withoutMoved.map((l, index) =>
      db.list.update({
        where: { id: l.id },
        data: {
          position: index,
          ...(l.id === listId && name ? { name } : {}),
        },
      }),
    ),
  );
  return NextResponse.json({ list: updated.find((l) => l.id === listId) });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { listId } = await params;
  const loaded = await loadListWithBoardAndProject(listId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  await db.$transaction([
    db.card.updateMany({ where: { listId }, data: toBacklogPatch() }),
    db.list.delete({ where: { id: listId } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
