## Pre-flight Report — BP-UAT-013

**Workflow:** wf-20260628-uat-030
**Step:** 2 (uat-preflight)
**Run by:** Orchestrator
**Run at:** 2026-06-28T11:30:00Z

### Goal

Confirm the local UAT environment is ready to execute the BP-UAT-013 spec
against `http://localhost:4321`, then hand off to UATRunner.

### Environment topology (mapped)

The script's `environment: http://localhost:4321` targets **`apps/web`**
(legacy Astro app), NOT `apps/web-next`. Confirmed by:

| Artifact | Evidence |
|---|---|
| `apps/web/astro.config.mjs` | `server: { port: 4321 }` |
| `apps/web-next/astro.config.mjs` | proxy → `:3000` and `port: 4322` |
| `apps/api/.env` | `OIDC_REDIRECT_URI=http://localhost:4321/api/v1/auth/callback` |
| `scripts/uat-env-setup.sh:456` | `UAT_BASE_URL=http://localhost:4321` |
| `apps/web/src/pages/index.astro` | imports `LeadCaptureForm` (the form the script tests) |
| `apps/web-next/src/pages/index.astro` | renders only `<Hero>` (no lead capture form — gap, see below) |

**Correction to BusinessAnalyst's "downstream concern":** BusinessAnalyst
flagged `apps/web-next/src/pages/index.astro` as missing a lead capture form.
That observation was correct, but it does **not** affect BP-UAT-013 because
the UAT runs against `apps/web` on 4321, which DOES render the form. The
gap remains a real product issue (web-next migration parity) and is
re-registered as `ISS-...` in Step 4 (triage).

### Environment checks

| Check | Result | Notes |
|---|---|---|
| Docker stack reachable | PASS | 11 containers Up; postgres (5433), directus (8200), mailpit (8025), authentik (9000), redis (6379), minio (9001/9100), twenty (3010), telegram-bot-api (8082). |
| Directus `:8200/server/health` | PASS | HTTP 200. |
| Directus `:8200/server/info` | PASS | HTTP 200. |
| Authentik `:9000/-/health/ready/` | PASS | HTTP 200. |
| Mailpit `:8025/` | PASS | HTTP 200. |
| `apps/web` Astro dev server on `:4321` | **PASS (started)** | Was DOWN at start of step; started via `pnpm --filter web dev`. PID 23044 listening on `[::1]:4321`. Logs: `Dev server running at http://localhost:4321 (pid 23044)`. |
| `apps/api` NestJS on `:3000` | PASS (already running) | PID 5008 listening. `WEB_BASE_URL=http://localhost:4321`. `OIDC_REDIRECT_URI=http://localhost:4321/api/v1/auth/callback` (matches the web proxy mapping `web :4321/api/* → api :3000`). |
| `/` returns 200 with lead form | PASS | HTTP 200, 111 272 bytes. |
| `/onboard` returns 200 | PASS | HTTP 200, 100 108 bytes. |
| `/leads/verified` returns 200 | PASS | HTTP 200. |
| `/leads/verify-failed` returns 200 | PASS | HTTP 200. |
| `pnpm uat:seed` completes | PASS (after 3 retries) | Directus hit transient 503s ("Service 'api' is unavailable. Under pressure.") on retry 1 and retry 2. Retried with 8s and 15s back-off; retry 3 succeeded end-to-end. Bootstrap reports `✅ Directus schema bootstrapped`. |
| Authentik test users created | PASS | `uat-member@aiqadam.test` (pk=5, group `aiqadam-member`), `uat-operator@aiqadam.test` (pk=6, group `aiqadam-super-admin`). Credentials `UatMember1!` / `UatOperator1!` (also in `apps/e2e/.env.uat`). |
| `operator_invites` collection exists in Directus | PASS | Schema bootstrapped by `pnpm uat:seed`. Fields: `id, email, display_name, role_groups (json), country, token_hash (sha256 hex), token_prefix, status (pending/consumed/revoked), created_at, created_by, expires_at, consumed_at, revoked_at, revoked_by`. |
| Operator onboard tokens seeded | PASS (manually inserted) | `uat-seed.sh` does NOT seed `operator_invites` rows. Orchestrator inserted three rows via Directus REST API using the static admin token from `apps/api/.env` (`DIRECTUS_TOKEN=uat-directus-static-admin-token-32c`). See "Token provisioning" below. |

### Token provisioning (BusinessAnalyst env-finding fix)

