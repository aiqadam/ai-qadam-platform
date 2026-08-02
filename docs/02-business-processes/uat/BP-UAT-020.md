---
code: BP-UAT-020
name: "Platform admin bootstrap (no manual scripts)"
status: Implemented
process_ref: "docs/02-business-processes/operator-playbook/admin-bootstrap.md"
environment: "http://localhost:4321"
seed_required: true
last_run: "2026-08-02"
linked_issues: [FR-ADM-010, ISS-UAT-020-1, ISS-ADM-010-1]
external_hops:
  - url: "auth.aiqadam.org (Authentik)"
    justification: "Bootstrap creates the seeded user directly in Authentik; sign-in is the standard OIDC redirect (auth-architecture.md §1), not a platform-hosted form. This is the same declared hop every other auth-touching BP-UAT script uses (see BP-UAT-009)."
    steps: ["002", "Negative 001"]
session_budget:
  max_steps: 40
  max_screenshots: 60
  wall_clock_minutes: 20
teardown_policy:
  action: clean-up
  removes:
    - item: "Seeded bootstrap admin user created in Authentik during this run"
      how: "Delete via Authentik admin API (break-glass credentials) or, once FR-ADM-011 ships, via the role-management screen's revoke action — do not leave a bootstrap admin account behind after a UAT run."
---

# BP-UAT-020 — Platform Admin Bootstrap (No Manual Scripts)

## Purpose

