# 06-test-design.md — wf-20260707-fix-118-flaky-playwright-authentik

Companion to `06-test-strategy.md`. Lists the concrete file-level changes
made to satisfy the strategy.

---

## Test/script files changed

### `apps/e2e/tests/uat/BP-UAT-009.spec.ts`

- Step 005's authenticated-content regression guard changed from
  `page.getByText(/your registrations|check-in qr|leaderboard points/i)`
  to `page.getByRole('heading', { name: /^your registrations$/i })`.
  Cause #2.

### `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts`

- New `RECOVERY_FLOW_URL` constant (`${AUTHENTIK_URL}/if/flow/default-recovery-flow/`)
  replacing all direct navigations to the brand-keyed
  `/if/flow/recovery/` path. Cause #3.
- Step 001 now submits the identifier field before checking for the
  "Forgot password?" link, and the expected href pattern accepts either
  the slug or brand-keyed form. Cause #3.
- `submitRecoveryFlow` split into `submitRecoveryIdentifier` (identifier
  stage only) and `completeRecoveryPasswordEntry` (password stage
  through completion). Cause #6.
- Step 002 now calls `page.goto(linkMatch![1])` between identifier
  submission and password entry — the reset link extracted from the
  live email is actually followed. Cause #6.
- `completeRecoveryPasswordEntry` ends with
  `page.waitForURL(/\/if\/flow\/default-authentication-flow\//)`
  instead of a bare `waitForLoadState`. Cause #10.
- Step 002 checks `page.url().startsWith(BASE_URL + '/me')` before
  falling back to an explicit `signInViaAuthentik` call. Cause #10.
- Step 003's expected neutral-copy regex changed from
  `/if an account exists|you'll receive an email|shortly/i` to
  `/recover your account|check your inbox/i`. Cause #7.
- `signInViaAuthentik`'s identifier-stage button locator broadened from
  `/continue/i` to `/continue|log in|next|sign in/i`. Cause #9.
- Step 002's password-restore block replaced: instead of a
  (nonexistent) `/me/profile` password-change form, it now clears
  cookies and drives a second full pass through the recovery flow
  (`submitRecoveryIdentifier` → wait for a NEW email → follow its link →
  `completeRecoveryPasswordEntry(page, MEMBER_PASSWORD)`). Cause #11.
- `waitForRecoveryEmail` gained an `excludeIds: ReadonlySet<string> = new Set()`
  parameter; the restore block passes the first email's ID so the
  second poll cannot return the already-consumed first message. Cause
  #12.

### `infrastructure/docker-compose.yml`

- `authentik-server` and `authentik-worker` services both gained:
  ```yaml
  AUTHENTIK_EMAIL__HOST: ${AUTHENTIK_EMAIL_HOST:-mailpit}
  AUTHENTIK_EMAIL__PORT: ${AUTHENTIK_EMAIL_PORT:-1025}
  AUTHENTIK_EMAIL__USE_TLS: "false"
  AUTHENTIK_EMAIL__USE_SSL: "false"
  AUTHENTIK_EMAIL__FROM: ${AUTHENTIK_EMAIL_FROM:-authentik@localhost}
  ```
  Cause #4.

### `scripts/provision-authentik-recovery-flow.sh`

- `ensure_email_stage()` now re-asserts `use_global_settings: true` on
  every idempotent re-run (previously only patched `subject`). Cause
  #5.
- New `resolve_existing_stage_uuid()` helper resolves an existing
  Authentik stage's UUID by API path + exact name.
- Main orchestration (renumbered `[1/6]`–`[6/6]`) now resolves and binds
  Authentik's built-in `default-password-change-prompt` (order 30) and
  `default-password-change-write` (order 40) stages to the recovery
  flow. Cause #8.

### `scripts/tests/provision-authentik-recovery-flow.bats`

- New test `regression-use-global-settings-repaired-by-rerun`: forces
  `use_global_settings=false` + stale `host=localhost, port=25` on the
  live `aiqadam-recovery-email` stage, re-runs the provision script,
  asserts the drift is repaired. Cause #5 regression coverage.

---

## No production application code changed

Every change in this diff is either a test file, a local-development
infrastructure config file (`docker-compose.yml`, itself a dev-only
file per its own header comment), or an operational provisioning
script + its test. `apps/web`, `apps/web-next`, and `apps/api` are
untouched.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "All planned file changes implemented and live-verified per 06-test-strategy.md."
  findings: []
```
