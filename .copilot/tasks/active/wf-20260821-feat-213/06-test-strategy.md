# Test Strategy — FR-CMS-008

## Requirement

**FEAT-CMS-8 / FR-CMS-008** — Community Rules & Documents source-file download
link. Extends FR-CMS-007.

Adds a nullable `source_file` uuid field (relation → `directus_files.id`,
`on_delete: SET NULL`) to the `content_documents` Directus collection; creates a
dedicated `public-documents` folder plus a folder-scoped, 6-field-allowlisted
`directus_files/read` grant for the Public policy; appends `source_file` to the
existing `content_documents` public-read allowlist; extends
`seed-content-documents.sh` to idempotently upload and link the 5 source
`.docx` files; derives `sourceFileUrl` in `apps/web-next/src/lib/cms.ts` via a
new `publicAssetUrl()` + `sourceFileDownloadUrl()` pair; and renders it on
`/rules/[slug]` as an additive `<a href download>` beside — never replacing —
the existing `source_document_label`.

Full text and the 10 ACs: `01-requirement-validation.md`.

---

## Rubric Score

**Score: 1 → Unit tests sufficient.**

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | No — `content_documents` is global/public content with no `countryCode` scoping (confirmed by ImpactAnalyzer and re-confirmed by SecurityReviewer's INV-1 check: N/A, no `bypassTenant()` call, no tenant-scoped table touched) | 0 |
| New API endpoint | No — zero `apps/api` surface. Content reads bypass NestJS entirely via `lib/cms.ts` direct-to-Directus SSR fetch (`architecture.md` L143-156). Directus's own auto-generated `/items` and `/assets/:id` routes are schema-driven, not hand-written endpoint code | 0 |
| Business rule with edge cases (capacity, waitlist, dates) | No — there is no business rule here. The only branching is `fileId ? url : null` | 0 |
| Cross-module service call | No — no NestJS→NestJS and no new NestJS→Directus call. The one genuinely new hop is browser → Directus `/assets/:id`, which is a plain `<a href>` navigation, not a service call | 0 |
| New database query | Yes (weak) — `source_file` is appended to `CONTENT_DOCUMENT_LIST_FIELDS`, changing the Directus `fields` query param on two existing fetchers. Not a new query, but not nothing | +1 |
| Pure function / utility | Yes — `publicAssetUrl()` and `sourceFileDownloadUrl()` are pure `string \| null → string \| null` functions with no I/O | 0 |
| UI-only change (no logic) | Yes — `rules/[slug].astro` gains two nested conditionals and one `<a>`; no state, no handler, no client script | 0 |

**Score 1 < 4 → Unit tests sufficient. No Testcontainers integration tests. No
new Playwright E2E.**

Justification beyond the arithmetic: this is a small additive change with no
Drizzle migration (confirmed by grep of all 17 `apps/api/src/db/migrations/`
files — zero `content_documents`/`source_file` matches), no `apps/api` surface,
no shared-types change, no bot/workers involvement. The entire testable-in-CI
logic surface is one pure derivation function.

---

## Required Test Levels

- [x] **Unit** — required. `apps/web-next/src/lib/cms-content-pages.test.ts`,
      extending the existing `content_documents` section.
- [ ] **Integration (Testcontainers)** — **not required**. Testcontainers in
      this repo exists for NestJS-service + Postgres integration
      (`apps/api`). No Postgres/Drizzle schema, no NestJS service, and no
      repository is touched by this FR. The only "database" involved is
      Directus-managed and reached over HTTP by an operator-run bash script.
      Spinning a Directus container to assert a bash script's `curl` calls
      would be new test infrastructure with no precedent in this repo, for a
      script explicitly outside the CI/build path.
- [ ] **E2E (Playwright)** — **not required**. See "E2E Test Plan" below for
      the reasoning and the one deliberate non-recommendation.

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `sourceFileDownloadUrl(fileId)` (mirrored in the test file per its local-re-implementation convention) | A non-null uuid yields `${PUBLIC_DIRECTUS_URL}/assets/${uuid}?download` — asserted as a full exact string, including the `?download` flag (AC-6) and the public HTTPS host | `null` in → `null` out (AC-8's graceful absence at the data layer) |
| `publicAssetUrl(fileId)` (via the same call chain) | Emits the **public** base | **Must NOT emit the internal Docker hostname** (`directus:8055`) — MAJOR-2's regression guard. Asserted negatively as well as positively, because this failure is silent: the page still renders a link, it just 404s/DNS-fails for every visitor |
| `normalizeContentDocumentRow(row)` | `source_file: <uuid>` → `sourceFileUrl` set; all pre-existing mapped fields (`sourceDocumentLabel`, `statusLabel`, `bodyMd`, `displayOrder`) unchanged alongside it (AC-7's data-layer half: the label is not replaced by the URL) | `source_file: null` → `sourceFileUrl: null` while `sourceDocumentLabel` stays non-null — the exact shape `/rules/[slug]` must render label-only from |
| `fetchContentDocuments()` (list fetcher, simulated) | Mixed batch: one row with `source_file`, one without → per-row independence, no cross-contamination | Directus unreachable / non-OK → `[]` (already covered by 3 existing tests; no new failure case introduced by this FR) |
| `fetchContentDocument(slug)` (detail fetcher, simulated) | Detail row with `source_file` → `sourceFileUrl` present on the single-row path too (this is the path `/rules/[slug]` actually uses) | Detail row without `source_file` → null URL, row still returned (not null) — proves absence degrades the field, not the page |

**Convention (binding on TestDesigner):** this file's stated convention (header
comment L1-7) is a **local re-implementation** that mirrors `lib/cms.ts`
line-for-line — no `global.fetch` mock, no `process.env` mock, no mocking
library. CodeDeveloper has already synced the mirror (`publicAssetUrl`,
`sourceFileDownloadUrl`, `source_file` on all 4 fixtures, and a deliberately
*different* `PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test'` host so a
regression to the internal base is visible as a changed host). Do not introduce
network mocking; extend the mirror.

---

## Integration Test Plan

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| — | — | **None required.** Rubric score 1. No Postgres/Drizzle schema, no NestJS service, no repository, no queue. Testcontainers is not the right tool for a Directus-managed schema mutated by an operator-run bash script that is deliberately outside the CI path. |

---

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| — | — | **None required.** Not recommended even as an optional addition. |

Reasoning, since the ImpactAnalyzer explicitly deferred this call here:

1. **`apps/e2e` is not CI-gating in this repo.** `apps/e2e/README.md` states
   plainly: *"As of 2026-07-26, this suite is not wired into CI at all."* A new
   spec there would be tooling, not a gate — it would not protect this change
   on any future PR. This is the FR-CMS-007 precedent the brief refers to, and
   it argues against, not for, adding more here.
2. **Existing `/rules/[slug]` coverage already carries the regression risk that
   matters.** `apps/e2e/tests/smoke-content-pages.spec.ts` already covers
   `/rules` (5 documents, distinct slugs), `/rules/[slug]` terminology, the
   superseded label, unknown slugs, and path-traversal — including a
   `RulesLibraryPage` Page Object. That suite targets **production** by
   default, where `source_file` will be null until an operator runs the seed
   script. A new assertion for a download link would therefore fail against
   production for an indeterminate window and then start passing with no code
   change — a flaky, environment-dependent test, which is worse than no test.
3. **AC-8 (the null case) is already exercised by that existing suite today.**
   Every current `/rules/[slug]` smoke test runs against rows with
   `source_file` null; if the new conditional wrapper broke the page, those
   specs would fail. That is real coverage obtained for free.
4. **The rendering itself is two nested conditionals and one `<a>` tag** — no
   state, no handler, no client script. `astro check` + `pnpm build` (AC-10)
   cover the compile surface; the derivation underneath is unit-tested.

**Recommendation instead of E2E:** carry AC-3/AC-4/AC-6 into the UAT step as
explicit operator checks (see the mapping table), which is where this repo
already verifies FR-CMS-007's own seeding.

---

## Acceptance Criteria → Test Mapping

**On the SecurityReviewer's live evidence** (the question the brief asks to
answer explicitly): the retry-1 review verified AC-5, AC-6, AC-4, and the
folder-scoped enumeration constraints against a live Directus 11 using code
extracted **verbatim from the edited files via `sed`, not retyped**, and then
restored the environment and verified the restoration. That is genuine
verification — those ACs are **satisfied**, and this strategy does not
prescribe automated tests whose only purpose would be to re-assert what has
already been demonstrated on the real system.

But it is **not regression coverage**, and the two must not be conflated:

- It was a *point-in-time* execution against a *transient* environment that no
  longer exists (explicitly torn down: 0 files, 0 folders, 0 grants, field and
  relation dropped).
- It exercised the **shell/Directus half** of the chain. It cannot re-run on a
  future PR and cannot catch a future edit to `cms.ts`.

So the split below is: **live-verified** where the evidence is conclusive and
no CI-runnable equivalent exists (schema, permissions, shell idempotency,
`Content-Disposition`), and **unit-tested** for exactly the part that lives in
TypeScript and *can* regress silently on a future PR — the URL derivation. The
one place both apply is AC-6: SecurityReviewer proved the server honours
`?download`; the unit test proves the client keeps *sending* it. Neither alone
is sufficient — the flag could be dropped from `sourceFileDownloadUrl()`
tomorrow and the live evidence would still read as "verified."

| AC | Test Level | Test Description |
|---|---|---|
| **AC-1** — `source_file` field exists, uuid/nullable, relation to `directus_files.id`, `on_delete: SET NULL` | Static + live-verified (no automated test) | Directus schema state, not application logic. Verified live in the security retry (field + `SET NULL` relation recreated from the shipping literals, then dropped). Re-verified at UAT via `GET /fields/content_documents` after `bootstrap.sh`. No CI-runnable equivalent exists — asserting the contents of a bash script would test the script's text, not its effect. |
| **AC-2** — `source_file` in the public-read allowlist; anonymous read returns it | Live-verified (no automated test) | Proven in security retry §2: anonymous `GET /items/content_documents?filter[slug][_eq]=manifesto&fields=slug,source_file` returned the uuid. Confirms the allowlist append is load-bearing exactly as the inline do-not-trim comment warns. Directus permission state; not unit-testable. |
| **AC-3** — 5 files uploaded and linked by the seed script | Operator/UAT (no automated test) | The script is deliberately outside the CI path and depends on gitignored binaries in `portal-content/20260819/`. Verified in the security retry for one document end-to-end; the remaining 4 are the same code path with different literals. UAT: run the script, then assert 5 non-null `source_file` values. |
| **AC-4** — re-run creates no duplicate `directus_files` rows | Live-verified + UAT (no automated test) | Security retry ran `attach_source_file` twice: file count stayed 1. The three-stage idempotency (row already linked → folder-scoped `filename_download` match → upload) was additionally probed with a planted decoy proving the folder scoping is a real correctness fix, not tidying. UAT re-check: two consecutive runs, `GET /files` count unchanged. |
| **AC-5** — real, working download link rendered with existing design-system classes | **Unit** (URL correctness) + live-verified (server side) + static (classes) | Unit: `sourceFileUrl` is a well-formed absolute URL on the **public** base — the half that can regress in TypeScript. Live: anonymous `GET /assets/<in-folder>?download` → `200`, `Content-Type: …wordprocessingml.document`. Classes: all utilities already used elsewhere in the file (`text-xs`, `font-medium`, `text-primary`, `hover:underline`), no raw hex, no new token — covered by lint/`biome` and the design-system review, not by a unit test. |
| **AC-6** — original filename/extension preserved on download | **Unit** (`?download` is emitted) + live-verified (server honours it) | Both halves are needed and neither substitutes for the other. Unit: assert the derived URL ends in `?download` — this is the client-side contract that could be silently dropped by a future refactor, and it is precisely the mechanism AC-6 depends on cross-origin. Live: `Content-Disposition: attachment; filename="AI Qadam Manifesto.docx"` observed on a real anonymous request. |
| **AC-7** — existing `source_document_label` still rendered, not replaced | **Unit** (data layer) + static (template) | Unit: `normalizeContentDocumentRow` maps `sourceDocumentLabel` and `sourceFileUrl` as independent fields — a row with both set yields both, so the URL cannot have displaced the label. Template: the label `<p>` is unchanged in the diff and its `{doc.sourceDocumentLabel && …}` guard is intact; confirmed by diff review, and by the existing smoke spec which already asserts label content on `/rules/[slug]`. |
| **AC-8** — row with null `source_file` renders exactly as today | **Unit** (primary) | `source_file: null` → `sourceFileUrl: null` with `sourceDocumentLabel` still non-null. This is the steady state on every environment until the operator runs the seed script, so it is the single most important case to lock down, and it is fully unit-testable. Structurally reinforced by the wrapper div's own `(label \|\| url)` guard so no stray `mb-8` spacer is emitted; and by the existing `/rules/[slug]` smoke specs, which today run against exactly this null state. |
| **AC-9** — `/about`, `/history`, `/partners` unmodified | Static (diff assertion) | Verified by diff: no file under those routes is touched, nor any `apps/api`, `packages/shared-types`, `apps/bot`, or `apps/workers` file. A negative-scope AC is asserted by inspection, not by a test. Also protected by the existing `smoke-content-pages.spec.ts` coverage of those three pages. |
| **AC-10** — `pnpm arch:check`, `astro check`, `pnpm build` pass | Build gate (CI) | Already green per CodeDeveloper and re-run independently by SecurityReviewer: typecheck 0 errors/0 warnings (272 files), 1081 tests across 44 files, `arch:check` ✓ (289 files, mode=full), build "Complete!". TestRunner re-confirms. |

**Coverage summary:** 10/10 ACs mapped. 4 of 10 (AC-5 partial, AC-6 partial,
AC-7 partial, AC-8) get new automated unit coverage; the rest are
live-verified, static, or build-gate — each with the reason stated inline
rather than left as an unexplained gap.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    Rubric score 1 (< 4) — unit tests sufficient. No Testcontainers
    integration tests (no Postgres/Drizzle schema, no NestJS service, no
    repository touched) and no new Playwright E2E (apps/e2e is not
    CI-gating per its own README, its /rules specs target production
    where source_file stays null until an operator seeds, and the
    existing smoke coverage already exercises AC-8's null state for
    free). All 10 ACs mapped: 4 to new unit assertions on the
    sourceFileUrl derivation, the rest to SecurityReviewer's live
    Directus evidence, static diff assertions, or the existing build
    gate — each with its reason stated.
  findings:
    - "Rubric score 1: only +1 (source_file appended to CONTENT_DOCUMENT_LIST_FIELDS, changing an existing Directus fields param — not a new query). Every other criterion scores 0: no tenant-scoped data, no new API endpoint, no business rule with edge cases, no cross-module service call. The new helpers are pure string functions."
    - "SecurityReviewer's live evidence IS accepted as verification for AC-1, AC-2, AC-3, AC-4 and the server half of AC-5/AC-6 — it executed code extracted verbatim from the edited files (via sed, not retyped) against a live Directus 11, including negative cases and 8 self-designed bypass probes, then restored and re-verified the environment. Prescribing automated tests to re-assert that would be duplicated effort against a torn-down environment."
    - "But live evidence is explicitly NOT treated as regression coverage: it was point-in-time against a transient environment, and it exercised the shell/Directus half of the chain — it cannot re-run on a future PR and cannot catch a future edit to cms.ts. The TypeScript half therefore still needs unit tests."
    - "AC-6 deliberately gets BOTH: SecurityReviewer proved the server honours ?download (Content-Disposition: attachment; filename=\"AI Qadam Manifesto.docx\"); the unit test proves the client keeps SENDING it. Drop the flag from sourceFileDownloadUrl() tomorrow and the live evidence would still read as 'verified' while every download silently reverted to inline under a uuid filename."
    - "MAJOR-2 regression guard is prescribed as a NEGATIVE assertion, not just a positive one: the test must assert the derived URL does NOT contain the internal docker hostname. That regression is silent — the page still renders a link, it just DNS-fails for every visitor — so a positive-only assertion on a mirrored constant would be weaker than it looks. The mirror's PUBLIC_DIRECTUS_BASE is deliberately a different host from the internal base, which is what makes the negative assertion meaningful."
    - "E2E explicitly NOT recommended, not merely 'optional' — the ImpactAnalyzer left this call to TestStrategist and it is answered here. apps/e2e/README.md states the suite is not wired into CI at all (since 2026-07-26), so a new spec would not gate anything; and apps/e2e/tests/smoke-content-pages.spec.ts targets production by default, where source_file is null until an operator seeds — a download-link assertion there would fail for an indeterminate window then start passing with no code change. Flaky-by-construction is worse than absent."
    - "Existing /rules/[slug] smoke coverage (smoke-content-pages.spec.ts, with a RulesLibraryPage Page Object) already runs against rows where source_file is null, so it exercises AC-8's graceful-absence path today at no cost — a genuine argument that the E2E gap is smaller than it appears."
    - "Testing convention is binding on TestDesigner: this file's stated convention (header L1-7) is a local re-implementation mirroring lib/cms.ts line-for-line — no global.fetch mock, no process.env mock, no mocking library. CodeDeveloper has already synced the mirror (publicAssetUrl, sourceFileDownloadUrl, source_file on all 4 fixtures) with no new assertions; extend it rather than introducing network mocking."
    - "AC-9 (negative scope) and AC-1/AC-2 (Directus schema/permission state) have no meaningful automated equivalent in this repo — asserting the text of bootstrap.sh would test the script's contents rather than its effect. Recorded as static/live rather than left as an unexplained gap."
```