Verifies [FR-ADM-010](../../03-requirements/FR-ADM-010.md): on a fresh
environment with zero `aiqadam-super-admin` members, the platform
automatically seeds a first admin account directly in Authentik and forces
a password change on first login — replacing the manual ADR-0021 §9
console procedure and the ad hoc scripts that motivated this requirement
(see GitHub issue [#107](https://github.com/aiqadam/ai-qadam-platform/issues/107)).

**Status note:** `FR-ADM-010` shipped (PR #110) and this script has run
end-to-end live against `local` (2026-07-29, `wf-20260729-uat-154`) via
`apps/e2e/tests/uat/BP-UAT-020.session.spec.ts`. Result: AC-1/AC-2/AC-4/AC-5
verified `MATCH`; AC-3 (forced password-change screen) verified `MISMATCH`
— filed as [ISS-ADM-010-1](../../../.copilot/issues/ISS-ADM-010-1.md).

## Acceptance Criteria

- [x] AC-1: On a fresh environment with zero `aiqadam-super-admin`
      members, bootstrap creates exactly one admin user in Authentik,
      assigned to `aiqadam-super-admin`, flagged to require a password
      change on next login. **Verified MATCH, 2026-07-29.**
- [x] AC-2: Running bootstrap again against an environment that already
      has ≥ 1 `aiqadam-super-admin` member is a no-op. **Verified MATCH,
      2026-07-29.**
- [x] AC-3: First sign-in with the seeded credentials forces a
      password-change screen before any other page is reachable.
      **Verified MATCH, 2026-08-02 (wf-20260801-fix-191, PR #231)** — flow
      executor returns `ak-stage-prompt` with `password` + `password_repeat`
      fields after submitting valid admin credentials, confirming the
      ExpressionPolicy mechanism is active. See [ISS-ADM-010-1](../../../.copilot/issues/ISS-ADM-010-1.md).
- [x] AC-4: After the forced change, the account functions as a normal
      super-admin (verified via reaching `/workspace/admin/countries`,
      the same route manually verified — with screenshots — during the
      investigation that preceded this workflow, workflow ID
      `wf-20260728-bp-147`). **Verified MATCH, 2026-07-29 — independent
      of AC-3's failure (the bootstrapped account has full access once
      signed in regardless of whether a password-change stage ran).**
- [x] AC-5: Seeded email/password values are documented identically in
      `.env.example` and `auth-architecture.md` across environments.
      **Verified MATCH, 2026-07-29.**

## Seed Fixtures Required

| `id` | Fixture | Description |
|---|---|---|
| `fresh-env` | Zero-super-admin environment state (snapshot-remove-restore) | This script requires a state where NO `aiqadam-super-admin` group member exists — the opposite of the usual `pnpm uat:seed` fixture (`uat-operator@example.com` is pre-bound to `aiqadam-super-admin`). Isolation mechanism (ISS-UAT-020-1): `scripts/uat-bp-uat-020-fixture.sh setup` snapshots the group's exact current member pks to a local, gitignored file, PATCHes the group to zero members, and bounces the local `api` dev process so `AdminBootstrapService.onModuleInit()` (`apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`) re-runs against a genuinely empty group. `AdminBootstrapService` only checks `aiqadam-super-admin` membership once, at process boot — never on a live request — so the zero-admin window this opens only has to span one restart, not the whole UAT session. `scripts/uat-bp-uat-020-fixture.sh teardown` (run in the Teardown section below, after all Steps and Negative Scenarios) restores the EXACT snapshotted membership and re-verifies it against live Authentik before deleting the snapshot file — so `uat-operator@example.com`'s standard super-admin binding (and any other engineer's local state) is unaffected once this run finishes. Manifest: `scripts/uat-fixtures/BP-UAT-020.json`. Refuses to run against a non-localhost Authentik target (same guard as `scripts/uat-seed.sh --reset`). |

## Steps

### Step 000 — Establish the zero-admin fixture

**AC ref:** (fixture precondition for AC-1, not itself a numbered AC)

**Precondition:** Standard `pnpm uat:seed` fixtures applied (includes
`uat-operator@example.com` bound to `aiqadam-super-admin`).

**Action:** Run `bash scripts/uat-bp-uat-020-fixture.sh setup`. This
snapshots the live `aiqadam-super-admin` membership, empties the group,
and restarts the local `api` process so the environment boots with zero
super-admins. Confirm the script's own output reports `setup complete`
before proceeding — do not proceed to Step 001 on a non-zero exit.

**Expected UI state:** N/A (backend/infra action, no browser session yet).

**Screenshot label:** N/A — infra step, no screenshot.

---

### Step 001 — Bootstrap runs against a zero-admin environment

**AC ref:** AC-1

**Precondition:** Step 000 completed — environment has zero
`aiqadam-super-admin` members (verified by Step 000's own script, not
re-asserted here).

**Action:** With the API already restarted by Step 000 (bootstrap runs at
`OnModuleInit`, i.e. it has already fired by the time Step 000 reports
`setup complete`), confirm via the Authentik admin API that exactly one
user now exists with email matching `ADMIN_BOOTSTRAP_EMAIL`
(`apps/api/.env.example`, default `admin@aiqadam.org`), assigned to
`aiqadam-super-admin`, with the `ak_login_password_change_required`
attribute set to `true`.

**Expected UI state:** N/A (backend action) — verified via Step 002's
sign-in, not a UI assertion at this step.

**Screenshot label:** `step-001-bootstrap-triggered`

---

### Step 002 — First sign-in forces password change

**AC ref:** AC-3

**Precondition:** Step 001 completed; seeded admin credentials known
(documented per AC-5).

**Action:** Navigate to `/auth/sign-in`, sign in with the seeded email +
default password via the standard Authentik OIDC redirect (declared
external hop above).

**Expected UI state:** Authentik's password-change screen is shown before
any redirect back to the platform completes. The specific heading/prompt
text is Authentik's own UI (not ours to specify exactly) — assert on the
presence of a password + confirm-password field and the absence of a
successful redirect back to `/workspace` until the change is submitted.

**Screenshot label:** `step-002-forced-password-change`

---

### Step 003 — Bootstrapped account reaches admin screens

**AC ref:** AC-4

**Precondition:** Step 002's password change completed.

**Action:** Navigate to `/workspace/admin/countries`.

**Expected UI state:** Countries table renders (same assertion as the
manual investigation performed 2026-07-28 for issue #107 — see
`00a-investigation-issue-107.md`), confirming the bootstrapped account has
full super-admin access with no special-casing.

**Screenshot label:** `step-003-admin-countries-reachable`

---

## Negative Scenarios

### Negative 001 — Bootstrap is a no-op on a non-empty environment

**AC ref:** AC-2

**Precondition:** At least one `aiqadam-super-admin` member already exists
(e.g. re-run bootstrap after Step 001 already succeeded once).

**Action:** Trigger the bootstrap job again.

**Expected rejection:** No new user created in Authentik; existing
super-admin's password/group membership unchanged.

Corroborated via a direct `fetch()` to the Authentik admin API (not
`driver.page.request`, since this check does not need the session's
browser-cookie context — a plain authenticated API call is simpler and
was what the actual `BP-UAT-020.session.spec.ts` implementation uses):

```typescript
const res = await fetch(`${AK_URL}/api/v3/core/users/?search=${encodeURIComponent(ADMIN_EMAIL)}`, {
  headers: { Authorization: `Bearer ${authentikAdminToken}` },
});
// Expect exactly 1 matching user, not 2.
```

**Screenshot label:** `neg-001-bootstrap-idempotent` (in practice, reuses
Step 003's screenshot as the session anchor — this scenario is an
API-level check with nothing new to visually capture).

---

### Negative 002 — Seeded credentials are documented identically across environments

**AC ref:** AC-5

**Precondition:** None (static documentation check, does not depend on
Step 001-003 or Negative 001's live state).

**Action:** This is a **repo-file check, not a browser/`driver.page`
action** — `UATSessionDriver` has no filesystem-read primitive
(confirmed against `apps/e2e/support/uat-session-driver.ts`), unlike
every other step/scenario in this script. The agent running the session
reads `apps/api/.env.example` and `docs/04-development/architecture/
auth-architecture.md`'s "Platform admin bootstrap" section (§9.5 at time
of writing) directly (not through the browser session) and compares them.

**Expected rejection (i.e. the check that must pass):** `ADMIN_BOOTSTRAP_EMAIL`
has the identical variable name and identical documented default
(`admin@aiqadam.org`) in both files. `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD`
has the identical variable name in both files, and `auth-architecture.md`
explicitly states it is a secret with no repo-committed default (matching
`.env.example`'s blank `=`). A drift in either variable's name, or a
default value present in one file but not the other, is a fail — file an
`ISS-<n>` documentation issue rather than silently noting it.

**Screenshot label:** N/A — documentation-diff check, no UI involved; record
the pass/fail verdict in the session's own step log instead.

---

## Teardown

Run immediately after Negative 002, before the session's own
`teardown_policy` write-up (frontmatter):

```bash
bash scripts/uat-bp-uat-020-fixture.sh teardown
```

This restores `aiqadam-super-admin`'s exact pre-Step-000 membership
(verified against live Authentik, not assumed from the PATCH call's
status code alone), restarts the local `api` process again, and deletes
the snapshot file. If this step fails, the snapshot file is deliberately
**not** deleted — it is the durable record of what still needs manual
restoration; do not delete it by hand without independently confirming
`aiqadam-super-admin`'s live membership matches what it recorded.

The `teardown_policy.removes` entry above ("Seeded bootstrap admin user
created in Authentik during this run") is a separate cleanup action from
this group-membership restore — both are required. Order: delete the
seeded bootstrap admin user first (per `teardown_policy`), then run
`scripts/uat-bp-uat-020-fixture.sh teardown` to restore the original
membership snapshot — reversing the order would restore a membership list
that still (harmlessly, since the seeded user's pk is not in the
snapshot) omits the just-created user, so the seeded user must be deleted
on its own via the Authentik admin API or the role-management screen
regardless of ordering; doing the deletion first just keeps the two
cleanup actions in the same order as they were created (admin user, then
group emptied).

## Notes

- **Fixture-isolation mechanism resolved (ISS-UAT-020-1):** the Seed
  Fixtures table's prior "open design question" (isolated Authentik realm
  vs. destructive remove-and-restore) is resolved as snapshot-remove-restore,
  implemented in `scripts/uat-bp-uat-020-fixture.sh`. This was safe to
  choose over a dedicated Authentik realm because `AdminBootstrapService`
  checks `aiqadam-super-admin` membership only once, at process boot — the
  zero-admin window only needs to span one local `api` restart, not the
  whole UAT session, and the restore is snapshot-exact + automatically
  verified (not a "restore approximately" step).
- Step 001's exact trigger mechanism (Authentik admin-API confirmation
  post-restart, per Step 001 above) reflects the shipped
  `AdminBootstrapService` implementation
  (`apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`), not
  the pre-implementation placeholder this script originally shipped with.
- **First live run, 2026-07-29 (`wf-20260729-uat-154`):** evidence at
  `apps/e2e/uat-results/BP-UAT-020/wf-20260729-uat-154/` (session log,
  3 screenshots, teardown record). Driver script:
  `apps/e2e/tests/uat/BP-UAT-020.session.spec.ts`. AC-1/AC-2/AC-4/AC-5
  MATCH; AC-3 MISMATCH (see [ISS-ADM-010-1](../../../.copilot/issues/ISS-ADM-010-1.md)).
