# 02 — Impact Analysis: FR-CRM-001 (Twenty CRM Deployment + SSO)

**Workflow:** wf-20260625-feat-026
**Requirement:** FR-CRM-001 — Twenty CRM deployment and SSO
**Analyst:** ImpactAnalyzer
**Date:** 2026-06-25

---

## Validated Requirement

**FR-CRM-001** — Deploy Twenty CRM as a self-hosted service at `crm.aiqadam.org` authenticated via Authentik OIDC SSO. Deliver the production Coolify Docker Compose stack (`infrastructure/twenty/docker-compose.yml`), local dev compose additions, and mark FR-CRM-001 Implemented.

**Scope clarification from FR notes:**
- C5.2 (Authentik OIDC SSO for Twenty) — **already shipped** as of 2026-05-18. No Authentik changes required in this PR.
- C5.1 (deployment) — the remaining gap. `infrastructure/twenty/docker-compose.yml` is referenced in the runbook (`docs/04-development/infrastructure/runbooks/coolify-app-stacks.md` §"Twenty CRM") but the file does not yet exist in the repo.
- Local dev compose additions (twenty service, telegram-bot-api service) and postgres-init.sql — already present as unstaged changes in the working tree.

---

## Affected Layers

### API (NestJS)

**No changes required.** The architecture rule (ARCHITECTURE.md §"Data ownership") is explicit: `twenty` schema is owned by Twenty CRM only. NestJS access to Twenty data is via Twenty's GraphQL API, never via direct SQL. No new NestJS modules, services, controllers, or Drizzle schemas touch this feature. The future FR-CRM-002 (contact sync) and FR-CRM-003 (activity sync) are where NestJS-to-Twenty integration work lands.

### DB Changes Required

**NO.**

No new Drizzle schemas. No NestJS migration files. No changes to `apps/api/src/modules/`. The `twenty` database is an independent database within the same Postgres 16 instance; it is created by `postgres-init.sql` at container init time (already done in the working tree — `CREATE DATABASE twenty;` added). Twenty's own internal schema migrations run inside the Twenty container on startup.

No DBMigrationAuthor step needed. **Step 3 should be skipped.**

### Shared Types

**No changes required.** No new Zod schemas or TypeScript types needed in `packages/shared-types/`. The NestJS API does not yet call the Twenty GraphQL API (that is FR-CRM-002/003).

### Frontend (`apps/web`, `apps/web-next`)

**No changes required.** No new Astro pages, React island components, or API client calls. Twenty CRM is an independent web application accessible at `crm.aiqadam.org`, not embedded in the platform web frontend.

### Bot (`apps/bot`)

**No changes required.** No new aiogram handlers. Bot is out of scope for this feature.

### Workers (`apps/workers`)

**No changes required.** No new BullMQ queues or processors. Background work is internal to the Twenty worker container.

---

## Files Changed

| File | Action | Status |
|------|--------|--------|
| `infrastructure/twenty/docker-compose.yml` | CREATE | Missing — must be authored in this PR |
| `infrastructure/docker-compose.yml` | MODIFY | Already done (unstaged, adds `twenty` + `telegram-bot-api` services + named volumes) |
| `infrastructure/scripts/postgres-init.sql` | MODIFY | Already done (unstaged, adds `CREATE DATABASE twenty;`) |
| `infrastructure/.env.example` | MODIFY | Already done (unstaged, adds `TWENTY_APP_SECRET` var) |
| `.gitignore` | MODIFY | Unstaged (exact change TBC — likely adds telegram credential file pattern) |
| `docs/03-requirements/FR-CRM-001.md` | MODIFY | Status update: `Planned` → `Implemented` |
| `docs/03-requirements/requirements-registry.md` | MODIFY | Status update: row 6 `Planned` → `Implemented`; row 29 (S5 sprint) partial status update |

---

## `infrastructure/twenty/docker-compose.yml` — Required Content

Based on the runbook (`coolify-app-stacks.md` §"Twenty CRM") and the two documented gotchas, the compose must include:

- `server` service: `twentycrm/twenty:${TAG:-v0.50.0}` — runs the Twenty frontend + API
  - `expose: ["3000"]` — required so Coolify/Traefik targets the correct port
  - `/app/docker-data` mounted as **world-writable tmpfs** (`mode=1777`) — fixes the `touch /app/docker-data/db_status` crashloop with `set -e` in the entrypoint
  - Environment variables: `APP_SECRET`, `PG_DATABASE_URL` (pointing to the compose-internal `db` service), `REDIS_URL` (pointing to `cache`), `SERVER_URL`, `FRONT_BASE_URL`, `STORAGE_TYPE`, `ENTERPRISE_KEY`, `IS_MULTIWORKSPACE_ENABLED`, `FRONTEND_URL`, `DEFAULT_SUBDOMAIN`
- `worker` service: same image, same env, no exposed ports — runs Twenty's background jobs
- `db` service: `postgres:16-alpine` — dedicated Postgres for Twenty (separate from the platform Postgres; Twenty is a Coolify service with its own sidecar DB)
- `cache` service: `redis:7-alpine` — dedicated Redis for Twenty's Bull queues
- Named volumes: `twenty-data` (local storage), `db-data`, `redis-data`
- The file should be pasteable inline into Coolify as a Docker Compose service (same pattern as `infrastructure/plausible/docker-compose.yml`)

