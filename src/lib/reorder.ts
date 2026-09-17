// Base-62 fractional indexing for card positions.
//
// Why fractional strings instead of floats or integers:
//   - Float midpoint drifts and breaks lexicographic comparison at large
//     offsets.
//   - Integer positions would force a renumber of every card on every
//     insert (an O(n) storm during drag-and-drop).
//
// The lexicographic order of base-62 strings matches the numeric order
// of the integer values they represent, as long as all keys share a
// common length prefix. `between` keeps that invariant by extending the
// shorter string before doing the arithmetic midpoint.
//
// When two neighbours become too close for a single-digit insert,
// `between` returns `null` and the caller invokes `rebalance` to rewrite
// the list with evenly-spaced keys (one rebalance, then many more
// inserts fit before another is needed).
//
// Capacity: `rebalance` produces single-digit keys only (max 60
// positions — the FIRST_DIGIT and LAST_DIGIT slots are reserved as
// boundaries). Lists that grow beyond that size must extend the
// algorithm to multi-digit keys before they reach production; callers
// should not see a rebalance count > 60 on a single list.

// 0-9, A-Z, a-z — 62 ASCII digits, ascending lexicographically.
export const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const FIRST_DIGIT = ALPHABET[0]; // "0"
const LAST_DIGIT = ALPHABET[ALPHABET.length - 1]; // "z"

// Returns a base-62 string strictly between `prev` and `next` in lex
// order. Pass "" (NO_KEY) for an open bound on either side. Returns
// `null` when no string fits — the caller must call `rebalance` to open
// the gap, then retry.
//
// Throws only on a degenerate call where `prev === next` (both
// non-empty) — a programmer error. A pair where `prev > next` returns
// `null` so the caller can treat it as "no room", same as a closure.
// `positionBetween` is a thin wrapper that maps `null`/`undefined`
// neighbours to "" and inherits this whole contract — including the
// null-on-closure return for callers that pass card rows directly.
export function between(prev: string, next: string): string | null {
  // Sentinel "" means no bound on that side. Handle first so the
  // `prev > next` guard below never trips on an open-ended pair.
  if (next === "") {
    return prev === "" ? middleDigit() : prev + middleDigit();
  }
  if (prev === "") {
    // Pick the single largest digit that sits below next[0], so the
    // next insert still has room. When next starts with FIRST_DIGIT,
    // no single char fits — fall through to extension / rebalance.
    if (next[0] === FIRST_DIGIT) {
      if (next === FIRST_DIGIT) return null;
      return between(FIRST_DIGIT, next);
    }
    const idx = ALPHABET.indexOf(next[0]);
    return ALPHABET.slice(0, idx).slice(-1);
  }

  // Both bounds non-empty.
  if (prev === next) {
    throw new Error(`between: prev equals next (${JSON.stringify(prev)})`);
  }
  if (prev > next) {
    // next is a strict prefix of prev, or prev lex-dominates next.
    return null;
  }

  // Trim the longest common prefix so the differing region is at index 0.
  let i = 0;
  const max = Math.min(prev.length, next.length);
  while (i < max && prev[i] === next[i]) i++;
  const aRest = prev.slice(i);
  const bRest = next.slice(i);

  // `prev` is a prefix of `next` (so prev < next). Append a digit
  // smaller than next's first remaining digit.
  if (aRest === "") {
    const idx = ALPHABET.indexOf(bRest[0]);
    if (idx <= 0) {
      // Extending `prev` by FIRST_DIGIT can already reach a true
      // closure (e.g. between("a", "a0") would recurse into
      // between("a0", "a0")). Detect it here and return `null` so the
      // caller rebalances; without this guard the recursion lands on
      // `prev === next` and trips the programmer-error throw reserved
      // for that case.
      if (prev + FIRST_DIGIT >= next) return null;
      return between(prev + FIRST_DIGIT, next);
    }
    return prev + ALPHABET.slice(0, idx).slice(-1);
  }

  // General case: both halves have a differing first digit.
  const idxA = ALPHABET.indexOf(aRest[0]);
  const idxB = ALPHABET.indexOf(bRest[0]);
  if (idxB - idxA >= 2) {
    // At least one digit of room — pick the arithmetic midpoint.
    return prev.slice(0, i) + ALPHABET[Math.floor((idxA + idxB) / 2)];
  }

  // No room at this position (consecutive digits). Extend `prev` with a
  // key strictly less than `next`'s remainder. The extended `prev` keeps
  // its prefix (and therefore its < relation to `next`) and is strictly
  // greater than the original `prev` by length.
  const tail = between("", bRest.slice(1));
  if (tail === null) {
    // bRest was a single char AND it was the smallest digit, which the
    // `prev === ""` branch already turned into a `null` return — keep
    // the same semantic for safety.
    return null;
  }
  return prev + tail;
}

