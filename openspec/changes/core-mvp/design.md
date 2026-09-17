# Design: core-mvp (plane-lite)

## Technical Approach

Single TypeScript monolith: Next.js (App Router, client components; no RSC/SSR), Prisma ORM on SQLite with a PostgreSQL-portable schema, Tailwind CSS, dnd-kit. Mutations go through plain route handlers in `src/app/api/**` (testable, no server actions). Every mutable entity carries `version` for optimistic concurrency. Freshness via polling. Team grouping is a read-only board view. Boards and projects add a non-destructive archive/restore path alongside destructive delete; archive applies ONLY to boards and projects (never lists, cards, cycles, labels).

## Architecture Decisions

| Decision | Choice | Rejected / Tradeoff |
|---|---|---|
| Card ordering | String fractional keys (base-62 midpoint) + on-demand rebalance | Float drift; integer renumber rewrites the whole list |
| Rebalance trigger | Rebalance a list only when the midpoint between neighbors is not strictly between them; reassign evenly-spaced keys | Every-drop rebalance = O(n) storm; never rebalance = unbounded growth |
| Board/List ordering | Integer `position`, renumber-on-move in one transaction | Fractional indexing overkill for 10–50 rows |
| List delete cascade | Soft: cards move to backlog (`list_id=NULL`, `position=NULL`) | Hard delete destroys work on column removal |
| Board delete cascade | Hard: delete board + lists + their cards (per boards spec) | Soft-to-backlog loses board grouping |
| Project delete cascade | Hard: cascade boards, lists, cards, cycles, labels (per projects spec) | — |
| Board archive | Non-destructive: set `archivedAt`; keep lists/cards/labels untouched; delete stays available | Soft-delete-as-archive conflates archive with delete |
| Project archive | Non-destructive: set `archivedAt`; hide boards via project scope WITHOUT setting any board flag | Individually archiving boards mutates children and breaks restore |
| 409 discrimination | Error body carries machine-readable `code`: `STALE_VERSION` vs `ARCHIVED` | Message-only 409 makes the two failures untestable |
| Auth seam | `src/auth/` exposes `authenticate()` + `getSessionUser()`; routes depend only on `SessionUser` | Monolithic auth couples provider to routes |
| Polling | Board `version` poll every 15s + refetch on focus / after own mutation | WebSocket/SSE deferred post-MVP |
| Migrations | `prisma migrate dev` locally; `prisma migrate deploy` at container start | Raw SQL edits break portability |

## Data Flow

Write path enforces the archived guard BEFORE the version check, so the two 409 classes never collide:

```
Client              route handler                      Prisma
  | PATCH /api/cards/:id/move                           |
  |---------------------------------------------------->|
  |          1. getSessionUser -> 403 if absent         |
  |          2. load board + its parent project         |
  |          3. board.archivedAt || project.archivedAt? |
  |             yes -> 409 {code:ARCHIVED, scope}       |
  |<-- 409 ARCHIVED  (no data touched)                  |
  |          4. UPDATE ... WHERE id=? AND version=?     |
  |             miss -> 409 {code:STALE_VERSION, entity}|
  |<-- 409 STALE_VERSION | 200 {card, version+1}        |
```

Restore re-enables writes with no further action: the guard re-reads `archivedAt` per request, so clearing it (or the parent project's flag) is sufficient — no cache, no token, no client round-trip beyond the normal refetch.

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Create | 9 models + `version` + `archivedAt DateTime?` on `Board`/`Project` |
| `src/auth/provider.ts` | Create | `AuthProvider` seam + `SessionUser` type |
| `src/auth/password.ts` | Create | Argon2id, admin provisioning, rate-limit |
| `src/auth/session.ts` | Create | httpOnly cookie issue/validate |
| `src/lib/db.ts` | Create | Prisma client singleton |
| `src/lib/reorder.ts` | Create | base-62 midpoint + rebalance |
| `src/lib/version.ts` | Create | conditional-update helper |
| `src/lib/errors.ts` | Create | `ConflictBody` type + `conflict(code, …)` builder |
| `src/lib/archive.ts` | Create | `assertWritable(board, project)` guard used by every write route |
| `src/app/api/**` | Create | CRUD + move + archive/restore routes per capability |
| `src/components/**` | Create | Board/List/Card + dnd-kit + archive toggle + archived view |
| `compose.yaml` | Create | app + SQLite volume; Postgres/Caddy commented |
| `package.json` | Create | deps: next, prisma, argon2, dnd-kit, tailwind |

## Interfaces / Contracts

```ts
// src/lib/errors.ts
type ConflictCode = "STALE_VERSION" | "ARCHIVED";
type ConflictBody = {
  code: ConflictCode;
  message: string;
  archivedScope?: "board" | "project"; // ARCHIVED only
  entity?: unknown;                    // STALE_VERSION only (current state for refetch)
};
```

```ts
// Board + Project model additions (provider-portable, no native types)
archivedAt DateTime? // null = active, non-null = archived
```

```text
POST /api/boards/:id/archive    -> { board } | 403
POST /api/boards/:id/restore    -> { board } | 403
POST /api/projects/:id/archive  -> { project } | 403
POST /api/projects/:id/restore  -> { project } | 403
GET  /api/projects?archived=false            (default view excludes archived)
GET  /api/projects/:id/boards?archived=false (default excludes archived boards AND boards of archived projects)
```

Archive/restore and delete are exempt from the archived guard; only create/move/edit of cards, lists, and boards are rejected (409 `ARCHIVED`) when the board or its project is archived.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | midpoint/rebalance, version compare, `assertWritable`, error builder | Vitest |
| Integration | login/429/session, CRUD, move atomicity, cascade; archive/restore preserves children and prior state; default vs archived listings | Vitest + Prisma on temp SQLite |
| Integration | archived guard: card create/move + list edit on archived board/project → 409 with `code:ARCHIVED`; stale write → 409 `code:STALE_VERSION`; both codes distinct and assertable | Vitest + Prisma |
| Integration | restore re-enables writes with no further action | Vitest + Prisma |
| E2E | drag-drop reorder, backlog↔list, group-by-team, two-button delete-vs-archive UI, archived view | Playwright (post-MVP smoke) |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Compose file is static config.

## Migration / Rollout

Greenfield — no data migration. `archivedAt` is a nullable column added to two models; existing rows default to `null` (active). Postgres upgrade path unchanged: swap `provider` + `DATABASE_URL`, regenerate baseline, copy data. Schema stays portable — only `String/Int/Boolean/DateTime/enum`, no provider-native types.

## Open Questions

None. The previously-open board-delete question is RESOLVED: board delete is hard cascade (boards spec pins removal of board + lists + cards), and archive/restore now provides the non-destructive alternative.
