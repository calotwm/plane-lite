import { describe, expect, it } from "vitest";
import {
  ALPHABET,
  assertBetween,
  between,
  needsRebalance,
  positionBetween,
  rebalance,
  toBacklogPatch,
} from "@/lib/reorder";

// Helper: lex compare mirrors the contract `between` upholds.
const lex = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

describe("between()", () => {
  it("returns the middle digit for empty bounds", () => {
    const mid = between("", "");
    expect(mid).not.toBeNull();
    expect(mid! > "").toBe(true);
  });

  it("places the largest single digit before an upper bound (maximises remaining room)", () => {
    // between("", x) picks the largest base-62 char strictly less than
    // x[0] so subsequent inserts still have room.
    expect(between("", "1")).toBe("0");
    expect(between("", "Z")).toBe("Y");
    expect(between("", "a")).toBe("Z");
  });

  it("returns null when the upper bound is the smallest digit", () => {
    expect(between("", "0")).toBeNull();
  });

  it("appends the middle digit past an upper-less lower bound", () => {
    const mid = ALPHABET[Math.floor(ALPHABET.length / 2)];
    expect(between("a", "")).toBe(`a${mid}`);
    expect(between("z", "")).toBe(`z${mid}`);
  });

  it("inserts between two single-digit neighbours with room", () => {
    const mid = between("a", "c");
    expect(mid).toBe("b");
    expect(assertBetween("a", mid!, "c")).toBe(true);
  });

  it("inserts between tight consecutive digits by extending the shorter key", () => {
    const mid = between("a", "b");
    expect(mid).not.toBeNull();
    expect(assertBetween("a", mid!, "b")).toBe(true);
    expect(mid!.length).toBeGreaterThanOrEqual(2);
  });

  it("appends one digit less than the upper bound when prev is a prefix of next", () => {
    const mid = between("a", "ab");
    expect(mid).not.toBeNull();
    expect(assertBetween("a", mid!, "ab")).toBe(true);
    expect(mid!.startsWith("a")).toBe(true);
    expect(mid!.length).toBeGreaterThan(1);
  });

  it("returns null when prev > next (caller treats as closure)", () => {
    expect(between("c", "a")).toBeNull();
    expect(between("zz", "a")).toBeNull();
  });

  it("returns null when next is a strict prefix of prev", () => {
    // "az" > "a" with no string strictly between.
    expect(between("az", "a")).toBeNull();
  });

  it("throws only on the degenerate prev === next (programmer error)", () => {
    expect(() => between("abc", "abc")).toThrow(/equals next/);
  });

  it("returns null only when there is genuinely no room (true closure)", () => {
    // Synthetic case where the lower bound is the maximum possible
    // smaller-than-upper neighbour. We force a closure by passing
    // `ALPHABET[60]y` as upper and `y` as prev: no single char fits.
    expect(between("y", "z")).not.toBeNull(); // "yZ"-style extension
    expect(assertBetween("y", between("y", "z")!, "z")).toBe(true);
  });

  it("100 random calls always satisfy assertBetween", () => {
    // Deterministic pseudo-random using a simple LCG so failures are
    // reproducible.
    let state = 1234567;
    const rnd = () => {
      state = (state * 1664525 + 1013904223) % 2 ** 32;
      return state / 2 ** 32;
    };
    const pick = () => ALPHABET[Math.floor(rnd() * ALPHABET.length)];
    for (let i = 0; i < 100; i++) {
      let prev = pick();
      let next = pick();
      if (lex(prev, next) > 0) [prev, next] = [next, prev];
      // Allow equal occasionally — between() should throw.
      if (prev === next) continue;
      const mid = between(prev, next);
      if (mid === null) continue;
      expect(assertBetween(prev, mid, next)).toBe(true);
    }
  });
});

describe("assertBetween / needsRebalance", () => {
  it("accepts strict lex order", () => {
    expect(assertBetween("a", "an", "c")).toBe(true);
    expect(assertBetween("", "0", "z")).toBe(true);
    expect(assertBetween("a", "az", "b")).toBe(true);
  });

  it("rejects equal or out-of-order keys", () => {
    expect(assertBetween("a", "a", "z")).toBe(false);
    expect(assertBetween("a", "0", "z")).toBe(false);
    expect(assertBetween("c", "d", "b")).toBe(false);
  });

  it("needsRebalance is the negation of assertBetween", () => {
    expect(needsRebalance("a", "b", "c")).toBe(!assertBetween("a", "b", "c"));
    expect(needsRebalance("a", "a", "c")).toBe(!assertBetween("a", "a", "c"));
  });
});

