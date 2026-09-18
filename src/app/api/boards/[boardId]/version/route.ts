// GET /api/boards/:boardId/version -> { version, updatedAt }
//
// Cheap polling probe per design.md §Architecture Decisions ("Polling"):
// clients poll this every 15s and refetch the full board only when
// `version` changed, instead of re-fetching the whole board on a timer.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { unauthorized, forbidden, notFound } from "@/lib/http";

interface RouteParams {
  params: Promise<{ boardId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { boardId } = await params;
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { id: true, version: true, updatedAt: true, projectId: true },
  });
  if (!board) return notFound();
  const project = await db.project.findUniqueOrThrow({ where: { id: board.projectId } });
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  return NextResponse.json({ version: board.version, updatedAt: board.updatedAt });
}
