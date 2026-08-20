# Code Summary — FR-CMS-008

## Requirement Implemented

**FEAT-CMS-8 / FR-CMS-008** — Community Rules & Documents source-file download
link. Extends FR-CMS-007.

Adds a `source_file` field (uuid, nullable, relation to `directus_files.id`,
`on_delete: SET NULL`) to the `content_documents` Directus collection; appends
it to the FR-CMS-007 public-read allowlist; extends
`seed-content-documents.sh` to idempotently upload and link the 5 source
`.docx` files; derives a `sourceFileUrl` in `apps/web-next/src/lib/cms.ts`; and
renders it on `/rules/[slug]` as a real download link **alongside** (never
replacing) the existing `source_document_label`.

All 10 ACs from `01-requirement-validation.md` are addressed in code. AC-3/AC-4
(actual upload + upload idempotency against a live Directus) and AC-6 (real
filename on the downloaded file) are code-complete but **verified by an
operator run**, not by this PR — see Known Limitations.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `infrastructure/directus/bootstrap.sh` | modified | Adds the `source_file` field to the `content_documents` collection block (`type: uuid`, `is_nullable: true`, `interface: "file"`); adds the `relation content_documents.source_file -> directus_files.id` ensure block with `on_delete: SET NULL`; appends `source_file` to the `content_documents` public-read `fields` allowlist (with an inline do-not-trim note). |
| `infrastructure/directus/seed-content-documents.sh` | modified | Adds `find_existing_file_id()` and `attach_source_file()`; calls `attach_source_file` once per seeded row. Uploads each source `.docx` via `POST /files` (multipart) and PATCHes the row's `source_file` to the returned UUID. Idempotent and non-fatal on every skip path. Header documents the new upload pass and its idempotency contract. |
| `apps/web-next/src/lib/cms.ts` | modified | `CmsContentDocument` gains `sourceFileUrl: string | null`; `CmsContentDocumentRow` gains `source_file: string | null`; `source_file` added to `CONTENT_DOCUMENT_LIST_FIELDS` (inherited by `CONTENT_DOCUMENT_DETAIL_FIELDS`); new `sourceFileDownloadUrl()` helper wraps the existing module-private `assetUrl()` and appends Directus's `?download` flag; `normalizeContentDocumentRow` maps the new field. |
| `apps/web-next/src/pages/rules/[slug].astro` | modified | The existing label `<p>` and a new conditional `<a href download>` are wrapped in one flex row, itself guarded so nothing renders when both are absent. |
| `apps/web-next/src/locales/en.json` | modified | Adds `rules.download_source` = "Download original". |
| `apps/web-next/src/locales/ru.json` | modified | Adds `rules.download_source` = "Скачать оригинал". |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | modified | Keeps the file's local re-implementation mirror in sync with `lib/cms.ts` (new interface fields, `assetUrl`/`sourceFileDownloadUrl` mirrors, `source_file` on all 4 existing fixtures). No new assertions added — new test cases belong to TestDesigner. |

## Key Design Decisions

**1. `interface: "file"`, not `"file-image"`.** Followed `event_materials.file`
(L4483) and `marketing_assets.file` (L2759), the two non-image precedents.
`.docx` is not an image, so `file-image` would give the wrong admin-UI picker.

**2. `on_delete: SET NULL`, not `RESTRICT`.** Matches the 4 optional-relation
precedents rather than `marketing_assets.file`'s outlier `RESTRICT`. If the
asset is ever deleted the document row and its `body_md` stay fully servable —
the page degrades to exactly AC-8's label-only rendering rather than breaking.

**3. Upload idempotency (AC-4) — a three-stage check, newly designed.** The
impact analysis correctly flagged this as having no precedent in this script
(the existing L73-77 idempotency dedupes *rows* by slug, not *assets*). The
design:

1. If the row already has a non-null `source_file` → return, no upload. This is
   the steady-state path on every re-run.
2. Else look up `directus_files` by exact `filename_download` and reuse that id.
   This covers the partial-failure window where a previous run uploaded the
   asset but died before the linking PATCH — without it, that run would orphan
   one asset per retry.
3. Only if both miss is the file actually uploaded.

The result is at most one `directus_files` row per source document, no matter
how many times the script runs.

