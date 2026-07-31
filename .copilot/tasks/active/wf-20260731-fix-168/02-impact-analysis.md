# Step 2: Impact Analysis

**Workflow:** wf-20260731-fix-168 (subworkflow of wf-20260731-fix-167, spawned from its own Step 13 live-verification findings)
**Issue:** ISS-EVT-005-1 (GitHub #186)

## Scope

Three independent fixes, all discovered live-verifying `ISS-EVT-004-1`'s
merged PR #185 against the real local stack:

1. **New public `apps/api` endpoint** — `GET /v1/events/:id/registration-count`,
   a new `EventRegistrationCountController` in the existing `registrations`
   module, using the module's already-injected `DirectusClient`.
2. **`apps/web-next` wiring change** — `fetchEvent()` (`lib/cms.ts`) drops
   its broken Directus-direct `registeredCountOf()`; a new
   `fetchEventRegistrationCount()` (`lib/api-ssr.ts`) calls the new
   endpoint; `[id].astro` composes both and merges the real count onto
   `event.registeredCount`.
3. **`RegistrationCTA.tsx` translation-prop fix** — `Translations.spots`/
   `going_count` change from functions to pre-rendered template strings
   (`spotsTemplate`/`goingCountTemplate`); `CapacityHint` does its own
   `.replace()` substitution. `[id].astro`'s prop construction updated to
   match.
4. **`use-registrations.ts` endpoint + shape fix** — `useMyRegistrationStatus`
   calls `/v1/registrations/mine` (was `/v1/registrations`, 404);
   `RegistrationRow` type corrected to the real nested `event: { id }`
   shape (was a flat, nonexistent `eventId` field).

## Blast radius

- `apps/api/src/modules/registrations/registrations.module.ts` — one new
  controller registered, no changes to existing controllers/services.
- `apps/web-next/src/lib/cms.ts`, `api-ssr.ts`, `pages/events/[id].astro`
  — same event-detail page as ISS-EVT-004-1; no other page imports
  `fetchEvent()` or `RegistrationCTA`.
- `apps/web-next/src/blocks/customer/RegistrationCTA.tsx` — sole consumer
  is `[id].astro`; no Storybook story or other page uses this component
  (confirmed via grep).
- `apps/web-next/src/lib/use-registrations.ts` — sole consumer is
  `RegistrationCTA.tsx` (both hooks). No other block imports this file.

## Risk

Low-to-moderate. All four changes are bug fixes restoring already-intended
behavior (the type signatures, translations interface, and hook already
expected this shape — they were simply wired to the wrong path/shape).
No new architectural surface beyond the new `apps/api` endpoint, which
follows an existing, proven pattern (`checkin-events.controller.ts`).

## Why this wasn't caught by ISS-EVT-004-1's own workflow

`wf-20260731-fix-167`'s Steps 1-9 were entirely unit-level (mocked fetch),
which cannot detect: (a) a real Directus permission boundary, (b) a
client-side React hydration crash, or (c) a wrong endpoint path that a
mock never exercises against the real route table. This is exactly why
AGENTS.md §6.1 mandates live post-merge verification (Step 13) for any
`Business-Process`-linked issue — these three bugs are the concrete
motivating case for that rule.

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T09:18:00Z"
  summary: "3 independent, low-risk bug fixes; no new architectural surface beyond one new apps/api endpoint following an existing pattern."
