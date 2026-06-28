---
code: BP-UAT-000
name: "UAT environment setup and health check"
status: Ready
process_ref: "docs/04-development/infrastructure/runbooks/"
environment: "http://localhost:4321"
seed_required: false
last_run: ""
---

# BP-UAT-000 — UAT Environment Setup and Health Check

## Purpose

Bootstraps the full local UAT environment from a cold state and verifies every
service is reachable before any business-process script runs. This script is a
**hard prerequisite** — if it ends in `failed-escalate`, do not run any other
UAT script. Fix the environment first.

## Pre-flight (one command — not a UAT step)

Before handing off to the UATRunner agent, run from the repo root:

```bash
bash scripts/uat-env-setup.sh
```

This script is **fully automated and idempotent**. On a cold machine it:

1. Generates all secrets (`AUTHENTIK_SECRET_KEY`, `JWT_SIGNING_SECRET`,
   `INTERNAL_API_TOKEN`, etc.) and writes `infrastructure/.env`,
   `apps/api/.env`, `apps/web/.env`
2. Starts Docker Compose services: Postgres, Redis, MinIO, Authentik,
   Directus, Mailpit, Twenty (Telegram skipped — not needed for UAT)
3. Waits for every service to pass its healthcheck
4. Creates the `aiqadam-platform-local` OIDC application + provider in
   Authentik via its admin API, extracts `client_id` + `client_secret`,
   and patches them into `apps/api/.env`
5. Runs `scripts/provision-authentik-rbac-groups.sh` to create the
   standard RBAC groups in Authentik
6. Writes `apps/e2e/.env.uat` with `UAT_INTERNAL_API_TOKEN` and test
   account credentials

Re-running is safe. Pass `FORCE_REGEN=1` to regenerate secrets from scratch
(wipes and re-creates all `.env` files). Pass `DRY_RUN=1` to see what would
be done without making changes.

After the script completes, start all apps from the repo root:

```bash
pnpm dev
```

Turborepo fans this out to `apps/api` (`nest start --watch`) and `apps/web`
(`astro dev`) in parallel. Wait for both "ready" lines before continuing.

Then seed UAT fixtures:

```bash
pnpm uat:seed
```

Once all that is done, the UATRunner runs this script's automated steps below
as a go / no-go gate.

## Acceptance Criteria

- [ ] AC-1: Postgres and Redis are reachable via Docker Compose.
- [ ] AC-2: Authentik OIDC server is healthy and the discovery document is valid.
- [ ] AC-3: Directus CMS is healthy and the admin API responds.
- [ ] AC-4: Mailpit SMTP catcher is reachable at `http://localhost:8025`.
- [ ] AC-5: NestJS API (`apps/api`) responds at `http://localhost:3000/health`.
- [ ] AC-6: Astro web app (`apps/web`) responds at `http://localhost:4321`.
- [ ] AC-7: `INTERNAL_API_TOKEN` is configured — internal endpoint returns 401
  (not 500) on a wrong-token probe.

## Seed Fixtures Required

None.

## Steps

### Step 001 — Infrastructure services health

**AC ref:** AC-1, AC-2

**Precondition:** `uat-env-setup.sh` completed.

**Action:**
```ts
const authentik = await request.get('http://localhost:9000/-/health/live');
expect(authentik.ok()).toBe(true);
```

Also verify Postgres/Redis indirectly — Authentik only becomes healthy once
it can reach both, so a passing Authentik healthcheck implies Postgres + Redis
are up.

**Expected UI state:** HTTP 200 from Authentik `/−/health/live`.

**Screenshot label:** `step-001-infra-health`

---

### Step 002 — Authentik OIDC discovery document

**AC ref:** AC-2

**Precondition:** Step 001 passed.

**Action:**
```ts
const discovery = await request.get(
  'http://localhost:9000/application/o/aiqadam-platform-local/.well-known/openid-configuration'
);
expect(discovery.ok()).toBe(true);
const body = await discovery.json();
expect(body.issuer).toBe(
  'http://localhost:9000/application/o/aiqadam-platform-local/'
);
expect(body.authorization_endpoint).toBeTruthy();
expect(body.token_endpoint).toBeTruthy();
```

**Expected UI state:** HTTP 200 with valid OIDC discovery JSON.

**Screenshot label:** `step-002-oidc-discovery`

---

### Step 003 — Directus CMS health

**AC ref:** AC-3

**Precondition:** `uat-env-setup.sh` started Directus via Docker Compose.

**Action:**
```ts
const directus = await request.get('http://localhost:8200/server/health');
expect(directus.ok()).toBe(true);

// Verify static admin token works
const items = await request.get('http://localhost:8200/items/countries', {
  headers: { Authorization: 'Bearer uat-directus-static-admin-token-32c' },
});
// 200 = collection exists and token is valid
// 404 = collection not yet created (Directus ≤ 10 behaviour)
// 403 = collection not yet created (Directus 11 behaviour — intentional; prevents
//       collection enumeration; does NOT mean the token is invalid)
// 403 = token invalid (only when /users/me also returns 403)
// Accept 200, 403, or 404; verify token validity via /users/me separately.
expect([200, 403, 404]).toContain(items.status());
```

**Expected UI state:** `/server/health` returns HTTP 200. Admin token does not
return 403.

**Screenshot label:** `step-003-directus-health`

---

### Step 004 — Mailpit SMTP catcher

**AC ref:** AC-4

**Precondition:** `uat-env-setup.sh` started Mailpit via Docker Compose.

**Action:**
```ts
const mailpit = await request.get('http://localhost:8025/api/v1/messages');
expect(mailpit.ok()).toBe(true);
```

