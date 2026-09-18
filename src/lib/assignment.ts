// Cross-entity validation shared by card create/update/move routes.
//
// - `validateAssignee`: teams spec §"Valid assignees" — a card assignee
//   must be an active user with team access to the card's project.
// - `validateCycle`: cycles spec §"Card assignment" — only a cycle of
//   the card's own project may be assigned ("Cross-project cycle
//   rejected").

import type { PrismaClient } from "@prisma/client";

export type ValidationResult = { ok: true } | { ok: false; message: string };

export async function validateAssignee(
  db: PrismaClient,
  teamId: string,
  assigneeId: string,
): Promise<ValidationResult> {
  const user = await db.user.findUnique({
    where: { id: assigneeId },
    select: { isActive: true, isAdmin: true, teamMemberships: { select: { teamId: true } } },
  });
  if (!user || !user.isActive) {
    return { ok: false, message: "assigneeId does not reference an active user" };
  }
  const hasAccess = user.isAdmin || user.teamMemberships.some((m) => m.teamId === teamId);
  if (!hasAccess) {
    return { ok: false, message: "assignee has no access to this project's team" };
  }
  return { ok: true };
}

export async function validateCycle(
  db: PrismaClient,
  projectId: string,
  cycleId: string,
): Promise<ValidationResult> {
  const cycle = await db.cycle.findUnique({ where: { id: cycleId }, select: { projectId: true } });
  if (!cycle || cycle.projectId !== projectId) {
    return { ok: false, message: "cycleId does not reference a cycle in this project" };
  }
  return { ok: true };
}
