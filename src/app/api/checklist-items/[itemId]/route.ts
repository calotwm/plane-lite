// PATCH/DELETE /api/checklist-items/:itemId
//
// PATCH toggles `done` and/or edits `text`, version-checked like every
// other mutable entity. DELETE is exempt from the archived guard,
// matching the card/board/project delete exemption.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionUser, hasTeamAccess } from "@/lib/scope";
import { unauthorized, forbidden, notFound, badRequest, conflictResponse, isRecord, readJson } from "@/lib/http";
import { conditionalUpdate } from "@/lib/version";

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

export const dynamic = "force-dynamic";

async function loadItemWithProject(itemId: string) {
  const item = await db.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) return null;
  const card = await db.card.findUniqueOrThrow({ where: { id: item.cardId } });
  const project = await db.project.findUniqueOrThrow({ where: { id: card.projectId } });
  return { item, project };
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { itemId } = await params;
  const loaded = await loadItemWithProject(itemId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.value;
  if (!isRecord(raw) || typeof raw.version !== "number") {
    return badRequest("version is required");
  }
  const data: Record<string, unknown> = {};
  if (typeof raw.text === "string" && raw.text.trim()) data.text = raw.text.trim();
  if (typeof raw.done === "boolean") data.done = raw.done;

  const result = await conditionalUpdate(db.checklistItem, itemId, raw.version, data);
  if (!result.ok) {
    return conflictResponse({ code: "STALE_VERSION", message: "Stale version", entity: result.entity });
  }
  return NextResponse.json({ item: result.entity });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const user = await requireSessionUser(request, db);
  if (!user) return unauthorized();

  const { itemId } = await params;
  const loaded = await loadItemWithProject(itemId);
  if (!loaded) return notFound();
  if (!hasTeamAccess(user, loaded.project.teamId)) return forbidden();

  await db.checklistItem.delete({ where: { id: itemId } });
  return new NextResponse(null, { status: 204 });
}