**4. The upload is deliberately NOT routed through
`directus_request_with_retry`.** That helper re-issues on 429/503, and a
retried multipart POST that actually succeeded server-side would leave a
duplicate asset behind — precisely what AC-4 forbids. The *linking* PATCH is
idempotent (same field, same value) and does go through the retry helper.
Rationale is comment-documented at the call site.

**5. ARG_MAX safety.** Per the earlier lesson recorded in this same script's
`seed_content_document`, no large payload is passed as an argv literal:
`-F "file=@${source_path}"` streams from disk, and the linking PATCH body goes
through `mktemp` + `--data @file`, matching the existing body_md pattern.

**6. The upload pass is best-effort and never fails the seed.**
`portal-content/20260819/` is gitignored and operator-local, so it is absent on
CI and on any other checkout. Every skip path (`SKIP_SOURCE_FILES=1`, missing
directory, missing file, row not found, upload failure, link failure) reports
and returns 0. The content rows still seed exactly as before — this script
stays runnable everywhere it was runnable before this change.
`SOURCE_DOC_DIR` is overridable for a different export location.

**7. `attach_source_file` is called from the top level, not from inside
`seed_content_document`.** Bash `trap ... RETURN` is not function-local without
`functrace`, so a nested trap would clobber the enclosing function's
temp-file cleanup trap. Calling the two functions as siblings avoids that
entirely. Comment-documented at the call site so it is not "simplified" later.

**8. `?download` on the asset URL (AC-6).** The HTML `download` attribute is
ignored by browsers cross-origin, and Directus is a different origin from
web-next — so the attribute alone would not guarantee AC-6's "real filename
preserved". Directus's own `?download` query flag switches
`Content-Disposition` from `inline` to `attachment` and names the file from
the asset's `filename_download` (which the upload sets from the real filename
via the explicit `filename=` part). Both the attribute and the flag are kept:
the flag is what actually carries AC-6, the attribute is correct and harmless
if the asset is ever served same-origin behind a proxy. This is a small
deviation from the literal `${directusBase()}/assets/${fileId}` pattern cited
in the prior docs, made specifically to satisfy AC-6; the base derivation still
reuses the existing `assetUrl()` helper unchanged.

**9. Wrapper `<div>` is itself conditional (AC-8).** A naive wrapper would
always emit an `mb-8` div, changing the page's spacing even when both children
are absent. Guarded with `{(doc.sourceDocumentLabel || doc.sourceFileUrl) && ...}`
so a row with neither renders byte-identically to today.

**10. Plain link, no icon.** Both cited precedents (`MaterialsList.astro`
plain-link, `press.astro` bare-text "Download …") ship without an icon, and
AC-5 makes the Lucide icon explicitly optional. Chose the lighter option to
match the existing `font-mono text-xs text-muted-foreground` metadata line the
link sits beside — an icon would over-weight a caption-level element. Classes
used are all existing utilities already in this file (`text-xs`,
`font-medium`, `text-primary`, `hover:underline`, `flex`, `flex-wrap`,
`items-baseline`, `gap-x-3`, `gap-y-1`, `mb-8`).

**11. Copy is i18n'd, not hardcoded.** Added `rules.download_source` to both
locale files, following the sibling `rules.read_document` key. Sentence case
per the design system's copy rules. (`press.astro` hardcodes English, but the
`/rules` surface is fully i18n'd and these documents are Russian-language, so
matching the surface's own convention was clearly right.)

**12. Added `source_file` to the shared LIST fields constant**, not just the
detail constant. The detail constant is defined as an extension of the list
one, so this keeps both fetchers consistent at zero cost; the impact analysis
explicitly left this as the developer's call.

## Architecture Rule Compliance

- **Module boundaries** — no new `apps/api`/NestJS surface, no new module, no
  cross-module import. Content reads continue to bypass the API layer entirely
  via `lib/cms.ts`'s direct-to-Directus SSR fetch, exactly as FR-CMS-007
  established. `pnpm arch:check` passes (289 files, mode=full).
- **Tenant scoping** — N/A. `content_documents` is confirmed global/public
  content with no `countryCode` scoping (per the bootstrap.sh comment at the
  public-grant block); no tenant-scoped table is touched.
