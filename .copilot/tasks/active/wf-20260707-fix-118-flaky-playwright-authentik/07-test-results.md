# 07-test-results.md — wf-20260707-fix-118-flaky-playwright-authentik

**Date**: 2026-07-30
**Branch**: `fix/ISS-USR-PWRESET-001-playwright-authentik-flake`

---

## 1. Infrastructure pre-flight (per AGENTS.md §6.1)

| Service | Check | Result |
|---|---|---|
| Authentik server | `curl -fsS http://localhost:9000/if/flow/default-authentication-flow/` | 200 |
| Authentik worker | `docker ps` | Up, healthy (recreated mid-session to apply `AUTHENTIK_EMAIL__*`, confirmed healthy after) |
| Mailpit | `curl -fsS http://localhost:8025/api/v1/messages` | 200 |
| Postgres / Redis | `docker ps` | Up, healthy |
| Web (`apps/web`) | `curl -fsS http://localhost:4321` | 200 |

All required services were already running at workflow start; the
Authentik server/worker containers were recreated once (`docker compose
up -d authentik-server authentik-worker`) to apply the new
`AUTHENTIK_EMAIL__*` env vars, and confirmed healthy again within ~30s.

## 2. `apps/e2e/tests/uat/BP-UAT-009.spec.ts`

Command:
```
set -a; source apps/e2e/.env.uat; set +a
cd apps/e2e && pnpm exec playwright test tests/uat/BP-UAT-009.spec.ts --config playwright.uat.config.ts --reporter=list
```

| | Pre-fix (documented baseline, `wf-20260707-fix-117`) | Post-fix (this session, live-verified) |
|---|---|---|
| Pass count | 1/9 | 7/9 |

Post-fix failures (both pre-existing, both soft-assertion-only, neither
a regression — see `06-test-strategy.md` §5 for full detail):
- Step 004 (Sign out): Authentik's logout confirmation interstitial,
  already documented in the spec's own comments. Hard assertion
  (session cookie cleared) still passes.
- Step 005 (Protected page after sign-out): script expected a 302
  redirect; actual app behavior is 200 + in-page AnonView, already
  documented in the spec's own comments. Hard assertions (no
  authenticated-only content leaked; footer regression guard) still
  pass.

## 3. `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts`

Command:
```
set -a; source apps/e2e/.env.uat; set +a
cd apps/e2e && pnpm exec playwright test tests/uat/BP-USR-PWRESET.spec.ts --config playwright.uat.config.ts --reporter=list
```

| | Pre-fix (documented baseline, `wf-20260707-fix-117`) | Post-fix (this session, live-verified) |
|---|---|---|
| Pass count | 0/6 | **6/6** |

All 6 tests pass:
```
ok 1 Step 001 — Anonymous user sees "Forgot password?" link on Authentik login UI
ok 2 Step 002 — Happy path: known email receives recovery email and user sets a new password
ok 3 Step 003 — Negative path: unknown email returns neutral copy without leaking user enumeration
ok 4 Step 004 — Recovery email subject is branded, not Authentik default
ok 5 Step 005 — Existing BP-UAT-009 sign-in flow not regressed (re-run via separate spec)
ok 6 Step 006 — Anonymous user lands on recovery flow at expected URL with no application-side redirect
6 passed (33.2s)
```

## 4. `scripts/tests/provision-authentik-recovery-flow.bats`

Command:
```
bash scripts/run-bats.sh scripts/tests/provision-authentik-recovery-flow.bats
```

| | Pre-fix (documented baseline) | Post-fix (this session, live-verified) |
|---|---|---|
| Pass count | 7/7 | **8/8** |

```
1..8
ok 1 idempotent-bind-brand-flow-recovery
ok 2 idempotent-brand-email-subject
ok 3 regression-use-global-settings-repaired-by-rerun   [NEW]
ok 4 regression-recovery-url-was-404-before-fix
ok 5 regression-email-template-jinja-body-preserved
ok 6 host-allow-list-rejects-unknown-host
ok 7 doc-and-spec-exist
ok 8 provision-script-runs-clean-against-localhost
```

## 5. AC-by-AC disposition (per `ISS-USR-PWRESET-001.md`)

| AC | Description | Prior disposition | This workflow's disposition |
|---|---|---|---|
| AC-1 | Anonymous user can navigate to recovery flow URL | verified (bats) | **still verified** |
| AC-2 | "Forgot password?" link on Authentik login UI | verified (protocol-level) | **verified live** — BP-USR-PWRESET Step 001 passes |
| AC-3 | Submitting recovery form sends email to Mailpit | **deferred** | **verified live end-to-end** — BP-USR-PWRESET Steps 002/004 pass, live email confirmed in Mailpit with correct branded subject |
| AC-4 | Recovery email subject is branded | verified (bats) | **still verified**, also live-verified via Step 004 |
| AC-5 | User can complete recovery + sign in with new password | **deferred** | **verified live end-to-end** — BP-USR-PWRESET Step 002 passes: identifier submitted, email received, link followed, new password set, session established, verified via `/me` |
| AC-6 | BP-UAT-009 sign-in not regressed | verified-not-regressed | **still verified-not-regressed** — 7/9 vs. 1/9 baseline is an improvement, not a regression; the 2 remaining failures are pre-existing and unrelated to this PR's changes |
| AC-7 | Host allow-list prevents non-allow-listed origin | verified (bats) | **still verified** |

**All 7 ACs are now verified.** No deferrals remain.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "All 3 test suites live-verified green (or pre-existing-documented for the 2 unrelated BP-UAT-009 soft-assertion cases). AC-3/AC-5 flip from deferred to verified."
  findings: []
```
