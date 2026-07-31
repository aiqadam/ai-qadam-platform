# Step 4 — Fix Summary

## Files changed

1. `docs/02-business-processes/uat/BP-UAT-010.md`
   - AC-1: `status=confirmed` → `status=registered` (real Directus enum
     value, `registrations-directus.service.ts:21`).
   - AC-2: dropped the QR-code-visible clause — no QR element exists
     anywhere in the current UI (`RegistrationCTA.tsx` has no `<img>`/
     `<canvas>` for a code); check-in is by staff scan against the Directus
     row directly. Renamed sidebar → `RegistrationCTA` block (the real V2
     component name).
   - AC-6: `waitlist` → `waitlisted`; sidebar → `RegistrationCTA`.
   - AC-7: "+5 points on confirmed registration" → "no points at
     registration; +10 on check-in via `reg-checkin-points`" (product
     decision recorded in `02-impact-analysis.md`: redefine around the real
     mechanism rather than escalate as a missing feature — no evidence
     anywhere that +5-on-registration is an intended, unbuilt feature).
   - Steps 003/004/006 and Negative-002/003 rewritten to match: real field
     values, real port (`:3000`, confirming the doc's port was actually
     already correct — only the endpoint path/status/fields were wrong),
     `RegistrationCTA` terminology, DOM-vs-Directus cross-reference
     framing (matching the technique that caught ISS-UAT-010-2).
   - Notes section: QR-code note corrected to "does not exist"; added a
     points-absence note and the known unrelated `ISS-EVT-004-1` display
     caveat.
   - Seed Fixtures table updated to reference the real manifest
     (`scripts/uat-fixtures/BP-UAT-010.json`, already shipped by
     ISS-UAT-SEED-003) instead of describing fixtures in the abstract.

2. `apps/e2e/tests/uat/BP-UAT-010.spec.ts` — full rewrite:
   - Targets the real endpoint (`POST /v1/events/:eventId/register`, 200,
     not the nonexistent `POST /v1/registrations` expecting 201).
   - Drops the nonexistent `GET /v1/points/me` assertion; AC-7 test instead
     asserts `/v1/points/me` returns 404 and `/v1/leaderboard` (the real
     points-related read) returns 200 — documents the absence rather than
     asserting a fictional endpoint.
   - Event ids resolved via a direct Directus read by title
     (`findEventPathByTitle`), matching `apps/web-next`'s own
     `cms.ts` convention (no public `GET /v1/events` listing endpoint
     exists in `apps/api` — a pre-existing, already-documented gap, not
     invented here).
   - New `waitForCtaSettled()` helper: the `RegistrationCTA` block is a
     React island (`client:load`) with a transient "Loading
     registration…" state before settling on Register / registered /
     waitlisted — a snap `isVisible()` check can race hydration (caught
     live during this workflow's own verification run, see Step 8).
   - Asserts absence of any QR `<img>`/`<canvas>` element (AC-2), matching
     the doc correction above.

## Product decision (see 02-impact-analysis.md for full reasoning)

AC-7 redefined around the real check-in-time mechanism rather than
escalating "+5 on registration" as a missing-feature request. Reversible,
evidence-backed, decided per AGENTS.md §16 rather than pausing to ask.

## Gate Result

gate_result:
  status: passed
  summary: "Doc + spec rewritten to match the real apps/api + apps/web-next implementation; live-verified (see 07-test-results.md)."
  findings: []
