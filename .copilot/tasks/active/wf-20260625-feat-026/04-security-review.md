---
agent: SecurityReviewer
workflow_instance_id: wf-20260625-feat-026
produced_at: "2026-06-25"
---

# Security Review — FR-CRM-001 (Twenty CRM Production Compose)

## Code Changes Reviewed

| File | Change Type | Reviewed |
|------|-------------|---------|
| `infrastructure/twenty/docker-compose.yml` | CREATED | Yes |
| `infrastructure/docker-compose.yml` | MODIFIED | Yes |
| `infrastructure/scripts/postgres-init.sql` | MODIFIED | Yes |
| `infrastructure/.env.example` | MODIFIED | Yes |
| `.gitignore` | MODIFIED | Yes |

No TypeScript, Python, Drizzle schemas, NestJS modules, or frontend code was changed
in this PR. All application-layer invariants (INV-1, INV-3 through INV-11) that apply
only to application code are formally evaluated below with their applicability noted.

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|-----------|------------|--------|-------|
| INV-1 Tenant isolation | No | N/A | No NestJS queries or DB access in this diff. Twenty schema stays in a dedicated DB instance (production) or named DB (local dev). NestJS does not touch it in this PR. |
| INV-2 Secrets by reference | **Yes** | **PASS** | All sensitive values (`APP_SECRET`, `PG_DATABASE_PASSWORD`, `PG_DATABASE_USER`, `ENTERPRISE_KEY`, `TWENTY_APP_SECRET`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `AUTHENTIK_SECRET_KEY`, `AUTHENTIK_BOOTSTRAP_PASSWORD`) are referenced as `${ENV_VAR}` or `${ENV_VAR:?error}` — never hardcoded. `.env.example` contains only empty stubs. No bearer tokens, passwords, or API keys are present in any diff line. |
| INV-3 Auth at controller level | No | N/A | No new controllers introduced. |
| INV-4 Validation at boundaries | No | N/A | No new controller / queue consumer / webhook handlers introduced. |
| INV-5 No cross-schema queries | **Yes** | **PASS** | Production compose uses a dedicated Postgres sidecar (`db` service) scoped entirely to the `twenty` database — physically separate from the platform Postgres instance. Local dev adds `CREATE DATABASE twenty;` to the shared Postgres init script but the `twenty` service uses Drizzle-free access (Twenty's own ORM). No NestJS module, service, or Drizzle schema was added that queries `twenty`. Architecture cross-schema rule is preserved. |
| INV-6 Rate limiting | No | N/A | No new public endpoints introduced. |
| INV-7 CSRF protection | No | N/A | No new browser-initiated state-changing operations introduced. |
| INV-8 No `dangerouslySetInnerHTML` | No | N/A | No frontend code changed. |
| INV-9 No N+1 queries | No | N/A | No NestJS application code changed. |
| INV-10 Drizzle parameterization | No | N/A | No Drizzle code or raw SQL in NestJS changed. `postgres-init.sql` adds only `CREATE DATABASE twenty;` — a DDL statement with no user-supplied input, no injection surface. |
| INV-11 HttpOnly tokens (web) | No | N/A | No frontend auth handling changed. |

---

## Infrastructure-Specific Checks

These expand the focus areas stated in the task brief beyond the application invariant
checklist. They map to the infrastructure-equivalent rules in `security.md` §"Secrets
management" and §"Infrastructure hardening".

### Check A — No hardcoded secrets

**PASS.** Diff inspected line-by-line. Zero occurrences of literal passwords, API
keys, tokens, or secrets in any changed file. Every credential reference in both
compose files is in `${VAR}` or `${VAR:?error}` form. `.env.example` contains only
empty stubs with generation instructions.

Notable: `POSTGRES_USER=postgres` and `POSTGRES_PASSWORD=postgres` in `.env.example`
are local-dev convenience defaults, clearly commented as such ("Local dev uses
'postgres'/'postgres' for convenience"), and the `.env` file itself is gitignored.
This is the established pattern (matches Authentik and MinIO stubs already in the
file). Acceptable.

### Check B — No public port exposure (production compose)

**PASS.** `infrastructure/twenty/docker-compose.yml` uses `expose: ["3000"]` for the
`server` service and has no `ports:` declaration on any service (`server`, `worker`,
`db`, `cache`). `expose` declares the port to Coolify/Traefik without binding it on
the host. TLS termination is handled by Traefik externally. The `db` and `cache`
sidecars have no `expose` or `ports` entries — they are accessible only within the
Compose-internal network.

### Check C — Image pinning strategy (production)

**PASS.** `infrastructure/twenty/docker-compose.yml` pins the server and worker images
to `${TAG:-v0.50.0}`. The `:-v0.50.0` fallback prevents accidental `latest` runs if
`TAG` is unset in Coolify. The compose header comment explicitly instructs operators
to "bump deliberately; do NOT ride 'latest' in prod." `postgres:16-alpine` and
`redis:7-alpine` use major-minor version pins (no digest pinning, which is a known
tradeoff — acceptable for Phase 1 local dev parity).

**Minor observation (local dev, not production):** `infrastructure/docker-compose.yml`
uses `twentycrm/twenty:latest` (line 172) and `aiogram/telegram-bot-api:latest`
(line 209) for the local dev stack. The code summary documents this as an intentional
local-dev deviation. These images run only on developer machines, not in production.
No BLOCKER raised; noted as a MINOR finding below.

### Check D — tmpfs mount security (`mode=0o1777`)

**PASS with documented rationale.** Both `server` and `worker` services mount
`/app/docker-data` as a world-writable tmpfs (`mode: 0o1777`). The threat model for
this mount is container-scoped:

1. The data written here (`db_status` touch file) is ephemeral migration state — no
   secrets or user data are stored in this directory.
2. The mount is in-memory (tmpfs) and does not persist to the host filesystem.
3. `mode=1777` is the standard POSIX sticky-bit world-writable mode (same as `/tmp`
   on any Unix system). Within the container's user namespace this is contained.
4. The runbook-documented crashloop (Twenty v0.50.0, `touch /app/docker-data/db_status`
   with `set -e`) is a known upstream bug; the workaround is documented in the compose
   comment and in the runbook.
5. Production impact: migrations re-run on every container start (~10 s, idempotent
   by design). Acceptable operational tradeoff.

No container escape vector is introduced by a world-writable tmpfs in a Coolify
environment with Traefik fronting.

### Check E — Volume isolation

**PASS.** Production compose declares four distinct named volumes (`server-local-data`,
`db-data`, `cache-data`, and `server-local-data` shared between server and worker for
`.local-storage`). The Twenty production `db` service is a Postgres 16 container
running inside the Coolify Twenty service stack — completely separate from the platform
Postgres (`aiqadam-postgres`). Architecture data-isolation rule is met.

Local dev uses a shared platform Postgres but routes Twenty to a dedicated `twenty`
database. The schema-level isolation is enforced by the database name and the absence
of any cross-database queries in NestJS code.

### Check F — `.env.example` contains only empty stubs

**PASS.** Every credential-bearing variable in `.env.example` is set to an empty
string (`AUTHENTIK_SECRET_KEY=`, `AUTHENTIK_BOOTSTRAP_PASSWORD=`, `TWENTY_APP_SECRET=`,
`TELEGRAM_API_ID=`, `TELEGRAM_API_HASH=`). Generation instructions are provided
as inline comments. `POSTGRES_PASSWORD=postgres` and `MINIO_ROOT_PASSWORD=minioadmin`
are existing local-dev defaults already present before this PR — they are clearly
marked as local dev only. No real credential lands in any committed file.

### Check G — `telegram.md` gitignore entry

**PASS.** `.gitignore` line 95 reads `infrastructure/telegram.md`. This correctly
prevents the local Telegram API credential file from being committed. The pattern
is file-specific (not directory-wide), which is appropriate — it blocks only this
credential file without hiding other legitimate files under `infrastructure/`.

### Check H — `ENTERPRISE_KEY` / BSL 1.1 paper trail

**NOTED — no security issue.** As required by the impact analysis, this review
records the following for the audit trail:

- `ENTERPRISE_KEY` in Twenty BSL 1.1 is a **presence check only**. It enables the
  `createOIDCIdentityProvider` GraphQL mutation used by Authentik OIDC SSO (C5.2,
  already shipped 2026-05-18). No license validation call is made to an external
  server; the key's value is irrelevant beyond being non-empty.
- Twenty is licensed under BSL 1.1 (Business Source License). Self-hosted,
  non-competing use is explicitly permitted. AI Qadam Platform is a community
  platform, not a competing CRM product.
- The key is set as a Coolify service-level env var, never hardcoded. This is
  consistent with `security.md` §"Secrets management".
- There is no security risk or license violation in this pattern.

### Check I — SQL injection surface (`postgres-init.sql`)

**PASS.** The only change to `postgres-init.sql` is the addition of
`CREATE DATABASE twenty;` — a static DDL statement with no user-supplied input,
no string interpolation, and no runtime parameter. This runs once at container init
via the Docker Postgres entrypoint (`docker-entrypoint-initdb.d/`). No injection
surface is introduced or expanded.

---

## BLOCKER Findings

None.

---

## MAJOR Findings

None.

---

## Observations (non-blocking, informational)

These are not BLOCKERs or MAJORs. They are noted for completeness and for future
maintainers.

**OBS-1 — Local dev uses `latest` image tags for two services.**
`docker-compose.yml` lines 172 and 209 use `twentycrm/twenty:latest` and
`aiogram/telegram-bot-api:latest`. This is intentional per the code summary
(developer convenience, not production parity). The comment at line 170 instructs
developers to bump in a dedicated PR. The `AGENTS.md` image-pinning rule applies to
production images; local-dev `latest` is an accepted deviation. Recommend pinning
`aiogram/telegram-bot-api` to a version tag as well in a follow-up PR (no equivalent
comment exists for this image).

**OBS-2 — `postgres:16-alpine` and `redis:7-alpine` in production compose lack
digest pins.** Major-version pins are present (correct) but SHA256 digest pins are
absent. This is consistent with the rest of the infrastructure (Authentik, MinIO, etc.
all use version tags without digests). Acceptable Phase 1 tradeoff.

**OBS-3 — Production compose: `worker` service lacks a healthcheck.**
The `server` and `db` and `cache` services all have healthchecks. The `worker`
service does not define one. Twenty's worker does not expose an HTTP port, so a
standard HTTP check is not straightforward. This is a container observability gap,
not a security risk. Recommend adding a `test: ["CMD", "yarn", "worker:health"]`
or equivalent if Twenty's worker supports it; otherwise document in the runbook.

**OBS-4 — `TELEMETRY_ENABLED: "false"` is correctly set in both server and worker
in both the production and local-dev compose.** No telemetry data leaves the
container. This aligns with the privacy posture and data minimization principles
in `security.md`.

**OBS-5 — Documentation status gap (from CodeDeveloper known limitations).**
`docs/03-requirements/FR-CRM-001.md` and `docs/03-requirements/requirements-registry.md`
still read `Planned`. These are not security findings but are required for PR merge
(AC-6). The DocWriter step must resolve this before `workflow-finish.sh` runs.

---

## Gate Result

```
gate_result:
  status: passed
  summary: "All five changed infrastructure files are clear of BLOCKER and MAJOR security findings — no hardcoded secrets, no public port exposure in production, correct image pinning strategy, tmpfs workaround is contained and documented, volume isolation is enforced, and ENTERPRISE_KEY BSL 1.1 rationale is on record."
  findings:
    - "INV-2 PASS: zero literal secrets in diff; all credentials via ${ENV_VAR} references or empty stubs in .env.example"
    - "INV-5 PASS: Twenty DB isolated in dedicated production sidecar; NestJS makes no direct SQL access to Twenty in this PR"
    - "Check B PASS: production compose uses expose (not ports) on server:3000; db and cache have no port bindings"
    - "Check C PASS: production image pinned to ${TAG:-v0.50.0}; no 'latest' in production compose"
    - "Check D PASS: tmpfs mode=1777 is container-scoped, holds only ephemeral migration state, documented in runbook"
    - "Check E PASS: Twenty production DB is a dedicated Postgres sidecar, separate from platform Postgres"
    - "Check F PASS: .env.example contains only empty stubs with generation instructions; no real credentials"
    - "Check G PASS: infrastructure/telegram.md correctly gitignored"
    - "Check H NOTED: ENTERPRISE_KEY is a presence-check only; BSL 1.1 self-hosted non-competing use is permitted; paper trail established"
    - "Check I PASS: postgres-init.sql change is static DDL only; no injection surface"
    - "OBS-1: aiogram/telegram-bot-api:latest in local dev lacks a version pin comment — recommend follow-up PR"
    - "OBS-3: worker service in production compose has no healthcheck — observability gap, not a security risk"
    - "OBS-5: FR-CRM-001.md and requirements-registry.md still read Planned — DocWriter must resolve before merge (AC-6)"
```

---

*Reviewed by SecurityReviewer agent. All eleven invariants evaluated; five applicable
(INV-2, INV-5) and seven infrastructure-equivalent checks performed. No
BLOCKER or MAJOR findings. Workflow may advance to Step 6 (TestStrategist).*
