// GET/PATCH/DELETE /api/cards/:cardId
//
// PATCH edits fields only (title/description/priority/assigneeId/
// dueDate/cycleId) — never listId/position, which belong to
// POST /api/cards/:id/move. Editing is guarded exactly like list/board
// edits: rejected 409 ARCHIVED when the card's board (if any) or project
// is archived (cards live in design.md's "create/move/edit" guarded set).
// DELETE is exempt, matching the board/project delete exemption.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { assertWritable } from "@/lib/archive";
import { validateAssignee, validateCycle } from "@/lib/assignment";
import { conditionalUpdate } from "@/lib/version";
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
  params: Promise<{ cardId: string }>;
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
type PriorityValue = (typeof PRIORITIES)[number];

function isPriority(value: unknown): value is PriorityValue {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
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

  return NextResponse.json({ card: loaded.card });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
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
  if (!isRecord(raw) || typeof raw.version !== "number") {
    return badRequest("version is required");
  }
  if ("listId" in raw || "position" in raw) {
    return badRequest("Use POST /api/cards/:id/move to change listId or position");
  }
  if (raw.priority !== undefined && !isPriority(raw.priority)) {
    return badRequest(`priority must be one of ${PRIORITIES.join(", ")}`);
  }
  if (typeof raw.assigneeId === "string" && raw.assigneeId) {
    const check = await validateAssignee(db, project.teamId, raw.assigneeId);
    if (!check.ok) return badRequest(check.message);
  }
  if (typeof raw.cycleId === "string" && raw.cycleId) {
    const check = await validateCycle(db, project.id, raw.cycleId);
    if (!check.ok) return badRequest(check.message);
  }

  const data: Record<string, unknown> = {};
  if (typeof raw.title === "string" && raw.title.trim()) data.title = raw.title.trim();
  if (typeof raw.description === "string" || raw.description === null) {
    data.description = raw.description;
  }
  if (isPriority(raw.priority)) data.priority = raw.priority;
  if (typeof raw.assigneeId === "string" || raw.assigneeId === null) {
    data.assigneeId = raw.assigneeId || null;
  }
  if (typeof raw.cycleId === "string" || raw.cycleId === null) {
    data.cycleId = raw.cycleId || null;
  }
  if (typeof raw.dueDate === "string") {
    const parsedDate = new Date(raw.dueDate);
    if (Number.isNaN(parsedDate.getTime())) return badRequest("dueDate is not a valid date");
    data.dueDate = parsedDate;
  } else if (raw.dueDate === null) {
    data.dueDate = null;
  }

  const result = await conditionalUpdate(db.card, cardId, raw.version, data);
  if (!result.ok) {
    return conflictResponse({ code: "STALE_VERSION", message: "Stale version", entity: result.entity });
  }
  return NextResponse.json({ card: result.entity });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { cardId } = await params;
  const loaded = await loadCardContext(cardId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  await db.card.delete({ where: { id: cardId } });
  return new NextResponse(null, { status: 204 });
}