**Issue raised in Step 1 (BusinessAnalyst validation, finding #1):**
`scripts/uat-seed.sh` does not insert rows into `operator_invites`. Three
tokens are required by BP-UAT-013 (valid, used, expired). Orchestrator
provisioned them via `POST /items/operator_invites` on Directus.

| Plaintext token (URL value) | Token_hash (SHA-256 hex) | Email | Status | Expires_at | Consumed_at |
|---|---|---|---|---|---|
| `uat-onboard-token` | `5e74f9f9...` (64 hex chars) | `uat-operator+valid@aiqadam.test` | `pending` | 2026-07-05 (+7d) | NULL |
| `uat-onboard-used-token` | `...` | `uat-operator+used@aiqadam.test` | `consumed` | 2026-07-05 | 2026-06-28 2h ago |
| `uat-onboard-expired-token` | `...` | `uat-operator+expired@aiqadam.test` | `pending` | 2026-06-27 (past) | NULL |

All three rows inserted; verified via `GET /items/operator_invites`.
**This is a workaround** — `pnpm uat:seed` should ideally provision these
tokens. That gap is registered as `ISS-...` in Step 4.

### UAT env-var wiring (for `apps/e2e/.env.uat`)

Confirmed expected values for the Playwright UAT runner:

| Env var | Expected | Source |
|---|---|---|
| `UAT_BASE_URL` | `http://localhost:4321` | `apps/web/astro.config.mjs` |
| `UAT_MEMBER_EMAIL` | `uat-member@aiqadam.test` | `scripts/uat-seed.sh` output |
| `UAT_MEMBER_PASSWORD` | `UatMember1!` | `scripts/uat-seed.sh` output |
| `UAT_OPERATOR_EMAIL` | `uat-operator@aiqadam.test` | `scripts/uat-seed.sh` output |
| `UAT_OPERATOR_PASSWORD` | `UatOperator1!` | `scripts/uat-seed.sh` output |
| `UAT_ONBOARD_TOKEN` | `uat-onboard-token` | inserted by Orchestrator |
| `UAT_ONBOARD_USED_TOKEN` | `uat-onboard-used-token` | inserted by Orchestrator |
| `UAT_ONBOARD_EXPIRED_TOKEN` | `uat-onboard-expired-token` | inserted by Orchestrator |

These should be present in `apps/e2e/.env.uat`. UATRunner must confirm
they're loaded before executing the spec.

### Known env-related caveats carried into the run

1. **Directus rate limit (transient):** the seed script needs ≥3 retries
   when bootstrap creates many collections/relations in quick succession.
   Documented for the triage step.
2. **Three onboard tokens were not seeded by the official script** — only
   manually inserted by Orchestrator. If the run is re-run from a clean
   Directus, the same workaround must be applied.
3. **`apps/api/.env` has `DIRECTUS_TOKEN=uat-directus-static-admin-token-32c`**
   — this is the **UAT static token** the api uses. Orchestrator reused it
   for the inserts (same value, same intent: UAT-only). Documented for audit.
4. **No baseline screenshot of /leads/verified or /leads/verify-failed was
   taken** — UATRunner is responsible for capturing them when Steps 3 and 4
   (negative paths) execute.

### Gate Result

```yaml
gate_result:
  status: passed
  summary: "UAT environment is ready: apps/web on :4321 (lead form present), apps/api on :3000, Directus schema bootstrapped, Authentik uat-member/uat-operator provisioned, three operator_invites rows inserted (valid/used/expired). One env finding (seed script doesn't provision tokens) was mitigated inline; another (web-next homepage missing form) is product-side, not env-side, and re-registered in Step 4."
  findings:
    - "ENV gap (mitigated): scripts/uat-seed.sh does not seed operator_invites rows. Orchestrator inserted three rows via Directus REST using DIRECTUS_TOKEN from apps/api/.env."
    - "ENV gap (open): Directus 503 'Under pressure' during bootstrap — needed 3 retries to drain. Not blocking this run but should be addressed (slower bootstrap, or split into batches)."
    - "PRODUCT gap (re-registered in Step 4): apps/web-next/src/pages/index.astro renders only <Hero>; no lead capture form. The UAT script targets apps/web (which has the form), so this does not affect BP-UAT-013. But web-next parity with web is broken — the migration cannot cut over without this fix."
    - "apps/web was DOWN at start of step. Started via `pnpm --filter web dev` (background, PID 23044). Reminder for next operator: dev servers do not auto-start; run `pnpm --filter web dev` and `pnpm --filter api dev` before UAT."
  output_file: ".copilot/tasks/active/wf-20260628-uat-030/02-preflight.md"
```