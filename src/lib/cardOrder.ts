// Orchestrates one card's insertion into a specific index of an ordered
// list of cards, on top of the pure primitives in `reorder.ts`.
//
// `computePlacement` is pure (no Prisma) so it stays unit-testable like
// the rest of `reorder.ts`. The `POST /api/cards/:id/move` route reads
// the destination list's current cards, calls this, then applies the
// result inside one transaction.

import { positionBetween, rebalance } from "./reorder";

export interface OrderedCard {
  id: string;
  position: string | null;
}

export type PlacementResult =
  | { kind: "single"; position: string }
  | { kind: "rebalance"; positions: { id: string; position: string }[] };

// `existing` is the destination list's cards in position order, NOT
// including the card being moved (callers exclude it by id or by the
// fact that it currently lives in a different list/the backlog).
// `index` is the 0-based slot the moved card should occupy once inserted.
export function computePlacement(
  existing: OrderedCard[],
  index: number,
  movingCardId: string,
): PlacementResult {
  const clamped = Math.max(0, Math.min(index, existing.length));
  const prev = clamped > 0 ? existing[clamped - 1].position ?? "" : "";
  const next = clamped < existing.length ? existing[clamped].position ?? "" : "";

  const single = positionBetween(prev, next);
  if (single !== null) {
    return { kind: "single", position: single };
  }

  // No room between neighbours: rebalance the whole destination list
  // (moved card included) into evenly-spaced single-digit keys.
  const withMoved: OrderedCard[] = [...existing];
  withMoved.splice(clamped, 0, { id: movingCardId, position: null });
  const keys = rebalance(withMoved.length);
  return {
    kind: "rebalance",
    positions: withMoved.map((card, i) => ({ id: card.id, position: keys[i] })),
  };
}
