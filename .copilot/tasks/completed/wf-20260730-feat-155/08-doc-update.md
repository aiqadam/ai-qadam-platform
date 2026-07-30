# Doc Update — FR-EVT-004 (Event detail page gap-closure)

Workflow: `wf-20260730-feat-155` · Agent: DocWriter

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/03-requirements/FR-EVT-004.md` | Frontmatter `status:` | Flipped `In Progress` → `Implemented`. |
| `docs/03-requirements/FR-EVT-004.md` | Frontmatter `phase:` | Updated stale `Rebuild Phase 1 (V2, In Progress)` → `Rebuild Phase 1 (V2, Implemented)` (directly tied to the same status flip; leaving it would contradict the new `status:` on the same file). |
| `docs/03-requirements/FR-EVT-004.md` | Acceptance criteria | Checked AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-8 (`[ ]` → `[x]`) per `07-test-results.md`'s confirmed E2E (AC-7/AC-8, both automated + independent manual curl/diff/hex verification) and manual spot-check coverage (AC-1/2/3/4/6, per `03-code-summary.md`/`04-security-review.md`'s direct source reads of `EventDetail.astro`/`VenueMap.astro`/the `isGated` gate). Left AC-5 (forum posting) **unchecked** and annotated inline `**(no E2E coverage — see Notes)**` — TestDesigner/TestRunner's own test results only exercise AC-7/AC-8 automatically and spot-check AC-1–4/6 manually; AC-5's write path (question posting, optimistic prepend) was not exercised at all this workflow, automated or manual, so it is not marked verified-by-this-workflow. |
| `docs/03-requirements/FR-EVT-004.md` | `## Notes` | Replaced the stale "V2 status: ... photos, recap/livestream embed, and map are not yet ported" note (all three shipped this workflow) with a current-state summary naming every new block/route/design decision and pointing to `03-code-summary.md` for detail. Updated the `isGated` note to reflect it's now a verified fetch-level gate, not just "must be ported." Added a new `### Known gaps (not blocking Implemented status, tracked for follow-up)` subsection recording: (1) AC-5 has no E2E coverage, with a named follow-up (`smoke-event-forum-posting.spec.ts`); (2) `invite_only` currently behaves identically to `members_only` per the Directus schema's own "accessible only via direct link share" design — explicitly noted as not-a-bug but a product-decision point; (3) `apps/api` has no public `GET /v1/events` listing route (pre-existing, unrelated to this FR, but the reason 8/14 E2E scenarios fall back to `test.skip`); (4) JSON-LD `Event` schema / `og:type=event` was not added (out of the 11 enumerated tasks, not referenced by any AC). Left the existing `### Architectural findings from requirement validation` subsection untouched (still accurate historical record of the Step-1 decisions, not stale). |
| `docs/03-requirements/requirements-registry.md` | FR implementation order table, row 35 | `Status` column: `In Progress` → `Shipped`. |
| `docs/04-development/architecture/wiring-map.md` | `### events` source, `ssr_fetcher`/`api_endpoint`/`fallback` | Corrected stale entry: previously claimed `fetchEvent` lives in `apps/web-next/src/lib/api-ssr.ts` calling `GET /v1/events/:id` on the NestJS API. That route never existed and the code was dead. Now documents `fetchEvent`'s actual current location (`lib/cms.ts`, reads Directus `/items/events/:id` directly, matching V1 and every sibling V2 fetcher) and the corrected fallback behavior (real 404 via `new Response('not_found', {status: 404})` for not-found/unpublished/wrong-country, replacing the old 302-to-`/events` description). |
| `docs/04-development/architecture/wiring-map.md` | `### event_photos` | Was a placeholder ("filled in a future finished-tab follow-up"). Replaced with a live entry: `EventPhotoGallery` block, `fetchEventPhotos(eventId)` in `lib/cms.ts`, Finished-tab-only, gated by `isGated`, `[]` fallback — matching the format of the other now-live sibling sources (`event_speakers`, `event_materials`, etc.) in the same file. |

## business_process frontmatter — confirmed, not changed

`business_process: [BP-UAT-010]` in `FR-EVT-004.md` was already set at Step 1
(requirement-validation) and still accurately reflects the final diff: the
registration sidebar/CTA (the only surface `BP-UAT-010` covers) is present on
this page across all lifecycle tabs (Upcoming: full sidebar; Live: check-in
mode; Finished: "You attended" state) per `03-code-summary.md`'s description
of `EventDetail.astro`. No edit needed.

