// POST /api/projects/:projectId/restore -> { project } | 403
//
// Re-enables writes with no further action: clearing archivedAt is
// sufficient (see design.md §Data Flow "Restore" note). Boards keep
// whatever archive state they already had — restoring the project never
// touches them.

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
    data: { archivedAt: null },
  });
  return NextResponse.json({ project: updated });
}
