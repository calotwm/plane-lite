import { describe, expect, it } from "vitest";
import { assertWritable } from "@/lib/archive";
import { isArchivedConflict } from "@/lib/errors";

function archivedOf(result: ReturnType<typeof assertWritable>) {
  if (result.ok) throw new Error("expected archived conflict");
  if (!isArchivedConflict(result.conflict)) {
    throw new Error(`expected ARCHIVED, got ${result.conflict.code}`);
  }
  return result.conflict;
}

describe("assertWritable", () => {
  it("passes when neither board nor project is archived", () => {
    expect(
      assertWritable({ archivedAt: null }, { archivedAt: null }),
    ).toEqual({ ok: true });
  });

  it("rejects when the board is archived with scope=board", () => {
    const conflict = archivedOf(
      assertWritable(
        { archivedAt: new Date("2026-01-01T00:00:00Z") },
        { archivedAt: null },
      ),
    );
    expect(conflict.code).toBe("ARCHIVED");
    expect(conflict.archivedScope).toBe("board");
    expect(conflict.message).toMatch(/board/i);
  });

  it("rejects when the project is archived with scope=project", () => {
    const conflict = archivedOf(
      assertWritable(
        { archivedAt: null },
        { archivedAt: new Date("2026-02-01T00:00:00Z") },
      ),
    );
    expect(conflict.code).toBe("ARCHIVED");
    expect(conflict.archivedScope).toBe("project");
  });

  it("board wins over project when both are archived (most specific scope)", () => {
    const conflict = archivedOf(
      assertWritable(
        { archivedAt: new Date("2026-03-01T00:00:00Z") },
        { archivedAt: new Date("2026-04-01T00:00:00Z") },
      ),
    );
    expect(conflict.archivedScope).toBe("board");
  });

  it("accepts null board (cards moving out of any list still check the project)", () => {
    expect(
      assertWritable(null, { archivedAt: null }),
    ).toEqual({ ok: true });
  });

  it("rejects on archived project even when board is null (backlog-only move)", () => {
    const conflict = archivedOf(
      assertWritable(null, {
        archivedAt: new Date("2026-05-01T00:00:00Z"),
      }),
    );
    expect(conflict.archivedScope).toBe("project");
  });

  it("does not touch the version field — the 409 body has no `entity` key", () => {
    // ARCHIVED bodies carry only `code`, `message`, `archivedScope` —
    // no entity snapshot, per design.md. This test pins the contract so
    // a future refactor doesn't accidentally add it.
    const conflict = archivedOf(
      assertWritable({ archivedAt: new Date() }, { archivedAt: null }),
    );
    expect(Object.keys(conflict).sort()).toEqual([
      "archivedScope",
      "code",
      "message",
    ]);
  });

  it("is pure — repeated calls return equivalent bodies", () => {
    const board = { archivedAt: new Date("2026-01-01T00:00:00Z") };
    const project = { archivedAt: null };
    const a = assertWritable(board, project);
    const b = assertWritable(board, project);
    expect(a.ok).toBe(b.ok);
    if (!a.ok && !b.ok) {
      expect(a.conflict).toEqual(b.conflict);
    }
  });
});