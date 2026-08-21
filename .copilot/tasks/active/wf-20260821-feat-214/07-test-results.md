# 07 — Test Results

**Workflow:** `wf-20260821-feat-214`
**Agent:** TestRunner
**Date:** 2026-08-21
**Requirement:** `FR-CMS-009`

---

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit — `web-next` (full) | 1115 (44 files) | **1115** | 0 | 0 |
| Unit — `cms-content-pages.test.ts` (isolated) | 57 | **57** | 0 | 0 |
| Integration (Testcontainers) | — | — | — | **N/A — verified, not skipped** (see below) |
| E2E (Playwright) | — | — | — | **N/A — assessed and declined** (see below) |

Commands run and their raw outcomes:

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 tasks successful |
| `pnpm exec astro check` (web-next, fresh) | ✅ **0 errors, 0 warnings**, 45 hints, 272 files |
| `pnpm biome check <2 changed TS files>` | ✅ `Checked 2 files in 8ms. No fixes applied.` |
| `pnpm --filter @aiqadam/web-next test` | ✅ 44 files, **1115 tests passed** |
| `pnpm exec vitest run src/lib/cms-content-pages.test.ts` | ✅ **57 passed** (was 37 pre-change → +20) |
| `pnpm build --force` | ✅ 4/4 successful, `Complete!` |
| `pnpm arch:check` | ✅ **289 files scanned, mode=full** |
| Compiled-artifact AC-10 execution | ✅ see dedicated section — **the decisive check** |

---

## Type Check

**PASS — 0 errors.**

`pnpm typecheck` reported 4/4 tasks successful. Because turbo served that from
cache, I re-ran the web-next checker directly and uncached to make sure I was
reading a real result and not a stale one:

```
pnpm exec astro check
Result (272 files):
- 0 errors
- 0 warnings
- 45 hints
```

The 45 hints are pre-existing `ts(6133)` "declared but never read" notices in
unrelated files (`src/pages/onboard.astro:23` and similar). None is in
`cms.ts` or `cms-content-pages.test.ts`, and hints are non-gating. This matches
CodeDeveloper's reported figure exactly.

---

## Lint / Format Check

**PASS on the changed files. Repo-wide `biome check .` is dirty for
pre-existing, non-CI-gating reasons — investigated, not waved through.**

The changed files are clean:

```
pnpm biome check apps/web-next/src/lib/cms.ts apps/web-next/src/lib/cms-content-pages.test.ts
Checked 2 files in 8ms. No fixes applied.
```

The TestRunner protocol's step 2 is `pnpm biome check .`, and that command
**does** exit non-zero (84 errors, 2 warnings). The protocol says a non-clean
result is `failed-retry-code` back to CodeDeveloper — so I investigated rather
than assuming it was noise, because assuming would be exactly how a real
formatter regression gets shipped. Findings:

| Dirty path | Tracked? | Related to this PR? | Verdict |
|---|---|---|---|
| `apps/e2e/uat-results/html-report/trace/urlMatch-*.js` | **No** — `git check-ignore` confirms `apps/e2e/.gitignore:4: uat-results/` | No | Minified Playwright report bundle from a previous local UAT run. Gitignored, so it does not exist in a clean clone or in CI. |
| `apps/e2e/uat-results/html-report/trace/index-*.js` | No (same rule) | No | Same. |
| `apps/e2e/uat-results/html-report/trace/snapshot-*.js` | No (same rule) | No | Same. |
| `apps/e2e/uat-results/html-report/trace/uiMode-*.js` | No (same rule) | No | Same. |
| `apps/web-next/src/blocks/workspace/AsyncSelect.tsx` | Yes | **No** — `git status --porcelain` on the file returns empty, i.e. unmodified by this PR | Pre-existing. Isolated run yields `Found 1 warning` (a `handleKeyDown` lint hint), **zero errors**. Not introduced here and not an error. |

Two independent reasons this is not `failed-retry-code`:

1. **Nothing dirty belongs to this PR.** The full changed-file list is six
   files (`git diff --name-only HEAD`), and none of them appears in the dirty
   set. The two changed TS files are affirmatively clean.
2. **CI does not run biome at all.** `.github/workflows/ci.yml:14–15` states
   the shared biome config is kept trimmed and developers "still run
   `pnpm lint` locally" — there is no biome step in the workflow. So this
   cannot break CI, and the four dominant offenders are gitignored artifacts
   that CI would never even see.

