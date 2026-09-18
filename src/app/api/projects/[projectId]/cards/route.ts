// GET  /api/projects/:projectId/cards?listId=<id>|backlog
// POST /api/projects/:projectId/cards { title, description?, priority?,
//        listId?, assigneeId?, dueDate?, cycleId? }
//
// Omitting `listId` (or passing null) creates a backlog card
// (`listId=null`, `position=null` — cards spec §"Backlog membership").
// A `listId` target appends the card at the end of that list; append
// always succeeds without a rebalance (`positionBetween(last, "")`
// never returns null — see reorder.ts).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { assertWritable } from "@/lib/archive";
import { positionBetween } from "@/lib/reorder";
import { validateAssignee, validateCycle } from "@/lib/assignment";
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

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
type PriorityValue = (typeof PRIORITIES)[number];

function isPriority(value: unknown): value is PriorityValue {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
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
  const listIdParam = url.searchParams.get("listId");
  const where =
    listIdParam === null
      ? { projectId }
      : listIdParam === "backlog"
        ? { projectId, listId: null }
        : { projectId, listId: listIdParam };

  const cards = await db.card.findMany({ where, orderBy: { position: "asc" } });
  return NextResponse.json({ cards });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound();
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  if (!isRecord(raw)) return badRequest("Malformed body");

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return badRequest("title is required");

  const priority: PriorityValue = isPriority(raw.priority) ? raw.priority : "MEDIUM";
  if (raw.priority !== undefined && !isPriority(raw.priority)) {
    return badRequest(`priority must be one of ${PRIORITIES.join(", ")}`);
  }

  const listId = typeof raw.listId === "string" ? raw.listId : null;

  let boardForGuard: { archivedAt: Date | string | null } | null = null;
  if (listId !== null) {
    const list = await db.list.findUnique({ where: { id: listId } });
    if (!list) return badRequest("listId does not reference an existing list");
    const board = await db.board.findUniqueOrThrow({ where: { id: list.boardId } });
    if (board.projectId !== projectId) {
      return badRequest("listId does not belong to this project");
    }
    boardForGuard = board;
  }

  const writable = assertWritable(boardForGuard, project);
  if (!writable.ok) return conflictResponse(writable.conflict);

  if (typeof raw.assigneeId === "string" && raw.assigneeId) {
    const check = await validateAssignee(db, project.teamId, raw.assigneeId);
    if (!check.ok) return badRequest(check.message);
  }
  if (typeof raw.cycleId === "string" && raw.cycleId) {
    const check = await validateCycle(db, projectId, raw.cycleId);
    if (!check.ok) return badRequest(check.message);
  }
  let dueDate: Date | undefined;
  if (typeof raw.dueDate === "string" && raw.dueDate) {
    const parsedDate = new Date(raw.dueDate);
    if (Number.isNaN(parsedDate.getTime())) return badRequest("dueDate is not a valid date");
    dueDate = parsedDate;
  }

  let position: string | null = null;
  if (listId !== null) {
    const last = await db.card.findFirst({
      where: { listId },
      orderBy: { position: "desc" },
    });
    position = positionBetween(last?.position ?? "", "");
  }

  const card = await db.card.create({
    data: {
      title,
      description: typeof raw.description === "string" ? raw.description : null,
      priority,
      listId,
      position,
      projectId,
      assigneeId: typeof raw.assigneeId === "string" && raw.assigneeId ? raw.assigneeId : null,
      cycleId: typeof raw.cycleId === "string" && raw.cycleId ? raw.cycleId : null,
      dueDate,
    },
  });
  return NextResponse.json({ card }, { status: 201 });
}
