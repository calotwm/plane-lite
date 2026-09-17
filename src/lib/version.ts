import { PrismaClient } from "@prisma/client";

// Conditional update with optimistic concurrency.
//
// Each mutable entity carries a `version Int`. `conditionalUpdate` issues
// `updateMany WHERE id = ? AND version = expected` and only treats the
// update as successful when exactly one row matches. On a miss it reads
// the current row so the 409 STALE_VERSION body can attach it without a
// second round-trip from the caller.
//
// `version` is incremented atomically as part of the same UPDATE.

export type ConditionalUpdateResult<T extends VersionedEntity> =
  | { ok: true; entity: T }
  | { ok: false; code: "STALE_VERSION"; entity: T | null };

export interface VersionedEntity {
  id: string;
  version: number;
}

// Minimal Prisma delegate surface. Every model in `prisma/schema.prisma`
// exposes `updateMany` and `findUnique`, so this is structural enough to
// accept `db.card`, `db.list`, etc., without a per-model overload.
export interface VersionedDelegate<T extends VersionedEntity> {
  updateMany(args: {
    where: { id: string; version: number };
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findUnique(args: { where: { id: string } }): Promise<T | null>;
}

export async function conditionalUpdate<
  T extends VersionedEntity,
  D extends Partial<Omit<T, "id" | "version" | "createdAt" | "updatedAt">>,
>(
  delegate: VersionedDelegate<T>,
  id: string,
  expectedVersion: number,
  data: D,
): Promise<ConditionalUpdateResult<T>> {
  const result = await delegate.updateMany({
    where: { id, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });

  if (result.count === 1) {
    const entity = await delegate.findUnique({ where: { id } });
    if (!entity) {
      // Cannot happen: we just updated this row in the same call.
      throw new Error(
        `conditionalUpdate: row ${id} missing immediately after a successful update`,
      );
    }
    return { ok: true, entity };
  }

  const current = await delegate.findUnique({ where: { id } });
  return { ok: false, code: "STALE_VERSION", entity: current };
}

// Convenience re-export so route handlers don't import @prisma/client
// just to call this helper.
export type DbClient = PrismaClient;