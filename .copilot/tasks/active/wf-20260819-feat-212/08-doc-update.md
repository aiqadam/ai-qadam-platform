# Documentation Update — wf-20260819-feat-212

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/03-requirements/FR-CMS-007.md` | New file (whole document) | Created following the `FR-CMS-001.md`/`FR-CMS-002.md` frontmatter/section format (frontmatter: `code`, `name`, `status`, `module`, `phase`, `business_process`; body: Description, Users, Functional scope, Acceptance criteria, Notes). `status: Implemented` (new file created already-implemented — no prior draft status existed to flip). Added an "Architecture note (binding, not just historical)" section documenting that no NestJS `content/` module was created, cross-referencing the corrected architecture.md note. `business_process: —`, with an explicit Notes-section line stating all 21 `BP-UAT-*` scripts in `docs/02-business-processes/uat/registry.md` were checked and none covers a public marketing/content-page surface (per protocol.md's guidance not to invent a link). Acceptance criteria transcribed from AC-1..AC-11 in `01-requirement-validation.md`, checked `[x]` per the passed gate results in `03-code-summary.md`/`07-test-results.md`, with the two known content-completeness caveats (About Us leadership bios, Partners RU content) carried into the Notes section rather than hidden. |
| `docs/03-requirements/requirements-registry.md` | §Module Abbrev table, CMS row | Appended `· [007](FR-CMS-007.md)` to the CMS / Content module's file list. |
| `docs/03-requirements/requirements-registry.md` | §FR implementation order table | Added row 69: `FR-CMS-007 \| Public content pages — About Us, Community Rules & Documents, Events & History, Partner With Us \| Shipped \| CMS-001`. Depends-on set to `CMS-001` (the site-wide CMS/`site_settings` precedent this requirement extends), consistent with how `FR-CMS-002`/`FR-CMS-005`/`FR-CMS-006` each also list `CMS-001` or `—` as their sole dependency. |
| `docs/04-development/architecture/architecture.md` | §Module boundaries → NestJS API modules diagram | Removed the stale `content/  # Bridge to Directus for content reads` line (confirmed never built — no `apps/api/src/modules/content/` directory exists) and added a blockquote note directly under the diagram explaining the actual shipped pattern (Astro-SSR-direct-to-Directus via `apps/web-next/src/lib/cms.ts`), naming the FR that surfaced the discrepancy (`FR-CMS-007`, 2026-08-19) and clarifying `apps/api/src/modules/directus/`'s real (narrower, user-sync) scope so it isn't mistaken for a content bridge. |
| `docs/04-development/architecture/architecture.md` | §Data ownership table, `directus` schema row | "Who reads" cell corrected from `NestJS reads via Directus API` (inaccurate — no such NestJS code path exists) to describe the actual reader (`Astro (apps/web-next)` via direct Directus REST calls, server-side only), cross-referencing the Module boundaries note. "Who writes" (`Directus admin UI`) was already accurate and left unchanged. |

### Note on the architecture.md correction decision

`01-requirement-validation.md` and `02-impact-analysis.md` both flagged the
`content/` module-diagram line and the "NestJS reads via Directus API" Data
Ownership row as stale/inaccurate but explicitly left fixing architecture.md
itself "out of scope for this workflow" at the RequirementAnalyst/
ImpactAnalyzer step — reasonably so, since neither of those agents' roles
includes editing architecture docs, and doing so mid-implementation would
have been premature (the discrepancy wasn't yet confirmed against a shipped,
tested implementation).

