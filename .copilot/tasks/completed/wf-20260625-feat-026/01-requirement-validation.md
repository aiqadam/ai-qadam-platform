---
agent: RequirementAnalyst
workflow_instance_id: wf-20260625-feat-026
produced_at: "2026-06-25"
---

# Requirement Validation — FR-CRM-001 (Twenty CRM Production Compose)

## Raw Input

**Requirement ref:** `FR-CRM-001`
**Requirement text (from handoff.yaml):**
> Deploy Twenty CRM as a self-hosted service at crm.aiqadam.org authenticated via
> Authentik OIDC SSO. Deliver the production Coolify Docker Compose stack
> (infrastructure/twenty/docker-compose.yml), local dev compose additions, and
> mark FR-CRM-001 Implemented.

**Context from task briefing:**
- C5.2 (Authentik OIDC SSO for Twenty) is ALREADY SHIPPED (2026-05-18).
- The runbook `docs/04-development/infrastructure/runbooks/coolify-app-stacks.md`
  already documents the Twenty stack with full operational detail.
- What remains: C5.1 — the production Coolify Docker Compose file
  (`infrastructure/twenty/docker-compose.yml`) referenced in the runbook as
  "source-of-truth compose" does not yet exist in the repo.
- Local dev compose additions are already in the working tree as unstaged changes
  (verified via `git diff` — Twenty service + telegram-bot-api service added to
  `infrastructure/docker-compose.yml`; `TWENTY_APP_SECRET` and telegram vars added
  to `infrastructure/.env.example`; `CREATE DATABASE twenty` added to
  `infrastructure/scripts/postgres-init.sql`).
- No new NestJS/Astro code in this PR — pure infrastructure deliverable.

---

## Analysis

### Completeness Issues Found

None that would block delivery. Minor clarification captured below as AC-6.

The requirement as stated in the handoff is narrower than FR-CRM-001's full scope.
This is intentional and correct: C5.3 (contact sync) and C5.4 (activity sync) are
separate Sprint 5 deliverables that belong to later PRs. This PR's sole code
boundary is:

| Scope IN | Scope OUT |
|---|---|
| `infrastructure/twenty/docker-compose.yml` (production compose) | `apps/api/src/modules/*/crm*` (C5.3, C5.4) |
| Unstaged local-dev changes to `infrastructure/docker-compose.yml` | Any new NestJS module or endpoint |
| Unstaged additions to `infrastructure/.env.example` | Any new Directus flow |
| Unstaged addition to `infrastructure/scripts/postgres-init.sql` | Contact or activity sync |
| Status flip in `docs/03-requirements/FR-CRM-001.md` to `Implemented` | |

The production compose (`infrastructure/twenty/docker-compose.yml`) must precisely
match what is currently running in Coolify (service uuid `x12tbwbkpmy4ump0kgf15mrc`)
as documented in `coolify-app-stacks.md` §"Twenty CRM (`aiqadam-twenty`)". Key
elements mandated by that runbook:

- Images: `twentycrm/twenty:v0.50.0` (pinned, `TAG` env var)
- Includes `twenty-server`, `twenty-worker`, dedicated Postgres, and dedicated Redis
  (four containers; different from the local-dev service which reuses shared PG +
  Redis)
