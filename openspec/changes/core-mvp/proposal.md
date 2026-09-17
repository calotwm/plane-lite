# Proposal: core-mvp (plane-lite)

## Intent

Build the `plane-lite` MVP: a self-hosted internal PMO tool (Plane × Trello) — projects → boards → lists → cards with drag & drop, cycles, backlog, and team grouping. Greenfield; no code exists. Deliberately rejects the abandoned `plane-internal-pmo` fork of `makeplane/plane`.

## Scope

### In Scope

- TypeScript monolith: Next.js + Prisma + SQLite (Postgres upgrade path) + Tailwind + dnd-kit.
- Entities: User, Team/TeamMember, Project, Board, List, Card, Cycle, Label/CardLabel.
- Fractional-index card ordering per list; integer position for Board/List.
- Backlog = `Card.list_id IS NULL`; team grouping = board view.
- Auth: email+password (Argon2id), httpOnly session, login rate-limit, admin-provisioned users, OIDC seam.
- Multiuser: assignees, membership, shared boards; `version` → 409, atomic reorder, polling.
- Hosting: Docker Compose (app + SQLite volume; Postgres/Caddy commented).

### Out of Scope

- Real-time collaboration; public signup; password reset; OIDC integration; email flows; Postgres/TLS live deploy; forking makeplane/plane.

## Capabilities

### New Capabilities

- `authentication` — email+password, sessions, rate-limit, admin provisioning.
- `teams` — team + membership, assignees.
- `projects` — project CRUD.
- `boards` — board/list CRUD, integer ordering.
- `cards` — card CRUD + fields, fractional ordering, backlog, concurrency (409).
- `cycles` — sprint CRUD + card assignment.
- `labels` — label + card-label m2m.
- `team-grouping` — board view by team.
- `deployment` — Docker Compose scaffold.

### Modified Capabilities

None (greenfield).

## Approach

One Next.js fullstack package. Prisma schema + migrations; SQLite now, Postgres behind the same provider. Auth module with a stable session/user seam for future OIDC. Conditional writes (`WHERE version=?`) return 409; reorder is one atomic transaction. dnd-kit for drag & drop.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | New | Entities + migrations |
| `src/auth/` | New | Sessions, Argon2id, rate-limit |
| `src/app/` | New | API routes + UI |
| `src/components/` | New | Board/card/list UI (dnd-kit) |
| `compose.yaml` | New | App + SQLite volume, Postgres/Caddy commented |
| `package.json` | New | Tooling config |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Fractional-index key growth | Med | Rebalance + drag-storm test |
| SQLite single-writer | Low | Postgres provider swap |
| Auth surface bugs | Med | Vetted Argon2id lib, minimal deps |
| Next.js churn | Med | Pin versions, avoid RSC/SSR |
| Concurrent-edit 409s | Med | Document refresh-on-conflict UX |

## Rollback Plan

Greenfield, no production data — `git revert` any commit. Risky paths: (1) Prisma migration → `prisma migrate resolve --rolled-back` + delete the disposable SQLite file; (2) auth regression → revert to prior session validation; (3) reorder bug → fall back to integer renumber. Postgres/TLS stay commented; no infra rollback needed.

## Dependencies

None external. Tooling: Node, Docker Desktop, pnpm/npm.

## Success Criteria

- [ ] Admin provisions a user; email+password login yields an httpOnly session.
- [ ] Project → board → list → card CRUD; drag & drop reorders via fractional index.
- [ ] Backlog holds `list_id IS NULL` cards; cards move to lists.
- [ ] Cycles assign cards; team grouping renders.
- [ ] `docker compose up` runs app + SQLite volume (~256–512MB).
