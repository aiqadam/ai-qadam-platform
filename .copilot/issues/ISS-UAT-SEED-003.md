# ISS-UAT-SEED-003 — BP-UAT-010's event/points fixtures are not seeded anywhere

| Field | Value |
|---|---|
| ID | ISS-UAT-SEED-003 |
| Severity | blocker (for BP-UAT-010 execution specifically) |
| Module | uat/seed |
| Status | open |
| Reported | 2026-07-30 |
| Reporter | BusinessAnalyst (`wf-20260730-uat-156`, Step 1 script validation for the post-merge UAT re-verification of `FR-EVT-004`) |
| Related | BP-UAT-010, FR-EVT-004 (unaffected — see Impact) |
| Business-Process | BP-UAT-010 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/152 |

## Symptom

`docs/02-business-processes/uat/BP-UAT-010.md`'s "Seed Fixtures Required"
table names four fixtures: `uat-member` (`uat-member@aiqadam.test`),
`uat-event-open-uz`, `uat-event-full-uz`, and
`uat-member-points-baseline`. None of these are actually produced by any
seed mechanism in this repo:

- `scripts/uat-seed.sh`'s own header comment states it seeds only:
  Directus collections/RBAC bootstrap, two Authentik users
  (`uat-member@example.com`, `uat-operator@example.com` — note the email
  domain does not match BP-UAT-010's `@aiqadam.test` either), and
  `operator_invites` rows for BP-UAT-013. No `events` fixtures of any kind.
- No `scripts/uat-fixtures/BP-UAT-010.json` manifest exists (only
  `BP-UAT-001.json`, `BP-UAT-013.json`, `BP-UAT-020.json` do), so
  `pnpm uat:seed --reset BP-UAT-010` has nothing declared to reset either.

This means BP-UAT-010 cannot be executed end-to-end against a freshly
seeded local stack today — Steps 002+ (sign-in, register for
`uat-event-open-uz`, waitlist via `uat-event-full-uz`, points delta
against `uat-member-points-baseline`) have no fixture data to act on.

## Impact

- **Blocks live UAT execution of BP-UAT-010** — the business process this
  script documents (event registration flow) cannot currently be
  re-verified via an agent-driven browser session without first manually
  creating ad hoc data, which defeats the purpose of a repeatable,
  scripted UAT fixture.
- **Does NOT indicate any regression in `FR-EVT-004`** — this gap
  pre-dates that workflow and is orthogonal to it. `FR-EVT-004` only
  touched `apps/web-next`'s `/events/[id]` page; the registration
  flow's own backend logic, and BP-UAT-010's seed data requirements, were
  never in scope for that PR. This was discovered *while attempting* the
  mandatory post-merge UAT re-verification for `FR-EVT-004`
  (`wf-20260730-feat-155` Step 13), not caused by it.
- `FR-EVT-004`'s own `Implemented`/`Shipped` status is unaffected — its
  own unit tests (1004/1004), new E2E coverage
  (`smoke-event-detail-lifecycle.spec.ts`), and security review already
  independently verified its acceptance criteria before merge. This issue
  only blocks the *additional*, process-level BP-UAT-010 re-check that
  FR-WORKFLOW-004/protocol.md's post-merge UAT step calls for.

## Root cause

`scripts/uat-seed.sh` and the `scripts/uat-fixtures/*.json` manifest
convention (introduced per FR-WORKFLOW-003 for BP-UAT-001/013/020) were
never extended to cover BP-UAT-010's events-domain fixtures. BP-UAT-010's
own script document was seemingly authored assuming a seed mechanism that
was never actually built, or was originally seeded via a manual/ad hoc
step never captured as a repeatable script.

## Acceptance criteria

- [ ] AC-1: A `scripts/uat-fixtures/BP-UAT-010.json` manifest is authored,
      following the same shape as `BP-UAT-001.json`/`BP-UAT-013.json`/
      `BP-UAT-020.json`, declaring `uat-event-open-uz` (capacity=10, 0
      confirmed registrations, `starts_at` = +7d), `uat-event-full-uz`
      (capacity=2, 2 pre-existing confirmed registrations, `starts_at` =
      +14d), and a way to capture/reset `uat-member`'s points baseline.
- [ ] AC-2: `scripts/uat-seed.sh` (or a companion script following the
      same `--reset <BP-UAT-NNN>` convention) is extended to create these
      fixtures idempotently against local Directus.
- [ ] AC-3: The `uat-member@aiqadam.test` vs. `uat-member@example.com`
      email-domain mismatch between `BP-UAT-010.md`/`BP-UAT-010.spec.ts`
      and `uat-seed.sh`'s actual provisioning is reconciled (pick one,
      update the other) — reconcile with BP-UAT-013 semantics if that
      script needs updating, since presumably other BP-UAT scripts may
      share `uat-member@example.com`.
- [ ] AC-4: A live `uat-verification` run against BP-UAT-010 with
      `--reset` completes end-to-end (UATRunner drives the full script,
      all 7 ACs get a real `MATCH`/`MISMATCH` verdict instead of being
      unexecutable).

## Resolution

_Open — not yet scheduled. Discovered live during `wf-20260730-uat-156`'s
Step 1 script-validation pass, itself spawned by `wf-20260730-feat-155`
(`FR-EVT-004`)'s mandatory post-merge UAT step. `FR-EVT-004`'s own
workflow completes with this gap honestly disclosed (see its Notes
section and `workspace-state.md`) rather than a fabricated live-session
pass — per AGENTS.md §6.1, a deferral is only legitimate with a named,
queued follow-up, which this issue file serves as until a workflow ID is
assigned._

### Non-blocking findings from the same validation pass (recorded for whoever picks this up)

- `docs/02-business-processes/uat/BP-UAT-010.md` and
  `apps/e2e/tests/uat/BP-UAT-010.spec.ts` still refer to the sidebar
  component as "RegistrationSidebar"; the actual component (post
  `FR-EVT-004`) is `RegistrationCTA`
  (`apps/web-next/src/blocks/customer/RegistrationCTA.tsx`). Cosmetic —
  the script's assertions use text/role selectors, not component names,
  so this does not itself block execution — but worth fixing in the same
  pass as AC-1/AC-2 above since the file will already be touched.
- Step 001's expectation that the event title/date/location render
  depends on the event-detail page's new (`FR-EVT-004`) lifecycle-tab
  default-tab resolution landing on `upcoming`, which in turn depends on
  the seeded events' `starts_at` staying in the future. True today by
  construction (the fixture table specifies `starts_at` = +7d/+14d) but
  was previously undocumented as an explicit assumption. Whoever authors
  the AC-1 manifest should keep `starts_at` in the future for both
  fixtures and note this dependency explicitly in the script so a future
  edit doesn't silently break Step 001 without an obvious diagnosis path.
