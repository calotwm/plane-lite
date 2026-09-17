import { archivedConflict } from "./errors";
import type { ConflictBody } from "./errors";

// Archived guard per openspec/changes/core-mvp/design.md §Data Flow.
//
// Every write route calls `assertWritable` BEFORE the version check so
// the two 409 classes never collide. An archived board or its archived
// parent project short-circuits the request — no row is touched, no
// version is consumed, no stale-version body is attached.
//
// `assertWritable` is pure and takes only the `archivedAt` columns so it
// can be exercised from unit tests without a full Prisma row.

export interface Archived {
  archivedAt: Date | string | null;
}

export type WritableCheck =
  | { ok: true }
  | { ok: false; conflict: ConflictBody };

// Board wins over project when both are archived: the most specific
// scope helps the client surface a useful message ("Board is archived")
// instead of leaking the parent project state.
export function assertWritable(
  board: Archived | null,
  project: Archived,
): WritableCheck {
  if (board !== null && board.archivedAt !== null) {
    return { ok: false, conflict: archivedConflict({ archivedScope: "board" }) };
  }
  if (project.archivedAt !== null) {
    return {
      ok: false,
      conflict: archivedConflict({ archivedScope: "project" }),
    };
  }
  return { ok: true };
}