---
code: BP-UAT-020
name: "Platform admin bootstrap (no manual scripts)"
status: Draft
process_ref: "docs/02-business-processes/operator-playbook/admin-bootstrap.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
linked_issues: [FR-ADM-010]
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

**Status note:** `FR-ADM-010` is `Proposed`, not yet implemented — this
script is authored against the FR's acceptance criteria per
`business-process-development.md` Step 4, and is **not runnable today**.
It becomes runnable once `FR-ADM-010` ships and is picked up by its own
`requirement-development` workflow, whose Step 13 post-merge UAT
re-verification is what executes this script for the first time.

## Acceptance Criteria

- [ ] AC-1: On a fresh environment with zero `aiqadam-super-admin`
      members, bootstrap creates exactly one admin user in Authentik,
      assigned to `aiqadam-super-admin`, flagged to require a password
      change on next login.
- [ ] AC-2: Running bootstrap again against an environment that already
      has ≥ 1 `aiqadam-super-admin` member is a no-op.
- [ ] AC-3: First sign-in with the seeded credentials forces a
      password-change screen before any other page is reachable.
- [ ] AC-4: After the forced change, the account functions as a normal
      super-admin (verified via reaching `/workspace/admin/countries`,
      the same route manually verified — with screenshots — during the
      investigation that preceded this workflow, workflow ID
      `wf-20260728-bp-147`).
- [ ] AC-5: Seeded email/password values are documented identically in
      `.env.example` and `auth-architecture.md` across environments.

## Seed Fixtures Required

| `id` | Fixture | Description |
|---|---|---|
| `fresh-env` | Zero-super-admin environment state | This script requires a state where NO `aiqadam-super-admin` group member exists — the opposite of the usual `pnpm uat:seed` fixture (`uat-operator@example.com` is pre-bound to `aiqadam-super-admin`). Requires a dedicated fixture path: either a fresh/isolated Authentik realm for this run, or removing all `aiqadam-super-admin` members before Step 001 and restoring after teardown. CodeDeveloper/TestDesigner to confirm the exact isolation mechanism once `FR-ADM-010` is implemented — flagged here as a known gap, not resolved by this draft. |

## Steps

### Step 001 — Bootstrap runs against a zero-admin environment

**AC ref:** AC-1

**Precondition:** Environment has zero `aiqadam-super-admin` members (see
Seed Fixtures note above — this precondition is not satisfiable with
today's standard `pnpm uat:seed` fixtures without modification).

**Action:** Trigger the bootstrap job (mechanism TBD by CodeDeveloper —
likely an API startup hook or an internal endpoint; this step's Action
will be refined once the implementation exists).

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

```typescript
// API-level corroboration — confirms no duplicate user was created,
// not just that the UI shows nothing new.
const usersRes = await driver.page.request.get('<authentik-users-api>?search=admin@aiqadam.org');
// Expect exactly 1 matching user, not 2.
```

**Screenshot label:** `neg-001-bootstrap-idempotent`

---

## Notes

- This script cannot run until `FR-ADM-010` ships. Authored now (Step 4 of
  `business-process-development` workflow `wf-20260728-bp-147`) so it is
  ready-to-run the moment the FR's own `requirement-development` workflow
  reaches its Step 13 post-merge UAT re-verification.
- The "fresh/zero-admin environment" fixture requirement (Seed Fixtures
  section) is a real, unresolved gap — flagged for whoever picks up
  `FR-ADM-010` to resolve as part of TestDesigner's Step 7, not silently
  assumed solvable.
- Step 001's exact trigger mechanism is intentionally vague pending
  implementation — do not treat this as a finished script; treat AC-1
  through AC-5 as the fixed contract and the Steps as the current best
  draft of how to exercise them.
