// GET  /api/cards/:cardId/checklist-items
// POST /api/cards/:cardId/checklist-items { text } -> appended at the end
//
// Extends core-mvp: not in the original proposal.md scope, added on
// request. Follows the same guard/version conventions as cards.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { assertWritable } from "@/lib/archive";
import { unauthorized, forbidden, notFound, badRequest, conflictResponse, isRecord, readJson } from "@/lib/http";

interface RouteParams {
  params: Promise<{ cardId: string }>;
}

export const dynamic = "force-dynamic";

async function loadCardContext(cardId: string) {
  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card) return null;
  const project = await db.project.findUniqueOrThrow({ where: { id: card.projectId } });
  const board = card.listId
    ? await db.board.findUniqueOrThrow({
        where: { id: (await db.list.findUniqueOrThrow({ where: { id: card.listId } })).boardId },
      })
    : null;
  return { card, project, board };
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { cardId } = await params;
  const loaded = await loadCardContext(cardId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  const items = await db.checklistItem.findMany({ where: { cardId }, orderBy: { position: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { cardId } = await params;
  const loaded = await loadCardContext(cardId);
  if (!loaded) return notFound();
  const { project, board } = loaded;
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const writable = assertWritable(board, project);
  if (!writable.ok) return conflictResponse(writable.conflict);

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  const text = isRecord(raw) && typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return badRequest("text is required");

  const count = await db.checklistItem.count({ where: { cardId } });
  const item = await db.checklistItem.create({ data: { cardId, text, position: count } });
  return NextResponse.json({ item }, { status: 201 });
}