**Expected UI state:** HTTP 200. Response is a JSON object from the Mailpit
API (may be `{ messages: [], total: 0 }`).

**Screenshot label:** `step-004-mailpit-health`

---

### Step 005 — NestJS API health

**AC ref:** AC-5

**Precondition:** `apps/api` started with `pnpm dev`.

**Action:**
```ts
const api = await request.get('http://localhost:3000/health');
expect(api.ok()).toBe(true);
```

**Expected UI state:** HTTP 200 with `{ status: 'ok' }` or equivalent.

**Screenshot label:** `step-005-api-health`

---

### Step 006 — Astro web app health

**AC ref:** AC-6

**Precondition:** `apps/web` started with `pnpm dev`.

**Action:**
```ts
await page.goto('http://localhost:4321');
await expect(page).toHaveTitle(/.+/);
```

**Expected UI state:** Page loads; non-empty title (AI Qadam homepage).

**Screenshot label:** `step-006-web-health`

---

### Step 007 — Internal API token env var check

**AC ref:** AC-7

**Precondition:** Step 005 passed.

**Action:**
```ts
// 401 = auth guard active (INTERNAL_API_TOKEN is set)
// 500 = config crash (token is blank or app failed to start)
const probe = await request.post('http://localhost:3000/v1/internal/ping', {
  headers: { 'x-internal-auth': 'intentionally-wrong-token' },
});
expect(probe.status()).toBe(401);
```

**Expected UI state:** HTTP 401 (not 500, not connection refused).

**Screenshot label:** `step-007-internal-token-configured`

---

## Negative Scenarios

### Negative 001 — OIDC application not created

**AC ref:** AC-2

**Precondition:** `uat-env-setup.sh` ran but Authentik OIDC bootstrap printed
a warning about manual setup being required (edge case where the Authentik API
authentication flow failed).

**Action:** Attempt Step 002.

**Expected rejection:** HTTP 404 on the discovery URL. UATRunner records
`blocked`. Escalate: follow
`docs/04-development/infrastructure/runbooks/authentik-local-bootstrap.md`
manually, then re-run `bash scripts/uat-env-setup.sh`.

**Screenshot label:** `neg-001-oidc-not-configured`

---

### Negative 002 — App not started

**AC ref:** AC-5

**Precondition:** Developer skipped `pnpm dev` for `apps/api` or `apps/web`.

**Action:** Attempt Step 005 or Step 006.

**Expected rejection:** Connection refused. UATRunner records `blocked` —
this is an environment error, not a product bug. Escalate: start the missing
app.

**Screenshot label:** `neg-002-app-not-started`

---

### Negative 003 — INTERNAL_API_TOKEN blank (env var missing)

**AC ref:** AC-7

**Precondition:** `apps/api/.env` has `INTERNAL_API_TOKEN=` (blank).

**Action:** Step 007 returns HTTP 500 instead of 401.

**Expected rejection:** HTTP 500 or connection error. Re-run
`bash scripts/uat-env-setup.sh` (it generates the token if missing) then
restart `apps/api`.

**Screenshot label:** `neg-003-token-blank`

---

## Notes

### Authentik OIDC bootstrap edge case

`uat-env-setup.sh` creates the OIDC application via the Authentik admin API
using HTTP Basic auth (akadmin / SuperSecretPass). On some Authentik versions
the Basic auth path is unavailable on the REST API — in that case the script
prints a warning and leaves `OIDC_CLIENT_ID=PLACEHOLDER_REPLACED_IN_STEP_6`
in `apps/api/.env`. The UATRunner will catch this at Step 002 (404 on the
discovery URL). Fix: follow the runbook manually once, then all subsequent
`uat-env-setup.sh` runs will detect the existing application and skip creation.

### App startup is not automated

`apps/api` and `apps/web` are host-process apps (not Docker containers).
`uat-env-setup.sh` does not start them because they depend on `node_modules`
being installed (`pnpm install` must run first). The correct command is:

```bash
pnpm install   # once, or after any dependency change
pnpm dev       # Turborepo starts api + web + web-next in parallel with hot-reload
```

For a fully headless CI/CD UAT pipeline, add `pnpm dev &` followed by
`wait_for_url` polling before invoking Playwright.

### Directus schema

After first boot, Directus has its own schema tables but the AI Qadam
application collections (events, registrations, etc.) are not present until
`infrastructure/directus/bootstrap.sh` is run. BP-UAT-000 Step 003 accepts a
404 on `/items/countries` as passing — the schema bootstrap is a separate
one-time step covered by the Directus bootstrap runbook and not part of the
UAT pre-flight.

## Process identity check

Pre-flight verifies each expected service by **process identity**, not just
by port ownership. A bare `curl http://localhost:<port>/health` accepts any
service answering on that port — including a sibling project's dev server
that may squat on the same port (see [ISS-UAT-013-2](../../issues/ISS-UAT-013-2.md)
for the original incident). Use
`bash scripts/uat-preflight-check.sh <service> <port> <expected-substring>`
to confirm the PID listening on the port has a CommandLine matching the
expected service. Example:

```bash
bash scripts/uat-preflight-check.sh api :3000 "@aiqadam/api"
bash scripts/uat-preflight-check.sh web :4321 "@astrojs/node"
```

On a mismatch, the helper exits non-zero with the foreign PID and its
CommandLine so the operator can identify and stop the conflicting process
without guessing.

**Coverage:** Windows (primary; PowerShell + `Get-CimInstance`).
macOS / Linux have a TODO marker; track separately if cross-platform
support is needed. The helper is wired into
[`.copilot/workflows/uat-verification.md` Step 2](../../workflows/uat-verification.md),
and the regression test lives at
`scripts/tests/uat-preflight-check.bats`.
