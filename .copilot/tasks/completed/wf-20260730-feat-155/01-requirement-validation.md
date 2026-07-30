# Requirement Validation — FR-EVT-004 (Event detail page)

Workflow: `wf-20260730-feat-155` · Agent: RequirementAnalyst

## Raw Input

Existing requirement doc `docs/03-requirements/FR-EVT-004.md`, status `In Progress`,
already carrying a full functional-scope list and acceptance criteria. GitHub issue
[#130](https://github.com/aiqadam/ai-qadam-platform/issues/130) tracks it. This is a
gap-closure pass, not a new requirement: V2 (`apps/web-next/src/pages/events/[id].astro`)
currently ports only speakers/materials/sponsors/forum from the full spec. Missing per
the FR's own Notes: lifecycle-adaptive tabs (upcoming/live/finished), photos gallery,
recap/livestream embed, venue+map block, visibility gating (`members_only`/`invite_only`),
country-mismatch 404, and the OG card image route.

## Analysis

### Completeness Issues Found

The FR is well-formed (specific functional scope, 8 acceptance criteria, clear Notes
on what's already shipped vs. missing) but three ambiguities needed resolution before
CodeDeveloper can implement without guessing — all three are now answered below and
recorded directly in the FR's Notes section as an "Architectural findings" subsection,
since they'll otherwise be rediscovered by whichever agent picks up implementation:

1. **How is a "country mismatch" actually detected server-side, and what should
   happen?** Traced both `fetchEvent` implementations:
   - V1 (`apps/web/src/lib/cms.ts::fetchEvent`) reads Directus directly
     (`/items/events/:id`), resolves tenant via `countryFromHost(host)` (first
     label of `Host` header, default `uz`), and returns `null` if
     `body.data.country !== country` — **collapsed into the same `null` path as
     "not found"**, which the page (`apps/web/src/pages/events/[id].astro` line
     ~39) turns into a **302 redirect to `/events`**, not a 404.
   - V2 (`apps/web-next/src/lib/api-ssr.ts::fetchEvent`) calls `GET
     /v1/events/:id` on the NestJS API and also collapses "not found" +
     "network failure" into `null` → the V2 page also 302s to `/events`
     (`apps/web-next/.../pages/events/[id].astro` line ~44).
   - **Neither codebase implements the FR's own AC-8 ("returns 404")
     today.** This is new behavior, not a port — flagged explicitly in the FR
     so it isn't silently treated as "just copy V1."

2. **What determines lifecycle state given `starts_at`/`ends_at`?** No new
   status field exists or is needed. V1's page (`apps/web/src/pages/events/[id].astro`,
   `VALID_TABS = ['upcoming', 'live', 'finished', 'forum']`) computes the default
   tab from `now` vs. `startsAt`/`endsAt`: `now < startsAt` → upcoming,
   `startsAt <= now <= endsAt` → live, `now > endsAt` → finished. The existing
   `status` enum (`draft`/`published`/`cancelled`) is orthogonal — it gates
   publish-visibility, not lifecycle tab selection. V2 should reuse this exact
   derivation.

3. **What is the OG card route's tech dependency chain?** V1:
   `pages/events/[id]/og-card.png.ts` → `fetchEvent` + `fetchEventSpeakers` (both
   from `lib/cms.ts`, straight to Directus) → `renderOgCard()` (`lib/og-template.tsx`,
   Satori JSX) → `loadOgFonts()` (`lib/og-fonts.ts`) → `satori()` → `Resvg` (SVG→PNG).
   Gates on `visibilityScope !== 'public'` → 404 (never leaks a private title via
   scraper preview). V2 has none of this yet; the same chain can be ported
   essentially as-is once `lib/cms.ts::fetchEvent` exists in V2 (see architectural
   finding below — this is the same missing piece AC-8 needs).

### Additional architectural findings surfaced during validation (now recorded in the FR)

- **Blocking gap: V2's `fetchEvent` targets a NestJS route that doesn't exist.**
  `apps/web-next/src/lib/api-ssr.ts::fetchEvent` calls `GET /v1/events/:id`.
  Searched all of `apps/api/src` for a controller implementing this route —
  none exists. The only `v1/events`-prefixed or `:id`-shaped controllers found
  are `v1/workspace/events/:id` (authenticated, operator-only,
  `events.controller.ts`) and `v1/events/:id/questions` (write-only,
  `event-questions.controller.ts`). Every other V2 event sub-fetcher
  (`fetchEventSpeakers`/`Materials`/`Sponsors`/`Questions` reads) lives in
  `lib/cms.ts` and reads Directus directly (anonymous public policy) —
  identical to V1's pattern, including V1's own `fetchEvent`. Recorded in the
  FR as a decision point with a recommendation: add `fetchEvent` to
  `web-next/src/lib/cms.ts` reading Directus directly (matches V1 precedent
  and every V2 sibling fetcher) rather than building a new public Nest
  endpoint. CodeDeveloper should treat this as default unless overridden.
- **`recapMd` / `livestreamUrl` missing from V2's `ApiEvent` type**
  (`apps/web-next/src/lib/types.ts`) — V1 already reads these as real Directus
  columns (`recap_md`, `livestream_url`), distinct from V2's current
  `externalLinks[].kind === 'livestream'` pill. Needs adding to the type and
  mapping from the same columns, not conflating with `externalLinks`.
- **`event_photos` has no V2 fetcher.** V1's `lib/cms.ts::fetchEventPhotos` has
  no V2 equivalent yet; needs porting, gated by `isGated`, Finished-tab only.

None of these are architecture *violations* — they're straightforward gaps that
fit cleanly within the existing L3/L4 block-composition model (Astro islands +
`blocks/customer/*` + `lib/api-ssr.ts` / `lib/cms.ts` split). No design change
required; flagging them here so CodeDeveloper doesn't have to re-derive this
from scratch or guess at the missing route.

### Conflicts with Existing Features

None. This is a gap-closure on an already-`In Progress` requirement; no other
FR claims ownership of `/events/[id]` or its sub-blocks. `FR-REG-001`
(registration flow) is correctly referenced by the FR's own functional scope
item 4 (registration sidebar) as an external dependency, not a conflict.

### Architectural Feasibility

Feasible, no deviation from the canonical stack needed:
- Astro 5 SSR page (`prerender = false`) — already the pattern in both V1 and
  V2's `[id].astro`.
- Directus reads for content (speakers/materials/sponsors/photos/forum-reads)
  via `lib/cms.ts`, matching the "no cross-schema queries" and "fetch via the
  owning service" architecture rules (`docs/04-development/architecture/architecture.md`
  §Data ownership, §Module boundaries) — Directus owns its own schema, V2 reads
  it directly for public content exactly as V1 did, no NestJS mediation
  required for reads.
