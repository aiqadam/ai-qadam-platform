# Step 2: Impact Analysis

**Workflow:** wf-20260731-fix-167
**Issue:** ISS-EVT-004-1 (GitHub #161)

## Scope

Single file, single call site: `apps/web-next/src/lib/cms.ts`'s
`fetchEvent()`. No DB migration (Directus `registrations` collection
already has the required `event`/`status` fields, per
`infrastructure/directus/bootstrap.sh`). No API contract change —
`ApiEvent.registeredCount` already exists in `apps/web-next/src/lib/types.ts`
and is already consumed by `RegistrationCTA.tsx` and `EventCard.astro`;
this fix only makes the value real instead of always-0.

## Blast radius

- `apps/web-next/src/pages/events/[id].astro` — the only page that calls
  `fetchEvent()`, passes `registeredCount` straight through to
  `<RegistrationCTA>`.
- `RegistrationCTA.tsx`'s `isFull` capacity math — now driven by a real
  server-computed count instead of purely client-side `optimisticDelta`.
- No change to `apps/web` (V1) — the identical bug there is explicitly
  out of scope per the existing `ISS-EVT-004-1.md` file (filed against
  `web-next` only).
- No change to any `apps/api` code — this fix queries Directus directly
  from the Next.js SSR layer, matching the existing architecture
  (`cms.ts`'s header comment: "no public GET /v1/events/:id route exists
  on apps/api today").

## Risk

Low. Additive change (new helper + one new await in an existing
try/catch), same query idiom already proven in 4 other places in the
codebase (3 in `apps/api`, 1 in this same file). Failure mode of the new
Directus call is contained by its own try/catch (falls back to 0,
matching the pre-fix behavior exactly as a worst case — never worse than
before).

## Referenced precedent (per ISS-EVT-004-1.md's own Root Cause section)

- `apps/api/src/modules/workspace/event-speaker-briefs.service.ts:201` —
  `registeredCountOf()`, `status IN ('registered','attended')`.
- `apps/api/src/modules/workspace/event-reminders.service.ts:257` — same filter.
- `apps/api/src/modules/workspace/post-event-cron.service.ts:206` — same filter.
- `apps/web-next/src/lib/cms.ts:969` (`fetchEventCountForCountry`) — same
  file's own `aggregate[count]` query-construction idiom (chosen over the
  `apps/api` services' `meta=filter_count` idiom for in-file consistency).

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T07:10:00Z"
  summary: "Single-file, single-call-site fix; no DB migration; low blast radius; 4 existing precedents in the codebase confirm the correct query shape."
