# ISS-UAT-SEED-003 — BP-UAT-010's event/points fixtures are not seeded anywhere

| Field | Value |
|---|---|
| ID | ISS-UAT-SEED-003 |
| Severity | blocker (for BP-UAT-010 execution specifically) |
| Module | uat/seed |
| Status | resolved |
| Reported | 2026-07-30 |
| Resolved | 2026-07-30 |
| Workflow | wf-20260730-fix-157 |
| Reporter | BusinessAnalyst (`wf-20260730-uat-156`, Step 1 script validation for the post-merge UAT re-verification of `FR-EVT-004`) |
| Related | BP-UAT-010, FR-EVT-004 (unaffected — see Impact), ISS-UAT-010-1, ISS-EVT-004-1 (out-of-scope findings split off during this resolution) |
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

- [x] AC-1: A `scripts/uat-fixtures/BP-UAT-010.json` manifest is authored,
      following the same shape as `BP-UAT-001.json`/`BP-UAT-013.json`/
      `BP-UAT-020.json`, declaring `uat-event-open-uz` (capacity=10, 0
      confirmed registrations, `starts_at` = +7d), `uat-event-full-uz`
      (capacity=2, 2 pre-existing confirmed registrations, `starts_at` =
      +14d), and a way to capture/reset `uat-member`'s points baseline.
- [x] AC-2: `scripts/uat-seed.sh` (or a companion script following the
      same `--reset <BP-UAT-NNN>` convention) is extended to create these
      fixtures idempotently against local Directus.
- [x] AC-3: The `uat-member@aiqadam.test` vs. `uat-member@example.com`
      email-domain mismatch between `BP-UAT-010.md`/`BP-UAT-010.spec.ts`
      and `uat-seed.sh`'s actual provisioning is reconciled (pick one,
      update the other) — reconcile with BP-UAT-013 semantics if that
      script needs updating, since presumably other BP-UAT scripts may
      share `uat-member@example.com`.
- [x] AC-4: A live `--reset BP-UAT-010` run against the local Directus/
      Authentik stack completes end-to-end (verified — see Resolution).
      **Narrowed from the original wording**: the original AC-4 asked for
      a full `uat-verification` session producing `MATCH`/`MISMATCH`
      verdicts on all 7 of BP-UAT-010's *own* ACs — that overlaps with
      this workflow's mandatory Step 13 post-merge UAT re-verification
      (which runs regardless, per `protocol.md`'s Business-Process
      Linkage section, since this issue's `Business-Process` field names
      `BP-UAT-010`) and additionally depends on ISS-UAT-010-1's doc/spec
      fix landing first for a clean per-AC verdict. This AC is satisfied
      by the seed *mechanism itself* running live end-to-end (proven
      below); the full 7-AC verdict is Step 13's job, tracked separately,
      not fabricated here.

## Resolution

