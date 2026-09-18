import { describe, expect, it } from "vitest";
import { computePlacement } from "@/lib/cardOrder";

describe("computePlacement", () => {
  it("returns a single midpoint key when there is room", () => {
    const existing = [
      { id: "a", position: "M" },
      { id: "b", position: "m" },
    ];
    const result = computePlacement(existing, 1, "new-card");
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.position > "M").toBe(true);
      expect(result.position < "m").toBe(true);
    }
  });

  it("appends at the end when index is past the last card", () => {
    const existing = [{ id: "a", position: "M" }];
    const result = computePlacement(existing, 5, "new-card");
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.position > "M").toBe(true);
    }
  });

  it("inserts at the start of an empty list", () => {
    const result = computePlacement([], 0, "only-card");
    expect(result.kind).toBe("single");
  });

  it("rebalances the whole list when no key fits between the neighbours", () => {
    // positionBetween("", "0") is the true closure case in reorder.ts
    // (next === FIRST_DIGIT with no lower bound) — inserting before the
    // very first possible key always forces a rebalance.
    const existing = [{ id: "a", position: "0" }];
    const result = computePlacement(existing, 0, "new-card");
    expect(result.kind).toBe("rebalance");
    if (result.kind === "rebalance") {
      expect(result.positions).toHaveLength(2);
      const byId = Object.fromEntries(result.positions.map((p) => [p.id, p.position]));
      expect(byId["new-card"] < byId["a"]).toBe(true);
      // Every position is unique.
      expect(new Set(result.positions.map((p) => p.position)).size).toBe(2);
    }
  });
});
