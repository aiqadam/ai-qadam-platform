# Test Results — wf-20260821-feat-213 (FR-CMS-008)

## Context note

Executed directly by the Orchestrator rather than delegated, since this
step is a fixed command sequence whose output is verifiable firsthand.
Same scoping rationale as FR-CMS-007's own run (`wf-20260819-feat-212`):

- **Integration tests (Testcontainers-Postgres): N/A.** No `apps/api`
  surface exists in this workflow — independently confirmed via
  `02-impact-analysis.md`'s grep across `apps/api/src` (zero
  `content_documents`/`source_file` references) and by `git status`
  showing no `apps/api` file in the diff. There is nothing to
  integration-test. Not a gate failure.
- **E2E: deliberately not added**, per `06-test-strategy.md`'s explicit
  recommendation (not merely "optional"). `apps/e2e/README.md` documents
  that suite as un-wired from CI since 2026-07-26, and its
  `smoke-content-pages.spec.ts` targets production by default — where
  `source_file` stays null until an operator runs the seed script, so a
  download-link assertion would fail for an indeterminate window then
  begin passing with no code change. Flaky-by-construction was judged
  worse than absent.
- **Live Directus verification** for the Directus-side ACs was performed
  by SecurityReviewer during its retry review (see `04-security-review.md`
  §Retry Verification) — anonymous `200` + `Content-Disposition:
  attachment; filename="AI Qadam Manifesto.docx"`, out-of-folder `403`,
  constrained enumeration, idempotent re-run. Treated by
  `06-test-strategy.md` as genuine verification but explicitly NOT as
  regression coverage (point-in-time, environment since torn down).

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit (`apps/web-next`, full suite) | 1096 (44 files) | 1096 | 0 | 0 |
| — of which new this workflow | 15 | 15 | 0 | 0 |
| Integration (Testcontainers) | N/A | N/A | N/A | N/A — no `apps/api` surface |
| E2E (Playwright) | 0 | — | — | Not added, by strategy decision (see above) |

## Type Check

`pnpm typecheck` (repo-wide, turbo, 4 packages) — **PASS**, 4/4 tasks
successful, 0 errors.

## Lint / Format Check

`pnpm biome check` scoped to this PR's changed TS/JSON files
(`cms.ts`, `cms-content-pages.test.ts`, `en.json`, `ru.json`) —
**clean**, `Checked 4 files in 8ms. No fixes applied.`

`.astro` files are repo-wide excluded from Biome (`biome.json`), and the
two changed shell scripts are not Biome targets — both validated with
`bash -n` instead (see below).

## Shell Script Validation

- `bash -n infrastructure/directus/bootstrap.sh` — syntax OK
- `bash -n infrastructure/directus/seed-content-documents.sh` — syntax OK

(`shellcheck` is not installed in this environment. The live end-to-end
execution performed by CodeDeveloper's retry and independently
re-verified by SecurityReviewer — running the functions extracted
verbatim from the edited files against a real Directus — is materially
stronger evidence than a static lint pass would have been.)

## Architecture Check

`pnpm arch:check` — **PASS**, 289 files scanned, mode=full, 0
violations. Confirms `no-inline-style` / `no-raw-fetch` /
`page-not-from-generator` locks all still hold for the changed
`rules/[slug].astro`.

## Build

`pnpm build` (repo-wide, turbo) — **PASS**, 4/4 tasks successful.

One pre-existing, unrelated warning: `no output files found for task
@aiqadam/storybook#build. Please check your outputs key in turbo.json` —
a turbo config nit on an untouched package, present before this branch.

## Failed Tests

None.

## Flaky Tests

None observed. No `@flaky` tags in the new tests.

## Coverage

- `apps/web-next/src/lib/cms-content-pages.test.ts` — 38 tests (was 23;
  +15 this workflow), covering the new `sourceFileUrl` derivation across
  5 describe blocks: derivation, public-base guard, normalizer mapping,
  detail-fetcher path, list per-row independence.
- Per `06-test-design.md`: 100% branch coverage of both new helpers
  (`publicAssetUrl`, `sourceFileDownloadUrl`).
- Notable regression guards: MAJOR-2 is asserted **negatively** (the
  emitted URL must not contain `directus:8055` or `//directus`, and must
  match `^https://`), which is what actually catches a future switch back
  to `directusBase()`; AC-6's `?download` flag is asserted both inside
  the exact-URL equality and standalone so a dropped flag fails legibly.
- AC-8 (graceful absence when `source_file` is null) is pinned by 4
  tests across 3 blocks, since that is the steady state on every
  environment until an operator runs the seed script.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    All mandatory checks pass for this workflow's actual surface
    (apps/web-next + infrastructure/directus, no apps/api change):
    typecheck 4/4 tasks 0 errors, scoped biome clean on all 4 changed
    TS/JSON files, full apps/web-next unit suite 1096/1096 across 44
    files (15 new this workflow, 38 total in the target file), arch:check
    289 files 0 violations, pnpm build 4/4 successful, and bash -n clean
    on both changed shell scripts. Integration tests correctly N/A (no
    apps/api surface, independently confirmed). E2E deliberately not
    added per the test strategy's reasoned recommendation, since this
    project's E2E suite is un-wired from CI and targets production where
    the feature's data is intentionally absent until an operator seeds.
    Directus-side ACs were verified live by SecurityReviewer's retry
    review and are recorded there rather than duplicated as brittle
    automated coverage.
  findings:
    - "1096/1096 unit tests pass (44 files); 15 new tests added this workflow, all passing."
    - "MAJOR-2 (internal-docker-URL leak) is guarded by a negative assertion rather than a tautological positive one — the test fails if the URL ever contains directus:8055 or //directus."
    - "Integration tier correctly N/A: no apps/api/NestJS surface in this diff, confirmed by grep and git status, not assumed."
    - "E2E deliberately omitted per 06-test-strategy.md — adding one would be flaky-by-construction against a production target where source_file is null until an operator seeds. The existing smoke-content-pages.spec.ts already exercises the null-source_file path (AC-8) for free."
    - "One pre-existing unrelated build warning (storybook turbo outputs key) — present before this branch, not introduced here."
  typecheck: passed
  lint_format_check: passed_scoped
  arch_check: passed
  build: passed
  unit_tests_run: 1096
  unit_tests_passed: 1096
  integration_tests_run: 0
  integration_tests_na_reason: "No apps/api surface in this workflow — independently confirmed"
  e2e_tests_run: 0
  e2e_omitted_reason: "Strategy decision — suite is non-CI-gating and prod-targeted; assertion would be flaky-by-construction"
  blocking: false
  route_to: none
```