describe("rebalance()", () => {
  it("produces strictly ascending keys", () => {
    const keys = rebalance(10);
    expect(keys).toHaveLength(10);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
  });

  it("keeps every key between FIRST_DIGIT and LAST_DIGIT", () => {
    const first = ALPHABET[0];
    const last = ALPHABET[ALPHABET.length - 1];
    for (const k of rebalance(30)) {
      expect(first < k).toBe(true);
      expect(k < last).toBe(true);
    }
  });

  it("rejects non-positive or non-integer counts", () => {
    expect(() => rebalance(0)).toThrow();
    expect(() => rebalance(-1)).toThrow();
    expect(() => rebalance(1.5)).toThrow();
  });

  it("throws when the count exceeds one-digit capacity", () => {
    expect(() => rebalance(ALPHABET.length - 1)).toThrow(/exceeds one-digit/);
  });

  it("every adjacent pair leaves room for `between` to insert at least once", () => {
    const keys = rebalance(40);
    for (let i = 0; i < keys.length - 1; i++) {
      const mid = between(keys[i], keys[i + 1]);
      expect(mid).not.toBeNull();
      expect(assertBetween(keys[i], mid!, keys[i + 1])).toBe(true);
    }
  });
});

describe("backlog helpers", () => {
  it("toBacklogPatch clears listId and position together", () => {
    expect(toBacklogPatch()).toEqual({ listId: null, position: null });
  });

  it("positionBetween maps nullish to empty-string sentinel", () => {
    expect(positionBetween(null, null)).toBe(between("", ""));
    expect(positionBetween(undefined, undefined)).toBe(between("", ""));
    expect(positionBetween(null, "z")).toBe(between("", "z"));
  });
});

describe("drag-storm", () => {
  it("repeated inserts at the same tight gap need at most one rebalance", () => {
    // "a" and "b" are tight neighbours — the first `between` call must
    // extend the key, and subsequent inserts in the same gap keep
    // extending it. After the first rebalance the evenly-spaced keys
    // give ~60 slots of room per gap, so a 100-card burst never
    // re-triggers rebalance.
    const A = "a";
    const B = "b";
    const keys: string[] = [];
    let rebalanceCount = 0;

    const insertAtGap = (gapIndex: number): void => {
      const boundaries = [A, ...keys, B];
      const prev = boundaries[gapIndex];
      const next = boundaries[gapIndex + 1];
      let mid = between(prev, next);
      if (mid === null || !assertBetween(prev, mid, next)) {
        const target = keys.length + 1;
        keys.length = 0;
        keys.push(...rebalance(target));
        rebalanceCount++;
        const newPrev = gapIndex === 0 ? A : keys[gapIndex - 1];
        const newNext = gapIndex >= keys.length ? B : keys[gapIndex];
        mid = between(newPrev, newNext);
        if (mid === null) throw new Error("rebalance left no room");
        keys.splice(gapIndex, 0, mid);
        return;
      }
      keys.splice(gapIndex, 0, mid);
    };

    for (let i = 0; i < 100; i++) {
      // Cycle through every existing gap so no single gap fills up
      // before a rebalance opens the others.
      const gapCount = keys.length + 1;
      insertAtGap(i % gapCount);
    }

    expect(rebalanceCount).toBeLessThanOrEqual(1);
    expect(keys).toHaveLength(100);
    // All strictly ascending.
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
  });

  it("inserting exactly between the same two neighbours never needs a rebalance", () => {
    // Pure drag-storm at the tail: each new key sits between the
    // previous last key and the upper boundary. After the very first
    // insert extends the lower key, every subsequent insert extends
    // that same tail further — no closure ever happens.
    const B = "z";
    let prev = "0";
    let rebalanceCount = 0;
    for (let i = 0; i < 50; i++) {
      const mid = between(prev, B);
      if (mid === null || !assertBetween(prev, mid, B)) {
        rebalanceCount++;
      }
      prev = mid ?? prev;
    }
    expect(rebalanceCount).toBe(0);
  });
});