**Workflow:** wf-20260730-fix-157
**PR:** [#155](https://github.com/aiqadam/ai-qadam-platform/pull/155)
**Merged:** `2691907f3487f000d4bf46c8b7de952396ede9f9` (squash)
**Root cause:** `scripts/uat-fixtures/BP-UAT-010.json` never existed and
`scripts/uat-seed.sh --reset` had no notion of `events`/`registrations`/
`point_awards` fixtures — the manifest-driven `--reset` convention
(FR-WORKFLOW-003) was only ever extended to operator_invites/
member_consents-shaped BP-UATs (001/013), never to BP-UAT-010's
events-domain shape.

**Fix:** Authored `scripts/uat-fixtures/BP-UAT-010.json` (8 fixtures: 3
identity, 5 domain) and generalized `reset_domain_fixture()`/
`resolve_payload_offsets()` in `scripts/uat-seed.sh` with two new
manifest hints (`event_ref`/`event_ref_field`, `user_email`) and a
`"__resolved__"` lookup-value sentinel, following the exact FK-resolution
pattern `member_email` already established. Reconciled the email-domain
mismatch (AC-3) in `BP-UAT-010.md` and `BP-UAT-010.spec.ts`, narrowly
(mechanical string fix only — the file's other, deeper issues are
out-of-scope, see below).

**A second, independently live-discovered bug was found and fixed in the
same session**: `resolve_payload_offsets()`'s `for k in $keys` word-split
on the native Windows `jq.exe`'s CRLF multi-line output, silently
corrupting every `*_offset` key except the last one in any fixture
declaring 2+ of them (`date_offset: unknown unit 'null'`). This was
**pre-existing, not introduced by this PR** — `BP-UAT-001.json`'s
`uat-event-draft-uz` fixture has the identical 2-offset-key shape and
would hit the same failure — it was simply never live-`--reset`-tested
with this shape before, since mock mode never calls
`resolve_payload_offsets()` at all. Fixed with `tr -d '\r'`, the same
idiom `env_get()` already uses for the identical class of problem. See
`07-test-results.md` for the full diagnostic account.

**Regression test:** `scripts/tests/uat-seed.bats` — 11 new tests (76/76
total pass across the 3 `uat-seed*.bats` files, up from 65 before this
workflow), including a dedicated fail-before/pass-after test for the
CRLF bug (sources `date_offset()`/`resolve_payload_offsets()` directly,
same technique the existing `env_get()` CRLF test already uses).

**Live verification:** `bash scripts/uat-seed.sh --reset BP-UAT-010`
against the actual local Docker stack (already running/healthy) —
succeeded end-to-end on the second attempt (first attempt caught the
CRLF bug above). Verified directly against Directus (not just the
script's own success message): both events created with the correct
`status`/`capacity`/`starts_at`; both `registrations` rows `status:
registered` against `UAT Event Full UZ`; `uat-member`'s `point_awards`
baseline row present (10 points, `event_attended`). Re-ran `--reset` a
second time and confirmed no row accumulation (idempotent) — the
`registrations` rows are correctly cleaned up via the pre-existing
`ON DELETE CASCADE` FK when their parent `events` row is deleted and
recreated.

**Two out-of-scope findings split off to their own issues** (per a
scope decision made explicit with the user before implementation — see
`01-issue-lookup.md`): BP-UAT-010.md's own AC-1/AC-6/AC-7 wording uses
field values (`confirmed`/`waitlist`, "+5 points on registration") that
don't exist anywhere in the real implementation, and its Playwright spec
targets the wrong app/endpoints entirely — filed as
[ISS-UAT-010-1](ISS-UAT-010-1.md). The event-detail page's
`registeredCount` is hardcoded to 0 on every load, so a seeded at-capacity
event won't render as full/waitlisted in the browser today — filed as
[ISS-EVT-004-1](ISS-EVT-004-1.md). Neither is a defect in this workflow's
own fix; both are pre-existing gaps this workflow's research uncovered.

**Step 13 (post-merge UAT re-verification) outcome:** `wf-20260730-uat-158`
drove a full live agent-driven browser session against `BP-UAT-010` — the
first time this business process has ever actually been executed
end-to-end in this repo. AC-1/AC-4/AC-5/Negative-002 verified `MATCH`;
AC-2 `PARTIAL` (sidebar state correct, no QR element found — a
pre-existing, already-documented gap in the doc's own Notes); AC-3
legitimately deferred (no mail-catcher check performed, per the doc's own
sanctioned deferral); AC-6/AC-7 `MISMATCH` as predicted above
(ISS-UAT-010-1's doc-wording gap). **Two new, real, previously-undiscovered
product bugs were also found and independently corroborated against
Directus (not just DOM text)** — both pre-existing, neither caused by
this workflow's own change:
[ISS-BRIDGE-STALE-001](ISS-BRIDGE-STALE-001.md) (a stale
`platform.users.directus_user_id` cache misattributes real registrations
to a superseded Directus user — high severity, wide blast radius, not
limited to this test fixture) and
[ISS-UAT-010-2](ISS-UAT-010-2.md) (a genuinely `waitlisted` registration
renders as "You're registered" in `apps/web`'s `RegistrationSidebar`).
Per protocol.md's Step 13 outcome-handling rule, this workflow does NOT
sync to `agent-verified` — a new finding on the same surface means
verification is not clean; Status remains at `implemented` for a human to
assess, or a future workflow to resolve and then correctly reach
`agent-verified` on its own pass.

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