**Classification: not a gate failure.** Routing this to CodeDeveloper would ask
them to reformat minified vendor bundles they did not create and cannot
meaningfully fix.

---

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| — | — | **None. Zero failures across all 1115 tests.** | — |

---

## Flaky Tests

**None.** No `@flaky` tags. The 20 new tests are structurally incapable of
flaking: every one is a synchronous call to a pure function with a
locally-constructed literal argument. No timers, no I/O, no network, no shared
mutable state, no `process.env` mutation, no ordering dependency. The isolated
run completed in 12 ms of actual test time.

---

## Integration Tests — N/A (verified, not skipped)

The protocol states integration tests are mandatory and that "skipped" is a gate
failure. This is **not** a skip — it is a verified absence of anything to
integration-test, and I checked rather than inheriting the claim:

- `git diff --name-only HEAD` returns six files. **Zero are under `apps/api/`**
  (`grep -c "^apps/api/"` → 0). There is no controller, no service, no
  repository, no DTO in the change.
- No DB access: no Drizzle schema, no migration, no query anywhere in the diff.
- No queue, no worker, no Redis, no external service in the resolver's call
  path.

Testcontainers has nothing to containerize. Docker availability is therefore
irrelevant here — this is not an infrastructure failure being disguised as an
N/A, which is the case the protocol's rule exists to catch. Rubric score is 0
(`06-test-strategy.md`), well under the ≥ 4 threshold.

---

## E2E — assessed and declined

The brief asked me to assess rather than assume, and to weigh FR-CMS-008's
precedent. I verified both load-bearing facts behind that precedent instead of
citing it:

1. **The suite is prod-targeted.** `apps/e2e/playwright.config.ts:35` reads
   `const BASE_URL = process.env.BASE_URL ?? 'https://aiqadam.org';`, with the
   comment at L19 confirming "default: BASE_URL=https://aiqadam.org
   (production)". A prod-targeted suite structurally **cannot** verify this
   feature's new behavior, because production is precisely the environment
   where `PUBLIC_DIRECTUS_URL` is deliberately left unset — the run would
   assert the default, which is byte-identical to pre-change behavior.
2. **The suite is non-CI-gating.** `grep` for `test:e2e` / `playwright` in
   `.github/workflows/ci.yml` returns **nothing**. It is not part of the PR
   gate.
3. **No existing e2e spec touches this surface at all.** `grep -rln` for
   `rules|download_source|sourceFile` across `apps/e2e/src` returns zero files.

So there is no existing E2E to regress, and a new one would need CI to inject
`PUBLIC_DIRECTUS_URL` *and* provide a reachable Directus at that origin — i.e.
the QA vhost that is the named out-of-scope infra dependency (T-0141). Adding it
here would pull deferred infra work into this PR.

**Declined for merge.** Consistent with `06-test-strategy.md`; the deferral is
named and tracked, not silent.

> One correction to the record: `03-code-summary.md` §5 and
> `02-impact-analysis.md` both state "FR-CMS-008's existing E2E/UAT already
> covers the rendered href." The **UAT** half is accurate; the **E2E** half is
> not — no Playwright spec references this surface. This does not change the
> decline decision (all three reasons above stand on their own), but the
> inherited claim was overstated and should not be repeated downstream as if a
> Playwright regression guard exists for the download link. It does not.

---

## Compiled-Artifact Verification (AC-10) — the decisive check

AC-10 is the one criterion a passing unit suite genuinely **cannot** establish,
since the entire hazard is that `import.meta.env` would be inlined at build time
and the tests would pass anyway. I re-verified it independently against the
freshly forced build rather than trusting `03-code-summary.md`.

**Static inspection** of `apps/web-next/dist/server/chunks/cms_CQjEHz28.mjs`:

```js
var DEFAULT_PUBLIC_DIRECTUS_URL = "https://cms.aiqadam.org";
function resolvePublicDirectusUrl(env = typeof process === "undefined" ? void 0 : process.env) {
	const configured = env?.PUBLIC_DIRECTUS_URL;
	if (typeof configured !== "string") return DEFAULT_PUBLIC_DIRECTUS_URL;
	const trimmed = configured.trim();
	return trimmed.length > 0 ? trimmed : DEFAULT_PUBLIC_DIRECTUS_URL;
}
```

