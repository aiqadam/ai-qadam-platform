# ISS-UAT-013-8 — `operator_invites.email` vs seeded Authentik user email mismatch; `invite_missing_authentik_user` blocks Step 006

| Field | Value |
|---|---|
| ID | ISS-UAT-013-8 |
| Severity | bug (seed-gap, blocks Step 006 only) |
| Module | uat / seed |
| Status | open |
| Reported | 2026-06-28 |
| Reporter | BusinessAnalyst (wf-20260628-uat-030 / 04-uat-triage.md, attempt 2) |
| Workflow | wf-20260628-uat-030 |

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
