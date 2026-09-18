// Cycles spec §"Cycle status derivation": a cycle whose end date is in
// the past MUST be reported as done regardless of its stored `status`
// field (which still drives the PLANNED -> ACTIVE transition while the
// cycle is current).

export interface CycleLike {
  endDate: Date;
  status: "PLANNED" | "ACTIVE" | "DONE";
}

export function deriveStatus(cycle: CycleLike, now: Date = new Date()): "PLANNED" | "ACTIVE" | "DONE" {
  if (cycle.endDate.getTime() < now.getTime()) return "DONE";
  return cycle.status;
}

export function withDerivedStatus<T extends CycleLike>(cycle: T): T & { derivedStatus: string } {
  return { ...cycle, derivedStatus: deriveStatus(cycle) };
}
