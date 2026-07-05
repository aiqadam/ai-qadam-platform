# Step 2 — Pre-Flight Result

**Run date:** 2026-07-05 (UTC)
**Workflow:** wf-20260705-uat-100
**BP-UAT:** 013 (Member signup and operator onboarding)

---

## Docker stack (Step 2a)

| Service | Status | Port |
|---|---|---|
| aiqadam-postgres | Up 38h (healthy) | 127.0.0.1:5433 |
| aiqadam-directus | Up 38h (healthy) | 127.0.0.1:8200 |
| aiqadam-mailpit | Up 38h (healthy) | 127.0.0.1:8025 |
| aiqadam-authentik-server | Up 38h (healthy) | 127.0.0.1:9000 |
| aiqadam-authentik-worker | Up 38h (healthy) | — |
| aiqadam-minio | Up 38h (healthy) | 127.0.0.1:9001, 9100 |
| aiqadam-redis | Up 38h (healthy) | 127.0.0.1:6379 |
| aiqadam-twenty | Up 38h (healthy) | 127.0.0.1:3010 |
| aiqadam-telegram-bot-api | Up 38h (**unhealthy**) | 127.0.0.1:8082 |

Result: **PASS** (telegram-bot-api unhealthy is unrelated to BP-UAT-013 surface — the script does not exercise the bot path).

---

## Web reachability + process identity (Step 2b)

| Check | Result |
|---|---|
| `curl http://localhost:4321` | HTTP 200 (Astro dev page) |
| PID listening on :4321 | **8664** (`node astro.mjs dev --json`) — `@aiqadam/web` |
| Process-identity match (`@astrojs/node`) | PASS — Astro CLI process matches expected command pattern |

Result: **PASS**.

---

## API reachability + process identity (Step 2c)

| Check | Result |
|---|---|
| `curl http://localhost:3000/health` | HTTP **307** redirect (foreign Next.js server on :3000 — `node next/dist/server/lib/start-server.js` PID 31116, project `ai-dala-next`) |
| `curl http://localhost:3001/health` | Initially: not listening (no api running on :3001) |

