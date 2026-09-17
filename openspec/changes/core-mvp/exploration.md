# Exploration: core-mvp (plane-lite)

> SDD explore phase · change `core-mvp` · greenfield
> Context: internal company PMO tool — deliberately simplified mix of Plane (open-source Jira alternative) and Trello (kanban). Solo developer, cost-sensitive, Windows + opencode, self-hosted.

## Current State

- Greenfield. Repo `C:\Users\cseifar\Desktop\Proyectos\plane-lite` holds only `.git` (zero commits, no remote), `openspec/config.yaml`, and `openspec/specs/.gitkeep`. No application code, no stack markers, no test command.
- `openspec/config.yaml` records five load-bearing open decisions: **stack, data model, auth, multiuser, hosting**.
- Confirmed MVP scope (user decision): projects → boards → lists → cards with drag & drop; card fields priority / assignee / labels / due date; cycles/sprints, backlog, grouping by team. **Do not expand.**
- Abandoned predecessor `plane-internal-pmo` planned to fork upstream `makeplane/plane` (AGPL-3.0; Django REST backend; React Router 7 + Vite + MobX frontend; PostgreSQL/Valkey/RabbitMQ/MinIO backing services). **That approach was abandoned by the user.** Every one of its assumptions is treated below as an explicitly-rejected option with a stated reason, never as a decided default.

## Affected Areas (to be created)

- Root app (monorepo or single package) — fullstack TypeScript application.
- `prisma/schema.prisma` (or equivalent) — data model + migrations.
- `src/` (or `apps/`) — auth, board/card/cycle/team domain logic, API routes.
- `openspec/changes/core-mvp/` — this and later SDD artifacts.
- `compose.yaml` — hosting/upgrade scaffold.

---

## Decision 1 — Stack

### Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. TypeScript monolith (recommended)** | Next.js fullstack + Prisma ORM + SQLite (→ Postgres) + Tailwind + dnd-kit | One language, one repo, one deployable; lowest maintenance surface; strongest AI-assist coverage; SQLite = zero DB ops | Next.js version churn (App Router/RSC) adds cognitive load; SSR is unnecessary for an internal tool; SQLite single-writer (irrelevant at PMO scale) |
| B. SPA + separate API | Vite React SPA + thin API (Hono/Fastify or FastAPI) + Postgres | Clean separation; SPA can be served as static file; very light API | Two runtimes/build pipelines to maintain; CORS/session plumbing; more moving parts for a solo dev |
| C. Low-code / BaaS | PocketBase, Appwrite, Directus, self-hosted Supabase, NocoDB | Near-zero backend code; PocketBase = single binary with embedded auth/realtime/admin UI | Schema and custom drag-drop reorder logic constrained by the platform; self-host footprint for Supabase is ~8 containers; lock-in |
| ✗ Fork `makeplane/plane` | Upstream fork + white-label (abandoned) | Proven full product | AGPL-3.0 network-copyleft legal exposure; ~5 backing services (Postgres/Valkey/RabbitMQ/MinIO); React+Django monorepo split; contradicts the "simplified" goal |

### Recommendation

**Option A — TypeScript monolith (Next.js fullstack + Prisma).** Persistence: **SQLite for MVP, PostgreSQL as the documented upgrade path**, both behind the same Prisma provider so the switch is a config + one compose-service change. This is the cost-optimal and lowest-cognitive-load path for a solo maintainer, and it directly rejects the abandoned fork's complexity (two languages, five services). Rationale: the dominant long-term cost for a solo dev is *maintenance surface*, not compute — one language and one process minimize that.

---

## Decision 2 — Data model

### Entities

| Entity | Key fields | Notes |
|--------|-----------|-------|
| `User` | email, name, password_hash, is_active, role | Global; not per-project |
| `Team` / `TeamMember` | name; (user_id, team_id, role) | Grouping + membership gate |
| `Project` | name, description, owner_team_id | Owned by a team |
| `Board` | project_id, name, position | Multiple boards per project |
| `List` | board_id, name, position | Ordered columns |
| `Card` | project_id, **list_id nullable**, position, priority enum, assignee_id nullable, due_date nullable, cycle_id nullable, title, description | `list_id IS NULL` ⇒ card lives in the backlog |
| `Cycle` | project_id, name, start_date, end_date, status | Sprint; cards reference it |
| `Label` / `CardLabel` | project_id, name, color; (card_id, label_id) | Many-to-many |

### Ordering model (drag & drop)

| Approach | Complexity | Tradeoff |
|----------|-----------|----------|
| Integer position + renumber on drop | Low | Simplest, bulletproof; O(n) writes per drop; acceptable for small lists but rewrites whole list |
| **Fractional indexing (recommended)** | Low/Med | O(1) insert between two cards via midpoint key; no rewrite storms; needs a periodic rebalance when keys grow long |
| Lexorank | Med/High | Robust, Jira-style; more machinery than MVP needs |
| Linked list (prev/next) | Med | O(1) move but ordered reads need recursive queries |

