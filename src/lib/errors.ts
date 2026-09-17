// 409 conflict body contract per openspec/changes/core-mvp/design.md.
//
// Every write route distinguishes optimistic-concurrency misses from
// archive rejections by carrying a machine-readable `code`. The two 409
// classes never collide: the archived guard runs BEFORE the version check
// (see design.md §Data Flow), so a request either fails as ARCHIVED
// without touching the row or fails as STALE_VERSION with the current
// state attached for refetch.

export type ConflictCode = "STALE_VERSION" | "ARCHIVED";

export interface ArchivedConflict {
  code: "ARCHIVED";
  message: string;
  archivedScope: "board" | "project";
}

export interface StaleVersionConflict {
  code: "STALE_VERSION";
  message: string;
  entity: unknown;
}

export type ConflictBody = ArchivedConflict | StaleVersionConflict;

// Type guards so route handlers can narrow without re-reading `code`.
export function isArchivedConflict(
  body: ConflictBody,
): body is ArchivedConflict {
  return body.code === "ARCHIVED";
}

export function isStaleVersionConflict(
  body: ConflictBody,
): body is StaleVersionConflict {
  return body.code === "STALE_VERSION";
}

// Overloaded builder: ARCHIVED requires `archivedScope`, STALE_VERSION
// requires `entity`. Throws when the args don't match the code so callers
// can't silently produce a malformed body.
export function conflict(
  code: "ARCHIVED",
  opts: { message?: string; archivedScope: "board" | "project" },
): ArchivedConflict;
export function conflict(
  code: "STALE_VERSION",
  opts: { message?: string; entity: unknown },
): StaleVersionConflict;
export function conflict(
  code: ConflictCode,
  opts: {
    message?: string;
    archivedScope?: "board" | "project";
    entity?: unknown;
  },
): ConflictBody {
  if (code === "ARCHIVED") {
    if (!opts.archivedScope) {
      throw new Error("conflict(ARCHIVED): archivedScope is required");
    }
    return {
      code: "ARCHIVED",
      message: opts.message ?? defaultArchivedMessage(opts.archivedScope),
      archivedScope: opts.archivedScope,
    };
  }
  // STALE_VERSION
  return {
    code: "STALE_VERSION",
    message: opts.message ?? "Stale version",
    entity: opts.entity,
  };
}

function defaultArchivedMessage(scope: "board" | "project"): string {
  return scope === "board" ? "Board is archived" : "Project is archived";
}

// Direct builders — convenience for callers that already know which
// branch they want. Both throw on contract violation, same as `conflict`.
export function archivedConflict(opts: {
  message?: string;
  archivedScope: "board" | "project";
}): ArchivedConflict {
  return {
    code: "ARCHIVED",
    message: opts.message ?? defaultArchivedMessage(opts.archivedScope),
    archivedScope: opts.archivedScope,
  };
}

export function staleVersionConflict(opts: {
  message?: string;
  entity: unknown;
}): StaleVersionConflict {
  return {
    code: "STALE_VERSION",
    message: opts.message ?? "Stale version",
    entity: opts.entity,
  };
}

// Untyped builder — used only by tests that intentionally violate the
// per-code arg shape (e.g. ARCHIVED without archivedScope) so the
// runtime guard fires. Routes should never call this.
export function conflictUnsafe(
  code: ConflictCode,
  opts: {
    message?: string;
    archivedScope?: "board" | "project";
    entity?: unknown;
  },
): ConflictBody {
  if (code === "ARCHIVED") {
    if (!opts.archivedScope) {
      throw new Error("conflict(ARCHIVED): archivedScope is required");
    }
    return {
      code: "ARCHIVED",
      message: opts.message ?? defaultArchivedMessage(opts.archivedScope),
      archivedScope: opts.archivedScope,
    };
  }
  return {
    code: "STALE_VERSION",
    message: opts.message ?? "Stale version",
    entity: opts.entity,
  };
}