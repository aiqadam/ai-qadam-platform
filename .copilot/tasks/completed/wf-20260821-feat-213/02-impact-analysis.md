# Impact Analysis — FR-CMS-008

## Validated Requirement

**FEAT-CMS-8 / FR-CMS-008** — Community Rules & Documents source-file download
link. Extends FR-CMS-007. On `/rules/[slug]`, the existing
`source_document_label` text (e.g. "AI Qadam Manifesto.docx") gains an
adjacent, real download link to the original source file, for all 5
`content_documents` rows (`manifesto`, `charter-v0-1`, `kazakhstan-mou`,
`global-board-polozhenie-v1`, `soglashenie-v1`). Adds a new `source_file`
field (uuid, nullable, relation to `directus_files.id`, `on_delete: SET
NULL`) to the `content_documents` Directus collection. The 5 source `.docx`
files are uploaded and linked via a manual/infra-workflow-run extension to
`infrastructure/directus/seed-content-documents.sh`. `apps/web-next/src/lib/cms.ts`
gains a derived `sourceFileUrl` field; `apps/web-next/src/pages/rules/[slug].astro`
renders it as a real `<a href>` download link next to (not replacing) the
existing label, only when set.

Full text and draft ACs: `.copilot/tasks/active/wf-20260821-feat-213/01-requirement-validation.md`.

---

## Affected Layers

### API (NestJS) — table

| Module | Change | Notes |
|---|---|---|
| — | none | No `apps/api/src/modules/` involvement. Verified: `apps/api` has zero references to `content_documents` or `source_file` anywhere in `src/`. `apps/api/src/modules/directus/` exists but is scoped narrowly to `DirectusUsersBridgeService` (syncing platform users into Directus for attribution) — confirmed by directory listing (`directus-users-bridge.service.ts`, `directus.client.ts`, `directus.module.ts`); not a general content bridge, not touched by this FR. Matches `architecture.md`'s explicit binding note (L143-156) that content reads bypass NestJS entirely. |

### DB Changes Required: **No** (Drizzle/Postgres) — **Yes** (Directus-managed schema, non-Drizzle)

Verified directly, not just per the requirement doc's claim:

- `apps/api/drizzle` does not exist as a path. The actual Drizzle migrations directory is `apps/api/src/db/migrations` (`0000_motionless_jocasta.sql` through `0016_lucky_blizzard.sql`, plus `meta/`).
- `grep -ril "content_documents\|source_file" apps/api/src/db` → **zero matches**. No existing migration touches this collection (expected — it's Directus-owned, per `architecture.md`'s data-ownership table: `directus` schema is "Directus admin UI"-written only, `platform` schema is NestJS API-only).
- Therefore **no Drizzle migration file is needed or should be generated** for this FR. `pnpm db:migrate` is not implicated.
- The actual schema change is a **Directus schema mutation via `bootstrap.sh`**, which drives Directus's own metadata REST API (`POST/PATCH {DIRECTUS_URL}/collections`, `/fields`, `/relations`) idempotently via the file's `ensure` helper — not a SQL migration file, not `drizzle-kit generate`.

**Confirmed schema-change plan** (verified against the live file, not just cited line numbers):

