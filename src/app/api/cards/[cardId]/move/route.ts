// POST /api/cards/:cardId/move { version, listId, index? }
//
// The one atomic reorder endpoint per design.md §Data Flow: the archived
// guard runs BEFORE the version check so the two 409 classes never
// collide, then the moving card's version-checked update and any sibling
// rebalance commit in a single transaction.
//
// `listId: null` moves the card to the backlog (`position` cleared too,
// no `index` needed). `listId: <id>` moves/reorders it into that list at
// `index` (0-based among the destination list's OTHER cards; omitted =
// append at the end).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { assertWritable } from "@/lib/archive";
import { toBacklogPatch } from "@/lib/reorder";
import { computePlacement } from "@/lib/cardOrder";
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

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { cardId } = await params;
  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card) return notFound();
  const project = await db.project.findUniqueOrThrow({ where: { id: card.projectId } });
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  if (!isRecord(raw) || typeof raw.version !== "number") {
    return badRequest("version is required");
  }
  if (!("listId" in raw) || !(raw.listId === null || typeof raw.listId === "string")) {
    return badRequest("listId is required (string or null)");
  }
  const targetListId = raw.listId as string | null;
  const index = typeof raw.index === "number" ? raw.index : Number.POSITIVE_INFINITY;

  // -- Archived guard BEFORE the version check (design.md §Data Flow) --
  if (targetListId === null) {
    const writable = assertWritable(null, project);
    if (!writable.ok) return conflictResponse(writable.conflict);
  } else {
    const targetList = await db.list.findUnique({ where: { id: targetListId } });
    if (!targetList) return badRequest("listId does not reference an existing list");
    const targetBoard = await db.board.findUniqueOrThrow({ where: { id: targetList.boardId } });
    if (targetBoard.projectId !== project.id) {
      return badRequest("listId does not belong to this card's project");
    }
    const writable = assertWritable(targetBoard, project);
    if (!writable.ok) return conflictResponse(writable.conflict);
  }

  // -- Apply atomically: the destination read, placement computation, the
  // version-checked move, and any sibling rebalance ALL happen inside one
  // transaction. Reading siblings outside the transaction would let two
  // concurrent moves into the same list both see the same "before" state
  // and compute colliding positions (cards spec §"Concurrent drops stay
  // consistent") — SQLite serializes overlapping write transactions, so
  // keeping the read inside is what makes the second mover see the
  // first mover's result instead of a stale snapshot.
  const outcome = await db.$transaction(async (tx) => {
    let moveData: { listId: string | null; position: string | null };
    let siblingPositions: { id: string; position: string }[] = [];

    if (targetListId === null) {
      moveData = toBacklogPatch();
    } else {
      const existing = await tx.card.findMany({
        where: { listId: targetListId, id: { not: cardId } },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      const placement = computePlacement(existing, index, cardId);
      if (placement.kind === "single") {
        moveData = { listId: targetListId, position: placement.position };
      } else {
        const mine = placement.positions.find((p) => p.id === cardId);
        if (!mine) {
          // Cannot happen: computePlacement always includes the moving card.
          throw new Error("move: rebalance result missing the moving card");
        }
        moveData = { listId: targetListId, position: mine.position };
        siblingPositions = placement.positions.filter((p) => p.id !== cardId);
      }
    }

    const result = await conditionalUpdate(tx.card, cardId, raw.version as number, moveData);
    if (!result.ok) return result;
    for (const sibling of siblingPositions) {
      await tx.card.update({ where: { id: sibling.id }, data: { position: sibling.position } });
    }
    return result;
  });

  if (!outcome.ok) {
    return conflictResponse({
      code: "STALE_VERSION",
      message: "Stale version",
      entity: outcome.entity,
    });
  }
  return NextResponse.json({ card: outcome.entity });
}
