# Step 4: Develop Fix

**Workflow:** wf-20260731-fix-168
**Issue:** ISS-EVT-005-1

## Changes

### Fix 1 — `registeredCount` proxy through `apps/api`

- **New:** `apps/api/src/modules/registrations/event-registration-count.controller.ts`
  — public `GET :id/registration-count` on the existing `v1/events` base
  path, using the module's `DirectusClient` (already authenticated
  server-to-server) to compute `aggregate[count]` on `/items/registrations`
  filtered by `event` + `status IN ('registered','attended')`.
- **Modified:** `apps/api/src/modules/registrations/registrations.module.ts`
  — registers the new controller.
- **New:** `apps/web-next/src/lib/api-ssr.ts`'s `fetchEventRegistrationCount()`
  — calls the new endpoint, same try/catch-fallback-to-0 convention as
  every sibling fetcher in that file.
- **Modified:** `apps/web-next/src/lib/cms.ts` — removed the broken
  Directus-direct `registeredCountOf()` helper entirely; `fetchEvent()`
  now always returns `registeredCount: 0` (documented in its own comment
  as intentional — the real count comes from the caller).
- **Modified:** `apps/web-next/src/pages/events/[id].astro` — added
  `fetchEventRegistrationCount()` to the existing non-gated
  `Promise.all([...])`, overwrites `event.registeredCount` with the real
  value before rendering.

### Fix 2 — `RegistrationCTA.tsx` hydration crash

- **Modified:** `Translations` interface — `spots`/`going_count` (functions)
  → `spotsTemplate`/`goingCountTemplate` (strings containing literal
  `{{count}}`/`{{capacity}}` placeholders).
- **Modified:** `CapacityHint` — does `.replace('{{count}}', ...)` /
  `.replace('{{capacity}}', ...)` instead of calling a function prop.
- **Modified:** `[id].astro` — constructs the template strings via `t()`
  with the placeholder text as the interpolation value, instead of
  passing arrow functions.

### Fix 3 — `useMyRegistrationStatus` endpoint + shape

- **Modified:** `apps/web-next/src/lib/use-registrations.ts` — endpoint
  path `/v1/registrations` → `/v1/registrations/mine` (the real route);
  `RegistrationRow` type corrected from a flat `eventId: string` to the
  real nested `event: { id: string }`; matching loop updated to
  `r.event.id === eventId`.

## Files changed

- `apps/api/src/modules/registrations/event-registration-count.controller.ts` (new, 30 lines)
- `apps/api/src/modules/registrations/registrations.module.ts` (+2/-0)
- `apps/api/test/event-registration-count.controller.spec.ts` (new, 78 lines)
- `apps/web-next/src/lib/api-ssr.ts` (+18/-0)
- `apps/web-next/src/lib/api-ssr.test.ts` (+52/-0)
- `apps/web-next/src/lib/cms.ts` (-27/+0, net removal of the broken helper)
- `apps/web-next/src/lib/cms.test.ts` (test updates to match the simplified `fetchEvent`)
- `apps/web-next/src/pages/events/[id].astro` (+13/-3)
- `apps/web-next/src/blocks/customer/RegistrationCTA.tsx` (+6/-4)
- `apps/web-next/src/lib/use-registrations.ts` (+2/-4)
- `apps/web-next/src/lib/use-registrations.test.ts` (new, 94 lines)

No new dependencies. No DB migration.

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T09:22:00Z"
  summary: "3 independent fixes implemented; all live-verified against the real local stack before this artifact was written (see 07-test-results.md)."