1. **New field** on `content_documents`, in the collection block at `infrastructure/directus/bootstrap.sh:5750-5782` (confirmed exact — `echo "[content_documents]"` is at L5750, the `fields` array closes at L5781). Add a `source_file` field entry (type `uuid`, nullable, `interface: "file"` — matching `event_materials.file`/`marketing_assets.file`, the two non-image file precedents, not `partners.logo`'s `file-image`).
2. **New relation `ensure` block**, placed immediately after, of the exact shape already used 5x in this file (verified all 5 by grep):
   - `partners.logo -> directus_files.id`, L735-738, `on_delete: SET NULL`
   - `sponsors.logo -> directus_files.id`, L904-907, `on_delete: SET NULL`
   - `speakers.photo -> directus_files.id`, L952-955, `on_delete: SET NULL`
   - `event_materials.file -> directus_files.id`, L4496-4499, `on_delete: SET NULL`
   - `marketing_assets.file -> directus_files.id`, L2795-2798, `on_delete: RESTRICT` (outlier — marketing_assets.file is load-bearing content, not this FR's precedent)
   - New block: `{"collection":"content_documents","field":"source_file","related_collection":"directus_files","schema":{"on_delete":"SET NULL"}}` — `SET NULL` is correct, matching the 4 optional/decorative precedents above.
3. **Public-read field allowlist** — confirmed exact at L5798-5800:
   ```
   ensure_perm_for_policy "${FR_CMS_007_PUBLIC_POLICY_ID}" "perm public content_documents/read" \
     content_documents read '{"status":{"_eq":"published"}}' \
     '["id","slug","status","title","source_document_label","status_label","body_md","display_order"]'
   ```
   `source_file` **must** be appended to this array. This is the single easiest-to-miss step: the field will exist and be settable via the admin/API token but will silently serialize as absent/null on anonymous public reads without this change. No new `directus_files`-collection-level grant is needed — confirmed no existing file-relation precedent (`partners.logo`, `event_materials.file`, etc.) has one; Directus serves `/assets/:id` without requiring `directus_files` item-read permission.

### Shared Types (`packages/shared-types/`)

None. Confirmed via grep: zero references to `content_documents`, `source_file`, or `CmsContentDocument` in `packages/shared-types`. This FR's types live entirely in `apps/web-next/src/lib/cms.ts` (module-local interfaces, not shared across apps) — consistent with how `CmsContentDocument`/`CmsContentDocumentRow` already work today for FR-CMS-007.

### Frontend (`apps/web-next/`)

Two files change, both verified by direct read:

**1. `apps/web-next/src/lib/cms.ts`** (1146 lines total) — the `content_documents` section runs L1060-1146.
- `CmsContentDocument` interface (L1068-1076): add `sourceFileUrl: string | null`.
- `CmsContentDocumentRow` interface (L1078-1087): add `source_file: string | null` (the raw Directus field — a uuid or null).
- `CONTENT_DOCUMENT_LIST_FIELDS` (L1089) and/or `CONTENT_DOCUMENT_DETAIL_FIELDS` (L1090): add `source_file` to the Directus `fields` query param string, or this new field will never come back from Directus regardless of the schema/permission changes above. Note both `fetchContentDocuments` (list, uses `CONTENT_DOCUMENT_LIST_FIELDS`) and `fetchContentDocument` (detail, uses `CONTENT_DOCUMENT_DETAIL_FIELDS` which extends the list fields) will pick it up if added to the shared `CONTENT_DOCUMENT_LIST_FIELDS` constant — likely the right place since AC-5/AC-6 only require it on the detail page, but adding it to the list-fields constant is harmless and keeps both fetchers consistent (CodeDeveloper's call).
- `normalizeContentDocumentRow` (L1092-1102): map `row.source_file` to `sourceFileUrl` using the `${directusBase()}/assets/${fileId}` pattern. Confirmed via grep this exact pattern (or the module-private `assetUrl()` helper at L845-848) is already used 3x in this file: `row.hero_image` (L286), `event_materials.file` (L448, L503), `marketing_assets.file`/`.thumbnail` via `assetUrl()` (L876-877). CodeDeveloper may inline the ternary or promote `assetUrl()` to file-wide reuse — both are consistent with existing style, not prescribed.

**2. `apps/web-next/src/pages/rules/[slug].astro`** (68 lines total, confirmed by full read).
- Current state: L62-64 renders `doc.sourceDocumentLabel` as inert `<p>` text, guarded by `{doc.sourceDocumentLabel && (...)}`.
- Change: add a new conditional block rendering `doc.sourceFileUrl` as `<a href={doc.sourceFileUrl}>`, placed adjacent to (not replacing) the existing label paragraph. Rendering precedent confirmed: `apps/web-next/src/blocks/customer/MaterialsList.astro` (plain `<a href={fileUrl} target="_blank" rel="noopener noreferrer">` with existing card/pill classes, no icon) and `press.astro` (bare-text "Download {label}" link, no icon) are both valid existing precedents — a Lucide `Download` icon is optional per AC-5, not mandatory.
- Must preserve AC-7 (label untouched) and AC-8 (graceful null — `doc.sourceFileUrl &&` guard, exactly mirroring the existing `doc.sourceDocumentLabel &&` guard already in the file).

### Bot (`apps/bot/`)

None. No Telegram-surface implication — this is a web-only content page.

### Workers (`apps/workers/`)

None. No BullMQ queue/processor implication — the file upload is a one-time, operator-run script action (`seed-content-documents.sh` extension), not an async job.

### Infrastructure / scripts (the third affected layer, beyond API/DB/Frontend)

**`infrastructure/directus/seed-content-documents.sh`** (118 lines total, confirmed by full read) — extend, not replace.

- Current shape: `seed_content_document()` (L37-101) takes `<slug> <title> <source_document_label> <status_label> <display_order>`, builds a JSON payload, and does a slug-keyed lookup-then-PATCH-or-POST against `/items/content_documents` (idempotency via `existing_id` lookup at L73-77, matching on `slug`).
- Required extension: for each of the 5 calls (L104-115), add a file-upload-and-link step:
  - `POST {DIRECTUS_URL}/files` (multipart) with the local `.docx` read from `portal-content/20260819/<filename>` (gitignored, not part of this diff — confirmed present in-session per the requirement doc; not re-verified here since it's explicitly outside the repo/diff).
  - Capture the returned file UUID; set it on the row's `source_file` (fold into the existing PATCH/POST payload, or a follow-up PATCH).
  - **New idempotency sub-problem, not identical to the existing slug-based one**: `seed_content_document`'s existing idempotency (L73-77) dedupes the *row* by slug. The file-upload step needs its own dedupe — re-running must not create a duplicate `directus_files` asset on every run. The existing pattern gives no direct precedent for this (it only ever PATCH/POSTs one resource per call); a reasonable approach is checking whether the row already has a non-null `source_file` before re-uploading (skip upload, keep existing link), or matching on `filename_download` via a `directus_files` query first. This is a genuinely new idempotency shape for this script, worth calling out to CodeDeveloper as a design decision point, not a mechanical copy-paste.
  - Filenames (already confirmed exact matches to the existing `source_label` arguments at L104-115): `AI Qadam Manifesto.docx`, `AI Qadam Charter v0 1.docx`, `AI_Qadam_Kazakhstan_MoU-2105 (3).docx`, `AI Qadam Global Board Положение (2).docx`, `AI Qadam Soglashenie v1 (2).docx`.
- **Not CI-gated, not a merge blocker** — same operational class as the script's existing body_md seeding (manual/infra-workflow post-merge step against each target environment). Must be called out in the PR description exactly as such.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| — | — | None. No `apps/api` REST endpoint added, removed, or modified. | N/A |

(Directus's own auto-generated `/items/content_documents` and `/assets/:id` REST endpoints gain a new readable field and a new asset relation respectively, but these are Directus-managed, not hand-written API surface — not itemized here since they're schema-driven, not endpoint code.)

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `apps/web-next` (Astro SSR, `rules/[slug].astro`) | Directus (`content_documents` collection) | Direct HTTP fetch from `apps/web-next/src/lib/cms.ts`'s `get()` helper — no NestJS hop, unchanged pattern from FR-CMS-007 |
| `apps/web-next` (browser, rendered `<a href>`) | Directus (`/assets/:id`) | Direct browser navigation to Directus's public asset-serving endpoint — new for this FR, but same mechanism already used by `MaterialsList.astro`, `event_materials.file`, `marketing_assets.file` |
| Operator / infra workflow (manual) | Directus (`/files`, `/items/content_documents/:id`) | `infrastructure/directus/seed-content-documents.sh`, extended — HTTP calls via `curl`, not application code |

No new NestJS-to-NestJS or NestJS-to-Directus service call is introduced. No tenant-scoping implication — `content_documents` is confirmed global/public content (no country scoping, no write grant for the Public policy, per the comment at bootstrap.sh L5787-5789).

---

## Risk Flags

**Security Review Required:** No dedicated SecurityReviewer gate flagged as mandatory, but note for that agent if invoked:
- The new field is read-only for the Public policy (append-to-allowlist only, no write grant) — consistent with existing `content_documents` posture.
- `on_delete: SET NULL` (not `RESTRICT`) is the correct choice: if a `directus_files` row is later deleted, `content_documents.body_md` remains fully servable; only the download link silently disappears (degrades to AC-8's "graceful absence" behavior, not a broken page).
- No new secrets, no new auth surface, no new public endpoint. `seed-content-documents.sh`'s `DIRECTUS_TOKEN` requirement is pre-existing, unchanged.

**Architecture Rule Risks:** None identified.
- No module-boundary violation — no new `apps/api` module, no cross-schema query (`content_documents → directus_files` is within the same Directus-managed `directus` Postgres schema, identical in kind to 5 existing precedents).
- No monorepo-boundary issue — touches only `infrastructure/directus/` and `apps/web-next/`, matching FR-CMS-007's own footprint exactly.
- One easy-to-miss failure mode (not an architecture violation, but a correctness risk worth flagging to CodeDeveloper/TestDesigner): forgetting the L5798-5800 public-read allowlist append. If missed, AC-1/AC-3 (schema + seed) would pass but AC-5/AC-6 (visible download link) would silently fail in a way that's easy to misdiagnose as a frontend bug when it's actually a Directus permissions gap.
- Minor script-design risk (not a violation): the new file-upload idempotency logic in `seed-content-documents.sh` has no exact existing precedent in this script (see Infrastructure section above) — CodeDeveloper should treat this as a small original design decision, not a mechanical copy of the slug-based row idempotency.

---

## Test Scope

**Unit tests** — primary and sufficient test scope for this FR, following the established repo pattern:
- Extend `apps/web-next/src/lib/cms-content-pages.test.ts` (the FR-CMS-007 test file already covering `content_documents`, confirmed sections at L202 "Local re-implementation: content_documents" and L267 "Tests: content_documents") — or add a sibling test file if preferred by TestDesigner — following the file's established convention: a **local re-implementation** of the fetcher/normalize logic (line-for-line mirror of `lib/cms.ts`, not a mocked-`fetch` integration test), per the file's own header comment (L1-7) citing this as the shared convention across `cms.test.ts`, `cms-landing-page.test.ts`, and this file.
- New cases needed: `normalizeContentDocumentRow`-equivalent mapping of `source_file: <uuid>` → `sourceFileUrl: "${base}/assets/<uuid>"`, and `source_file: null` → `sourceFileUrl: null` (AC-8's graceful-absence case at the data layer).
- No new test infra, no mocking library changes — matches existing zero-dependency pattern (plain `describe`/`it`/`expect` from `vitest`).

**Integration tests (Testcontainers):** None required. No Postgres/Drizzle schema touched, no NestJS service touched — Testcontainers in this repo is for API+DB integration, not applicable here.

**E2E (Playwright):** Not required to satisfy this FR's ACs, but worth flagging as optional: `apps/e2e` could add/extend a smoke check that `/rules/[slug]` renders without error when `source_file` is null (AC-8) — however this is arguably already covered by FR-CMS-007's own existing `/rules/[slug]` smoke coverage if any exists (not verified in this pass; TestStrategist should check `apps/e2e` for existing `/rules` coverage before deciding whether to extend it). Given the page-level change is additive and low-risk (a conditional `<a>` block mirroring an existing conditional `<p>` block), unit coverage of the `cms.ts` derivation logic plus the existing `astro check` / `pnpm build` gate (AC-10) is likely sufficient without new E2E investment — final call belongs to TestStrategist.

**Manual/operator verification (not automated):** AC-3/AC-4 (seed script upload + idempotency) and AC-6 (real filename preserved on download) are best verified by actually running `seed-content-documents.sh` against a local/dev Directus instance and downloading the resulting link — this is consistent with how FR-CMS-007's own body_md seeding is verified (operator-run, not CI-gated), not a gap specific to this FR.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    Impact fully analyzed. No apps/api/NestJS surface, no Drizzle/Postgres
    migration (confirmed by direct grep of apps/api/src/db — zero references
    to content_documents or source_file in any of the 17 existing migration
    files). Change is confined to a Directus schema mutation via
    infrastructure/directus/bootstrap.sh (new source_file field + relation +
    public-read allowlist append, all following exactly-precedented patterns),
    an idempotent-upload extension to
    infrastructure/directus/seed-content-documents.sh, and two
    apps/web-next files (lib/cms.ts derived field, pages/rules/[slug].astro
    rendering). No shared-types, bot, or workers involvement.
  findings:
    - "DB migration confirmed NOT needed: apps/api/drizzle does not exist as a path (actual dir is apps/api/src/db/migrations); grepped all 17 existing .sql migrations plus meta/ for content_documents/source_file — zero matches. This is Directus-managed schema via bootstrap.sh's REST-driven `ensure` helper, not Drizzle-managed. pnpm db:migrate is not implicated."
    - "All cited precedents in the requirement doc verified byte-exact against the live files: bootstrap.sh content_documents block (L5750-5782), the 5 file-relation ensure blocks (partners.logo L735-738, sponsors.logo L904-907, speakers.photo L952-955, event_materials.file L4496-4499, marketing_assets.file L2795-2798), the public-read allowlist (L5798-5800), cms.ts's content_documents section (L1060-1146), and rules/[slug].astro's current label rendering (L62-64)."
    - "Highest-risk single step: forgetting to append source_file to the bootstrap.sh L5798-5800 public-read fields array — field would exist and be settable but silently return null/absent on anonymous public reads, which would surface as an apparent frontend bug (AC-5/AC-6 failing) rather than an obviously-related permissions gap."
    - "seed-content-documents.sh's file-upload idempotency (AC-4) has no exact existing precedent in that script — its current idempotency (L73-77) dedupes content_documents rows by slug, not directus_files assets by content. This is a small original design decision for CodeDeveloper, not a mechanical copy-paste of the existing pattern."
    - "Test scope: unit tests only, extending apps/web-next/src/lib/cms-content-pages.test.ts's existing content_documents section (L202, L267) using the file's established local-re-implementation convention (not mocked fetch). No Testcontainers integration tests (no DB/API touched). E2E is optional/likely-unnecessary — final call left to TestStrategist pending a check of apps/e2e for existing /rules coverage."
    - "No apps/api, packages/shared-types, apps/bot, or apps/workers involvement — confirmed via grep, not just asserted."
  test_scope:
    unit: "apps/web-next/src/lib/cms-content-pages.test.ts — extend content_documents section with source_file -> sourceFileUrl mapping cases (set uuid, and null passthrough for AC-8)"
    integration_testcontainers: "none required"
    e2e_playwright: "optional; TestStrategist to confirm whether existing /rules coverage in apps/e2e already exercises this path before deciding"
```
