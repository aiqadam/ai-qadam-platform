---
code: BP-UAT-019
name: "Operator approvals queue"
status: Ready
process_ref: "docs/02-business-processes/operations/operator-approvals-queue.md"
environment: "http://localhost:4321"
seed_required: false
last_run: ""
---

# BP-UAT-019 — Operator Approvals Queue

## Purpose

Verifies the operator approvals cabinet (`/workspace/approvals`) as it exists
today: an **empty-shell v1** (F-S3.7 cabinet #4). Per
[operator-approvals-queue.md](../operations/operator-approvals-queue.md), all
three aggregation sources — sponsor onboarding, speaker proposal, and
operator-assisted interaction — are `ready: false` in
`apps/api/src/modules/workspace/approvals.service.ts`. There is no live
pending-registration review, no approve/reject action, and no member-flagging
concept anywhere in the codebase yet (verified by reading
`approvals.service.ts`, `ApprovalsQueue.tsx` / `ApprovalsList.tsx`, and a
repo-wide search for "flag" — no such feature exists).

This script therefore covers what is actually shippable today: the cabinet's
auth gating and its empty-state/roadmap presentation. It supersedes the
shallow `smoke-workspace-approvals.spec.ts` (status codes only) by also
asserting the visible empty-state copy and the per-source roadmap list. The
approve/reject/flag steps originally envisioned by
[ISS-UAT-COV-002](../../../.copilot/issues/ISS-UAT-COV-002.md) are captured
below as **Deferred** — they cannot be authored against code that does not
exist, and doing so would document a fictional contract. See `## Notes` for
what unblocks each deferred step.

## Acceptance Criteria

- [ ] AC-1: An authenticated operator visiting `/workspace/approvals` sees the cabinet render with HTTP 200 (no crash), with all sources listed as not-yet-ready.
- [ ] AC-2: The queue shows an empty-state message (zero items) rather than an error state, matching `ApprovalsService.list()` returning `{ items: [], sources: [...] }`.
- [ ] AC-3: The roadmap/footer area lists all three known sources (sponsor onboarding, speaker proposal, operator-assisted interaction) with their `ready: false` note text, so an operator understands what is coming.
- [ ] AC-4: An anonymous (unauthenticated) visitor is redirected away from `/workspace/approvals` toward Authentik sign-in.
- [ ] AC-5: `GET /v1/workspace/approvals` rejects unauthenticated requests with HTTP 401.

## Seed Fixtures Required

No seed data is required — v1 has no queryable pending-item rows regardless
of seed state (all sources are `ready: false`, so every source's loader
returns `[]` unconditionally). Only an authenticated operator session is
needed for Steps 001–003.

| `id` | Fixture | Description |
|---|---|---|
| `test-operator` | Operator account | Operator account (`uat-operator@example.com`, password from `.env.test`) — used to reach the authenticated cabinet view. |

## Steps

### Step 001 — Operator loads the approvals cabinet

**AC ref:** AC-1, AC-2

**Precondition:** Signed in as `test-operator`.

**Action:** Navigate to `/workspace/approvals`.

**Expected UI state:** HTTP 200. Page renders the approvals cabinet layout with no error boundary. Zero items are shown; an empty-state message is visible (not a loading spinner stuck, not an error panel).

**Screenshot label:** `step-001-empty-state`

---

### Step 002 — Roadmap footer lists all pending sources

**AC ref:** AC-3

**Precondition:** Step 001 completed.

**Action:** Read the roadmap/footer section of the cabinet.

**Expected UI state:** All three sources appear — sponsor onboarding, speaker proposal, operator-assisted interaction — each shown as not-yet-ready, with the note text sourced from `approvals.service.ts`'s `SOURCES` registry (e.g. "Lands with F-S3.5 sponsor cabinet…").

**Screenshot label:** `step-002-roadmap-footer`

---

### Step 003 — API contract matches the UI

**AC ref:** AC-1, AC-2, AC-3

**Precondition:** Step 001 completed.

**Action:** With the operator's session, call `GET /v1/workspace/approvals` directly.

**Expected UI state:** HTTP 200. Response body is `{ items: [], sources: [ { kind, ready: false, note }, ... ] }` for all three known `kind` values. This is the API-level disambiguation for Steps 001–002 — the UI alone cannot prove the empty state is the correct empty state rather than a silently-swallowed error.

**Screenshot label:** `step-003-api-contract`

---

## Negative Scenarios

### Negative 001 — Anonymous visitor redirected from the cabinet

**AC ref:** AC-4

**Precondition:** No active session (signed out / fresh browser context).

**Action:** Navigate to `/workspace/approvals`.

**Expected rejection:** Redirects toward Authentik sign-in (`auth.aiqadam.org` or `/api/v1/auth/login`) within 10s. Does not remain on `/workspace/approvals`.

```typescript
// API-level disambiguation — confirms the redirect is the auth gate,
// not a coincidental client-side navigation bug. Do NOT remove.
const apiRes = await page.request.get('/api/v1/workspace/approvals');
expect(apiRes.status(), 'unauthenticated API call must be rejected, not silently empty').toBe(401);
```

**Screenshot label:** `neg-001-anon-redirect`

---

### Negative 002 — Unauthenticated API call rejected

**AC ref:** AC-5

**Precondition:** No `Authorization` / session cookie sent.

**Action:** `GET /v1/workspace/approvals` directly (no browser navigation).

**Expected rejection:** HTTP 401. Response body does not leak `{ items: [], sources: [...] }` to an unauthenticated caller.

**Screenshot label:** `neg-002-api-401`

---

## Deferred Steps (not authorable against current code)

These map to the original issue's proposed scope ("reviewing pending
registrations, approving/rejecting, flagging a member") but cannot be written
as real Playwright steps today because the underlying functionality does not
exist:

- **Review pending registrations / approve / reject** — blocked on any one
  source flipping `ready: true` with a real loader (F-S3.5 sponsor
  onboarding is the nearest candidate per the runbook's source table). Once
  a source is wired, add Steps 004+ here exercising: an item appears in the
  queue, clicking through opens the resource's own cabinet (per "Approve
  action" in the runbook — v1 has no in-cabinet approve button by design),
  and the per-resource approve/reject flow updates the source record.
- **Flagging a member + surfacing the flagged state elsewhere** (cohort
  builder, member profile) — no `flag` concept exists in
  `apps/api/src/modules/workspace/` or the member data model today (verified
  by repo-wide search). This is not part of the approvals cabinet's current
  design at all; it would need its own FR before a UAT step can reference
  it. Do not author this step speculatively — file a new FR/issue once a
  flagging mechanism is designed.

Re-run `node scripts/gen-bp-uat-coverage.mjs --write` once a Playwright spec
exists at `apps/e2e/tests/uat/BP-UAT-019.spec.ts` so the registry's Spec
column links it automatically.

## Notes

- This script intentionally does **not** claim approve/reject/flag coverage.
  Claiming it would fail the honesty bar in `AGENTS.md §9` — the referenced
  UI and API surfaces do not exist on `main` as of 2026-07-05.
- `smoke-workspace-approvals.spec.ts` already covers the auth-gate contract
  (Negative 001/002 above) at a shallower level (status codes only, no UI
  empty-state or roadmap assertion). BP-UAT-019 supersedes it as the source
  of truth for this cabinet; the smoke test can remain as a fast regression
  check.
- When a source ships, split this file rather than growing it unboundedly:
  keep BP-UAT-019 as the "cabinet shell + auth" script, and consider a new
  BP-UAT code for "sponsor onboarding approval flow" if it grows past a
  handful of steps (matches the one-script-per-process-outcome convention
  used elsewhere in this registry).
