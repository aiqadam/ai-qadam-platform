# Step 6/7: Test Strategy + Design

**Workflow:** wf-20260731-fix-168

## Strategy

Unit-level regression tests for each of the three fixes, plus a live
Playwright re-run (Step 13 equivalent, folded into this same workflow
since it's the reason these bugs were found) as the ultimate proof.

## Cases added

**`apps/api/test/event-registration-count.controller.spec.ts`** (5 cases):
returns the aggregate count; coerces a string count to number; returns 0
for an empty aggregate response; filters by event id + `status IN
(registered, attended)`; never includes waitlisted/cancelled in the
status filter.

**`apps/web-next/src/lib/api-ssr.test.ts`** (+4 cases in a new
`fetchEventRegistrationCount` describe block): returns the count on
success; returns 0 on HTTP error; returns 0 on network error; URL-encodes
the event id.

**`apps/web-next/src/lib/cms.test.ts`** (simplified, not expanded): removed
the now-dead `registeredCountOf` re-implementation and its 4-case describe
block (that logic moved to `apps/api`); added 1 new case confirming
`fetchEvent` always returns `registeredCount: 0` and makes no
`registrations` query (proving the Directus-direct path was fully
removed, not just made unreachable).

**`apps/web-next/src/lib/use-registrations.test.ts`** (new file, 8 cases):
confirms the corrected endpoint path; `findMyStatus` matching logic
against the real nested `event.id` response shape, covering registered /
waitlisted / no-match / cancelled-excluded / attended-excluded / empty /
multi-row cases.

## Live verification (the actual bug-discovery mechanism)

Every one of these three bugs was found by, and re-verified via, a real
Playwright session against the local Docker stack (Directus + Authentik
+ apps/api + apps/web-next), not by unit tests alone — unit tests alone
cannot catch a real Directus 403, a browser hydration crash, or a 404
against the real route table. Sequence:

1. Confirmed `registeredCountOf`'s 403 via direct `curl` (no auth header)
   against `/items/registrations`.
2. Confirmed the hydration crash via Playwright's `pageerror` event
   capture (`TypeError: t.spots is not a function`).
3. Confirmed the wrong-endpoint bug via Playwright's `response` event
   capture (`GET /api/v1/registrations → 404`).
4. After each fix, re-ran the live BP-UAT-010 session spec + a temporary
   diagnostic probe, confirming: (a) `registeredCountOf` endpoint
   returns 200 with the correct count; (b) the RegistrationCTA sidebar
   renders (no crash); (c) "✓ You're registered" / "On waitlist —
   we'll email if a seat opens" correctly appear after clicking, with
   the exact Directus row confirmed via direct API query
   (`status=registered` / `status=waitlisted` respectively).

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T09:26:00Z"
  summary: "17 new/updated unit test cases across 4 files + full live Playwright re-verification with direct Directus cross-reference for all 3 fixes."
