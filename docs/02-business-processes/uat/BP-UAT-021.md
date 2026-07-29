---
code: BP-UAT-021
name: "Admin user and role management screen"
status: Draft
process_ref: "docs/02-business-processes/operator-playbook/admin-user-management.md"
environment: "http://localhost:4322"
seed_required: true
last_run: ""
linked_issues: [FR-ADM-011, ISS-WEB-NEXT-SSR-JSDOM-001]
external_hops: []
session_budget:
  max_steps: 40
  max_screenshots: 60
  wall_clock_minutes: 20
teardown_policy:
  action: clean-up
  removes:
    - item: "Any role grant/revoke made to the target test user during this run"
      how: "Revert the target user's role via the same role-management screen (or, if unavailable, via scripts/uat-seed.sh --reset once a manifest exists for this BP-UAT) so the fixture returns to its declared initial state."
---

# BP-UAT-021 — Admin User and Role Management Screen

## Purpose

Verifies [FR-ADM-011](../../03-requirements/FR-ADM-011.md): super-admins
can view and change any user's role through
`/workspace/admin/users`, with every change followed by a live re-read of
the actually-applied Authentik state, and the ADR-0021 ≤3-super-admin cap
enforced as a hard block. This directly targets the silent-failure mode
(a role-grant script that appeared to succeed but didn't) that motivated
GitHub issue [#107](https://github.com/aiqadam/ai-qadam-platform/issues/107).

**Status note:** `FR-ADM-011` is `Proposed`, not yet implemented — this
script is authored against the FR's acceptance criteria per
`business-process-development.md` Step 4, and is **not runnable today**.
Becomes runnable once `FR-ADM-011` ships; its own `requirement-development`
workflow's Step 13 executes this script for the first time.

## Acceptance Criteria

- [ ] AC-1: A super-admin can search for an existing user and see their
      role(s) in plain language.
- [ ] AC-2: Granting a role updates Authentik and the screen displays the
      actually-re-read post-change state.
- [ ] AC-3: Granting `super_admin` when 3 already exist is blocked with a
      message citing the ADR-0021 cap.
- [ ] AC-4: Revoking a role updates Authentik, reflected the same way as AC-2.
- [ ] AC-5: Every grant/revoke produces an audit log entry.
- [ ] AC-6: A non-super-admin cannot access this screen or its API.

## Seed Fixtures Required

| `id` | Fixture | Description |
|---|---|---|
| `test-operator` | Super-admin acting account | `uat-operator@example.com`, bound to `aiqadam-super-admin` (standard `pnpm uat:seed` fixture). |
| `test-member` | Target user for role changes | `uat-member@example.com`, standard `aiqadam-member` fixture — used as the target of grant/revoke steps. |
| `three-super-admins` | Cap-test fixture | For AC-3 (Negative 001 below): an environment state with exactly 3 existing `aiqadam-super-admin` members before the test attempts a 4th grant. Not covered by the standard seed (which has 1 super-admin, `uat-operator`) — needs either 2 additional throwaway super-admin fixtures or a mocked count at the API layer. Flagged as an open fixture-design question for TestDesigner, same class of gap as BP-UAT-020's zero-admin fixture. |

## Steps

### Step 001 — Super-admin loads the user management screen

**AC ref:** AC-1

**Precondition:** Signed in as `test-operator`.

**Action:** Navigate to `/workspace/admin/users`, switch to the "Manage
users" view (exact IA TBD by CodeDeveloper — see FR-ADM-011 functional
scope item 1).

**Expected UI state:** HTTP 200. User search/list is visible.

**Screenshot label:** `step-001-user-management-loaded`

---

### Step 002 — Search reveals the target user's current role in plain language

**AC ref:** AC-1

**Precondition:** Step 001 completed.

**Action:** Search for `test-member`'s email.

**Expected UI state:** `test-member`'s row/detail shows a plain-language
role label (e.g. "Member" — not `aiqadam-member`).

**Screenshot label:** `step-002-plain-language-role`

---

### Step 003 — Grant a role and see the live-verified confirmation

**AC ref:** AC-2

**Precondition:** Step 002 completed.

**Action:** Grant `test-member` the "Organizer" role for `uz` via the form
controls, submit.

**Expected UI state:** Confirmation shows the actually-re-read state (not
an optimistic toast) — the screen must reflect a fresh read of
`test-member`'s Authentik groups, now including `aiqadam-organizer-uz`.

```typescript
// API-level corroboration — the UI confirmation alone cannot prove the
// state shown is freshly re-read vs. optimistically assumed. Confirm the
// API response for this action includes the re-read group list, not just
// a 200 ack.
const apiRes = await driver.page.request.patch('/v1/admin/users/<test-member-id>/roles', { data: { grant: 'organizer', country: 'uz' } });
expect(apiRes.status()).toBe(200);
const body = await apiRes.json();
// body must include the actually-applied groups, not just {ok:true}
```

**Screenshot label:** `step-003-grant-verified`

---

### Step 004 — Audit log records the change

**AC ref:** AC-5

**Precondition:** Step 003 completed.

**Action:** Navigate to `/workspace/admin/audit`.

**Expected UI state:** A new audit entry shows requester (`test-operator`),
target (`test-member`), role (`organizer`, `uz`), and before/after state.

**Screenshot label:** `step-004-audit-entry`

---

### Step 005 — Revoke the role, confirm live-verified state

**AC ref:** AC-4

**Precondition:** Step 003 completed (role granted).

**Action:** Revoke the `organizer`/`uz` role from `test-member`.

**Expected UI state:** Same live-re-read confirmation pattern as Step 003,
now showing the role removed.

**Screenshot label:** `step-005-revoke-verified`

---

## Negative Scenarios

### Negative 001 — Super-admin cap blocks the 4th grant

**AC ref:** AC-3

**Precondition:** `three-super-admins` fixture — exactly 3
`aiqadam-super-admin` members exist.

**Action:** Attempt to grant `super_admin` to a 4th user.

**Expected rejection:** Grant is blocked; UI shows a message citing the
ADR-0021 ≤3 cap. No group membership change occurs.

```typescript
// API-level corroboration — confirms the block happened server-side,
// not just that the UI hid the button.
const apiRes = await driver.page.request.patch('/v1/admin/users/<target-id>/roles', { data: { grant: 'super_admin' } });
expect(apiRes.status(), 'cap-exceeding grant must be rejected server-side').not.toBe(200);
```

**Screenshot label:** `neg-001-cap-blocked`

---

### Negative 002 — Non-super-admin cannot access the screen

**AC ref:** AC-6

**Precondition:** Signed in as `test-member` (no operator-family group).

**Action:** Navigate to `/workspace/admin/users`.

**Expected rejection:** Redirected away / 403, consistent with the
existing `FR-ADM-005` guard pattern.

```typescript
const apiRes = await driver.page.request.get('/v1/admin/users/<any-id>/roles');
expect(apiRes.status()).toBe(403);
```

**Screenshot label:** `neg-002-non-admin-blocked`

---

## Notes

- **2026-07-29 (`wf-20260729-feat-150` Step 13):** `FR-ADM-011` shipped
  (PR #113), and this screen lives on `apps/web-next` (the
  nginx-production-routed app), **not** `apps/web` (legacy) — corrected
  `environment` from `:4321` to `:4322` accordingly; both apps happen to
  have a route at the same path, but only web-next's carries this FR's
  new "Manage users" tab. Live execution was attempted at Step 13 but
  blocked before any browser session could start: `apps/web-next`'s
  entire `/workspace/*` SSR surface currently 500s in local dev due to a
  pre-existing `jsdom`/`undici` dependency incompatibility (see
  [`ISS-WEB-NEXT-SSR-JSDOM-001`](../../../.copilot/issues/ISS-WEB-NEXT-SSR-JSDOM-001.md)),
  confirmed unrelated to FR-ADM-011's own diff. This blocks not just
  this script but every `/workspace/*` BP-UAT until the environment
  issue is fixed. No follow-up workflow queued yet for the fix itself.
- This script cannot run until `FR-ADM-011` ships. Authored now (Step 4 of
  `business-process-development` workflow `wf-20260728-bp-147`) so it is
  ready-to-run the moment the FR's own `requirement-development` workflow
  reaches Step 13.
- The `three-super-admins` fixture (Negative 001) is a real, unresolved
  gap flagged for TestDesigner, same as BP-UAT-020's zero-admin fixture —
  do not assume it's trivially solvable with the standard seed script
  without modification.
- Steps 001's exact IA (tab vs. separate route) is deliberately
  unspecified pending CodeDeveloper's implementation choice within
  `docs/04-development/design-system/` constraints.