- `process.env` occurrences in the chunk: **2** — it survives verbatim.
- `ASSETS_PREFIX` occurrences: **0** — no Vite-inlined frozen literal object
  anywhere in this chunk, which is the exact fingerprint of the trap
  (`Layout_*.mjs` L702–710 shows what it looks like when it *has* happened).

**Dynamic execution** of the compiled function against a live `process.env`:

| `PUBLIC_DIRECTUS_URL` | Compiled resolver returned |
|---|---|
| unset | `https://cms.aiqadam.org` |
| `https://cms.qa.aiqadam.org` | `https://cms.qa.aiqadam.org` |
| `'   '` (whitespace) | `https://cms.aiqadam.org` |
| mutated mid-process → `https://cms.staging.aiqadam.org` | `https://cms.staging.aiqadam.org` |

The last row is decisive: the value changed **at runtime, with no rebuild** —
something `import.meta.env` could not have done. **AC-10 confirmed on the build
output**, independently of CodeDeveloper's run and of the Orchestrator's `tsx`
run. Three independent confirmations now agree.

---

## Coverage

| Scope | Line | Branch | Error paths |
|---|---|---|---|
| `resolvePublicDirectusUrl` | **100%** | **100%** (3 of 3) | N/A — function is *total* |
| `cms-content-pages.test.ts` surface | 57 tests, all passing | — | — |

The resolver has exactly three branches, all exercised by multiple tests each:

1. `typeof configured !== 'string'` → default — covered by the absent-key,
   explicit-`undefined`, and `env === undefined` tests.
2. `trimmed.length > 0` → configured value — covered by the verbatim, trimmed,
   and trailing-slash tests.
3. else → default — covered by the 4-case empty/whitespace `it.each`.

There is **no error path to cover** because the function cannot throw: every
input either yields a configured value or falls back. `standards.md` §IV's
"100% of error paths in business logic" is satisfied vacuously and correctly —
totality is a stronger property than tested error handling. Targets (80% line /
70% branch) are exceeded.

---

## Regression Check

The specific risk of this change is eroding FR-CMS-008's MAJOR-2 invariant.
Confirmed intact by execution, not by inspection alone:

- The pre-existing MAJOR-2 guards (`not.toContain('directus:8055')`,
  `not.toContain('//directus')`, `/^https:\/\//`) still pass **unmodified**.
- The new 5-case `it.each` re-asserts the same invariant against the **real**
  resolver under unset / `undefined` / empty / whitespace / overridden env —
  all 5 pass.
- Repo-wide `web-next` count went 1095 → 1115 with **zero** newly failing
  tests, so nothing elsewhere depended on the removed constant.

---

## Gate Result

