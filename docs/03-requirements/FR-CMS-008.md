---
code: FR-CMS-008
name: Community Rules & Documents — original source-file download link
status: Implemented
module: CMS / Content (CMS)
phase: Rebuild Phase 3 (V2)
business_process: —
---

## Description

Extends [`FR-CMS-007`](FR-CMS-007.md). On the Community Rules & Documents detail
page (`/rules/[slug]`), the existing `source_document_label` text (e.g. "AI Qadam
Manifesto.docx") names the original file each page's reflowed markdown was
sourced from, but had no download mechanism behind it — reported by a user as
"I cannot download it."

This requirement adds a real download link for the original `.docx`, rendered
**alongside** (never replacing) that label, for all five `content_documents`
rows. Source files are stored as Directus file assets in a dedicated
public-read folder and linked to their row via a new `source_file` relation.

Scoped narrowly to the five governance documents. The three other FR-CMS-007
pages (`/about`, `/history`, `/partners`) are explicitly out of scope — they do
not have this source-attribution-without-link pattern.

## Users

Content editors / operators (upload + link source files via the seed script);
Public (download, unauthenticated).

## Functional scope

1. **`content_documents.source_file` field** — new `uuid`, nullable field with a
   relation to `directus_files.id` and `on_delete: SET NULL`, added in
   `infrastructure/directus/bootstrap.sh`. Follows the existing file-relation
   pattern already used by `partners.logo`, `speakers.photo`, `sponsors.logo`,
   `event_materials.file`. `interface: "file"` (not `"file-image"`) — the
   non-image precedents, since `.docx` is not an image. `SET NULL` rather than
   `RESTRICT`: if the asset is ever deleted the row and its `body_md` stay fully
   servable and the page degrades to label-only.
2. **Public-read allowlist append** — `source_file` is appended to the
   FR-CMS-007 `content_documents` public-read `fields` array. Without it the
   field exists and is settable via an admin token but silently serialises as
   absent on anonymous reads. The line carries an inline do-not-trim comment.
3. **`public-documents` Directus folder + scoped `directus_files` read grant** —
   `bootstrap.sh` creates a folder with a hardcoded, client-supplied UUID
   (`PUBLIC_ASSET_FOLDER_ID`) and grants the Public policy `read` on
   `directus_files` **filtered to that folder**
   (`{"folder":{"_eq":"<id>"}}`) with an explicit six-field allowlist
   (`id`, `filename_download`, `type`, `filesize`, `title`, `folder`) — never
   `permissions: {}`, never `fields: ["*"]`. See the Directus asset-permission
   note below for why this is required rather than optional.
4. **Seed-script upload pass** — `infrastructure/directus/seed-content-documents.sh`
   gains `find_existing_file_id()` and `attach_source_file()`, called once per
   seeded row. Each source `.docx` is uploaded via `POST /files` (multipart,
   with `-F folder=` ordered **before** the `file` part — Directus applies
   already-parsed fields to the file it creates, so a `folder` part sent after
   the payload is silently ignored and the asset lands outside the grant), then
   the row's `source_file` is PATCHed to the returned UUID. Idempotency is a
   three-stage check: row already linked → reuse an existing **folder-scoped**
   `filename_download` match → only then upload. The whole pass is best-effort
   and never fails the seed, so the script stays runnable on CI and on checkouts
   without the gitignored `portal-content/` directory.
5. **`sourceFileUrl` derivation** — `apps/web-next/src/lib/cms.ts` gains
   `publicAssetUrl()` (always `PUBLIC_DIRECTUS_URL`-based, never the realm-
   dependent internal Docker host) and `sourceFileDownloadUrl()`, which appends
   Directus's `?download` flag. `source_file` is added to
   `CONTENT_DOCUMENT_LIST_FIELDS` (inherited by the detail constant) and mapped
   in `normalizeContentDocumentRow`.
6. **Rendering** — `apps/web-next/src/pages/rules/[slug].astro` wraps the
   existing label `<p>` and a new conditional `<a href download>` in one flex
   row, itself guarded on `(sourceDocumentLabel || sourceFileUrl)` so a row with
   neither renders byte-identically to before. Plain link, no icon, matching the
   `MaterialsList.astro` / `press.astro` precedents and the caption-weight
   metadata line it sits beside. Copy is i18n'd (`rules.download_source`, ru+en).

## Architecture note

No `apps/api` / NestJS surface is added or changed. Content reads continue to
bypass the API layer entirely via `apps/web-next/src/lib/cms.ts`'s
direct-to-Directus SSR fetch, exactly as FR-CMS-007's own binding architecture
note establishes. No Drizzle/Postgres migration is implicated — the
`content_documents → directus_files` relation lives entirely within the
Directus-managed schema.

## Directus asset-permission note (corrects a prior assumption)

FR-CMS-008's own analysis chain initially inherited the belief that **"Directus
serves `/assets/:id` for non-private files without requiring a `directus_files`
item-read permission."** This is **empirically false** on this stack. Tested
against a live, already-bootstrapped Directus 11 instance, an anonymous
`GET /assets/<id>` returned:

```
403 Forbidden
{"errors":[{"message":"You don't have permission to access collection
\"directus_files\" or it does not exist. Queried in root.",
"extensions":{"code":"FORBIDDEN"}}]}
```

`bootstrap.sh` had twelve `related_collection: directus_files` **relation**
blocks but zero `directus_files` **permission** grants — relations are not
permissions. The cited "existing precedent" (`partners.logo`,
`event_materials.file`, `marketing_assets.file`, …) was never proven working:
those collections are all empty, so no anonymous asset had ever actually been
served by this stack.

**Consequence for any future requirement:** shipping a public asset from
Directus requires an explicit `directus_files` read grant. That grant MUST be
**scoped** — an unfiltered one lets an anonymous `GET /files` enumerate every
asset in the instance, including future private uploads, which would itself be
a security finding. The folder-filter + field-allowlist form used here
(Functional scope §3) is the pattern to copy. It was verified against eight
bypass probes: filter inversion (`filter[folder][_null]`, `filter[folder][_neq]`),
`fields=*`, explicit private-field requests (`storage`, `filename_disk`,
`uploaded_by`, `metadata` → 403), `limit=-1`, `aggregate[count]` (constrained —
no count-oracle side channel), and relational traversal through `source_file`.
`GET /folders` is 403, so the folder id is not even discoverable — and its
confidentiality is not load-bearing anyway, since the boundary is the
server-side filter.

## Acceptance criteria

- [x] `content_documents` has a `source_file` field (`uuid`, nullable) with a
      relation to `directus_files.id` and `on_delete: SET NULL`, matching the
      existing file-relation precedents in `bootstrap.sh`.
- [x] `source_file` is included in the `content_documents` public-read `fields`
      allowlist — an anonymous API request for a published row returns a
      non-null `source_file` once the row has one set.
- [x] `seed-content-documents.sh`, run with `DIRECTUS_URL`/`DIRECTUS_TOKEN`
      against an environment where `bootstrap.sh` has already run, uploads all
      five source `.docx` files as `directus_files` assets and sets each
      matching row's (`manifesto`, `charter-v0-1`, `kazakhstan-mou`,
      `global-board-polozhenie-v1`, `soglashenie-v1`) `source_file` to the
      uploaded file's id.
