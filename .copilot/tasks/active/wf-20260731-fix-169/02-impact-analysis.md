# Step 2 — Impact Analysis

**Scope:** doc + E2E test files only. No `apps/api`, `apps/web-next`, or
Directus schema/flow changes. No DB migration. No production code touched.

## Files to change

1. `docs/02-business-processes/uat/BP-UAT-010.md` — rewrite AC-1, AC-6, AC-7
   wording; rewrite the affected Steps (003, 004, 006) and Negative-003 to
   match the real values/endpoints/UI copy; update `process_ref` note if
   needed.
2. `apps/e2e/tests/uat/BP-UAT-010.spec.ts` — this file targets `apps/web`
   (V1) with nonexistent endpoints. `apps/web-next` (V2) is the real,
   current registration surface (confirmed live-tested repeatedly across
   `wf-20260730-uat-158` through `wf-20260731-uat-166`) and already has a
   working live session-driven spec (`BP-UAT-010.session.spec.ts`). Per
   AC-4 of the issue, this file needs rewriting to target the real surface.
3. `.copilot/issues/ISS-UAT-010-1.md` — Step 9 status flip + Resolution.
4. `.copilot/issues/registry.md` — Step 9 status flip.

## Product decision required by the issue's own AC-3 (deciding now, not escalating)

The issue explicitly flags that AC-7 needs a decision: redefine the AC
around the real check-in mechanism, or treat "+5 on registration" as a
missing feature requiring a new FR. Deciding: **redefine AC-7 around
check-in (+10 points via `reg-checkin-points`)**, not escalate. Reasoning:

- There is no evidence anywhere (FR docs, ADRs, code comments, this GitHub
  issue, or any other open issue) that "+5 points at registration time" is
  an intended, not-yet-built product feature. The one place that number
  appears is `FR-REG-001.md`, itself already documented (by this same
  issue's Root Cause section) as a superseded Phase-1/V1 spec.
  `registrations.controller.ts:27-29` has an explicit comment: "Directus
  flows own capacity/waitlist/points" — i.e. the current architecture's
  deliberate design is that points are a check-in-time concern, not a
  registration-time one.
  `flows-bootstrap.sh:46-51`'s ADR-0033 CRM-removal note corroborates this
  was a deliberate architecture migration, not an oversight.
- `scripts/uat-fixtures/BP-UAT-010.json` (already merged, `wf-20260730-fix-157`)
  was deliberately built around a check-in-sourced `point_awards` baseline
  row for exactly this reason — the seed-fixture author already made this
  same call for the seed data; leaving the doc still saying "+5 on
  registration" makes the doc and its own seed fixture permanently
  inconsistent with each other regardless of what this workflow does.
- Reversibility test (AGENTS.md §16): if this call is wrong, the cost of
  reversing it is editing one AC line back — no data loss, no shipped
  behavior change (product code is untouched either way). This is
  squarely a "decide and proceed, disclose" case, not a "stop and ask"
  case.

If the user disagrees after reading this, reopening is a doc-only revert —
noted in the PR description under Risks per the escalation-alternative
path.

## Risk / blast radius

None on running systems — no product code, no migration, no CI config,
no Directus schema. Risk is entirely "did we describe the real system
accurately," mitigated by the direct source verification in Step 1 (every
claim re-checked against current `main` HEAD, not just trusted from the
2026-07-30 issue filing).

## Gate Result

gate_result:
  status: passed
  summary: "Doc/spec-only change; scope and the AC-3 product decision (redefine around check-in) are both settled with cited evidence."
  findings: []
