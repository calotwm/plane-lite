// GET  /api/projects/:projectId/labels
// POST /api/projects/:projectId/labels { name, color }
//
// Labels spec §"Label CRUD": names are unique within a project
// (`@@unique([projectId, name])` — the Prisma P2002 error becomes 400).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
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

  const labels = await db.label.findMany({ where: { projectId }, orderBy: { name: "asc" } });
  return NextResponse.json({ labels });
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
  const name = isRecord(raw) && typeof raw.name === "string" ? raw.name.trim() : "";
  const color = isRecord(raw) && typeof raw.color === "string" ? raw.color.trim() : "";
  if (!name) return badRequest("name is required");
  if (!color) return badRequest("color is required");

  try {
    const label = await db.label.create({ data: { name, color, projectId } });
    return NextResponse.json({ label }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return badRequest(`A label named "${name}" already exists in this project`);
    }
    throw error;
  }
}