All sensitive values (APP_SECRET, PG_DATABASE_URL password, ENTERPRISE_KEY) are passed as `${ENV_VAR}` references — set in Coolify's service env UI, never hardcoded. This aligns with ARCHITECTURE.md §"Secrets: environment variables, never in code".

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|----------|--------|--------|-----------|
| — | — | None | No |

No NestJS API surface changes in this PR.

---

## Cross-Module Calls

| Caller | Called | Via |
|--------|--------|-----|
| — | — | — |

No cross-module calls introduced. Future FR-CRM-002 will add NestJS → Twenty GraphQL API calls.

---

## Risk Flags

### Security Review Required

- **Secret injection pattern:** `ENTERPRISE_KEY` is a presence-check only (no license server call). Must be set to a non-empty random string in Coolify env. Not hardcoded. Low risk, but the SecurityReviewer should confirm no secrets land in the compose file.
- **Network isolation:** In the Coolify production compose, the Twenty `server` and `worker` containers must not expose ports publicly. Coolify's Traefik handles ingress. The `db` and `cache` sidecars must also be internal only (`expose` not `ports`). LocalDev compose (already done) binds to `127.0.0.1` only — correct.
- **`ENTERPRISE_KEY` clarification:** As documented in the runbook and FR-CRM-001 notes, Twenty's BSL 1.1 permits non-competing self-hosted use. The env presence check is not bypassing a license server. This is documented behavior. SecurityReviewer should note this in their output to establish the paper trail.
- **tmpfs for `/app/docker-data`:** World-writable tmpfs is a known workaround for the Twenty v0.50.0 entrypoint bug (documented in the runbook). It is container-scoped and does not affect host security.

### Architecture Rule Risks

- **No cross-schema queries:** Confirmed — Twenty owns the `twenty` DB, NestJS does not touch it in this PR. Architecture rule preserved.
- **No new stack deviation:** Twenty CRM is already listed in ARCHITECTURE.md §"Supporting Services" and in the Active Topology under a future Coolify project. This PR makes the existing architectural intent concrete.
- **Coolify routing pattern:** The runbook documents that `SERVICE_FQDN_*` magic env vars do NOT work for compose-based services in Coolify. FQDN must be set via `PATCH /api/v1/services/<uuid>` after deploy. This is operational, not a code risk, but the CodeDeveloper must add a note in the compose file header.

---

## Test Scope

### Unit Tests

**None required.** No application logic changed.

### Integration Tests (Testcontainers)

**None required.** No NestJS modules, services, or DB schemas changed.

### E2E / Smoke Tests (Playwright or manual)

Smoke test per FR-CRM-001 acceptance criteria — these are **manual / operational** steps, not automated Playwright tests (Twenty is an external service):

1. `https://crm.aiqadam.org` accessible, shows Twenty workspace after sign-in.
2. "Sign in with SSO" redirects to `https://auth.aiqadam.org/...` and returns with valid session.
3. `admin@aiqadam.org` bootstrap account matches by email on first SSO sign-in (no duplicate user created).
4. Twenty background worker healthy (verify via `/healthz` or worker logs).
5. Stack survives Coolify restart (both `twenty` and `twenty-worker` come back).
6. RAM usage check: `docker stats` shows Twenty stack under 400 MB total.

The TestRunner agent (Step 7) should record these as manual verification steps. No automated Playwright flow is practical for an external SaaS-like service behind SSO.

---

## Step Routing

| Step | Agent | Action |
|------|-------|--------|
| Step 3 | DBMigrationAuthor | **SKIP** — no DB schema changes |
| Step 4 | CodeDeveloper | Proceed — author `infrastructure/twenty/docker-compose.yml`; ensure all unstaged changes are clean |

---

## Gate Result

```
gate_result:
  status: passed
  summary: "Impact fully analyzed; infrastructure-only change with no NestJS/DB/frontend/bot/worker scope — one new file to author (infrastructure/twenty/docker-compose.yml), four already-modified files to stage, two docs to update."
  findings:
    - "DB Changes Required: NO — skip Step 3 (DBMigrationAuthor), advance to Step 4 (CodeDeveloper)"
    - "C5.2 (Authentik OIDC) is already shipped — zero Authentik changes in this PR"
    - "infrastructure/twenty/docker-compose.yml does not exist — CodeDeveloper must create it"
    - "Local dev docker-compose.yml, postgres-init.sql, .env.example, and .gitignore already have unstaged changes in the working tree — CodeDeveloper must stage and verify these"
    - "Production compose must use expose (not ports) for server:3000, db, and cache — no public port exposure"
    - "tmpfs mode=1777 on /app/docker-data is required to avoid Twenty v0.50.0 entrypoint crashloop (documented in runbook)"
    - "No Playwright automation for smoke — manual verification steps defined in Test Scope"
    - "SecurityReviewer should document the ENTERPRISE_KEY BSL 1.1 rationale as a paper trail"
```
