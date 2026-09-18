// GET  /api/cards/:cardId/comments
// POST /api/cards/:cardId/comments { body } -> authored by the caller
//
// Extends core-mvp: not in the original proposal.md scope, added on
// request. `authorId` always comes from the session, never the client.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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

  const comments = await db.comment.findMany({
    where: { cardId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json({ comments });
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
  const body = isRecord(raw) && typeof raw.body === "string" ? raw.body.trim() : "";
  if (!body) return badRequest("body is required");

  const comment = await db.comment.create({
    data: { cardId, authorId: user.id, body },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json({ comment }, { status: 201 });
}
