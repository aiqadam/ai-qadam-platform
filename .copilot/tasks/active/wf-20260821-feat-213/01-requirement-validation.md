# Requirement Validation — FR-CMS-008

## Raw Input

> On the Community Rules & Documents page (FR-CMS-007, /rules and
> /rules/[slug]), each document detail page shows a source-attribution
> label (e.g. "AI Qadam Manifesto.docx") naming the original file the
> page's reflowed markdown content was sourced from. This label
> currently looks like a filename/link but has no download mechanism
> behind it — user-reported confusion: "I cannot download it."
>
> Add a real download link for the original source document next to
> (or replacing) that label, for all 5 content_documents rows
> (manifesto, charter-v0-1, kazakhstan-mou, global-board-polozhenie-v1,
> soglashenie-v1). Source .docx files are available locally at
> portal-content/20260819/ (gitignored, not part of this diff — same
> source material FR-CMS-007 used) and need to be uploaded as Directus
> file assets, then linked to their corresponding content_documents row.
>
> Follow the existing pattern this codebase already uses for
> file-to-collection relations (see infrastructure/directus/bootstrap.sh:
> partners.logo, speakers.photo, sponsors.logo — all
> `related_collection: directus_files` with `on_delete: SET NULL`): add
> a new `source_file` field on `content_documents` relating to
> `directus_files.id`, upload the 5 source files via Directus's file
> upload API, set each row's `source_file`, and render an actual
> download link (using the file's real filename/extension, e.g. "AI
> Qadam Manifesto.docx") on the /rules/[slug] page next to the existing
> source_document_label text — do not remove the existing label, add
> the link alongside or make the label itself the link target.
>
> Design-system compliance required per
> docs/04-development/design-system/Design system for AI agents/readme.md
> (existing component classes, Lucide icons only — e.g. a download icon
> if one is used, no raw hex).
>
> This is scoped narrowly to Community Rules & Documents' 5 governance
> documents. Do NOT extend to Events & History, Partner With Us, or
> About Us — those pages don't have this source-attribution-without-link
> pattern and are out of scope for this fix.

(Verbatim from `handoff.yaml`'s `requirement_text` field, workflow `wf-20260821-feat-213`.)

## Analysis

### Completeness Issues Found

None blocking. The raw input is unusually complete for an intake requirement — it already names the target collection, the exact field to add, the exact relation pattern to follow (with three cited precedents), the exact 5 rows in scope, the exact page to modify, and an explicit non-goal (don't extend to the other three FR-CMS-007 pages). One gap needed resolving, addressed below rather than kicked back as `needs-clarification`:

- **Provisioning mechanism was described but not classified against this repo's own conventions.** The raw input says "upload the 5 source files via Directus's file upload API" without saying *how* that upload is invoked (CI step? application code? manual script?). Resolved by inspecting `infrastructure/directus/seed-content-documents.sh` — FR-CMS-007's own analogous one-time content-provisioning step is a standalone, idempotent, operator-run bash script (not application code, not a CI step), invoked manually with `DIRECTUS_URL`/`DIRECTUS_TOKEN` env vars against a target environment. This FR follows the identical shape: extend (not replace) that script, or add a sibling script alongside it. See Architectural Feasibility below for the concrete file-level plan.

### Conflicts with Existing Features

None found. Searched `docs/03-requirements/` for any existing FR touching `content_documents`, `source_file`, download links, or file-relation additions to CMS collections — only `FR-CMS-007.md` (the parent requirement this extends) references `content_documents`, and it explicitly ships `source_document_label` as a **label**, not a link:

> `source_document_label` (e.g. "AI Qadam Charter v0 1.docx")... note: "Original filename / source reference shown on the detail page"

FR-CMS-007's own acceptance criteria never claim this label is downloadable — it's a citation string. This requirement is additive (a new field + a new rendered element alongside the existing label), not a correction of a defect in FR-CMS-007's own scope. No FR-CMS-008 file exists yet in `docs/03-requirements/` — confirmed via directory listing.

### Architectural Feasibility

**Feasible. No architectural violations.** Checked against `docs/04-development/architecture/architecture.md`'s module-boundary rules and the FR-CMS-007 precedent (which itself documents that content reads bypass NestJS entirely via `apps/web-next/src/lib/cms.ts` direct-to-Directus SSR fetches — the same pattern this FR extends, no new module required).

**1. Schema change — new `source_file` field, `content_documents` collection.**
Confirmed exact precedent in `infrastructure/directus/bootstrap.sh`: every existing file-relation field (`partners.logo` L724/735-738, `speakers.photo` L952-955, `sponsors.logo` L904-907, `event_materials.file` L4496-4499, `marketing_assets.file` L2795-2798) follows a two-part pattern:
  - A `uuid`-typed, nullable field on the owning collection (`interface: "file-image"` for image fields; plain `"file"` interface is the analogous choice for a non-image document — `event_materials.file` and `marketing_assets.file` are the closer precedents since `.docx` isn't an image).
  - A separate `ensure "relation <collection>.<field> -> directus_files.id"` block: `{"collection":"content_documents","field":"source_file","related_collection":"directus_files","schema":{"on_delete":"SET NULL"}}`.

  `SET NULL` (not `RESTRICT`) is the right choice here — matches `partners.logo`/`speakers.photo`/`sponsors.logo`/`event_materials.file` (optional, decorative-to-content-integrity relations) rather than `marketing_assets.file`'s `RESTRICT` (where the file *is* the primary content). If a `directus_files` row is later deleted, the `content_documents` row and its `body_md` remain fully intact and servable — only the download link disappears — which matches this FR's own framing (the link is an *addition* to an already-complete content row, not a load-bearing dependency).

  This addition goes in `infrastructure/directus/bootstrap.sh`, appended to the existing `content_documents` collection block (~line 5750-5782) as a new field entry plus a new relation `ensure` block immediately after, following the exact placement convention already used for every other file-relation field in the file.

**2. Public field allowlist.** The existing FR-CMS-007 public-read permission grant (bootstrap.sh ~L5798-5800) explicitly enumerates readable fields for `content_documents`:
  ```
  ["id","slug","status","title","source_document_label","status_label","body_md","display_order"]
  ```
  `source_file` must be appended to this array or the new field will silently return `null` to anonymous public requests even after being set — this is an easy miss and is called out explicitly as an AC below. No new `directus_files` collection-level public-read grant is needed: none of the existing file-relation precedents (`partners.logo`, `event_materials.file`, etc.) have one either — Directus serves `/assets/:id` for non-private files without requiring `directus_files` item-read permission, which is how every existing file-download/display feature in this codebase already works. This FR doesn't need to establish new precedent here, only follow it.

**3. One-time content provisioning (upload + link 5 files) — belongs in `seed-content-documents.sh`, not application code.** This is the same class of operation FR-CMS-007 itself solved with `infrastructure/directus/seed-content-documents.sh`: a standalone, idempotent, operator/infra-workflow-run bash script, not CI-invoked, not application code, gated on `DIRECTUS_URL`/`DIRECTUS_TOKEN` env vars, run manually against a target environment after `bootstrap.sh`. The correct approach is to **extend that existing script** (not invent a new mechanism) with an upload-and-link step per row:
  - `POST {DIRECTUS_URL}/files` (multipart) with the local `.docx` from `portal-content/20260819/<filename>` — mirrors the "file upload API" language in the raw requirement.
  - Capture the returned file UUID, then `PATCH {DIRECTUS_URL}/items/content_documents/<row-id>` (or fold into the existing per-row PATCH/POST payload) to set `source_file` to that UUID.
  - Idempotency matters here the same way it already matters for the script's existing body_md upsert (re-running must not create duplicate `directus_files` rows on every run) — the script should look up whether the row already has a non-null `source_file` (or match on `filename_download`) before re-uploading, same spirit as the existing `existing_id` slug lookup at L73-77.
  - The 5 source filenames are already known exactly from the existing `seed_content_document` calls' `source_label` arguments (L104-115) and were confirmed present at `portal-content/20260819/` in this session: `AI Qadam Manifesto.docx`, `AI Qadam Charter v0 1.docx`, `AI_Qadam_Kazakhstan_MoU-2105 (3).docx`, `AI Qadam Global Board Положение (2).docx`, `AI Qadam Soglashenie v1 (2).docx`.
  - This script is **not part of the CI/build path** and is **not a blocking precondition for merging the PR** — same operational treatment as FR-CMS-007's seeding step. The PR ships the schema change, the script change, and the frontend change; an operator (or infra workflow) runs the script against each target environment (local/staging/prod) afterward, same as `seed-content-documents.sh` already requires today for `body_md` content. This must be called out in the PR description exactly as FR-CMS-007's own PR presumably did (Body seeding is a manual/infra-workflow post-merge step, not CI-gated).

**4. Frontend rendering.** `apps/web-next/src/pages/rules/[slug].astro` (read in full) currently renders `doc.sourceDocumentLabel` as inert text at line 62-64. `apps/web-next/src/lib/cms.ts`'s `CmsContentDocument`/`CmsContentDocumentRow`/`normalizeContentDocumentRow`/`CONTENT_DOCUMENT_DETAIL_FIELDS` (lines 1068-1146) need a new `sourceFileUrl: string | null` derived field, built with the exact same `${directusBase()}/assets/${fileId}` pattern already used three times elsewhere in this same file (`row.hero_image` L286, `event_materials.file` L448, `marketing_assets.file`/`.thumbnail` via the existing-but-private `assetUrl()` helper L845-848). Reusing or promoting `assetUrl()` (currently module-private, used only by the marketing-assets section) is a natural, low-risk implementation choice left to CodeDeveloper — either inline the same one-line ternary already used twice elsewhere, or export `assetUrl()` for reuse; both are consistent with existing code, so this is not prescribed as an AC.

  Rendering precedent for "real download link, real filename": `MaterialsList.astro` (`apps/web-next/src/blocks/customer/MaterialsList.astro`) is the closest existing block — a plain `<a href={fileUrl} target="_blank" rel="noopener noreferrer">` styled with existing card/pill classes, no icon. `press.astro` renders bare-text "Download {label}" links with no icon at all. Both are precedent for a no-icon plain link being fully compliant with this codebase's design-system usage today — the raw requirement's "a download icon **if one is used**" is conditional, not mandatory, so CodeDeveloper may choose plain text (`press.astro`-style) or a Lucide `Download` icon (confirmed available and already imported directly into `.astro` files from `lucide-react`, e.g. `apps/web-next/src/pages/workspace/integrations/telegram/index.astro:11`) — either satisfies design-system compliance as long as no raw hex/new tokens are introduced.

**5. Graceful absence.** Not all 5 rows may have `source_file` set at the moment the PR merges (upload is a separate, operator-run, post-merge step per point 3) — the page must not error or show a broken/dead link when `sourceFileUrl` is null; it must render exactly as it does today (label-only, no link) until the seed script has run for that row. This mirrors FR-CMS-007's own resilience posture (`sourceDocumentLabel &&` conditional already guards the label itself at line 62) and is captured as an AC below.

**No violations found:**
- No new NestJS module or `apps/api` surface required — matches FR-CMS-007's own binding architecture note that content reads bypass the API layer entirely.
- No cross-schema query — `source_file` relates within the same Directus instance/schema (`content_documents` → `directus_files`), identical in kind to every existing precedent cited.
- No monorepo-boundary issue — touches only `infrastructure/directus/` (schema + seed script) and `apps/web-next/` (page + lib), consistent with FR-CMS-007's own footprint.
- `pnpm db:migrate` is not implicated — this is a Directus-managed schema (via bootstrap.sh's REST calls against Directus's own metadata API), not a Postgres/Prisma-style migration file, so the CLAUDE.md rule "never run `pnpm db:migrate` automatically" does not apply here; nothing in this FR touches that migration path.

### Completeness Assessment (5 criteria)

- **Specific** — yes. Exact field name, exact collection, exact relation semantics, exact 5 rows, exact page, exact non-goals.
- **Testable** — yes, see draft ACs below (each is independently verifiable via Directus schema inspection, HTTP fetch, or page render).
- **Non-conflicting** — confirmed against FR-CMS-007 and the full requirements registry; no other FR touches this surface.
- **Scoped to one module layer** — yes, single module (CMS), spans its two conventional layers (Directus schema/infra script + Astro frontend), matching FR-CMS-007's own footprint exactly. No `apps/api` layer touched.
- **Referenced** — will link back to `FR-CMS-007.md` as the parent/extended requirement.

## Formalized Requirement

**FEAT-CMS-8** / **FR-CMS-008** — Community Rules & Documents source-file download link

> Extends FR-CMS-007. On `/rules/[slug]`, the existing `source_document_label`
> text (e.g. "AI Qadam Manifesto.docx") gains an adjacent, real download link
> to the original source file for all 5 `content_documents` rows. Adds a new
> `source_file` field (uuid, nullable, relation to `directus_files.id`,
> `on_delete: SET NULL`) to the `content_documents` Directus collection,
> following the exact pattern of `partners.logo` / `speakers.photo` /
> `sponsors.logo` in `infrastructure/directus/bootstrap.sh`. The 5 source
> `.docx` files are uploaded and linked via a manual/infra-workflow-run
> extension to `infrastructure/directus/seed-content-documents.sh` (the same
> operational class as FR-CMS-007's own body_md seeding step — not CI-gated,
> not application code). `apps/web-next/src/lib/cms.ts`'s
> `fetchContentDocument`/`fetchContentDocuments` gain a derived
> `sourceFileUrl` field; `apps/web-next/src/pages/rules/[slug].astro` renders
> it as a real `<a href>` download link next to (not replacing) the existing
> label, only when set — never a broken link, never removing the label.

**Cross-references:** Extends `FR-CMS-007` (parent — Community Rules &
Documents page and `content_documents` collection origin). No other FR
depends on or conflicts with this one. Registry entry to add: CMS module,
next number after FR-CMS-007 (confirmed via
`docs/03-requirements/requirements-registry.md`'s Module Abbrev table — CMS's
last entry is 007, and no `FR-CMS-008.md` exists yet).

## Acceptance Criteria (draft)

- **AC-1**: Given the `content_documents` Directus collection after
  `bootstrap.sh` runs, when its schema is inspected, then a `source_file`
  field exists (type `uuid`, nullable) with a relation to `directus_files.id`
  and `on_delete: SET NULL` — matching the exact shape of
  `partners.logo`/`speakers.photo`/`sponsors.logo`.

- **AC-2**: Given the FR-CMS-007 public-read permission grant for
  `content_documents` (the `$t:public_label` policy), when its allowed
  `fields` array is inspected after this change, then `source_file` is
  included alongside the existing 8 fields — an anonymous public API request
  for a published row returns a non-null `source_file` value once the row has
  one set.

- **AC-3**: Given `infrastructure/directus/seed-content-documents.sh` (or a
  sibling script under `infrastructure/directus/`) extended per this
  requirement, when run with `DIRECTUS_URL`/`DIRECTUS_TOKEN` against an
  environment where `bootstrap.sh` has already run, then all 5 source files
  (`AI Qadam Manifesto.docx`, `AI Qadam Charter v0 1.docx`,
  `AI_Qadam_Kazakhstan_MoU-2105 (3).docx`,
  `AI Qadam Global Board Положение (2).docx`,
  `AI Qadam Soglashenie v1 (2).docx`) are uploaded as `directus_files` assets
  and each corresponding `content_documents` row (`manifesto`,
  `charter-v0-1`, `kazakhstan-mou`, `global-board-polozhenie-v1`,
  `soglashenie-v1`) has its `source_file` set to the matching uploaded file's
  id.

- **AC-4**: Given the script from AC-3 is run a second time against the same
  environment, when it completes, then no duplicate `directus_files` rows are
  created for files already uploaded and linked (idempotent, matching the
  existing slug-based idempotency of `seed_content_document`'s body_md
  upsert).

- **AC-5**: Given a `content_documents` row with `source_file` set, when
  `/rules/[slug]` is rendered for that row's slug, then a real, working
  download link is shown pointing at that file (e.g.
  `{DIRECTUS_URL}/assets/{fileId}`), rendered using only existing
  design-system component classes (no raw hex, no new CSS tokens) — a Lucide
  icon is permitted but not required, consistent with existing precedent
  (`MaterialsList.astro`, `press.astro`).

- **AC-6**: Given the link in AC-5, when a user activates it, then the
  browser downloads (or opens, per browser/MIME handling) the original
  `.docx` file with its real filename/extension preserved (e.g. "AI Qadam
  Manifesto.docx") — not a generic/renamed/truncated filename.

- **AC-7**: Given the existing `source_document_label` text on
  `/rules/[slug]`, when this requirement ships, then that label is still
  rendered exactly as before (not removed, not replaced) — the download link
  is additive, shown alongside it.

- **AC-8**: Given a `content_documents` row where `source_file` is still
  null (e.g. before the seed script in AC-3 has been run against that
  environment), when `/rules/[slug]` is rendered for that row's slug, then
  the page renders exactly as it does today — label only, no broken link, no
  error, no 500.

- **AC-9**: Given the 3 other FR-CMS-007 pages (`/about`, `/history`,
  `/partners`), when this requirement ships, then none of them are modified
  — this fix is scoped exclusively to `content_documents` /
  `/rules/[slug]`.

- **AC-10**: Given the full test/build gate, when `pnpm arch:check`,
  `astro check`, and `pnpm build` are run, then all pass with no new
  violations (matching FR-CMS-007's own AC-10 bar).

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    FR-CMS-008 formalized: specific, testable, non-conflicting, scoped to
    the CMS module, and architecturally feasible via a fully precedented
    implementation path.
  findings:
    - "No conflicts with FR-CMS-007 or any other requirement in docs/03-requirements/; FR-CMS-008 is free (CMS module's last entry is 007, no 008 file exists)."
    - "New content_documents.source_file field follows the exact file-relation pattern already used 5x in infrastructure/directus/bootstrap.sh (partners.logo, speakers.photo, sponsors.logo, event_materials.file, marketing_assets.file) — uuid field + separate relation ensure block, on_delete: SET NULL (matches the optional/decorative precedents, not marketing_assets.file's RESTRICT)."
    - "source_file must be appended to the existing FR-CMS-007 public-read field allowlist (bootstrap.sh ~L5798-5800) or it will silently return null to public requests — called out as AC-2, easy to miss."
    - "One-time file upload + row-linking belongs in infrastructure/directus/seed-content-documents.sh (extend it), matching FR-CMS-007's own precedent of a standalone, idempotent, operator/infra-workflow-run script — not CI-gated, not application code."
    - "Frontend: apps/web-next/src/lib/cms.ts needs a derived sourceFileUrl using the same ${directusBase()}/assets/${fileId} pattern already used 3x in that file; apps/web-next/src/pages/rules/[slug].astro renders it as an additive link next to (not replacing) the existing source_document_label, gracefully absent when source_file is unset."
    - "All 5 source .docx files confirmed present locally at portal-content/20260819/ with filenames matching seed-content-documents.sh's existing source_document_label values exactly."
    - "No apps/api / NestJS surface required — matches FR-CMS-007's own binding architecture note that content reads bypass the API layer entirely."
```