That precondition is now satisfied: `03-code-summary.md`'s "Architecture Rule
Compliance" section reconfirms by inspection that no `content/` module was
created, and `07-test-results.md`'s gate passed. Per this agent's own role
definition (`.copilot/agents/doc-writer.md`: "Updates project documentation
to reflect the implemented requirement. Keeps architecture docs... current")
and process step 3 ("For architecture updates: Add to the relevant section.
Do not alter unaffected sections"), correcting this specific,
now-fully-verified inaccuracy is squarely this agent's job, not a separate
follow-up — the fix is two narrow, targeted edits (one diagram line removed
plus an explanatory note; one table cell corrected), not a rewrite of
unaffected sections, and leaving a docs-accuracy correction as a "future doc
pass" when the correcting agent is active in this very workflow would just
recreate the same stale-doc problem for the next reader. Made the correction
directly rather than deferring it.

## Documents Not Updated

| Document | Reason |
|---|---|
| `docs/api/` (OpenAPI supplement) | No NestJS route/endpoint was added, modified, or removed by this workflow (confirmed via `02-impact-analysis.md`'s empty "API Surface Changes" table and `03-code-summary.md`'s "no `apps/api/src/modules/content/` created"). Content is served by Directus's own REST API, which is not part of this repo's OpenAPI surface. |
| `docs/adr/` (new ADR) | No new cross-cutting architecture *decision* was made — this requirement follows an existing, already-decided pattern (Astro-SSR-direct-to-Directus, first established by `FR-CMS-001`/`FR-CMS-002`) rather than introducing a new one. The architecture.md correction above documents a factual correction to stale documentation, not a new decision requiring its own ADR. |
| `docs/04-development/standards.md` | No new coding convention was introduced. `content_pages.translations` (flat per-locale JSON) reuses the existing `events.translations` (`#326`) pattern rather than establishing a new one; the `marked` → `isomorphic-dompurify` render pipeline is page-content-specific implementation detail already covered by `docs/04-development/security/security.md`'s existing URL-scheme policy (see below), not a repo-wide standard. |
| `docs/04-development/security/security.md` | No new security rule was added — `render-markdown.ts`'s `ALLOWED_URI_REGEXP` (`/^(?:https?|mailto|tg):/i`) *implements* this file's existing, already-documented "https, mailto, tg" URL-scheme policy (per `03-code-summary.md`'s Retry 1 section); it doesn't introduce a new one. |
| `docs/runbooks/` | No new operational scenario (on-call/incident-response procedure) was introduced. The one operational nuance found during testing — `infrastructure/directus/seed-content-documents.sh`'s Windows `ARG_MAX` fix — is a local-dev-seeding script fix, already fully documented in `03-code-summary.md`'s "Retry 2" section, not a recurring operational procedure needing its own runbook. |
| `packages/shared-types/README.md` | This package/file does not exist in the repo (confirmed) and no shared-types schema was added by this workflow — the Directus-direct-SSR pattern has no DTO/shared-type surface between `apps/api` and `apps/web-next` for this content. |
| `docs/01-business/glossary.md` | No new domain term was introduced that isn't already self-explanatory from existing terms (About/Rules/History/Partners are plain page names, not new business vocabulary requiring a glossary entry). |
| `docs/02-business-processes/uat/registry.md` | Checked all 21 `BP-UAT-*` entries — none matches this requirement's public marketing/content-page surface (auth, events, registration, admin/ops, points, and referral flows only). No existing script's row needed a `Body`/`linked_issues` update, and authoring a brand-new BP-UAT script is outside DocWriter's role (that's BusinessAnalyst's scope, triggered separately if this surface later needs a formal UAT script). `FR-CMS-007.md`'s `business_process: —` reflects this. |

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    Created docs/03-requirements/FR-CMS-007.md following the existing
    FR-CMS-001/002 format, status Implemented, with business_process
    correctly left as — (verified against all 21 BP-UAT registry entries,
    none matching this public content-page surface — not invented).
    Added the FR-CMS-007 row to requirements-registry.md's Module Abbrev
    table and FR implementation order table (Status: Shipped, Depends on:
    CMS-001). Corrected architecture.md's module-boundary diagram and Data
    Ownership table, which both stated a NestJS content/ bridge module
    reads Directus — confirmed via 01-requirement-validation.md and
    03-code-summary.md that no such module exists or was built; the actual
    pattern (Astro SSR reads Directus directly) is now documented
    accurately in both places, narrowly scoped to the two specific
    inaccurate lines with no unaffected content altered. No duplication
    introduced; no other documentation surface required a change per the
    Documents Not Updated table above.
  documents_updated: 4
  documents_not_updated: 8
  duplication_check: passed
  unaffected_content_check: passed
  blocking: false
```