- Forum-post writes correctly go through the NestJS API
  (`EventQuestionsController`, auth-guarded) — this split (anonymous reads via
  Directus, authenticated writes via Nest) is already established in V2 and
  should be preserved, not restructured.
- OG card route is a standalone Astro API route (`.png.ts`), same pattern as
  V1, no new infra.
- No new inviolable-rule conflicts: single monorepo, module boundaries, tenant
  scoping via `Host` header are all respected by the recommended path.

## Formalized Requirement

**FEAT-EVT-004** (existing `FR-EVT-004`, no renumbering needed — this is a
gap-closure, not a new requirement). Cross-refs: `FR-EVT-001` (Event CRUD,
depends-on), `FR-REG-001` (Registration flow, depends-on), `FR-SPK-001`
(Speaker profiles, depends-on) — all already listed as dependencies in
`requirements-registry.md` row 35. GitHub issue: [#130](https://github.com/aiqadam/ai-qadam-platform/issues/130).

Scope for this workflow: implement the 7 missing pieces named in the FR's Notes
— lifecycle-adaptive tabs, photos gallery, recap/livestream embed, venue+map
block, visibility gating, country-mismatch 404, OG card route — following V2's
own L3/L4 block-composition model, using V1 only as a structural/behavioral
reference, not a code source.

## Acceptance Criteria (draft)

Reuses the FR's own 8 ACs verbatim (already well-formed); adding derivation
notes for TestDesigner where the FR's Notes/my findings resolve an ambiguity:

- **AC-1**: Given an upcoming event (`now < startsAt`), when a visitor loads
  `/events/[id]`, then the page shows the registration sidebar, agenda,
  speakers, and sponsors.
- **AC-2**: Given a finished event (`now > endsAt`), when a visitor loads the
  page, then it shows the recap section (`recapMd`), recordings, and photos
  gallery.
- **AC-3**: Given a live event (`startsAt <= now <= endsAt`) with
  `livestreamUrl` set, when a visitor loads the page, then it shows the
  livestream embed and the "Live" chip.
- **AC-4**: Given a `members_only` event, when an unsigned visitor loads the
  page, then they see a sign-in prompt instead of full content (gated per the
  `isGated` pattern already used in V1 — must be ported, V2 currently fetches
  unconditionally).
- **AC-5**: Given a signed-in member on any lifecycle tab, when they post a
  question (≤2000 chars) on the Forum tab, then it appears immediately via
  optimistic prepend, reverse-chronological, pinned questions floating to top.
- **AC-6**: Given any event with venue data, when the page renders the venue
  block, then it shows an OSM iframe and working deep-links to Google Maps and
  Yandex Maps.
- **AC-7**: Given any published public event, when a scraper fetches
  `/events/[id]/og-card.png`, then it renders a 1200×630 PNG with title + date,
  cache-busted by `date_updated`, and returns 404 for non-public
  `visibilityScope`.
- **AC-8 (behavior change, not a port — see findings above)**: Given a request
  for an event that doesn't exist, isn't published, or belongs to a different
  country than the resolved tenant (`Host` header → `countryFromHost`), when
  the page is requested, then it returns an actual HTTP 404 — not the 302
  currently returned by both V1 and V2. Requires `fetchEvent` (wherever it
  ends up living) to distinguish "not found" from "found but gated by tenant"
  from "found and visible," or for the page to re-check `countryCode` after a
  successful fetch and 404 explicitly on mismatch.

## Gate Result

gate_result:
  status: passed
  summary: "FR-EVT-004 confirmed well-formed and architecturally feasible; business_process and github_issue frontmatter set; 3 ambiguities resolved and recorded in the FR; GitHub sync succeeded."
  findings:
    - "business_process set to [BP-UAT-010] (Event registration flow) — the only registered BP-UAT touching this page's surface (registration sidebar/CTA). No BP-UAT exists for forum Q&A, photos, lifecycle tabs, venue/map, or OG card in isolation — flagged as a registry gap for a future ISS-UAT-COV-* follow-up, not invented."
    - "github_issue frontmatter already present (https://github.com/aiqadam/ai-qadam-platform/issues/130); no edit needed there."
    - "BLOCKING FINDING for CodeDeveloper: V2's fetchEvent (lib/api-ssr.ts) targets GET /v1/events/:id, which has no NestJS controller anywhere in apps/api/src. Recommended fix: add fetchEvent to web-next/src/lib/cms.ts reading Directus directly, matching V1 precedent and every sibling V2 event sub-fetcher already in that file. Recorded in FR-EVT-004.md Notes."
    - "AC-8 (country-mismatch/not-found 404) is NEW behavior — neither V1 nor current V2 implements a real 404 today; both 302-redirect to /events on null. This must not be treated as a straight port."
    - "recapMd / livestreamUrl are missing from web-next/src/lib/types.ts ApiEvent — need adding, distinct from the existing externalLinks[].kind === 'livestream' field."
    - "event_photos has no V2 fetcher yet (lib/cms.ts) — needs porting from V1's fetchEventPhotos, Finished-tab only, gated by isGated."
    - "Lifecycle tab derivation confirmed: now < startsAt → upcoming; startsAt <= now <= endsAt → live; now > endsAt → finished. No new status field; existing draft/published/cancelled status is orthogonal."
    - "GitHub sync (scripts/sync-github-project.sh --ref FR-EVT-004 --status todo) succeeded: GITHUB_ISSUE_URL=https://github.com/aiqadam/ai-qadam-platform/issues/130 (matched --existing-url, confirming the two are already in sync)."
