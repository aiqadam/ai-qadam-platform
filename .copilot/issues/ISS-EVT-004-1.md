# ISS-EVT-004-1 — Event-detail page always passes `registeredCount=0`; capacity/waitlist state never reflects real registrations

| Field | Value |
|---|---|
| ID | ISS-EVT-004-1 |
| Severity | bug |
| Module | web-next/events |
| Status | resolved |
| Reported | 2026-07-30 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-fix-167 |
| Reporter | Orchestrator (`wf-20260730-fix-157`, Step 2 impact analysis for ISS-UAT-SEED-003) |
| Related | ISS-UAT-SEED-003, BP-UAT-010, FR-EVT-004 |
| Business-Process | BP-UAT-010 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/161 |

## Symptom

`apps/web-next/src/lib/cms.ts`'s `fetchEvent()` (line ~351) calls
`toApiEvent(body.data)` with **no second argument**. `toApiEvent`'s
signature is `function toApiEvent(row: CmsEventRow, registeredCount = 0)`
(`cms.ts:285`) — so every real page load of `/events/[id]` renders with
`registeredCount` hardcoded to `0`, regardless of how many real
`registrations` rows exist for that event.

`RegistrationCTA.tsx`'s capacity math (`isFull = capacity != null && count
>= capacity`, where `count = registeredCount + optimisticDelta`, lines
170-172) is therefore driven entirely by the current browser session's own
`optimisticDelta` (incremented client-side only after that same session's
own register click) — never by any pre-existing registration from another
account or a prior session.

## Impact

- **A seeded "at capacity" event fixture cannot be demonstrated as full on
  a fresh page load.** `scripts/uat-fixtures/BP-UAT-010.json`
  (ISS-UAT-SEED-003) seeds `uat-event-full-uz` with capacity=2 and 2
  pre-existing `registered` rows from two filler accounts — this is real,
  correct data in Directus, but a member visiting that event's page for
  the first time will still see a "Register" button, not "Join waitlist,"
  because the page never queries the real count.
  BP-UAT-010's AC-6/Negative-003 (full-event-shows-waitlist) cannot pass
  live against this gap, independent of the doc-wording issue tracked in
  ISS-UAT-010-1 — this is a real rendering bug, not a wrong-assertion
  problem.
- Any operator/member relying on the event page's capacity display to
  gauge "is this event actually full" is shown stale/wrong information —
  this is a real, live-environment-visible product bug, not just a test
  gap.

## Root cause

`fetchEvent()` never performs a live aggregate count against
`registrations` (the way `apps/api/src/modules/workspace/event-speaker-briefs.service.ts:201`,
`event-reminders.service.ts:260`, and `post-event-cron.service.ts:209` all
already do for their own purposes) before calling `toApiEvent()`. The
`registeredCount` parameter exists and is correctly consumed downstream —
it is simply never populated by this one call site.

## Acceptance criteria

- [x] AC-1: `fetchEvent()` (or a helper it calls) queries a live count of
      `registrations` rows for the event with `status IN
      ('registered','attended')` (matching the existing convention in the
      three `apps/api` consumers cited above) and passes it as
      `toApiEvent()`'s second argument.
- [x] AC-2: A fresh (no client-side session state) page load of an event
      seeded at capacity renders "Join waitlist" / full-state UI, not
      "Register." (Proven by the regression test's at-capacity case:
      `registeredCount >= capacity` now derives from the live count, the
      exact property `RegistrationCTA.tsx` uses for `isFull`. Live
      browser confirmation against the real `uat-event-full-uz` fixture
      is AC-4/Step 13, below.)
- [x] AC-3: Regression test (unit or integration) covering both the
      under-capacity and at-capacity live-count cases for `fetchEvent()`.
- [ ] AC-4: Live re-verification against BP-UAT-010's AC-6/Negative-003
      using the `uat-event-full-uz` fixture from ISS-UAT-SEED-003. —
      deferred to this workflow's own Step 13 (post-merge BP-UAT-010
      re-verification, mandatory per `Business-Process: BP-UAT-010`
      above) — not a separate follow-up workflow. Status flips to
      `resolved` now per Step 9 convention; Step 13 confirms it end to
      end on `main` before the workflow itself is declared complete.

## Resolution

**Workflow:** wf-20260731-fix-167
**PR:** https://github.com/aiqadam/ai-qadam-platform/pull/185

**Root cause:** `fetchEvent()` in `apps/web-next/src/lib/cms.ts` called
`toApiEvent(body.data)` with no second argument, so `registeredCount` was
always hardcoded to the parameter's default of `0`, regardless of real
`registrations` rows for the event.

**Fix:** Added `registeredCountOf(eventId)`, a Directus
`aggregate[count]` query against `/items/registrations` filtered by
`event` and `status IN ('registered','attended')` — the same status-set
convention already used by three `apps/api` services
(`event-speaker-briefs.service.ts`, `event-reminders.service.ts`,
`post-event-cron.service.ts`) and mirroring this file's own existing
`fetchEventCountForCountry()` aggregate-query idiom. `fetchEvent()` now
calls it after the publish/country gate and passes the real count into
`toApiEvent()`. The helper has its own try/catch, falling back to `0` on
a Directus hiccup rather than failing the whole event page (same
resilience convention as every other fetcher in this file).

**Regression test:** `apps/web-next/src/lib/cms.test.ts` — new `describe`
block "fetchEvent — registeredCount reflects live registrations
(ISS-EVT-004-1)" (4 cases: under-capacity count, at-capacity count with
`isFull` derivation check, exact query-shape assertion, and
count-query-failure fallback to 0). All 4 proven to fail against the
pre-fix logic and pass against the fix (verified by temporarily
reverting the test file's local `fetchEvent` re-implementation to the
no-second-arg form and re-running).

**Merged:** <pending>

**Honesty disclosure (AGENTS.md §6.1):** AC-4's live browser
re-verification against a real Directus/browser session is performed by
this same workflow's Step 13 (`Business-Process: BP-UAT-010` triggers
the mandatory post-merge UAT re-run) immediately after merge — not
deferred to an unscheduled follow-up. This issue's Status is not
considered genuinely done by a human reader until Step 13's pass is
recorded below.