- [x] Re-running that script creates no duplicate `directus_files` rows for
      files already uploaded and linked (idempotent).
- [x] A row with `source_file` set renders a real, working download link on
      `/rules/[slug]`, using only existing design-system component classes — no
      raw hex, no new CSS tokens.
- [x] Activating that link downloads the original `.docx` under its real
      filename (e.g. "AI Qadam Manifesto.docx") — verified live as
      `Content-Disposition: attachment; filename="AI Qadam Manifesto.docx"`.
- [x] The existing `source_document_label` text is still rendered exactly as
      before — the download link is additive, shown alongside it.
- [x] A row where `source_file` is still null renders exactly as it did before
      this requirement — label only, no broken link, no error, no 500.
- [x] None of `/about`, `/history`, or `/partners` is modified.
- [x] `pnpm arch:check`, `astro check` / typecheck, and `pnpm build` all pass
      with no new violations.

## Operator note — shipping this PR does NOT make downloads work

**Two operator steps are required per environment, in this order, before any
download link appears.** Neither is CI-gated; both are the same operational
class as FR-CMS-007's own `body_md` seeding step.

1. **Re-run `infrastructure/directus/bootstrap.sh`** against the target
   environment. This creates the `source_file` field and its relation, appends
   `source_file` to the public-read allowlist, creates the `public-documents`
   folder, and adds the scoped `directus_files` read grant. **Without the folder
   and the grant, every download 403s regardless of what the frontend renders.**
