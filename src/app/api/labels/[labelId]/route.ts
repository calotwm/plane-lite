// PATCH/DELETE /api/labels/:labelId

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
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
  params: Promise<{ labelId: string }>;
}

export const dynamic = "force-dynamic";

async function loadLabelWithProject(labelId: string) {
  const label = await db.label.findUnique({ where: { id: labelId } });
  if (!label) return null;
  const project = await db.project.findUniqueOrThrow({ where: { id: label.projectId } });
  return { label, project };
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { labelId } = await params;
  const loaded = await loadLabelWithProject(labelId);
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
  if (typeof raw.color === "string" && raw.color.trim()) data.color = raw.color.trim();

  try {
    const result = await conditionalUpdate(db.label, labelId, raw.version, data);
    if (!result.ok) {
      return conflictResponse({ code: "STALE_VERSION", message: "Stale version", entity: result.entity });
    }
    return NextResponse.json({ label: result.entity });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return badRequest("A label with that name already exists in this project");
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { labelId } = await params;
  const loaded = await loadLabelWithProject(labelId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  await db.label.delete({ where: { id: labelId } });
  return new NextResponse(null, { status: 204 });
}
