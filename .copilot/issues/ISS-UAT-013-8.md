# ISS-UAT-013-8 — `operator_invites.email` vs seeded Authentik user email mismatch; `invite_missing_authentik_user` blocks Step 006

| Field | Value |
|---|---|
| ID | ISS-UAT-013-8 |
| Severity | bug (seed-gap, blocks Step 006 only) |
| Module | uat / seed |
| Status | resolved |
| Reported | 2026-06-28 |
| Resolved | 2026-06-29 |
| Reporter | BusinessAnalyst (wf-20260628-uat-030 / 04-uat-triage.md, attempt 2) |
| Workflow | wf-20260628-uat-030 → wf-20260629-fix-039 |
| Resolved by | wf-20260629-fix-039 (PR #71) |
| Merged | _pending auto-merge_ |
| PR | https://github.com/tvolodi/aiqadam/pull/71 |

## Symptom

During the BP-UAT-013 attempt-2 run on 2026-06-28, Step 006 (Complete operator
onboarding) failed with the API's structured error code
`invite_missing_authentik_user`. Screenshot evidence:

```
apps/e2e/uat-results/BP-UAT-013/step-006-onboard-completed.png
apps/e2e/test-results/…/video.webm   (per-test trace + video)
```

The UI form correctly surfaced the error verbatim — the React handler
(`apps/web-next/src/blocks/customer/OnboardingForm.tsx` or its sibling in
`apps/web/src/blocks/customer/OnboardingForm.tsx`) renders the error code as
inline error text, so the failure is honest at every layer.

The runtime evidence is the seed-data mismatch itself:

| Field | Value (from `scripts/uat-seed.sh` + Orchestrator's pre-flight insert) |
|---|---|
| `operator_invites.email` for the valid token | `uat-operator+valid@aiqadam.test` |
| `operator_invites.token_prefix` for the valid token | `uat-onboard-token` (hash of plaintext `uat-onboard-token`) |
| Authentik user `uat-operator` | `uat-operator@aiqadam.test` (no `+valid` suffix) |
| Authentik groups for `uat-operator` | `aiqadam-super-admin` |

The api's `/v1/onboard/accept` handler (`apps/api/src/modules/admin-invites/admin-invites.service.ts:358`)
requires an Authentik user whose email matches `operator_invites.email`
exactly. The `+valid` suffix is a plus-addressing tag — Authentik stores the
user's `email` field verbatim, so it stores `uat-operator@aiqadam.test`,
and the api's check finds no match.

## Root cause

There are two contributing causes, both in the seed layer:

### A. The `+valid` suffix on the invite email is a UAT-internal convention

The script `docs/02-business-processes/uat/BP-UAT-013.md` (Step 005) and the
three inserted `operator_invites` rows use the `+valid` / `+used` / `+expired`
plus-addressing suffixes to make each row visually distinguishable in
Directus admin. This is reasonable in isolation, but:

### B. `scripts/uat-seed.sh` does not provision a matching Authentik user per row

`scripts/uat-seed.sh` provisions exactly one operator user:
`uat-operator@aiqadam.test` (line 237, 278 — `OPERATOR_EMAIL` default; passed
to Authentik's user-create endpoint). It does not provision
`uat-operator+valid@aiqadam.test`, `uat-operator+used@aiqadam.test`, or
`uat-operator+expired@aiqadam.test` — those are not real users.

`uat-env-setup.sh` line 468 also defaults `UAT_OPERATOR_EMAIL=uat-operator@aiqadam.test`,
so even if a developer copies a `.env.uat` from a working run, they get a
single non-plus-addressed user.

### Why this matters

The api's `invite_missing_authentik_user` is **correct production behaviour**:
if an operator in production creates an invite for `alice@acme.com`, the
production user `alice@acme.com` must exist (or be created via SCIM) before
the invite can be consumed. The seed layer must therefore either (a) create
matching Authentik users per invite, or (b) drop the `+valid` suffix and use
the bare `uat-operator@aiqadam.test` for all three rows.

This issue is registered separately from ISS-UAT-013-4 (which is about
`operator_invites` rows not being seeded at all). ISS-UAT-013-4 is about
**existence**; this issue is about **consistency between the two seed layers**
when those rows DO exist.

## Repro

```bash
# 1. Confirm the seed mismatch
grep '^UAT_OPERATOR_EMAIL=' scripts/uat-env-setup.sh
# → UAT_OPERATOR_EMAIL=uat-operator@aiqadam.test

grep 'OPERATOR_EMAIL=' scripts/uat-seed.sh
# → OPERATOR_EMAIL="${UAT_OPERATOR_EMAIL:-uat-operator@aiqadam.test}"

curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" \
  http://localhost:8200/items/operator_invites?filter[token_prefix][_eq]=uat-onboard-token \
  | jq '.data[0].email'
# → "uat-operator+valid@aiqadam.test"

# 2. Confirm the api rejects the accept call with the structured error
curl -i -X POST http://localhost:3001/v1/onboard/accept \
  -H "Content-Type: application/json" \
  -d '{"token":"uat-onboard-token","password":"UatOperator1!","acceptAup":true}'
# → HTTP/1.1 409 Conflict
# → {"error":"invite_missing_authentik_user"}
```

## Proposed resolution

The cleanest fix is to **drop the `+valid` / `+used` / `+expired` plus-addressing
suffixes from the UAT seed data** and use the bare `uat-operator@aiqadam.test`
email for all three `operator_invites` rows. This keeps the seed layer simple
(one operator user, three invites that all point to it) and matches production
semantics where one operator has been issued multiple invites over time.

### Implementation (in `scripts/uat-seed.sh` per ISS-UAT-013-4's helper)

```bash
ensure_operator_invite() {
  local email="$1" status="$2" expires_at="$3" consumed_at="$4" token_plain="$5"
  local token_hash
  token_hash=$(printf '%s' "$token_plain" | sha256sum | awk '{print $1}')
  # …
}

# Three rows, all pointing to the seeded operator user
ensure_operator_invite "uat-operator@aiqadam.test"  "pending"  "$(date -u -d '+7 days'  +%FT%TZ)" ""                "uat-onboard-token"
ensure_operator_invite "uat-operator@aiqadam.test"  "consumed" "$(date -u -d '+7 days'  +%FT%TZ)" "$(date -u +%FT%TZ)" "uat-onboard-used-token"
ensure_operator_invite "uat-operator@aiqadam.test"  "pending"  "$(date -u -d '-1 day'   +%FT%TZ)" ""                "uat-onboard-expired-token"
```

### Acceptance criteria

1. `pnpm uat:seed` against a clean Directus leaves `operator_invites` with
   exactly 3 rows, all with `email = uat-operator@aiqadam.test`.
2. `Step 006 of BP-UAT-013` succeeds on the next UAT run (the api finds the
   matching Authentik user and proceeds to password/AUP/Accept).
3. The `+valid` / `+used` / `+expired` suffix convention is removed from
   `docs/02-business-processes/uat/BP-UAT-013.md` Step 005 description
   (replace with a one-sentence note: "all three rows point to the seeded
   `uat-operator@aiqadam.test` user; the token itself distinguishes them").
4. The api's `invite_missing_authentik_user` error path remains exercised in
   UAT by a **new** negative scenario that creates a row whose email has no
   matching Authentik user (e.g. `uat-operator+no-user@aiqadam.test`).

### Out of scope

- Changes to `apps/api`'s `/v1/onboard/accept` handler. Its current contract
  (Authentik email must match invite email) is correct production behaviour.
- Real Authentik SCIM user provisioning. Out of scope for the UAT seed layer.

## References

- `apps/api/src/modules/admin-invites/admin-invites.service.ts:358` — `invite_missing_authentik_user` throw
- `scripts/uat-seed.sh:237,278` — single seeded operator user
- `scripts/uat-env-setup.sh:468` — `UAT_OPERATOR_EMAIL` default
- `docs/02-business-processes/uat/BP-UAT-013.md` Step 005 — `uat-operator+valid@aiqadam.test` reference
- `.copilot/tasks/active/wf-20260628-uat-030/03-uat-runner-report.md` §5.2.2
- `.copilot/tasks/active/wf-20260628-uat-030/02-preflight.md` — manual three-row insert
- ISS-UAT-013-4 — sibling seed-layer issue (rows don't exist; this is rows exist but email mismatch)

## Resolution (wf-20260629-fix-039, 2026-06-29)

### Approach taken

Implemented option (b) from the proposed resolution: drop the
`+valid/+used/+expired` plus-addressing suffix from all three happy-path
`operator_invites.email` rows; they now all carry the bare
`uat-operator@aiqadam.test` (the seeded Authentik operator). Added a
**fourth** row (`uat-onboard-no-user-token`) with email
`uat-operator+no-user@aiqadam.test` so the api's
`invite_missing_authentik_user` error path remains exercised in UAT
(AC-4 of the proposed resolution).

### Scope expanded during Step 2 — `display_name` plumbing

The Orchestrator's impact analysis flagged that the existing
`getByText(/UAT Operator \(valid\)/i)` assertion at
`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts:282` would break after the
email fix because `OnboardingForm.tsx:192` renders
`preview.display_name ?? preview.email.split('@')[0]`. The seed script
never set `display_name`, so after the email fix the persona label would
become `Welcome, uat-operator.` instead of `Welcome, UAT Operator (valid).`.

Fix: `ensure_operator_invite` now takes a 6th `display_name` argument.
The four call sites pass `"UAT Operator (valid)"`,
`"UAT Operator (used)"`, `"UAT Operator (expired)"`, and `"UAT Operator
(no-user)"` respectively. The Directus `operator_invites.display_name`
column already existed (used by `OnboardingForm.tsx:192`) and was the
correct field to populate. Persona distinction is preserved; the spec
assertion at L282 continues to pass.

### Files changed

| File | Change |
|---|---|
| `scripts/uat-seed.sh` | `ensure_operator_invite` extended to take a 6th `display_name` arg; four call sites written (three happy + one no-user). |
| `scripts/uat-env-setup.sh` | `.env.uat` heredoc gains `UAT_ONBOARD_NO_USER_TOKEN=uat-onboard-no-user-token`. |
| `scripts/tests/uat-seed.bats` | AC-1 mock-count `3` → `4`; summary-name assertion now includes `uat-onboard-no-user-token`; **optional** AC-1 email-distribution `@test` added (asserts 3 bare + 1 plus-addressed). |
| `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` | New Neg 005 test (`ONBOARD_NO_USER_TOKEN`); honesty-notes header rewritten; persona-label assertion unchanged. |
| `docs/02-business-processes/uat/BP-UAT-013.md` | Seed Fixtures table rewritten with Email + display_name columns; Step 005/006 prose updated; new Negative 005 subsection added. |

**Total: 5 files modified. Net +59 lines.** Within the small-PR rule
(400 lines / 5 files).

### Apps/api code unchanged (correct behaviour)

The api's `invite_missing_authentik_user` throw at
`apps/api/src/modules/admin-invites/admin-invites.service.ts:358` is
**correct production behaviour** and was not touched. This was confirmed
by SecurityReviewer's read-only review (`04-security-review.md`,
INV-1 through INV-11 all pass; 0 MAJOR/MINOR).

### Test results

`scripts/tests/uat-seed.bats` now reports **8/8 pass** with the fix
versus **3/8 fail** with the seed reverted (proves the three new AC-1
assertions are non-vacuous). Sibling regression
`scripts/tests/bp-uat-template-rule.bats` (from wf-20260629-fix-038)
still reports **5/5 pass**. `pnpm arch:check` reports **249 files pass**.

Live run output preserved at `.copilot/tasks/active/wf-20260629-fix-039/07-test-results.md`.

### Risks documented in PR description

1. **Stale-row risk:** pre-existing `+valid/+used/+expired` rows in an
   already-seeded Directus environment will still throw
   `invite_missing_authentik_user`. Mitigation: before re-running
   `pnpm uat:seed`, execute
   `DELETE FROM operator_invites WHERE token_prefix LIKE 'uat-onboard%'`.
   Idempotency is keyed on `token_hash` (full SHA-256), not
   `token_prefix`, so fresh rows with the same `token_prefix` would
   not collide but would coexist.
2. **AC-2 deferred to follow-up UATRunner workflow.** This workflow
   verified the seed-layer correctness and the bats regression; it
   did NOT re-run the live BP-UAT-013 Step 006 end-to-end because that
   requires a live Docker stack + re-seed migration step. The
   follow-up UATRunner will execute the live re-run and back-fill
   the outcome here.

### Honesty disclosures

- The Orchestrator initially proposed the fix without `display_name`
  plumbing; ImpactAnalyzer flagged the persona-label regression
  during Step 2 (see `02-impact-analysis.md` Items Flagged section),
  and the fix was expanded in scope.
- The original task prompt suggested asserting 409 at
  `GET /v1/onboard/preview`. The actual api code shows `previewInvite`
  does NOT check `authentik_user_id`; only `consumeInvite` does.
  Neg 005 correctly asserts 200 at GET preview + 409 at POST accept.
- The new bats tests are non-vacuous: stash-and-revert proof in
  `07-test-results.md` shows 3/8 fail without the seed fix.
- **AC-2 (live Step 006 re-run) is NOT just deferred — the local
  Docker stack lacks the containers needed to run it.** Verified on
  2026-06-29 via `docker ps -a --format ... | Select-String aiqadam`:
  only `aiqadam-postgres`, `aiqadam-redis`, `aiqadam-directus`,
  `aiqadam-mailpit`, `aiqadam-twenty`, `aiqadam-minio`,
  `aiqadam-authentik-server`, `aiqadam-authentik-worker`,
  `aiqadam-telegram-bot-api` are running. **Missing: `aiqadam-api`,
  `aiqadam-web-next`** (and `aiqadam-e2e` for the Playwright runner).
  Step 006 needs the api on `:3001` and the web-next portal on the
  nginx-upstream port. The follow-up UATRunner workflow must therefore
  start those services before attempting the live re-run — it is not
  a "rerun the spec" task, it is a "spin up api + web-next + run seed +
  then rerun the spec" task. This is a stronger statement than the
  "AC-2 deferred" framing in `06-test-strategy.md`; the strategy
  assumed the stack would be there and only deferred the act of
  running it. Reality: the stack is incomplete. The follow-up
  workflow's first step must be `docker compose up -d api web-next e2e`
  (or the equivalent in this repo's `infrastructure/docker-compose.yml`)
  and a pre-flight curl against `http://localhost:3001/health` and
  the web-next index page before invoking Playwright.

### Workflow artifact paths

- [01-issue-lookup.md](../tasks/active/wf-20260629-fix-039/01-issue-lookup.md)
- [02-impact-analysis.md](../tasks/active/wf-20260629-fix-039/02-impact-analysis.md)
- [03-code-summary.md](../tasks/active/wf-20260629-fix-039/03-code-summary.md)
- [04-security-review.md](../tasks/active/wf-20260629-fix-039/04-security-review.md)
- [06-test-strategy.md](../tasks/active/wf-20260629-fix-039/06-test-strategy.md)
- [06-test-design.md](../tasks/active/wf-20260629-fix-039/06-test-design.md)
- [07-test-results.md](../tasks/active/wf-20260629-fix-039/07-test-results.md)