## Documents Not Updated

- **`docs/04-development/architecture/architecture.md`** — considered, not
  changed. Searched for `satori`/`resvg`/`geist`/`og-card`/dependency-vetting
  sections; none exist as a pattern this workflow would extend (V1's
  `apps/web` has depended on the identical `satori`/`@resvg/resvg-js`/`geist`
  versions in production already, with no dedicated architecture.md mention
  of them there either — so adding one now for V2's port would be
  introducing a new documentation pattern, not fixing a stale one). The
  `fetchEvent`-moved-to-`cms.ts` decision and the "no cross-schema queries /
  Directus owns its own schema, read directly for public content" rule this
  workflow follows were both already correctly documented in
  `architecture.md`'s existing Data-ownership / Module-boundaries sections
  (confirmed by `01-requirement-validation.md`'s own citation of those
  sections) — no new rule was introduced, so no edit was needed there. The
  wiring-map.md updates above are the correct and sufficient place for the
  concrete fetcher/route change per that file's own stated purpose ("CI rule
  enforces it" for exactly this kind of data-wiring change).
- **`packages/shared-types/README.md`** — not touched. No new shared-types
  schema was introduced by this workflow (confirmed via `03-code-summary.md`:
  all type changes are additions to `apps/web-next/src/lib/types.ts`, a
  web-next-local file, not `packages/shared-types`).
- **New ADR** — not created. This gap-closure introduces no new architectural
  decision beyond what `01-requirement-validation.md` already resolved as
  "straightforward gaps that fit cleanly within the existing L3/L4
  block-composition model" — explicitly "no architecture violations" and "no
  design change required" per that file's own Architectural Feasibility
  section. Not ADR-worthy.
- **`docs/04-development/standards.md`** — not touched. No new coding
  convention was introduced; the one convention-adjacent decision (named
  slots over props-with-JSX, `Fragment slot=` for multi-element named slots)
  is an application of an *existing* established pattern already used
  elsewhere in `EventDetail.astro` itself (per `03-code-summary.md`'s Key
  Design Decision #4/#6), not a new one worth codifying.
- **`docs/04-development/security/security.md`** — not touched. No new
  security rule was introduced; `04-security-review.md` confirmed all
  applicable existing invariants (INV-1 through INV-11) pass or are N/A, with
  zero BLOCKER/MAJOR findings — this is compliance with existing rules, not a
  new one.
- **`docs/runbooks/`** — not touched. No new operational scenario (deploy
  step, incident procedure, manual runbook) was introduced by an SSR
  page/route change of this kind.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Atomic FR status flip completed and verified via git status (both files show as modified, not just described): FR-EVT-004.md status frontmatter In Progress → Implemented (phase frontmatter's stale V2 sub-status corrected too), AC checkboxes updated to reflect actual verified-vs-unverified state per 07-test-results.md (AC-1/2/3/4/6/7/8 checked, AC-5 left unchecked with an inline no-E2E-coverage annotation since forum posting was not exercised this workflow), and the Notes section replaced/extended: stale 'photos/recap/map not yet ported' note replaced with the current shipped-state summary, plus a new Known-gaps subsection recording AC-5's missing E2E coverage, invite_only's current members_only-equivalent behavior (by Directus schema design, not a bug), and apps/api's pre-existing missing public GET /v1/events listing route. requirements-registry.md row 35 Status column updated In Progress → Shipped. business_process: [BP-UAT-010] confirmed still accurate against the final diff (registration sidebar present across all lifecycle tabs) — no edit needed. Additionally corrected two stale entries in docs/04-development/architecture/wiring-map.md (events source's ssr_fetcher/api_endpoint/fallback, which still described the removed dead fetchEvent-via-NestJS code path and the old 302 redirect; and the event_photos placeholder, now a live entry) since ADR-0038 mandates this file track data-wiring changes and both entries directly described code this workflow changed. architecture.md, standards.md, security.md, packages/shared-types/README.md, and docs/runbooks/ were considered and correctly left untouched — no new module boundary, shared-types schema, coding convention, security rule, or operational scenario was introduced by this gap-closure. GitHub sync (scripts/sync-github-project.sh --ref FR-EVT-004 --status implemented --existing-url .../issues/130) succeeded: GITHUB_ISSUE_URL=https://github.com/aiqadam/ai-qadam-platform/issues/130."
  findings: []
```