- `/app/docker-data` must be mounted as world-writable tmpfs to avoid the
  `touch /app/docker-data/db_status` crashloop (gotcha #1 from the runbook)
- `expose: ["3000"]` on the server container (gotcha #2)
- `SERVER_URL`, `FRONTEND_URL`, `IS_MULTIWORKSPACE_ENABLED`, `DEFAULT_SUBDOMAIN`,
  `ENTERPRISE_KEY` env vars required for SSO to function
- `FQDN` routing handled outside the compose via Coolify API PATCH

**Minor clarification (not a blocker):** The runbook states "Source-of-truth compose:
`infrastructure/twenty/docker-compose.yml`" but does not explicitly say whether the
production compose should include the worker or use a single-compose-with-profiles
pattern. Sprint 5 plan C5.1 calls for `twenty/twenty-worker` (background). Resolving
with standard assumption: include both `server` and `worker` services in the compose
(matches what Coolify has running today).

### Conflicts with Existing Features

None found.

- The `twenty` Postgres database is already established in the architecture's data
  ownership table (`architecture.md` §"Data ownership"): owned by Twenty, no
  cross-schema access from NestJS API. No conflict with existing module schemas.
- The local-dev changes in the working tree add a `twenty` service to
  `infrastructure/docker-compose.yml`. This is additive — no existing service is
  modified.
- The `CREATE DATABASE twenty` addition to `postgres-init.sql` is additive; existing
  databases (`platform`, `directus`, `authentik`, `listmonk`) are unchanged.
- Authentik OIDC provider for Twenty (pk=4, `aiqadam-twenty-provider`) was created
  in C5.2 and is already live. No conflict.
- The `telegram-bot-api` local service in the working tree's `docker-compose.yml` diff
  is a separate infrastructure concern (Sprint 6 prep). It is included in the
  unstaged local-dev additions and belongs in this PR as bundled local-dev
  infrastructure work.

### Architectural Feasibility

Fully feasible. No architecture changes required.

- **Deployment pattern:** matches the established Coolify Docker Compose pattern
  (Plausible, Authentik all follow the same structure). No new pattern introduced.
- **Database isolation:** Twenty uses a dedicated Postgres instance within its own
  compose service, NOT the shared `aiqadam-postgres`. The runbook confirms this
  (four-container service: server + worker + dedicated PG + dedicated Redis). Data
  access from our API is via Twenty's GraphQL API only — enforced by architecture's
  "no cross-schema queries" rule.
- **Module boundaries:** No NestJS module boundary is touched. The infrastructure
  deliverable sits entirely below the application layer.
- **Monorepo:** new file `infrastructure/twenty/docker-compose.yml` is within the
  single monorepo at a well-established path pattern (`infrastructure/<service>/`).
- **No new dependencies** in `package.json`, no new Drizzle schema files, no
  new API endpoints in this PR.

---

## Formalized Requirement

**Feature identifier:** `FEAT-INFRA-3`

**Statement:**

> The repository SHALL contain a production-grade Coolify Docker Compose file at
> `infrastructure/twenty/docker-compose.yml` that exactly describes the Twenty CRM
> service currently running in production at `crm.aiqadam.org` — comprising the
> `twenty-server` and `twenty-worker` containers with their required environment
> variables (including SSO vars), the `/app/docker-data` tmpfs workaround, and the
> `expose: ["3000"]` declaration. The local-dev compose (`infrastructure/docker-compose.yml`)
> SHALL include a `twenty` service (single container, shared PG/Redis, port 3010)
> and a `telegram-bot-api` service. The `infrastructure/.env.example` and
> `infrastructure/scripts/postgres-init.sql` SHALL be updated to match. The
> `docs/03-requirements/FR-CRM-001.md` status field SHALL be set to `Implemented`.

**Cross-refs:**
- `FR-CRM-001` — parent requirement
- `docs/04-development/infrastructure/runbooks/coolify-app-stacks.md` §"Twenty CRM"
  — source of all runtime parameters (env vars, UUIDs, gotchas)
- `docs/03-requirements/sprint-5-to-8-plan.md` §"C5.1" — scope definition
- `docs/04-development/architecture/architecture.md` §"Data ownership" — confirms
  `twenty` schema isolation rule

---

## Acceptance Criteria (draft)

**AC-1 (production compose present):**
Given the repository is checked out, when a developer inspects
`infrastructure/twenty/docker-compose.yml`, then the file exists, contains
`twenty-server` and `twenty-worker` services, pins the image to `v0.50.0` via
`TAG`, and includes the `/app/docker-data` tmpfs volume with `mode=1777`.

**AC-2 (SSO env vars present in compose):**
Given `infrastructure/twenty/docker-compose.yml`, when it is reviewed, then it
references the following env variables (either hard-coded non-secret values or
`${VAR}` references): `IS_MULTIWORKSPACE_ENABLED=false`, `FRONTEND_URL`,
`DEFAULT_SUBDOMAIN=app`, `ENTERPRISE_KEY`, `SERVER_URL`.

**AC-3 (expose declaration):**
Given `infrastructure/twenty/docker-compose.yml`, when it is reviewed, then the
`twenty-server` service includes `expose: ["3000"]` so Coolify's Traefik label
generation targets the correct port.

**AC-4 (local-dev compose additions):**
Given the working tree, when `infrastructure/docker-compose.yml` is inspected, then
it contains a `twenty` service bound to `127.0.0.1:3010:3000` using the shared
`postgres` and `redis` services, and a `telegram-bot-api` service bound to
`127.0.0.1:8082`.

**AC-5 (postgres init and env example updated):**
Given `infrastructure/scripts/postgres-init.sql`, when reviewed, then it contains
`CREATE DATABASE twenty;`. Given `infrastructure/.env.example`, when reviewed, then
it contains `TWENTY_APP_SECRET=` with a generation instruction comment.

**AC-6 (FR-CRM-001 status):**
Given `docs/03-requirements/FR-CRM-001.md`, when reviewed after this PR merges,
then the front-matter `status` field reads `Implemented`.

**AC-7 (no application code changes):**
Given the PR diff, when reviewed, then no files under `apps/` or `packages/` are
modified — the diff is confined to `infrastructure/` and `docs/03-requirements/`.

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-CRM-001 (C5.1) is specific, testable, non-conflicting, and architecturally feasible; the deliverable is a pure infrastructure artifact with clear scope boundaries."
  findings:
    - "C5.2 (Authentik OIDC SSO) is already live in production — not in scope for this PR."
    - "Production compose must be a four-container service (server + worker + dedicated PG + dedicated Redis) matching the live Coolify service, distinct from the single-container local-dev service."
    - "Two known gotchas from the runbook are mandatory in the compose: (1) /app/docker-data world-writable tmpfs to prevent crashloop; (2) expose: [\"3000\"] on the server service."
    - "Local-dev changes (Twenty + telegram-bot-api in docker-compose.yml, .env.example, postgres-init.sql) are already in the working tree as unstaged changes and must be committed as part of this PR."
    - "C5.3 (contact sync) and C5.4 (activity sync) are explicitly out of scope — they belong to follow-on PRs."
    - "No NestJS, Astro, or shared-types changes; no Drizzle migrations; no new pnpm dependencies."
