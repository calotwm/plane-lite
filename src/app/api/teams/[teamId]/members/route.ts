// GET  /api/teams/:teamId/members                 -> list members (admin only)
// POST /api/teams/:teamId/members { userId, role? } -> add a member (admin only)

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser } from "@/lib/scope";
import { unauthorized, forbidden, notFound, badRequest, isRecord, readJson } from "@/lib/http";

interface RouteParams {
  params: Promise<{ teamId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const { teamId } = await params;
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return notFound();

  const members = await db.teamMember.findMany({
    where: { teamId },
    include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ members });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const { teamId } = await params;
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return notFound();

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  const userId = isRecord(raw) && typeof raw.userId === "string" ? raw.userId : "";
  const role = isRecord(raw) && typeof raw.role === "string" ? raw.role : "member";
  if (!userId) return badRequest("userId is required");

  const targetUser = await db.user.findUnique({ where: { id: userId } });
  if (!targetUser) return badRequest("userId does not reference an existing user");

  const existing = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (existing) return badRequest("User is already a member of this team");

  const member = await db.teamMember.create({ data: { teamId, userId, role } });
  return NextResponse.json({ member }, { status: 201 });
}
