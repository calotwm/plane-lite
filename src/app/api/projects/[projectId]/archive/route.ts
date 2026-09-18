// POST /api/projects/:projectId/archive -> { project } | 403
//
// Non-destructive per specs/projects/spec.md §"Project archive and
// restore": only sets archivedAt, never touches boards/lists/cards.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { unauthorized, forbidden, notFound } from "@/lib/http";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound();
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const updated = await db.project.update({
    where: { id: projectId },
    data: { archivedAt: new Date() },
  });
  return NextResponse.json({ project: updated });
}
