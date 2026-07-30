# ISS-EVT-004-1 — Event-detail page always passes `registeredCount=0`; capacity/waitlist state never reflects real registrations

| Field | Value |
|---|---|
| ID | ISS-EVT-004-1 |
| Severity | bug |
| Module | web-next/events |
| Status | open |
| Reported | 2026-07-30 |
| Reporter | Orchestrator (`wf-20260730-fix-157`, Step 2 impact analysis for ISS-UAT-SEED-003) |
| Related | ISS-UAT-SEED-003, BP-UAT-010, FR-EVT-004 |
| Business-Process | BP-UAT-010 |
| GitHub-Issue | — (not yet filed; local-origin finding, filed here per AGENTS.md §14 auto-registration precedent) |

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

- [ ] AC-1: `fetchEvent()` (or a helper it calls) queries a live count of
      `registrations` rows for the event with `status IN
      ('registered','attended')` (matching the existing convention in the
      three `apps/api` consumers cited above) and passes it as
      `toApiEvent()`'s second argument.
- [ ] AC-2: A fresh (no client-side session state) page load of an event
      seeded at capacity renders "Join waitlist" / full-state UI, not
      "Register."
- [ ] AC-3: Regression test (unit or integration) covering both the
      under-capacity and at-capacity live-count cases for `fetchEvent()`.
- [ ] AC-4: Live re-verification against BP-UAT-010's AC-6/Negative-003
      using the `uat-event-full-uz` fixture from ISS-UAT-SEED-003.

## Resolution

_Open — not yet scheduled. Filed alongside ISS-UAT-SEED-003's fix
(`wf-20260730-fix-157`) as a separate, appropriately-scoped app-code fix
(touches `apps/web-next/src/lib/cms.ts` and its Directus query surface,
not seed tooling) — per that workflow's Step-1 scope decision and
AGENTS.md §4's small-PR rule._
