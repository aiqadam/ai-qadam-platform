# Step 4: Develop Fix

**Workflow:** wf-20260731-fix-167
**Issue:** ISS-EVT-004-1

## Change

`apps/web-next/src/lib/cms.ts`:

- Added `registeredCountOf(eventId: string): Promise<number>` — queries
  Directus `/items/registrations` with `filter[event][_eq]=<id>`,
  `filter[status][_in]=registered,attended`, `aggregate[count]=id`.
  Mirrors `fetchEventCountForCountry()`'s existing aggregate-query idiom
  in the same file, and the `status IN ('registered','attended')`
  status-set convention already used identically in
  `apps/api/src/modules/workspace/event-speaker-briefs.service.ts:201`,
  `event-reminders.service.ts:257`, `post-event-cron.service.ts:206`.
  Own try/catch — falls back to `0` on any Directus failure, same
  resilience convention as every sibling fetcher in this file.
- `fetchEvent()` now calls `registeredCountOf(body.data.id)` after the
  publish/country gate and passes the result as `toApiEvent()`'s second
  argument (previously omitted entirely, defaulting to `0`).

`apps/web-next/src/lib/cms.test.ts`:

- Local re-implementations of `toApiEvent`/`fetchEvent` updated to match
  (this test file intentionally re-implements `cms.ts` logic locally
  rather than importing it, per its own header comment).
- Added local `registeredCountOf` re-implementation.
- New `describe` block: "fetchEvent — registeredCount reflects live
  registrations (ISS-EVT-004-1)" — 4 cases (under-capacity count,
  at-capacity count + `isFull`-equivalent derivation, exact query-shape
  assertion, count-query-failure fallback to 0).
- Updated 6 pre-existing tests that reach the (now two-fetch-call)
  `fetchEvent` happy path to also mock the second (count) call.

## Files changed

- `apps/web-next/src/lib/cms.ts` (+27/-2 lines)
- `apps/web-next/src/lib/cms.test.ts` (+96/-8 lines, incl. 6 existing
  tests updated with a second mock)

No new dependencies. No DB migration (Directus schema unchanged — the
`registrations` collection and its `status`/`event` fields already
exist, per `infrastructure/directus/bootstrap.sh`).

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T07:15:00Z"
  summary: "registeredCountOf() added and wired into fetchEvent(); mirrors 3 existing apps/api precedents and this file's own fetchEventCountForCountry() idiom."