function middleDigit(): string {
  return ALPHABET[Math.floor(ALPHABET.length / 2)];
}

// Verifies that `mid` is strictly between `prev` and `next` in lex
// order. Routes and reorder callers use this to detect when `between`
// produced a key that drifts out of the legal range (e.g. an
// implementation bug or a stale neighbour) and must trigger a rebalance.
export function assertBetween(
  prev: string,
  mid: string,
  next: string,
): boolean {
  if (prev === "" && next === "") return mid > "";
  if (prev === "") return mid < next && mid > "";
  if (next === "") return mid > prev;
  return prev < mid && mid < next;
}

// Inverse of `assertBetween`: true when a `between` call would fail for
// the same three keys.
export function needsRebalance(
  prev: string,
  mid: string,
  next: string,
): boolean {
  return !assertBetween(prev, mid, next);
}

// One-digit rebalance: produces `count` evenly-spaced single-digit keys
// that fit strictly between FIRST_DIGIT and LAST_DIGIT. Throws when the
// count exceeds one-digit capacity (60 — last two slots are reserved as
// boundaries). Lists beyond that size should extend the algorithm to
// multi-digit keys before they appear in production.
export function rebalance(count: number): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`rebalance: count must be a positive integer, got ${count}`);
  }
  const usableSlots = ALPHABET.length - 2; // skip FIRST and LAST
  if (count > usableSlots) {
    throw new Error(
      `rebalance: count (${count}) exceeds one-digit capacity (${usableSlots}); ` +
        `extend to multi-digit keys before reaching this size`,
    );
  }
  // Evenly spread `count` positions across `usableSlots` slots, starting
  // at slot 1 (skipping the boundary) so the resulting keys all sit
  // strictly between FIRST_DIGIT and LAST_DIGIT.
  const step = usableSlots / (count + 1);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const slot = Math.floor((i + 1) * step) + 1;
    keys.push(ALPHABET[slot]);
  }
  return keys;
}

// Backlog helpers.
//
// Prisma's `Card.listId @relation(onDelete: SetNull)` clears `listId`
// automatically when a List is deleted, but leaves `position` intact.
// Per the slice invariant, `reorder.ts` OWNS the `position` field when
// a card crosses the list/backlog boundary so the two transitions stay
// consistent regardless of who triggered them (move endpoint, list
// delete, or set-list-to-null).

// Patch sent to Prisma when moving a card to the backlog. The caller
// applies it together with the move transaction; the route handler is
// responsible for version-check + 409 reporting.
export function toBacklogPatch(): { listId: null; position: null } {
  return { listId: null, position: null };
}

// Returns a position strictly between `prev` and `next`, or `null` when
// the gap is closed. `null`/`undefined` neighbour values are mapped to
// the empty-string sentinel so callers can pass `null` directly from a
// card row.
export function positionBetween(
  prev: string | null | undefined,
  next: string | null | undefined,
): string | null {
  return between(prev ?? "", next ?? "");
}