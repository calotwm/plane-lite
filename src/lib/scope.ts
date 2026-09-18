// Team-scoped access helper per openspec/changes/core-mvp/specs/teams/spec.md
// §"Team-scoped access": a project's boards/cards are reachable only by
// members of the project's owning team, plus admins.
//
// `requireSessionUser` wraps `getSessionUser` with the same
// store/db wiring every route needs, so route handlers do not each
// re-derive a `prismaSessionStore(db)` instance.

import type { PrismaClient } from "@prisma/client";
import { getSessionUser, prismaSessionStore } from "@/auth/session";
import type { SessionUser } from "@/auth/provider";

export async function requireSessionUser(
  request: Request,
  db: PrismaClient,
): Promise<SessionUser | null> {
  const store = prismaSessionStore(db);
  return getSessionUser({ headers: request.headers }, store, db);
}

// Admins bypass every team scope check; everyone else needs an explicit
// membership row (carried on SessionUser.teamIds at session-read time).
export function hasTeamAccess(user: SessionUser, teamId: string): boolean {
  return user.role === "admin" || user.teamIds.includes(teamId);
}