- **Zod at boundaries** — N/A. No new external input is accepted: no endpoint,
  no form, no request body. The only new inbound data is a Directus field
  already typed in the module-local `CmsContentDocumentRow` interface, and the
  slug input path is unchanged (still `isValidContentSlug`-guarded).
- **No cross-schema queries** — the `content_documents → directus_files`
  relation lives entirely within the Directus-managed schema, identical in kind
  to the 5 existing file-relation precedents. No Drizzle/Postgres migration is
  implicated (confirmed by the impact analysis's grep of all 17 migrations);
  `pnpm db:migrate` is not touched.
- **No `any`** — `sourceFileUrl: string | null` and `source_file: string | null`
  are explicitly typed; the new `sourceFileDownloadUrl()` helper has an explicit
  signature. `pnpm --filter web-next typecheck` → **0 errors, 0 warnings**
  (272 files).
- **Auth at controller level** — N/A, no controller. The new field is read-only
  for the Public policy (allowlist append only; no write grant was added), and
  the seed script's `DIRECTUS_TOKEN` requirement is pre-existing and unchanged.
  No new secret, no new auth surface, no new public endpoint.
- **No `dangerouslySetInnerHTML` / no new React component** — the change is a
  plain Astro conditional block; the page's existing `set:html={bodyHtml}` for
  markdown is untouched.

## Formatter Check

| Check | Result |
|---|---|
| `pnpm biome check` (changed TS/JSON) | Clean — "Checked 4 files. No fixes applied." |
| `pnpm --filter web-next lint` | Clean for changed files. 2 warnings reported, both pre-existing (`ComboBox.tsx:251`, `TgBroadcastComposer.tsx:478`) — **verified identical on a stashed clean tree**. |
| `pnpm --filter web-next typecheck` | 0 errors, 0 warnings (272 files) |
| `pnpm --filter web-next test` | 44 files / **1081 tests passed** |
| `pnpm --filter web-next build` | Success ("Complete!"). Warnings are pre-existing `/leads/*` `Astro.request.headers` notices, unrelated. |
| `pnpm arch:check` | ✓ passed (289 files, mode=full) |
| `bash -n` both shell scripts | Syntax OK |
| Both bootstrap.sh JSON payloads via `jq -e` | Parse cleanly |
| Both locale files via `JSON.parse` | Valid |
| Python ruff | N/A — no Python touched |

Note: `shellcheck` is not installed on this machine, so the two shell scripts
were validated with `bash -n` plus `jq` parsing of their JSON payloads. The
one `shellcheck disable` directive added (`SC2064`, intentional early
expansion) copies the existing directive already used in this file.

## Known Limitations

1. **The seed script was not run against any environment** — deliberate, per
   the task instruction and the requirement doc §3. Uploading the 5 `.docx`
   files to a live Directus is an operator/infra-workflow action of the same
   class as FR-CMS-007's own body_md seeding: not CI-gated, not a merge
   blocker. **This must be stated in the PR description.** Until it runs against
   a given environment, every row's `source_file` is null there and `/rules/[slug]`
   renders label-only — which is exactly AC-8's required behavior, not a defect.

2. **AC-3, AC-4, and AC-6 are code-complete but operator-verified.** They
   require a live Directus and the gitignored local binaries, so they cannot be
   asserted in unit tests. AC-4 in particular (re-run creates no duplicate
   asset) is worth an explicit two-run check during UAT.

3. **`bootstrap.sh` must be re-run before the seed script** on any environment,
   or the `source_file` field and its public-read allowlist entry will not
   exist yet. `attach_source_file` degrades gracefully in that case (the PATCH
   fails and is reported) rather than corrupting anything, but the field will
   stay unset. Normal bootstrap-then-seed ordering already covers this.

4. **No new test assertions were added** — the existing test file's local
   re-implementation mirror was updated so it does not drift from `lib/cms.ts`
   (that file's stated convention is a line-for-line mirror) and so it keeps
   compiling, but the new `source_file → sourceFileUrl` mapping cases called
   for by the impact analysis's test scope are TestDesigner's to write. The
   mirror is ready for them: `sourceFileDownloadUrl()` is in place and two
   fixtures already carry a non-null `source_file`.

5. **`?download` is not exercised by any existing repo precedent.** It is
   standard Directus asset-API behavior and is the mechanism AC-6 depends on
   cross-origin, but it is worth one explicit click during UAT to confirm the
   file arrives named e.g. `AI Qadam Manifesto.docx`.

## Retry 1 — MAJOR-1 + MAJOR-2 Fixes

Both SecurityReviewer MAJOR findings are fixed. Both were accepted as
established fact (independently re-confirmed by the Orchestrator) and were
**not** re-litigated. The corrected behaviour was then verified empirically
against the live local Directus, since the original premise this feature was
built on had just been disproved — reasoning from documentation a second time
would have repeated the same mistake.

### MAJOR-1 — anonymous `/assets/:id` returned 403

**Root cause accepted as stated:** `bootstrap.sh` had twelve
`related_collection: directus_files` *relation* blocks but zero `directus_files`
*permission* grants, so the Public policy could not read any asset. The cited
precedents never exercised the path because those collections are empty.

**Fix — a dedicated, permission-scoped public folder:**

1. **New `PUBLIC_ASSET_FOLDER_ID` constant** (`bootstrap.sh`), a hardcoded
   UUID `0f9b1c2d-…-0e1f2a3b4c5d`. Directus accepts a client-supplied uuid on
   `POST /folders` (verified live), so the id is identical in every
   environment and the permission filter can reference it literally — no
   name lookup, no ordering dependency, no drift between install and grant.
2. **New `ensure "folder public-documents"` block** creating that folder
   idempotently via the existing `ensure` helper.
3. **New `ensure_perm_for_policy … directus_files read` grant**, filtered to
   `{"folder":{"_eq":"<id>"}}` with an explicit six-field allowlist
   (`id`, `filename_download`, `type`, `filesize`, `title`, `folder`) — never
   `permissions: {}`, never `fields: ["*"]`.
4. **`seed-content-documents.sh` uploads into that folder** via a
   `-F "folder=${PUBLIC_ASSET_FOLDER_ID}"` multipart part placed **before**
   the `file` part (Directus applies already-parsed fields to the file it
   creates; a `folder` part sent after the payload is ignored and the asset
   silently lands at the root, outside the grant).
5. **`find_existing_file_id()` is now folder-scoped too.** This is a real
   correctness fix, not tidying: an unscoped `filename_download` match could
   reuse a same-named asset living outside the public folder, linking the row
   to a file anonymous visitors get 403 on — silently reintroducing the exact
   bug the folder scoping exists to prevent.

Why a folder rather than a per-file grant or a `_in` list of uuids: the uuids
are generated at upload time, so any id-based filter would have to be written
back into `bootstrap.sh` after each seed run — an ordering cycle between the
two scripts. The folder is a stable, declarative boundary that both scripts
can name up front, and it generalises to future public documents without a
permission edit.

**SecurityReviewer's blanket-grant warning is directly addressed** — the
unfiltered-grant enumeration it demonstrated is exactly what the folder filter
and the field allowlist prevent, and this was re-tested rather than assumed
(see the verification table below).

### MAJOR-2 — internal Docker hostname in the browser-facing `href`

**Fix — the narrow option, as recommended.** Added `publicAssetUrl()` to
`cms.ts` immediately beside `assetUrl()`; it returns
`${PUBLIC_DIRECTUS_URL}/assets/${fileId}` unconditionally.
`sourceFileDownloadUrl()` now calls it instead of `assetUrl()`.

`assetUrl()` and the three inline `${directusBase()}/assets/...` sites are
**deliberately left unchanged**. The task allowed either scope; the narrow one
was chosen because those callers feed SSR fetches and `img src` values that may
legitimately want the internal base, so changing them is a separate change with
its own blast radius and its own testing burden. Both helpers carry comments
explaining which realm each belongs to, so the distinction is discoverable
rather than accidental. The latent flaw SecurityReviewer flagged in `assetUrl()`
generally is therefore documented but not silently inherited by this feature.

The test file's mirror was updated to match: it now mirrors `publicAssetUrl()`
against a distinct `PUBLIC_DIRECTUS_BASE` constant. The dead `assetUrl()` /
`DIRECTUS_BASE` mirror was removed rather than left unused — keeping the two
bases visibly different is what would let a future test catch a regression back
to the internal base.

### Files Changed (this retry)

| File | Change Type | Description |
|---|---|---|
| `infrastructure/directus/bootstrap.sh` | modified | Adds `PUBLIC_ASSET_FOLDER_ID`, the `ensure "folder public-documents"` block, and the folder-scoped `directus_files/read` grant with an explicit field allowlist. Both carry comments recording the empirical 403 finding and an explicit do-not-unscope warning. |
| `infrastructure/directus/seed-content-documents.sh` | modified | Adds the matching `PUBLIC_ASSET_FOLDER_ID` (env-overridable); uploads with `-F folder=…` ordered before the file part; folder-scopes `find_existing_file_id()`; header documents that the folder is required, not cosmetic. |
| `apps/web-next/src/lib/cms.ts` | modified | Adds `publicAssetUrl()`; `sourceFileDownloadUrl()` switched to it. `assetUrl()` untouched. |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | modified | Mirror updated to `publicAssetUrl()` + `PUBLIC_DIRECTUS_BASE`; removed the now-dead `assetUrl()`/`DIRECTUS_BASE` mirror. |

### Empirical Verification (live local Directus, port 8200)

The `bootstrap.sh` folder/permission blocks and the `seed-content-documents.sh`
`attach_source_file` / `find_existing_file_id` functions were extracted
**verbatim from the edited files** (via `sed`, not retyped) and executed against
the running instance, so what was tested is the shipping code.

| Check | Result |
|---|---|
| `ensure "folder public-documents"` (1st run) | `+ created` |
| `ensure_perm_for_policy … directus_files read` (1st run) | `+ created` |
| Both re-run (idempotency) | `✓ exists` / `✓ exists` — no duplicates |
| Upload with `-F folder=…` | `200`, asset lands with `folder` set correctly |
| `attach_source_file` re-run (AC-4) | Reuses the asset; file count stays 1 |
| **Anonymous `GET /assets/<id>?download`** | **`200 OK`**, `Content-Disposition: attachment; filename="AI Qadam Manifesto.docx"` — **AC-5 + AC-6 proven** |
| Anonymous `GET /assets/<out-of-folder-id>` | `403` — non-public files stay protected |
| Anonymous `GET /files` (enumeration) | Lists **only** the in-folder asset — blanket-grant exposure resolved |
| Anonymous `GET /folders` | `403` — the folder id is not discoverable |
| Anonymous `content_documents` read with the new allowlist | `source_file` uuid serialises correctly |

That last row plus the download row together prove the **whole chain**:
anonymous read yields the uuid → the page builds a `PUBLIC_DIRECTUS_URL`-based
href → anonymous fetch returns the document under its real filename. This is
the end-to-end evidence the original (false) premise lacked.

**Environment restored** — verified afterwards: 0 files, 0 folders,
`source_file` field and relation dropped, `content_documents` allowlist back to
its original 8 fields, zero `directus_files` grants, all 5 original
`content_documents` rows intact and unmodified. Containers left running as
found. No repo `.env` or seeded data was permanently changed.

One test-harness artifact worth recording so it is not mistaken for a defect:
an upload attempt returned `HTTP 000` with **no** corresponding Directus log
entry. That was MSYS/curl mangling a long absolute path containing spaces in my
ad-hoc harness — not a server rejection and not reachable from the seed script,
which passes a correctly-quoted `"${SOURCE_DOC_DIR}/${filename}"`. The same
upload succeeded immediately from a shorter path.

### Validation (re-run after the fixes)

| Check | Result |
|---|---|
| `pnpm --filter web-next typecheck` | 0 errors, 0 warnings (272 files) |
| `pnpm --filter web-next test` | 44 files / **1081 tests passed** |
| `pnpm arch:check` | ✓ passed (289 files, mode=full) |
| `pnpm --filter web-next lint` | Clean for changed files; same 2 pre-existing warnings (`ComboBox.tsx`, `TgBroadcastComposer.tsx`) |
| `pnpm biome check` (4 changed files) | "Checked 4 files. No fixes applied." |
| `bash -n` both shell scripts | Syntax OK |
| New JSON payloads via `jq -e` | Folder body, permission filter, field allowlist all parse |

### Known Limitations (updated by this retry)

- Limitation 1/2/3 from the original list still stand: the seed script was not
  run against any shared environment, and `bootstrap.sh` must be re-run before
  the seed script. **The re-run is now more important than before** — it creates
  the folder and the `directus_files` grant, without which every download 403s.
  This must be stated in the PR description.
- Limitation 5 (`?download` unexercised by precedent) is **now resolved** — it
  was verified live, returning `Content-Disposition: attachment` under the real
  filename.
- **New:** `assetUrl()` retains the internal-base flaw SecurityReviewer
  identified, for its three pre-existing callers. Not fixed here by choice
  (narrow-change preference); those paths are currently unexercised because the
  collections are empty. Worth a separate follow-up issue before any of
  `marketing_assets`, `event_materials`, `event_photos`, or `sponsors.logo`
  ships real data.
- **New:** `PUBLIC_ASSET_FOLDER_ID` is duplicated as a literal in both scripts.
  Deliberate — shell scripts run independently with no shared config module, and
  a lookup-by-name would reintroduce the ordering coupling the hardcoded id
  removes. Both sites comment that they must stay in sync.

## Gate Result

```yaml
gate_result:
  status: passed
  retry: 1
  summary: >
    Retry 1 — both SecurityReviewer MAJOR findings are fixed and, unlike
    the original pass, the corrected behaviour is proven empirically
    rather than assumed. MAJOR-1: bootstrap.sh now creates a dedicated
    public-documents folder (hardcoded uuid, so the grant can reference
    it literally) and adds a directus_files read grant scoped to
    {"folder":{"_eq":"<id>"}} with an explicit 6-field allowlist; the
    seed script uploads into that folder and its filename-reuse lookup is
    folder-scoped too. MAJOR-2: a new publicAssetUrl() always uses
    PUBLIC_DIRECTUS_URL and now backs sourceFileDownloadUrl(), leaving
    assetUrl() and its 3 existing callers untouched (the narrow fix, as
    recommended). Verified against live Directus using the shipping code
    extracted verbatim from the edited files: anonymous GET
    /assets/<id>?download returns 200 with Content-Disposition:
    attachment; filename="AI Qadam Manifesto.docx", while out-of-folder
    assets stay 403 and anonymous GET /files lists only the in-folder
    file. Typecheck (0 errors), 1081 tests, arch:check, lint, and biome
    all clean; both shell scripts pass bash -n. Environment fully
    restored afterwards.
  findings:
    - "MAJOR-1 FIXED — bootstrap.sh gains PUBLIC_ASSET_FOLDER_ID (a hardcoded uuid; Directus accepts a client-supplied id on POST /folders, verified live, so the id is identical in every environment and the permission filter references it literally with no name lookup or ordering dependency), an idempotent `ensure \"folder public-documents\"` block, and an ensure_perm_for_policy directus_files/read grant."
    - "MAJOR-1 scoping requirement honoured exactly as SecurityReviewer demanded: the grant is filtered to {\"folder\":{\"_eq\":\"<id>\"}} with fields limited to [id, filename_download, type, filesize, title, folder] — never permissions:{}, never [\"*\"]. Re-tested live: anonymous GET /files lists ONLY the in-folder asset, and anonymous GET /folders is 403 so the folder id is not even discoverable."
    - "MAJOR-1 seed side: uploads now pass -F folder=<id> ordered BEFORE the -F file part — Directus applies already-parsed multipart fields to the file it creates, so a folder part sent after the payload is silently ignored and the asset lands at the root, outside the grant. Discovered and confirmed during live testing."
    - "MAJOR-1 extra correctness fix (not cosmetic): find_existing_file_id() is now folder-scoped. An unscoped filename_download match could reuse a same-named asset living outside the public folder, linking the row to a file anonymous visitors 403 on — silently reintroducing the very bug the folder scoping prevents."
    - "MAJOR-2 FIXED with the narrow option: new publicAssetUrl() returns ${PUBLIC_DIRECTUS_URL}/assets/${id} unconditionally and now backs sourceFileDownloadUrl(). assetUrl() and the 3 inline ${directusBase()}/assets sites are deliberately unchanged — they feed SSR fetches / img src that may legitimately want the internal base, so widening the fix carries its own blast radius. Both helpers are commented with which realm they belong to."
    - "END-TO-END PROOF (the evidence the original false premise lacked): with the new grant in place, anonymous content_documents read serialises the source_file uuid, and anonymous GET /assets/<uuid>?download returns 200 with Content-Disposition: attachment; filename=\"AI Qadam Manifesto.docx\". AC-5 and AC-6 are now demonstrated, not asserted. Out-of-folder asset returns 403."
    - "Testing used the SHIPPING code: the bootstrap folder/permission blocks and the seed script's attach_source_file / find_existing_file_id were extracted verbatim from the edited files via sed rather than retyped, then executed against live Directus. Both bootstrap blocks were re-run to confirm idempotency (✓ exists, no duplicates), and attach_source_file was run twice to confirm AC-4 (file count stayed 1)."
    - "Environment fully restored and verified: 0 files, 0 folders, source_file field + relation dropped, content_documents allowlist back to its original 8 fields, zero directus_files grants, all 5 original content_documents rows intact and unmodified. Containers left running as found; no repo .env or seeded data permanently changed."
    - "Harness artifact recorded so it is not mistaken for a defect: one upload returned HTTP 000 with no Directus log entry — MSYS/curl mangling a long absolute path containing spaces in the ad-hoc test harness, not a server rejection and not reachable from the seed script, which passes a correctly-quoted \"${SOURCE_DOC_DIR}/${filename}\". The same upload succeeded from a shorter path."
    - "NEW follow-up worth an issue: assetUrl() retains the internal-base flaw for its 3 pre-existing callers. Safe today because marketing_assets/event_materials/event_photos/sponsors.logo are all empty, but it should be fixed before any of them ships real data."
    - "bootstrap.sh re-run is now MORE important than in the original pass and must be called out in the PR description: it creates the folder and the directus_files grant, without which every download 403s regardless of the frontend."
    - "Original-pass findings below still hold — none were invalidated by this retry."
    - "The highest-risk step flagged by both prior agents — appending source_file to the bootstrap.sh public-read fields allowlist — is done, and carries an inline do-not-trim comment explaining the silent-null failure mode so a future edit does not undo it."
    - "Upload idempotency (AC-4) is a three-stage check designed for this script (row already linked -> reuse asset matching filename_download -> upload), since the impact analysis correctly noted the existing slug-based row idempotency gave no precedent. Guarantees at most one directus_files row per source document across any number of re-runs."
    - "The multipart upload is deliberately NOT routed through directus_request_with_retry: that helper retries on 429/503, and a retried upload that already succeeded server-side would create the duplicate asset AC-4 forbids. The linking PATCH is idempotent and does use the helper."
    - "AC-6 required a deviation from the literal ${directusBase()}/assets/${fileId} pattern: the HTML download attribute is ignored cross-origin, and Directus is a different origin from web-next, so Directus's own ?download flag is appended to force Content-Disposition: attachment under the asset's real filename. assetUrl() is still reused unchanged for the base derivation."
    - "attach_source_file is called from the top level rather than from inside seed_content_document, because bash RETURN traps are not function-local without functrace and a nested trap would clobber the enclosing temp-file cleanup. Comment-documented so it is not refactored away."
    - "The whole upload pass is best-effort/non-fatal (missing gitignored source dir, missing file, upload or link failure all skip with a message and return 0), so the script remains runnable on CI and on checkouts without portal-content/ — the content rows seed exactly as before."
    - "AC-8 verified structurally: the wrapper div is itself guarded on (sourceDocumentLabel || sourceFileUrl), so a row with neither renders byte-identically to today rather than emitting a stray mb-8 spacer."
    - "AC-9 verified by diff: no /about, /history, or /partners file is touched. No apps/api, packages/shared-types, apps/bot, or apps/workers file is touched either."
    - "Test file's local re-implementation mirror was kept in sync (new fields, new helper, source_file on all 4 fixtures) so it does not drift from lib/cms.ts, but no new assertions were added — those belong to TestDesigner."
    - "The seed script was NOT run against any environment, per instruction — that is an operator/infra step of the same class as FR-CMS-007's own seeding and must be called out in the PR description as a post-merge action."
```
