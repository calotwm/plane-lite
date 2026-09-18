// GET  /api/projects/:projectId/cycles
// POST /api/projects/:projectId/cycles { name, startDate, endDate, status? }
//
// Cycles spec §"Cycle validity": endDate MUST NOT precede startDate.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { withDerivedStatus } from "@/lib/cycleStatus";
import { unauthorized, forbidden, notFound, badRequest, isRecord, readJson } from "@/lib/http";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound();
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const cycles = await db.cycle.findMany({ where: { projectId }, orderBy: { startDate: "asc" } });
  return NextResponse.json({ cycles: cycles.map(withDerivedStatus) });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound();
  if (!hasTeamAccess(user, project.teamId)) return forbidden();

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  if (!isRecord(raw)) return badRequest("Malformed body");

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return badRequest("name is required");
  if (typeof raw.startDate !== "string" || typeof raw.endDate !== "string") {
    return badRequest("startDate and endDate are required");
  }
  const startDate = new Date(raw.startDate);
  const endDate = new Date(raw.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return badRequest("startDate/endDate are not valid dates");
  }
  if (endDate < startDate) {
    return badRequest("endDate must not precede startDate");
  }
  const status =
    raw.status === "PLANNED" || raw.status === "ACTIVE" || raw.status === "DONE"
      ? raw.status
      : "PLANNED";

  const cycle = await db.cycle.create({
    data: { name, projectId, startDate, endDate, status },
  });
  return NextResponse.json({ cycle: withDerivedStatus(cycle) }, { status: 201 });
}
