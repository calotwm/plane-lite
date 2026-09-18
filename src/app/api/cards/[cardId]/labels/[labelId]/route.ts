// DELETE /api/cards/:cardId/labels/:labelId -> remove a label from a card

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { unauthorized, forbidden, notFound } from "@/lib/http";

interface RouteParams {
  params: Promise<{ cardId: string; labelId: string }>;
}

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { cardId, labelId } = await params;
  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card) return notFound();
  const project = await db.project.findUniqueOrThrow({ where: { id: card.projectId } });
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const existing = await db.cardLabel.findUnique({
    where: { cardId_labelId: { cardId, labelId } },
  });
  if (!existing) return notFound();

  await db.cardLabel.delete({ where: { cardId_labelId: { cardId, labelId } } });
  return new NextResponse(null, { status: 204 });
}