**Foreign-service-squat detection (per ISS-UAT-013-2 + AGENTS.md §6.1):**
Port :3000 is held by **PID 31116** — `node …\ai-dala-next\node_modules\next\dist\server\lib\start-server.js` (foreign project). This matches the symptom recorded in `ISS-UAT-013-1` (resolved 2026-06-29 by `wf-20260629-fix-033` PR #65) and the spec file's inline honesty note in `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`:

> "The api on dev listens on PORT=3001 in this UAT (port 3000 is held by a foreign ai-dala-next dev server). UAT_API_URL is overridden at the command line."

### Remediation taken (Orchestrator direct)

The `@aiqadam/api` was not running. Per AGENTS.md §6.1 (Orchestrator infra pre-flight: bring up missing infra, then run the test), I started the api on the non-conflicting port `:3001`:

```bash
$env:PORT = 3001; pnpm dev   # in apps/api
# → PID 5488: node …\apps\api\dist\main
```

Re-probe after api start:

| Check | Result |
|---|---|
| `curl http://localhost:3001/health` | HTTP **200** with body `{"status":"ok","timestamp":"…","service":"api","tenant":{"code":"uz","name":"Uzbekistan"}}` |
| PID listening on :3001 | **5488** (`@aiqadam/api/dist/main`) |
| Process-identity match (`@aiqadam/api`) | PASS |

Result: **PASS** (api is the real `@aiqadam/api`).

---

## Seed (Step 2d) — FAILED

### First attempt: `pnpm uat:seed --reset BP-UAT-013` (with manifest)

The `--reset` code path (`reset_domain_fixture`, `scripts/uat-seed.sh:725`) POSTs the manifest payload **verbatim** to Directus. The manifest at `scripts/uat-fixtures/BP-UAT-013.json` declares only the business fields (`email`, `display_name`, `status`, `expires_at_offset`, `consumed_at`, `role_groups`, `country`) — it does **not** declare `token_hash` or `token_prefix`. Directus's `operator_invites` collection now requires both (added by `bootstrap.sh` for the email-routing fields that were dropped in F-S2.12, but the constraint stayed). The four fixture rows are DELETED, then re-creation fails with:

```
Validation failed for field "token_hash". Value is required.
Validation failed for field "token_prefix". Value is required.
```

The unconditional seed path (`ensure_operator_invite`, `scripts/uat-seed.sh:500-595`) **does** compute `token_hash`/`token_prefix` at the call site — but that path was bypassed by `--reset` (intentional: FR-WORKFLOW-003 said `--reset` should DELETE+RECREATE from the manifest payload, not call `ensure_operator_invite`).

This is a real seed-script bug in the FR-WORKFLOW-003 `--reset` path. The fixture payload schema needs to carry `token_plain` (which it does, top-level) so the reset path can recompute `token_hash`/`token_prefix` the same way `ensure_operator_invite` does. **Not a product bug** — environment/test-infra blocker.

### Second attempt: `pnpm uat:seed` (unconditional)

Falls through to STEP 1-4. STEP 1 (Directus bootstrap) succeeds; STEP 2 (migrations) succeeds; STEP 3 (Authentik users) starts; `uat-member` ensure + group patch both succeed; `api_ensure_directus_user_link uat-member@example.com "UAT Member"` fails:

```
curl -s -X POST -w '\n%{http_code}' http://localhost:3000/v1/internal/users/ensure-linked -d '{…}'
→ resp='\n000'   (curl exit 7)
```

The seed script reads `apps/api/.env`'s `PORT=3000` (canonical) and ignores `API_BASE_URL` in this run. **curl exit 7 = "Failed to connect"** — the seed's `curl` is GNU `curl 8.5.0 (x86_64-pc-linux-gnu)` from Git Bash (`/usr/bin/curl`), which in this sandboxed terminal context cannot reach the Windows-host's `localhost:3000` (or `:3001`).

Sanity check from the sandbox's PowerShell with `curl.exe`:

```powershell
curl.exe -s --max-time 5 http://localhost:3001/health
→ code=200   body={"status":"ok","service":"api","tenant":{"code":"uz"}}
```

`curl.exe` from PowerShell reaches the api at `:3001` (200); GNU `curl` from Git Bash does not. This is a **sandbox network-isolation limitation**, not a product bug and not a fixable env-config issue. The user's actual machine runs the seed via `pnpm uat:seed` natively (where Windows `curl.exe` is used) and it works — per `wf-20260704-fix-089` (PR #106 squash `3e524bd`), which is the most recent precedent for this exact seed run.

### Third attempt: `API_BASE_URL=http://localhost:3001 pnpm uat:seed`

The script does honor `API_BASE_URL` (`scripts/uat-seed.sh:274` — `local api_base="${API_BASE_URL:-http://localhost:${api_port}}"`). Verified the override takes effect via `bash -x` trace:

```
+ local api_base=http://localhost:3001   # ← override worked
```

But the underlying `curl` failure mode is identical — GNU `curl 8.5.0` from Git Bash in this sandbox cannot reach Windows-host `localhost:3001`. The endpoint is reachable from PowerShell `curl.exe` (verified independently) but unreachable from inside this terminal's bash.

---

## Pre-Flight Gate Decision

| Gate | Result |
|---|---|
| 2a — Docker stack healthy | **PASS** |
| 2b — Web reachable + process identity | **PASS** |
| 2c — API reachable + process identity (after starting on :3001) | **PASS** |
| 2d — Seed completes | **FAIL** |

Two distinct failures, both NOT product bugs:

1. **`--reset BP-UAT-013` payload bug** (real seed-script defect): manifest payload omits `token_hash`/`token_prefix`; the reset path POSTs them as null → Directus 400. Follow-up workflow needed.
2. **Sandbox bash-curl cannot reach Windows localhost** (terminal limitation): GNU curl from Git Bash cannot reach `localhost:3001` from this sandboxed agent terminal. Follow-up workflow needs to be run from the user's native terminal, OR the seed script's curl needs to call `curl.exe` explicitly when running under Git Bash on Windows.

**Per AGENTS.md §6.1 (production-readiness), §6.2 safety gate #5 (conflicting in-flight work), and §13 (critical analysis of trade-offs):**

I have two options:

- **Option A:** Declare `failed-escalate`, write `NEEDS_REVIEW.md`, register `ISS-UAT-013-14` (covering both findings), and queue a follow-up workflow `wf-20260705-fix-101-uat-013-verify` to either (a) fix the seed reset-path bug + (b) make the seed `curl.exe`-aware on Windows, then re-run this workflow. The Orchestrator's job per §6.1 is "make the test possible" — but the sandbox limitation is not fixable from inside this workflow.
- **Option B:** Proceed with a partial UAT run (steps that don't depend on `api_ensure_directus_user_link`). The four `operator_invites` rows were DELETED by the failed `--reset`, so even Step 005/006/Neg 002/003/Neg 005 cannot run. **This is not viable.**

**Decision: Option A.** I will not run UATRunner against an environment where (i) the fixtures are gone and (ii) the seed cannot re-create them. That would corrupt the entire BP-UAT-013 surface (Steps 005/006 + Neg 002/003/005 all depend on the four `operator_invites` rows). Per AGENTS.md §9 (honesty and integrity), pretending otherwise is a workflow violation.

The validation (Step 1) is complete and recorded; the pre-flight investigation (Step 2) is complete and recorded; the remaining work (Step 3+ — actual Playwright run, VisualReviewer, Triage, PR) requires either (a) the user's terminal or (b) the seed-script fix first.

## Gate Result

```yaml
gate_result:
  status: failed-escalate
  summary: "Pre-flight failed: (1) --reset BP-UAT-013 path POSTs manifests without token_hash/token_prefix and Directus rejects; (2) bash GNU curl in the agent sandbox cannot reach Windows-host localhost on the api port — verified curl.exe from PowerShell reaches :3001 200."
  findings:
    - "ISS-UAT-013-14: scripts/uat-seed.sh reset_domain_fixture() must recompute token_hash + token_prefix from manifest.token_plain before POST (parallel to ensure_operator_invite's lines 500-501)."
    - "ISS-UAT-013-15: scripts/uat-seed.sh's bash curl cannot reach Windows-host localhost from inside Git Bash MSYS sandbox; needs curl.exe fallback on Windows, or the workflow must run from the user's native terminal."
    - "api started on :3001 (PID 5488) was stopped to restore clean state."
    - "operator_invites table currently empty (4 rows deleted by the failed --reset) — must be reseeded before any BP-UAT-013 run."
```