2. **Then run `infrastructure/directus/seed-content-documents.sh`** with
   `DIRECTUS_URL`/`DIRECTUS_TOKEN` and the source `.docx` files present at
   `portal-content/20260819/` (gitignored, operator-local; `SOURCE_DOC_DIR` is
   overridable). This uploads the five files into the public folder and links
   each row's `source_file`.

Running the seed script **before** bootstrap leaves `source_file` unset (the
PATCH fails and is reported, nothing is corrupted). Until both have run against
a given environment, every row's `source_file` is null there and `/rules/[slug]`
renders **label-only** — that is AC-8's required behaviour, **not a defect**.

## Notes

- **`?download` is what actually carries the real-filename guarantee.** The HTML
  `download` attribute is ignored by browsers cross-origin, and Directus is a
  different origin from web-next. Directus's own `?download` query flag switches
  `Content-Disposition` from `inline` to `attachment` and names the file from the
  asset's `filename_download`. Both the flag and the attribute are kept; the flag
  is load-bearing, the attribute is correct and harmless if the asset is ever
  served same-origin behind a proxy.
- **`PUBLIC_ASSET_FOLDER_ID` is duplicated as a literal in both shell scripts**
  (env-overridable in the seed script). Deliberate: shell scripts here have no
  shared config module, and a lookup-by-name would reintroduce the bootstrap
  ordering dependency the hardcoded id removes. Drift between the two fails
  **closed** — the upload lands outside the grant and 403s visibly. Both sites
  carry keep-in-sync comments. This mirrors the eight RBAC policy UUIDs already
  hardcoded in `bootstrap.sh`.
- **`publicAssetUrl()` is new; `assetUrl()` is deliberately unchanged.**
  `assetUrl()` and the four inline `${directusBase()}/assets/…` sites are
  realm-dependent and would emit the internal Docker hostname from SSR. Those
  paths are currently unexercised (`marketing_assets`, `event_materials`,
  `event_photos`, `sponsors.logo` are all empty), so they were left alone to
  keep this diff narrow. **This should be fixed before any of those collections
  ships real data** — worth a tracked follow-up issue.
- **No new automated coverage for the Directus-side ACs.** The schema and
  permission state, and the operator-run seed script, have no meaningful
  CI-runnable equivalent in this repo (asserting `bootstrap.sh`'s *text* would
  test the script's contents rather than its effect). They were verified against
  a live Directus 11 during security review, using code extracted verbatim from
  the edited files. 15 new unit tests in
  `apps/web-next/src/lib/cms-content-pages.test.ts` cover the `sourceFileUrl`
  derivation, including a negative guard asserting the internal Docker hostname
  is never emitted.
- **No E2E test added, by design.** `apps/e2e` has not been CI-wired since
  2026-07-26 per its own README, and its `/rules` specs target production, where
  `source_file` stays null until an operator seeds — a download-link assertion
  would fail for an indeterminate window and then start passing with no code
  change. Flaky-by-construction was judged worse than absent.
  **Correction (recorded during FR-CMS-009, 2026-08-21):** downstream work
  repeatedly restated this as *"FR-CMS-008's existing E2E/UAT already covers the
  rendered `href`."* **The UAT half is accurate; the E2E half is false.**
  `apps/e2e/tests/smoke-content-pages.spec.ts` does cover `/rules` and
  `/rules/[slug]` — but only FR-CMS-007 concerns: the 5-document listing,
  terminology, the superseded label, unknown-slug handling, and traversal.
  **No spec asserts the download link, `sourceFile`, or the emitted asset
  origin**, so there is **no Playwright regression guard for this
  requirement's surface** and none was inherited. Do not cite FR-CMS-008 as E2E
  precedent for the download link.
- **Community Rules & Documents remains Russian-only** for this pass, unchanged
  from FR-CMS-007. The new `rules.download_source` key is provided in both ru
  and en.
- No `BP-UAT-*` business process currently covers these pages (re-checked
  `docs/02-business-processes/uat/registry.md`'s full 21-entry script list — all
  cover auth, events, registration, admin/ops, points, or referral flows; none
  is a public marketing/content-page surface). `business_process` is left as `—`
  per protocol rather than linking a non-matching script, same as FR-CMS-007.
