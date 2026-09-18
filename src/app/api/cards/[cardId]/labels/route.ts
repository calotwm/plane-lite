// POST /api/cards/:cardId/labels { labelId } -> apply a label to a card
//
// Labels spec §"Project scope of labels": a card only accepts labels
// from its own project ("Cross-project label rejected").

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { unauthorized, forbidden, notFound, badRequest, isRecord, readJson } from "@/lib/http";

interface RouteParams {
  params: Promise<{ cardId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { cardId } = await params;
  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card) return notFound();
  const project = await db.project.findUniqueOrThrow({ where: { id: card.projectId } });
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const cardLabels = await db.cardLabel.findMany({
    where: { cardId },
    include: { label: true },
  });
  return NextResponse.json({ labels: cardLabels.map((cl) => cl.label) });
}

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
  const labelId = isRecord(raw) && typeof raw.labelId === "string" ? raw.labelId : "";
  if (!labelId) return badRequest("labelId is required");

  const label = await db.label.findUnique({ where: { id: labelId } });
  if (!label || label.projectId !== card.projectId) {
    return badRequest("labelId does not reference a label in this card's project");
  }

  try {
    const cardLabel = await db.cardLabel.create({ data: { cardId, labelId } });
    return NextResponse.json({ cardLabel }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return badRequest("Label is already applied to this card");
    }
    throw error;
  }
}