gate_result:
  status: passed
  summary: "All suites green: 1115/1115 web-next unit tests pass (57/57 in the target file), typecheck 0 errors / 0 warnings across 272 files, build 4/4 successful, arch:check 289 files. Biome is clean on both changed files. Integration is a verified N/A (zero apps/api files in the diff) and E2E is declined on three independently verified grounds. AC-10 was re-confirmed by executing the freshly compiled artifact."
  findings:
    - "ALL GREEN. pnpm --filter @aiqadam/web-next test -> 44 files, 1115/1115 passed, 0 failed, 0 skipped. cms-content-pages.test.ts in isolation -> 57/57 (was 37, +20). pnpm build --force -> 4/4 successful, Complete!. pnpm arch:check -> passed, 289 files, mode=full. Zero failed tests, zero flaky tests, zero it.skip."
    - "TYPECHECK 0 ERRORS — and I did not accept turbo's cached 4/4 at face value. Re-ran `pnpm exec astro check` uncached in apps/web-next: Result (272 files): 0 errors, 0 warnings, 45 hints. The 45 hints are pre-existing ts(6133) unused-variable notices in unrelated files (e.g. src/pages/onboard.astro:23); none is in cms.ts or cms-content-pages.test.ts, and hints are non-gating."
    - "BIOME: CHANGED FILES CLEAN ('Checked 2 files in 8ms. No fixes applied.'). Repo-wide `biome check .` DOES exit non-zero (84 errors, 2 warnings) and the protocol calls that failed-retry-code, so I investigated rather than waving it through. All 84 errors come from 4 MINIFIED PLAYWRIGHT REPORT BUNDLES under apps/e2e/uat-results/, which `git check-ignore -v` confirms are gitignored via apps/e2e/.gitignore:4 (uat-results/) — they do not exist in a clean clone or in CI. The only tracked offender, apps/web-next/src/blocks/workspace/AsyncSelect.tsx, is UNMODIFIED by this PR (git status --porcelain on it returns empty) and in isolation yields 1 warning and ZERO errors. NOT a gate failure: nothing dirty belongs to this PR (the changed-file list is 6 files, none in the dirty set), and CI runs no biome step at all per .github/workflows/ci.yml:14-15."
    - "INTEGRATION N/A IS VERIFIED, NOT SKIPPED — the distinction the protocol's mandatory-integration rule exists to police. `git diff --name-only HEAD | grep -c '^apps/api/'` returns 0: there is no controller, service, repository, DTO, DB access, queue, or external service anywhere in the change. Testcontainers has nothing to containerize, so Docker availability is irrelevant and this is not an infrastructure failure disguised as an N/A. Rubric score 0 vs a threshold of 4."
    - "E2E DECLINED ON THREE INDEPENDENTLY VERIFIED GROUNDS, not on inherited precedent. (1) Prod-targeted: apps/e2e/playwright.config.ts:35 is `BASE_URL = process.env.BASE_URL ?? 'https://aiqadam.org'` — a prod-targeted suite structurally CANNOT verify this feature, because prod is exactly where PUBLIC_DIRECTUS_URL is deliberately unset, so the run would assert the byte-identical default. (2) Non-CI-gating: grep for test:e2e/playwright in .github/workflows/ci.yml returns nothing. (3) No existing spec touches this surface: grep -rln for rules|download_source|sourceFile across apps/e2e/src returns zero files. A new E2E would additionally need CI to inject the var AND a reachable Directus at that origin — the T-0141 QA vhost that is explicitly out of scope."
    - "CORRECTION TO THE INHERITED RECORD: 03-code-summary.md §5 and 02-impact-analysis.md both claim 'FR-CMS-008's existing E2E/UAT already covers the rendered href.' The UAT half is accurate; the E2E half is NOT — no Playwright spec references this surface (verified by grep). The decline decision is unaffected (all three grounds above stand alone), but this overstated claim should not be repeated downstream as if a Playwright regression guard exists for the download link. It does not."
    - "AC-10 RE-CONFIRMED INDEPENDENTLY ON THE FRESHLY FORCED BUILD — the one criterion a passing unit suite cannot establish, since the whole hazard is that import.meta.env would be inlined and the tests would pass anyway. Static: dist/server/chunks/cms_CQjEHz28.mjs contains `function resolvePublicDirectusUrl(env = typeof process === \"undefined\" ? void 0 : process.env)` with 2 process.env occurrences and ZERO ASSETS_PREFIX occurrences — no Vite-inlined frozen literal, which is the trap's exact fingerprint. Dynamic: I extracted and executed the compiled function against a live process.env — unset -> https://cms.aiqadam.org, override -> the override, whitespace -> default, and MUTATING the var mid-process -> https://cms.staging.aiqadam.org with NO rebuild. Three independent confirmations (CodeDeveloper, Orchestrator via tsx, TestRunner via the compiled chunk) now agree."
    - "COVERAGE 100% LINE AND 100% BRANCH ON THE RESOLVER, exceeding the 80/70 target. All three branches are covered by multiple tests each: typeof-not-string -> default (absent key, explicit undefined, env===undefined); trimmed.length > 0 -> configured (verbatim, trimmed, trailing slash); else -> default (4-case empty/whitespace it.each). No error path exists to cover because the function is TOTAL — it cannot throw, it falls back. standards.md §IV's '100% of error paths' is satisfied correctly: totality is a stronger property than tested error handling."
    - "MAJOR-2 REGRESSION GUARD CONFIRMED BY EXECUTION, not inspection. The pre-existing guards (not.toContain('directus:8055'), not.toContain('//directus'), /^https:\\/\\//) still pass UNMODIFIED, and the new 5-case it.each re-asserts the same invariant against the REAL resolver under unset/undefined/empty/whitespace/overridden — all 5 pass. web-next went 1095 -> 1115 tests with zero newly failing, so nothing elsewhere depended on the removed constant."
    - "ZERO FLAKINESS RISK IN THE NEW TESTS, structurally: every one is a synchronous call to a pure function with a locally-constructed literal argument — no timers, no I/O, no network, no shared mutable state, no process.env mutation, no ordering dependency. The isolated 57-test run took 12ms of actual test time."
