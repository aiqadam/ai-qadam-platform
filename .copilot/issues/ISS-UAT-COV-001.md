# ISS-UAT-COV-001 — 18 of 19 BP-UAT scripts have no Playwright spec and have never been run

| Field | Value |
|---|---|
| ID | ISS-UAT-COV-001 |
| Severity | enhancement |
| Module | uat/coverage |
| Status | resolved |
| Reported | 2026-07-02 |
| Resolved | 2026-07-03 |
| Resolver | Orchestrator (autonomous, per AGENTS.md §6.2) |
| Reporter | BusinessAnalyst (UAT coverage audit) |

## Symptom

Of the 19 scripts in `docs/02-business-processes/uat/registry.md` (BP-UAT-000 through
BP-UAT-018), only **BP-UAT-013** has a corresponding Playwright spec
(`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`) and has ever been executed. The
remaining 18 — including registration (BP-UAT-010), QR check-in (BP-UAT-011), points
and leaderboard (BP-UAT-012), auth (BP-UAT-009), waitlist (BP-UAT-014), cancellation
(BP-UAT-015), and every cron/operator script — are narrative scripts only, never run
by the `uat-verification` agentic workflow. This was last confirmed in
`wf-20260630-uat-042/05-all-scripts-summary.md` (2026-06-30) and remains true.

Separately, an independent Playwright `smoke-*.spec.ts` suite (35 files, CI-wired via
`.github/workflows/smoke.yml`, runs on every PR + every 30 min against production)
covers many of the same surfaces but at contract depth only (status codes, redirects,
auth gates) — not full business-process depth, and not cross-referenced to any BP-UAT
code. There is currently no single place that shows, per business process, whether it
has (a) no test, (b) a shallow smoke test, or (c) a deep UAT walkthrough.

## Impact

Cross-referencing against `docs/03-requirements/requirements-registry.md` shows 85
requirements marked **Shipped** in production. Most have no BP-UAT script and, for the
18 unexecuted scripts, no confirmation the documented business process still matches
the shipped implementation.

## Proposed resolution

Not a single fix — this is a backlog. Recommend triaging in priority order (highest
first):

1. BP-UAT-009 (auth) — prerequisite for all member-facing scripts per registry's own
   execution-order note
2. BP-UAT-010 (registration), BP-UAT-011 (QR check-in), BP-UAT-012 (points/leaderboard)
   — core member value loop
3. BP-UAT-014 (waitlist), BP-UAT-015 (cancellation)
4. Operator scripts (002, 004, 005) and cron scripts (001, 006, 007, 008, 016, 017, 018)

Each script needs: BusinessAnalyst validation → TestDesigner spec authorship → seed
extension (events/registrations/QR/check-in data, per the 2026-06-30 summary's noted
blockers) → UATRunner execution.

## Acceptance criteria

- [x] A decision-batch or sprint entry sequences the 18 scripts into scoped `uat-verification` workflows — **resolved by** `.copilot/tasks/queued/uat-bp-uat-coverage-batch/handoff.yaml` (17 sequenced workflow IDs, positions 2–17 + BP-UAT-010 pilot position 1 already in this PR)
- [x] Registry updated as each script moves from never-run to a real `Last Run` / `Run Status` — **partial**. The PR adds an auto-regenerated `Spec` column and a `Smoke Overlap` column to `docs/02-business-processes/uat/registry.md` via `scripts/gen-bp-uat-coverage.mjs`. Subsequent workflow runs will move rows from `—` (spec) to a real spec link and then to a real `Last Run` value.
- [x] Relationship between `smoke-*.spec.ts` and BP-UAT scripts documented (either merged coverage map or explicit statement of what each layer guarantees) — **resolved by** the `Smoke Overlap` column + legend in `registry.md`. The legend explicitly states the heuristic nature of the overlap map.

## Resolution

Closed in `wf-20260703-fix-067-coverage-registry` (this PR). Authoring + tooling:

1. **`scripts/gen-bp-uat-coverage.mjs`** — pure Node generator that scans `apps/e2e/tests/{uat,}/` and rewrites the new `Spec` and `Smoke Overlap` columns of `registry.md` in place. Idempotent (verified by `Compare-Object` after two `--write` runs = 0 diff).
2. **`docs/02-business-processes/uat/registry.md`** — now has 9 columns including the two new auto-generated columns. Legend documents both columns and how to keep them in sync (`node scripts/gen-bp-uat-coverage.mjs --write`).
3. **`apps/e2e/tests/uat/BP-UAT-010.spec.ts`** — pilot spec for BP-UAT-010 (event registration flow). Authored in this PR; live execution is the responsibility of the queued follow-up workflow.
4. **`.copilot/tasks/queued/uat-bp-uat-coverage-batch/handoff.yaml`** — 17 follow-up workflow placeholders, each owning one BP-UAT spec + run cycle.

### Honesty disclosures (per AGENTS.md §6.1)

- **AC #1 (decision-batch)** — *fully verified*: 17 follow-up workflow IDs are queued in `.copilot/tasks/queued/uat-bp-uat-coverage-batch/`. They will be picked up by subsequent autonomous workflows.
- **AC #2 (registry updates as scripts run)** — *partial*. The mechanism (Spec/Smoke Overlap columns) is live and auto-maintained. The follow-up workflows will populate the per-row `Last Run` and `Run Status` columns as each spec runs. This PR does NOT itself populate `Last Run` for any new script because the live Docker stack is out of scope for this workflow.
- **AC #3 (smoke ↔ BP-UAT relationship documented)** — *fully verified*: the new `Smoke Overlap` column is exactly the cross-reference the AC requested. The legend explicitly distinguishes the heuristic nature from a coverage guarantee.
- **BP-UAT-010 spec live execution** — *deferred with queue ref*: `wf-20260703-uat-068-pilot-bp-uat-010` (position 1 of `uat-bp-uat-coverage-batch/`) will:
  1. run `docker compose up -d` to bring the stack up,
  2. run `pnpm uat:seed`,
  3. run `pnpm playwright test --config=playwright.uat.config.ts uat/BP-UAT-010.spec.ts`,
  4. record Pass/Fail in `Run Status` column via the existing `uat-verification` agent loop.
- The current PR flips `Status: open → resolved` because the gap is now *sequenced, visible, and queued*. The gap is NOT closed in the sense of "all 19 scripts have passing specs" — that is the cumulative result of the queued batch. If the queue is abandoned, this issue flips back to `open`.
