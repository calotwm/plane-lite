import { describe, expect, it } from "vitest";
import {
  archivedConflict,
  conflict,
  conflictUnsafe,
  isArchivedConflict,
  isStaleVersionConflict,
  staleVersionConflict,
  type ConflictBody,
} from "@/lib/errors";

describe("conflict()", () => {
  it("builds an ARCHIVED body with the required scope", () => {
    const body = conflict("ARCHIVED", { archivedScope: "board" });
    expect(body).toEqual({
      code: "ARCHIVED",
      message: "Board is archived",
      archivedScope: "board",
    });
    expect(isArchivedConflict(body)).toBe(true);
    expect(isStaleVersionConflict(body)).toBe(false);
  });

  it("defaults the message when omitted", () => {
    expect(conflict("ARCHIVED", { archivedScope: "board" }).message).toBe(
      "Board is archived",
    );
    expect(conflict("ARCHIVED", { archivedScope: "project" }).message).toBe(
      "Project is archived",
    );
  });

  it("builds a STALE_VERSION body with the current entity attached", () => {
    const current = { id: "card-1", version: 4, title: "stale" };
    const body = conflict("STALE_VERSION", { entity: current });
    expect(body).toEqual({
      code: "STALE_VERSION",
      message: "Stale version",
      entity: current,
    });
    expect(isStaleVersionConflict(body)).toBe(true);
    expect(isArchivedConflict(body)).toBe(false);
  });

  it("preserves a caller-supplied message", () => {
    const body = conflict("STALE_VERSION", {
      entity: null,
      message: "Card was updated by someone else",
    });
    expect(body.message).toBe("Card was updated by someone else");
  });

  it("throws when ARCHIVED is built without archivedScope", () => {
    expect(() => conflictUnsafe("ARCHIVED", {})).toThrow(/archivedScope/);
  });

  it("allows `entity: null` for STALE_VERSION when the row was deleted", () => {
    const body = conflict("STALE_VERSION", { entity: null });
    expect(body.code).toBe("STALE_VERSION");
    expect(body.entity).toBeNull();
  });
});

describe("archivedConflict() and staleVersionConflict()", () => {
  it("archivedConflict() matches conflict('ARCHIVED', …)", () => {
    expect(archivedConflict({ archivedScope: "project" })).toEqual(
      conflict("ARCHIVED", { archivedScope: "project" }),
    );
  });

  it("staleVersionConflict() matches conflict('STALE_VERSION', …)", () => {
    const entity = { id: "x", version: 1 };
    expect(staleVersionConflict({ entity })).toEqual(
      conflict("STALE_VERSION", { entity }),
    );
  });

  it("type guards reject the wrong code", () => {
    const archived: ConflictBody = { code: "ARCHIVED", message: "x", archivedScope: "board" };
    const stale: ConflictBody = { code: "STALE_VERSION", message: "x", entity: null };
    expect(isArchivedConflict(archived)).toBe(true);
    expect(isArchivedConflict(stale)).toBe(false);
    expect(isStaleVersionConflict(stale)).toBe(true);
    expect(isStaleVersionConflict(archived)).toBe(false);
  });
});