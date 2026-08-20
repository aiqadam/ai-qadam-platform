# Test Design — FR-CMS-008

Implements the plan in `06-test-strategy.md`: unit tests only (rubric score 1),
extending the existing FR-CMS-007 test file rather than adding a sibling, and
following that file's stated local-re-implementation convention — no
`global.fetch` mock, no `process.env` mock, no mocking library.

## Tests Written

### Unit

| File | Count / Focus | Required? |
|---|---|---|
| `apps/web-next/src/lib/cms-content-pages.test.ts` | **+15 tests** across 5 new `describe` blocks, all under a new `// ─── Tests: source_file → sourceFileUrl derivation (FR-CMS-008)` section appended after the existing content_documents tests. File total: **23 → 38**. | Yes |

Breakdown:

| `describe` | Tests | Covers |
|---|---|---|
| `sourceFileDownloadUrl — derivation (AC-5, AC-6)` | 4 | Full exact URL from a uuid; `?download` suffix asserted independently; `null` → `null`; empty-string id → `null` (not a base-only URL) |
| `sourceFileDownloadUrl — public base, never the internal host (MAJOR-2)` | 3 | Positive: starts with the public base. **Negative: does not contain `directus:8055` or `//directus`.** Scheme: matches `^https://` (guards the mixed-content downgrade half of MAJOR-2) |
| `normalizeContentDocumentRow — source_file mapping (AC-7, AC-8)` | 5 | uuid → derived URL; null → null; label intact *alongside* the URL (AC-7); label intact *without* the URL (AC-8's label-only degradation); every other mapped field (`id`, `slug`, `title`, `statusLabel`, `bodyMd`, `displayOrder`) untouched by the new derivation |
| `fetchContentDocument — sourceFileUrl on the detail path (AC-5, AC-8)` | 2 | The path `/rules/[slug]` actually uses: URL present when set; **document still returned (not null)** with a null URL and intact `bodyMd` when unset |
| `fetchContentDocuments — per-row source_file independence` | 1 | Mixed batch — row 0 has a URL, row 1 is null; no cross-contamination through the `.map` |

Two shared fixture builders (`documentRowWithoutSourceFile()`,
`documentRowWithSourceFile()`) return **fresh objects per call**, so there is no
shared mutable state between tests. The "with" builder spreads the "without" one
and overrides a single field, so the two fixtures cannot drift apart.

CodeDeveloper's pre-existing mirror was used as-is: `publicAssetUrl()`,
`sourceFileDownloadUrl()`, `PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test'`,
and `source_file` on all 4 original fixtures. **No mirror change was needed** —
it already matched `lib/cms.ts`, verified by reading both.

### Integration (Testcontainers)

| File | Count / Focus | Required? |
|---|---|---|
| — | none | **No** — rubric score 1; no Postgres/Drizzle schema, no NestJS service, no repository touched |

### E2E (Playwright)

| File | Count / Focus | Required? |
|---|---|---|
| — | none | **No** — see `06-test-strategy.md` § E2E Test Plan. `apps/e2e` is not CI-wired, and its `/rules` specs target production where `source_file` stays null until an operator seeds, so a download-link assertion would be flaky by construction |

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| **AC-1** — `source_file` field, uuid/nullable, `SET NULL` relation | No automated test (Directus schema state) — live-verified in security retry; UAT re-check via `GET /fields/content_documents` | Covered, not automated |
| **AC-2** — `source_file` in the public-read allowlist | No automated test (Directus permission state) — live-verified: anonymous read serialised the uuid | Covered, not automated |
| **AC-3** — 5 files uploaded + linked by the seed script | Operator/UAT — script is outside the CI path and needs gitignored binaries | Covered, not automated |
| **AC-4** — re-run creates no duplicate assets | Live-verified (`attach_source_file` run twice, file count stayed 1) + decoy probe on the folder-scoped lookup; UAT two-run re-check | Covered, not automated |
| **AC-5** — real, working download link | `sourceFileDownloadUrl — derivation` (4 tests) + `public base, never the internal host` (3) + `fetchContentDocument — detail path` (1 of 2) | ✅ Covered (unit) |
| **AC-6** — real filename preserved on download | `appends the ?download flag so Directus serves the real filename cross-origin` — asserts the client-side half of the contract (server half proven live) | ✅ Covered (unit) |
| **AC-7** — existing label still rendered, not replaced | `keeps sourceDocumentLabel intact alongside the derived URL` + `leaves every other mapped field untouched` | ✅ Covered (unit, data layer) |
| **AC-8** — null `source_file` renders as today | `returns null when the row has no source_file attached`, `leaves sourceFileUrl null when source_file is null`, `still renders the label when source_file is null`, `returns the document (not null) with a null sourceFileUrl` — 4 tests across 3 blocks | ✅ Covered (unit) |
| **AC-9** — other 3 FR-CMS-007 pages unmodified | Static diff assertion — a negative-scope AC has no meaningful automated equivalent | Covered, not automated |
| **AC-10** — arch:check / astro check / build pass | Build gate; TestRunner re-confirms | Covered by gate |
| **MAJOR-2** (SecurityReviewer regression guard) | `never emits the internal docker hostname` + `emits an https absolute URL` | ✅ Covered (unit) |

---

## Self-Check

| Check | Result |
|---|---|
| All new public functions have unit tests (happy + ≥1 failure path) | ✅ `sourceFileDownloadUrl` (and `publicAssetUrl` through it) — happy path plus two failure paths (`null`, `''`) |
| Integration tests use Testcontainers, never mock DB | ✅ N/A — no integration tests required, and none were written |
| No `it.skip` | ✅ Zero — `grep -c "it\.skip\|describe\.skip\|test\.skip"` → 0 |
| No `any` in test code | ✅ Zero. Fixture builders are explicitly typed `CmsContentDocumentRow`; the one `null` literal is annotated `const fileId: string \| null = null` so it is not inferred as `null`-only |
| AAA pattern | ✅ Every one of the 15 tests has explicit `// Arrange` / `// Act` / `// Assert` sections separated by blank lines |
| No shared mutable state | ✅ Fixtures are builder **functions** returning fresh objects per call, not module-level constants |
| Follows the file's local-re-implementation convention | ✅ No `global.fetch` mock, no `process.env` mock, no `vi.mock`. Uses the existing `simulatedFetchContentDocument(s)` helpers and the existing mirrored `sourceFileDownloadUrl` / `PUBLIC_DIRECTUS_BASE` |
| Coverage target (80% line / 70% branch / 100% error paths in business logic) | ✅ Both branches of `sourceFileDownloadUrl` and both branches of `publicAssetUrl` are exercised — 100% branch coverage of the new logic |
| Design system (UI component tests) | N/A — no component test written; the change is an Astro template conditional with no client script, and class compliance is a lint/review concern, not a unit-test one |

## Verification Run

| Check | Result |
|---|---|
| `pnpm vitest run src/lib/cms-content-pages.test.ts` | **1 file / 38 tests passed** (was 23 — all 23 pre-existing still pass, +15 new) |
| `pnpm biome check apps/web-next/src/lib/cms-content-pages.test.ts` | "Checked 1 file. No fixes applied." |
| `pnpm --filter web-next typecheck` | **0 errors, 0 warnings** (272 files) |

---

## Known Test Gaps

No `// TODO` comments were left in source or test code — every gap below is a
deliberate, reasoned scope decision from `06-test-strategy.md`, not something
that could have been written but wasn't.

1. **Directus schema and permission state (AC-1, AC-2)** — not automatable in
   this repo. Asserting the *text* of `bootstrap.sh` would test the script's
   contents rather than its effect, which is worse than no test because it
   passes while the effect is broken. Both were verified against a live
   Directus 11 during security review using code extracted verbatim from the
   edited files. UAT re-checks after `bootstrap.sh` runs.

2. **Seed-script upload and idempotency (AC-3, AC-4)** — the script is
   deliberately outside the CI/build path and depends on gitignored binaries in
   `portal-content/20260819/`. Verified live (two runs, file count stayed 1,
   plus a planted-decoy probe confirming the folder-scoped `filename_download`
   lookup is a real correctness fix). UAT should do one explicit two-run check.

3. **The server half of AC-6 (`Content-Disposition`)** — a unit test can only
   assert the client sends `?download`, which is what it does. That Directus
   *honours* the flag with `attachment; filename="AI Qadam Manifesto.docx"` was
   proven live and is not re-asserted here. Neither half substitutes for the
   other, which is why AC-6 is the one AC mapped to both.

4. **Rendered-template assertions on `/rules/[slug].astro`** — there is no
   Astro component-test harness in this repo (`apps/web-next` has no
   `@testing-library` or container-render setup for `.astro` files), so AC-7's
   and AC-8's *template* halves are covered at the data layer plus the existing
   `smoke-content-pages.spec.ts` `/rules/[slug]` specs, which today run against
   rows where `source_file` is null and would fail if the new conditional
   wrapper broke the page. Introducing an Astro test harness for two nested
   conditionals would be disproportionate new infrastructure.

5. **No new E2E** — reasoned and explicitly *not recommended* in the strategy
   (not merely skipped): `apps/e2e` has not been CI-wired since 2026-07-26 per
   its own README, and its `/rules` specs target production by default, where a
   download-link assertion would fail until an operator seeds and then start
   passing with no code change.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    15 new unit tests added to
    apps/web-next/src/lib/cms-content-pages.test.ts across 5 describe
    blocks, covering the sourceFileUrl derivation: the uuid → full URL
    happy path, the ?download flag (AC-6), null and empty-string absence
    (AC-8), label-alongside-URL independence (AC-7), the detail-fetcher
    path, per-row independence in the list fetcher, and a negative
    MAJOR-2 regression guard asserting the internal docker hostname is
    never emitted. File goes 23 → 38 tests, all passing; biome clean;
    typecheck 0 errors / 0 warnings. No integration or E2E tests written,
    per the strategy's rubric score of 1.
  findings:
    - "38/38 tests pass in apps/web-next/src/lib/cms-content-pages.test.ts (23 pre-existing + 15 new). Verified by running the file directly: 1 file / 38 tests passed, 220ms."
    - "MAJOR-2 is guarded NEGATIVELY as well as positively — the tests assert the derived URL does not contain 'directus:8055' or '//directus' and does match ^https://, not just that it starts with the mirrored public base. A positive-only assertion against a mirrored constant would be near-tautological; the negative one is what would actually catch a switch back to directusBase()."
    - "AC-6's ?download flag is asserted twice on purpose: once inside the full exact-URL equality, and once standalone via /\\?download$/. The standalone assertion is the one that fails loudly and legibly if a future refactor drops the flag, rather than surfacing as a confusing whole-string diff."
    - "AC-8 gets 4 tests across 3 describe blocks, not one — it is the steady state on every environment until the operator seed step runs, so both the derivation (null in → null out), the normalizer (label survives without a URL), and the detail fetcher (document still returned, not null, with bodyMd intact) are each locked down independently."
    - "Empty-string file id was added as a second failure path beyond null. sourceFileDownloadUrl's guard is falsy-based (`if (!fileId)`), so '' must yield null rather than a base-only '/assets/?download' URL — a distinct branch worth pinning."
    - "Fixtures are builder FUNCTIONS returning fresh objects per call, not module-level constants, so there is no shared mutable state between tests. documentRowWithSourceFile() spreads documentRowWithoutSourceFile() and overrides one field, so the two cannot drift."
    - "CodeDeveloper's local re-implementation mirror needed no changes — it was read against lib/cms.ts and already matched (publicAssetUrl, sourceFileDownloadUrl, PUBLIC_DIRECTUS_BASE, source_file on all 4 original fixtures). The convention was followed: no global.fetch mock, no process.env mock, no vi.mock introduced."
    - "Self-check clean: zero it.skip/describe.skip/test.skip, zero `any` (the one null literal is annotated `const fileId: string | null = null` so it is not inferred as null-only), explicit Arrange/Act/Assert sections in all 15 tests, 100% branch coverage of both new helpers."
    - "biome check on the changed file: 'Checked 1 file. No fixes applied.' pnpm --filter web-next typecheck: 0 errors, 0 warnings (272 files)."
    - "No TODO comments left in source or tests. Every uncovered AC (AC-1, AC-2, AC-3, AC-4, AC-9, and the server half of AC-6) is a reasoned scope decision carried over from the strategy — Directus schema/permission state and an operator-run bash script have no meaningful CI-runnable equivalent here, and asserting bootstrap.sh's text would test the script's contents rather than its effect."
    - "No Astro component-test harness exists in apps/web-next, so AC-7/AC-8's template halves are covered at the data layer plus the existing smoke-content-pages.spec.ts /rules/[slug] specs (which today run against null source_file rows and would fail if the new conditional wrapper broke the page). Adding such a harness for two nested conditionals would be disproportionate."
```
