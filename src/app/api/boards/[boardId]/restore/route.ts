// POST /api/boards/:boardId/restore -> { board } | 403

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { unauthorized, forbidden, notFound } from "@/lib/http";

interface RouteParams {
  params: Promise<{ boardId: string }>;
}

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { boardId } = await params;
  const board = await db.board.findUnique({ where: { id: boardId } });
  if (!board) return notFound();
  const project = await db.project.findUniqueOrThrow({ where: { id: board.projectId } });
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const updated = await db.board.update({
    where: { id: boardId },
    data: { archivedAt: null },
  });
  return NextResponse.json({ board: updated });
}
