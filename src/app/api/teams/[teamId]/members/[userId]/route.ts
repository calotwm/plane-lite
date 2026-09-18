// DELETE /api/teams/:teamId/members/:userId -> remove a member (admin only)

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser } from "@/lib/scope";
import { unauthorized, forbidden, notFound } from "@/lib/http";

interface RouteParams {
  params: Promise<{ teamId: string; userId: string }>;
}

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const { teamId, userId } = await params;
  const existing = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!existing) return notFound();

  await db.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
  return new NextResponse(null, { status: 204 });
}
