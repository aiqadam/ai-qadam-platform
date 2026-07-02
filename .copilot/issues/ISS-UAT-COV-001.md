# ISS-UAT-COV-001 — 18 of 19 BP-UAT scripts have no Playwright spec and have never been run

| Field | Value |
|---|---|
| ID | ISS-UAT-COV-001 |
| Severity | enhancement |
| Module | uat/coverage |
| Status | open |
| Reported | 2026-07-02 |
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

- [ ] A decision-batch or sprint entry sequences the 18 scripts into scoped `uat-verification` workflows
- [ ] Registry updated as each script moves from never-run to a real `Last Run` / `Run Status`
- [ ] Relationship between `smoke-*.spec.ts` and BP-UAT scripts documented (either merged coverage map or explicit statement of what each layer guarantees)
