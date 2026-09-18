// GET/PATCH/DELETE /api/cycles/:cycleId
//
// DELETE per cycles spec §"Delete cycle": the cycle is removed and its
// cards become cycle-less (`cycleId=null`) — handled automatically by
// `Card.cycle`'s `onDelete: SetNull` in the schema.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { withDerivedStatus } from "@/lib/cycleStatus";
import {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  conflictResponse,
  isRecord,
  readJson,
} from "@/lib/http";
import { conditionalUpdate } from "@/lib/version";

interface RouteParams {
  params: Promise<{ cycleId: string }>;
}

export const dynamic = "force-dynamic";

async function loadCycleWithProject(cycleId: string) {
  const cycle = await db.cycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return null;
  const project = await db.project.findUniqueOrThrow({ where: { id: cycle.projectId } });
  return { cycle, project };
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { cycleId } = await params;
  const loaded = await loadCycleWithProject(cycleId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  return NextResponse.json({ cycle: withDerivedStatus(loaded.cycle) });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { cycleId } = await params;
  const loaded = await loadCycleWithProject(cycleId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  if (!isRecord(raw) || typeof raw.version !== "number") {
    return badRequest("version is required");
  }

  const data: Record<string, unknown> = {};
  if (typeof raw.name === "string" && raw.name.trim()) data.name = raw.name.trim();
  if (raw.status === "PLANNED" || raw.status === "ACTIVE" || raw.status === "DONE") {
    data.status = raw.status;
  }

  const nextStart =
    typeof raw.startDate === "string" ? new Date(raw.startDate) : loaded.cycle.startDate;
  const nextEnd = typeof raw.endDate === "string" ? new Date(raw.endDate) : loaded.cycle.endDate;
  if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
    return badRequest("startDate/endDate are not valid dates");
  }
  if (nextEnd < nextStart) return badRequest("endDate must not precede startDate");
  if (typeof raw.startDate === "string") data.startDate = nextStart;
  if (typeof raw.endDate === "string") data.endDate = nextEnd;

  const result = await conditionalUpdate(db.cycle, cycleId, raw.version, data);
  if (!result.ok) {
    return conflictResponse({ code: "STALE_VERSION", message: "Stale version", entity: result.entity });
  }
  return NextResponse.json({ cycle: withDerivedStatus(result.entity) });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { cycleId } = await params;
  const loaded = await loadCycleWithProject(cycleId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  await db.cycle.delete({ where: { id: cycleId } });
  return new NextResponse(null, { status: 204 });
}
