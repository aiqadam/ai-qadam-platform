# Step 10 — Documentation Update (DocWriter)

**Workflow:** `wf-20260704-fix-095`
**Issue:** `ISS-TEST-WEB-001`
**Timestamp:** 2026-07-04T21:19:00Z

## Doc surface affected

One file: [`apps/web/src/lib/utm.test.ts`](apps/web/src/lib/utm.test.ts) —
the inline comment header explaining why it had a "local re-implementation"
of `UTM_MEDIUMS`, `validateUtmField`, `parseDestination`, and `buildUtmUrl`.
Pre-fix, the file documented the workaround ("Avoids ESM/alias issues
with Astro + Vitest integration"). Post-fix, that workaround is no
longer needed; cross-module imports work in vitest 4.1.9.

## Edit applied

Replaced the 2-line workaround comment with a 9-line historical note:

- Anchors the workaround in the pre-vitest-4 era (cites
  `__vite_ssr_exportName__` and vite 8.1.0 helper addition)
- References `ISS-TEST-WEB-001` so future readers can find the
  unblocking PR
- Explicitly states that migrating to `import { ... } from './utm'` is
  a **future refactor**, deliberately deferred to keep this PR small
  and mechanical (single responsibility: unblock the test infra, not
  refactor the test file)

## What was deliberately NOT changed

- The local re-implementation itself was kept. Converting it to
  imports would diff ~120 lines that are unrelated to the bug this
  PR is fixing and would inflate the diff past the
  `AGENTS.md §4 400-lines / 5-files` limit when combined with the
  lockfile regeneration.

## Tests re-verified after edit

```
cd apps/web && pnpm exec vitest run utm.test.ts
```
- Test Files: 1 passed (1)
- Tests: **45 passed (45)** — AC-4 (no regression on baseline)
- Exit code: 0

## Other doc surfaces considered (not changed)

- `docs/04-development/standards.md` — would be the right place for a
  "test-infra fallback patterns" guideline (when to inline a helper vs
  import a sibling module). Out of scope for this PR.
- `apps/web/vitest.config.ts` — already minimal; no docstring to add
  (matches the apps/api config which also lacks one).
- `apps/web-next/vitest.config.ts` — already has an explanatory header
  (added by this PR).

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-04T21:19:00Z"
  summary: "Doc update: replaced 2-line workaround comment in utm.test.ts with 9-line historical note linking to ISS-TEST-WEB-001; 45/45 tests still pass."
  output_file: ".copilot/tasks/active/wf-20260704-fix-095/08-doc-update.md"
```