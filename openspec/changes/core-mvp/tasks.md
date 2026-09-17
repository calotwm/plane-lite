# Tasks: core-mvp (plane-lite)

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

~3,400–3,800 lines; PR 4–7 may exceed 400; re-split at apply.

### Suggested Work Units

| Unit | Goal | PR | Focused test | Harness | Rollback |
|---|---|---|---|---|---|
| 1 | Toolchain, schema, `db.ts` | 1 | `vitest run tests/unit` | `prisma migrate dev` | scaffold commit |
| 2 | Concurrency libs | 2 | `vitest run tests/unit/lib` | N/A: pure fns | `src/lib/**` |
| 3 | Auth seam, Argon2id, session, routes | 3 | `vitest run tests/integration/auth` | login sets cookie; N+1→429 | `src/auth/**`, auth |
| 4 | Teams/Projects/Boards API, archive | 4 | `vitest run tests/integration/projects boards` | child write → 409 `ARCHIVED` | routes |
| 5 | Lists/Cards API, move, 409 codes | 5 | `vitest run tests/integration/cards lists` | stale → 409 `STALE_VERSION` | routes |
| 6 | Cycles/Labels API | 6 | `vitest run tests/integration/cycles labels` | assign card to cycle | routes |
| 7 | UI: dnd, backlog, archive, grouping | 7 | `vitest run` | manual drag, archive toggle | components, pages |
| 8 | Compose, Dockerfile, README | 8 | `docker compose config --services` | `docker compose up -d` | `compose.yaml` |

## Phase 1: Foundation

- [x] 1.1 Scaffold Next.js, TS, Tailwind; pin versions.
- [x] 1.2 Vitest + temp-SQLite harness: `vitest.config.ts`, `tests/setup.ts`.
- [x] 1.3 `prisma/schema.prisma`: 9 models, `version`, `archivedAt` on Board/Project; migration + `db.ts`.
- [x] 1.4 Schema tests: backlog `list_id NULL`, label uniqueness.

## Phase 2: Concurrency Core

- [x] 2.1 `src/lib/errors.ts`: `ConflictCode`, `ConflictBody`, `conflict()` + tests.
- [x] 2.2 `src/lib/version.ts`: conditional update returning stale state + tests.
- [x] 2.3 `src/lib/reorder.ts`: midpoint key, rebalance, drag-storm test.
- [x] 2.4 `src/lib/archive.ts`: `assertWritable` + tests; runs before version check.

## Phase 3: Authentication

- [ ] 3.1 `src/auth/provider.ts`: `AuthProvider` + `SessionUser` seam.
- [ ] 3.2 `src/auth/password.ts`: Argon2id, admin provisioning, rate-limit.
- [ ] 3.3 `src/auth/session.ts`: httpOnly cookie issue/validate/invalidate; auth routes, no signup.
- [ ] 3.4 Tests: valid/invalid/inactive login, 429, 401, logout, provider parity.

## Phase 4: API

- [ ] 4.1 Teams/membership routes + scope helper.
- [ ] 4.2 Projects CRUD + `?archived=false` scoped listing.
- [ ] 4.3 Project archive/restore; child writes → 409 `ARCHIVED`.
- [ ] 4.4 Boards CRUD + archive/restore; listings hide archived boards/projects.
- [ ] 4.5 Lists CRUD, renumber-on-move, delete → backlog.
- [ ] 4.6 Cards CRUD + fields; append assigns fractional position.
- [ ] 4.7 `POST /api/cards/:id/move`: atomic; `STALE_VERSION` vs `ARCHIVED`.
- [ ] 4.8 Cycles (validity, derived status) + Labels (unique, scoped) routes.
- [ ] 4.9 `GET /api/boards/:id/version` for polling.
- [ ] 4.10 Tests: cascades, archive/restore, concurrent drops, distinct 409s.

## Phase 5: UI

- [ ] 5.1 Board page: dnd-kit lists/cards, card fields, backlog, refetch on 409.
- [ ] 5.2 Two-button delete-vs-archive, archived views, group-by-team.

## Phase 6: Hosting

- [ ] 6.1 `compose.yaml`: app + SQLite volume, commented Postgres/Caddy, `migrate deploy`.
- [ ] 6.2 `Dockerfile`, README, config test command.
