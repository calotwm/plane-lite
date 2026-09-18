// DELETE /api/comments/:commentId — the comment's own author or an admin only.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { unauthorized, forbidden, notFound } from "@/lib/http";

interface RouteParams {
  params: Promise<{ commentId: string }>;
}

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { commentId } = await params;
  const comment = await db.comment.findUnique({ where: { id: commentId } });
  if (!comment) return notFound();
  const card = await db.card.findUniqueOrThrow({ where: { id: comment.cardId } });
  const project = await db.project.findUniqueOrThrow({ where: { id: card.projectId } });
  if (!hasTeamAccess(user, project.teamId)) return forbidden();
  if (comment.authorId !== user.id && user.role !== "admin") return forbidden();

  await db.comment.delete({ where: { id: commentId } });
  return new NextResponse(null, { status: 204 });
}