**Recommendation:** **fractional indexing per list** (insert between two cards = midpoint fraction key), with a background rebalance. `Board.position` and `List.position` use plain integer ordering (they are few, renumber-on-move is trivial).

### Backlog, cycles, team grouping

- **Backlog** = `Card.list_id IS NULL` (a first-class per-project container, not a fake list). Dragging backlog → board list sets `list_id` + assigns a position.
- **Cycles** = cards reference a `Cycle`; active vs. done derived from dates + status.
- **Grouping by team** = a board *view* that groups cards by the assignee's team (or by `assignee_id`). A view concern, not a schema change.

---

## Decision 3 — Auth

### Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Email + password + sessions (recommended)** | Argon2id/bcrypt hash, server-side session cookie (httpOnly, SameSite), login rate-limit, admin-provisioned users (no public signup) | Simplest secure baseline; no external IdP or email infra needed; per-user accountability for assignees/audit | Must build password reset eventually; passwords to manage |
| B. OIDC/OAuth2 against company IdP | Entra ID / Google Workspace / Okta | No password store; aligns with company SSO | Requires an existing IdP + integration work; not guaranteed available |
| C. Basic auth / shared token / IP allowlist | Trivial gate | Minimal effort | Unsafe for multiuser (no per-user audit, shared credentials) — rejected |
| D. Magic link / email OTP | Email link login | No passwords | Needs SMTP infra; still needs session management |

### Recommendation

**Option A**, but architect the auth boundary (a small `auth` module with a stable "session/user provider" interface) so an **OIDC provider can be swapped in post-MVP without rework**. "As simple as it can be without being unsafe" = email+password + Argon2id + httpOnly session cookie + login rate-limit + admin-provisioned accounts (no open signup). Use a vetted library rather than hand-rolling password hashing. No OAuth, no email flows, no password reset in MVP (admin resets).

---

## Decision 4 — Multiuser

- **Multiuser IS in scope**: multiple logins, shared boards, per-user assignees, team membership.
- **Real-time collaboration is NOT in MVP**: no live sync of others' edits, no cursors, no WebSocket push.

Consequences without real-time:

- **Optimistic concurrency control**: every mutable entity carries a `version` (or `updated_at`); updates are conditional (`WHERE version = ?`) and a conflict returns 409 with a refresh/merge. Protects against lost updates when two users edit the same card.
- **Drag & drop reorder is a single atomic transaction** (position update + optional `list_id` move on one list), so concurrent drops serialize cleanly — no torn state, no lost or duplicated cards.
- **Freshness**: periodic polling (`GET /boards/:id` refetch or a cheap `/boards/:id/version` poll every N seconds). WebSockets/SSE deferred until justified post-MVP.

---

## Decision 5 — Hosting

### Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Docker Compose (recommended)** | app container + SQLite named volume for MVP; Postgres + Caddy reverse proxy as ready-to-add services | Reproducible; upgrade path trivial (add Postgres container + swap provider + mount Caddy for TLS) | Docker Desktop on Windows is itself resource-heavy (WSL2 VM) |
| B. Single native process | Node + SQLite run directly on the Windows host | Absolute minimal footprint; no Docker | Weaker reproducibility; manual upgrade path |
| C. Managed PaaS | Fly.io / Railway / Render / Vercel | Zero ops | Contradicts "self-hosted internal"; out of scope |

### Recommendation

**Option A — Docker Compose from day one**, structured so `postgres` and a TLS reverse proxy (Caddy) are commented/ready-to-add. MVP footprint ≈ **256–512MB RAM**. Upgrade path: uncomment Postgres, swap the Prisma provider, add Caddy for a domain — no re-architecture. Option B remains a valid minimal fallback for local/dev runs; either works because SQLite keeps MVP to a single service.

---

## Recommendation (overall)

Build a **single TypeScript monolith (Next.js + Prisma + SQLite, upgrading to Postgres)**, six core entities with **fractional-index ordering** for drag & drop, **email+password sessions** with an OIDC-ready seam, **optimistic concurrency** instead of real-time, shipped as a **one-service Docker Compose** app. This is the smallest maintenance surface that still satisfies the confirmed MVP and stays honest about not inheriting the abandoned fork's stack.

## Risks

- **SQLite single-writer**: fine at PMO scale; revisit if concurrent-write pressure grows (mitigate via the Postgres provider swap).
- **Fractional-index key growth**: needs a rebalance routine; must test a drag-storm (many rapid reorders between the same two cards).
- **Hand-assembled auth surface**: even with a vetted library, auth is security-critical; keep the dependency set minimal and audited.
- **Next.js churn**: pin versions and avoid RSC/SSR features the internal tool does not need.
- **No real-time**: concurrent edits can 409; acceptable for MVP but must be documented in UX (refresh-on-conflict).

## Ready for Proposal

**Yes.** Every load-bearing open decision now has a concrete recommendation. Next phase should be `sdd-propose` (or `sdd-spec` after proposal) to lock scope, rollback plan, and acceptance criteria before any code.
