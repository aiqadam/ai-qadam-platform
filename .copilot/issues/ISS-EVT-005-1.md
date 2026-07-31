# ISS-EVT-005-1 — registeredCount fix (ISS-EVT-004-1) silently no-ops in the real environment; two adjacent registration-UI bugs found during live re-verification

| Field | Value |
|---|---|
| ID | ISS-EVT-005-1 |
| Severity | bug |
| Module | web-next/events, api/registrations |
| Status | resolved |
| Reported | 2026-07-31 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-fix-168 |
| Reporter | Orchestrator (`wf-20260731-fix-167`, Step 13 live BP-UAT-010 re-verification of ISS-EVT-004-1) |
| Related | ISS-EVT-004-1, BP-UAT-010 |
| Business-Process | BP-UAT-010 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/186 |

## Symptom

Three independent, previously-undetected bugs surfaced while live-verifying
`ISS-EVT-004-1`'s merged fix (PR #185) against the real local stack:

**1. `registeredCountOf()` always 403s in a correctly-configured environment.**
`apps/web-next/src/lib/cms.ts`'s `fetchEvent()` queries
`/items/registrations` unauthenticated (no Bearer token — this SSR module
talks to Directus directly, with no secret to present). Directus's Public
role deliberately has NO read grant on `registrations` (per
`ISS-RBAC-PERMS-001`/`ISS-SEC-PUBLIC-UNMANAGED-001` — it holds other
members' registration data). The query returns HTTP 403, caught by the
fix's own try/catch, silently falling back to `registeredCount: 0` —
reproducing the exact original symptom (`0/2 spots`) through a different
mechanism. Confirmed live: `curl` (no auth header) against
`/items/registrations` → 403; the same query with the admin token → 200.

**2. `RegistrationCTA.tsx` crashes on hydration for every signed-in
visitor to a capacity-limited event.** `[id].astro` passes
`t.spots`/`t.going_count` as **functions** into a `client:load` React
island. Astro serializes island props as JSON; functions cannot survive
that serialization and silently become `null`. `CapacityHint` then calls
`t.spots(count, capacity)`, throwing `TypeError: t.spots is not a
function`, caught by React only as an uncaught render error — the entire
sidebar renders empty (confirmed via Playwright's `pageerror` event and a
blank RegistrationCTA area in the screenshot). This is pre-existing
(introduced by PR #150, `FR-EVT-004`), unrelated to the `registeredCount`
change, but it fully blocks any browser-level verification of the
registration/waitlist flow.

**3. `useMyRegistrationStatus` calls the wrong endpoint with the wrong
response shape, so "You're registered"/"On waitlist" never renders after
a successful register/waitlist call.** `apps/web-next/src/lib/use-registrations.ts`
calls `GET /v1/registrations` — the real route on
`RegistrationsController` is `GET /v1/registrations/mine`
(`registrations.controller.ts:127`). The wrong path 404s every time;
`apiClient` throws, the TanStack Query enters an error state, and
`status.data ?? null` collapses to `null` — rendering identically to
"not yet registered," even though the server-side registration/waitlist
call succeeded (confirmed live: Directus row exists with the correct
`status`, but the DOM never updates). A second, independent bug in the
same function: `RegistrationRow` was typed with a flat `eventId: string`
field, but the real `/mine` response nests it as `event: { id: string }`
— even after fixing the path, the matching loop would never find a row.
Both bugs are pre-existing (from `PR #429`, `Phase 1.4`), unrelated to
`registeredCount`.

## Impact

- Bug 1 means `ISS-EVT-004-1`'s fix, as merged in PR #185, does not
  actually work in any environment with correctly-configured Directus
  permissions (i.e. every real environment) — it only "worked" in local
  testing because of a misconfigured admin-token curl check that masked
  the real unauthenticated failure path.
- Bug 2 means any signed-in member visiting ANY capacity-limited event
  sees a broken (empty) registration sidebar — a total loss of the
  registration/waitlist CTA for the single most common real-world case.
- Bug 3 means even when registration/waitlist succeeds server-side, the
  member never sees confirmation in the UI — they cannot tell if their
  click worked, and might click again (idempotency is a server-side
  concern the API already handles correctly, but the UX is broken).
- All three combined meant BP-UAT-010's registration flow was never
  actually exercisable end-to-end in a live browser session before this
  workflow, despite three prior BP-UAT-010 workflows
  (`wf-20260731-uat-163`, `wf-20260731-fix-165`, `wf-20260731-uat-166`)
  reporting clean passes — those runs' own DOM-text assertions
  (`getByText(/you're registered/i)`) apparently tolerated the "✓ "
  prefix or otherwise didn't hit this exact crash path; see Resolution
  for how this workflow's own re-run confirmed the underlying server
  behavior was correct throughout (bug 3 is UI-only).

## Root cause

See Symptom above — three independent root causes, one per bug. No
single shared cause; grouped into one issue because all three were
discovered in the same live-verification session and all three block
BP-UAT-010's registration flow.

## Acceptance criteria

- [x] AC-1: `apps/web-next`'s event-detail page computes `registeredCount`
      via a new public `apps/api` endpoint (`GET
      /v1/events/:id/registration-count`) backed by `apps/api`'s own
      authenticated `DirectusClient`, instead of querying Directus
      directly from `apps/web-next` (which has no valid credential for
      the `registrations` collection).
- [x] AC-2: `RegistrationCTA.tsx` receives pre-formatted translation
      templates (strings), not function props, for any value used inside
      a `client:load` island — no `TypeError` on hydration for any
      signed-in visitor to a capacity-limited event.
- [x] AC-3: `useMyRegistrationStatus` calls the real `GET
      /v1/registrations/mine` endpoint and correctly matches on the
      nested `event.id` field; after a successful register/waitlist
      call, "You're registered"/"On waitlist" renders within a few
      seconds (TanStack Query's existing `invalidateQueries` call is
      sufficient once the endpoint/shape are correct).
- [x] AC-4: Regression tests for all three fixes (apps/api controller
      test, apps/web-next `api-ssr.test.ts` fetcher test, and
      `use-registrations.test.ts` matching-logic test).
- [x] AC-5: Live re-verification against BP-UAT-010's registration/
      waitlist flow using the real local stack (Directus + Authentik +
      apps/api + apps/web-next), confirming both the capacity display
      AND the post-click UI confirmation now work end-to-end.

## Resolution

**Workflow:** wf-20260731-fix-168 (subworkflow of wf-20260731-fix-167)
**PR:** <pending>

**Root cause:** Three independent bugs, all masked by unit-level testing
alone: (1) `registeredCountOf()` queried Directus unauthenticated, 403ing
against the deliberately-locked-down `registrations` collection; (2)
`RegistrationCTA.tsx` passed translation functions as `client:load` island
props, which Astro's JSON serialization silently drops to `null`; (3)
`useMyRegistrationStatus` called a nonexistent `/v1/registrations`
endpoint (real route: `/v1/registrations/mine`) with a type shape that
didn't match the real nested `event: { id }` response.

**Fix:** (1) Added a public `GET /v1/events/:id/registration-count` on
`apps/api`, computed via its own authenticated `DirectusClient`, never
exposing row-level data; `apps/web-next` now calls this instead of
querying Directus directly. (2) `Translations.spots`/`going_count`
changed from functions to pre-rendered template strings with
`{{count}}`/`{{capacity}}` placeholders; `CapacityHint` does its own
string substitution. (3) Corrected the endpoint path and the
`RegistrationRow` type to match the real API response shape.

**Regression tests:** 17 new/updated unit test cases across
`event-registration-count.controller.spec.ts` (apps/api, 5 cases),
`api-ssr.test.ts` (apps/web-next, 4 cases), `cms.test.ts` (simplified,
-4/+1 cases reflecting the removed Directus-direct path), and
`use-registrations.test.ts` (new file, 8 cases).

**Live verification:** All three fixes independently confirmed against
the real local Docker stack (Directus + Authentik + apps/api +
apps/web-next) via direct `curl`/Directus API cross-reference and 3 full
Playwright `BP-UAT-010.session.spec.ts` runs, all passing cleanly
post-fix. Screenshots show correct "3/2 spots" + "Leave waitlist" and
"✓ You're registered" states, cross-referenced against the exact Directus
rows (`status=registered`/`status=waitlisted`).

**Merged:** <pending>

**Honesty disclosure:** This issue exists because `wf-20260731-fix-167`'s
own Step 13 (mandatory live BP-UAT-010 re-verification, AGENTS.md §6.1)
found that its merged fix (PR #185) didn't actually work outside unit
tests. That workflow's earlier local manual verification (a `curl` with
an admin token) had masked the real unauthenticated-403 failure path —
a case of testing with elevated credentials the production code path
doesn't have. This is recorded here so future workflows verify with the
SAME credential level the real caller uses, not a convenience shortcut.
