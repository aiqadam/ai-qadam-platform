## What

Closes the single failing test on `main` in `apps/web-next/src/lib/event-lifecycle-tab.test.ts` (run 30731579324, 2026-08-02) — the `ci-cd` `build` job's `Test` step was red because the unit-test mirror's "degrades to 'upcoming' when only startsAt is unparseable" case asserted a defensive-fallback spec the inline Astro page logic (`apps/web-next/src/pages/events/[id].astro` lines 105-110) didn't implement.

## Why

The original ternary — `now >= endsAtMs ? 'finished' : now >= startsAtMs ? 'live' : 'upcoming'` — short-circuits to `'finished'` whenever `now` is past a parseable `endsAtMs`, even if `startsAtMs` is `NaN`. An event whose `startsAt` is unparseable (Directus data-quality issue) can therefore render as a finished event with no recordings/recap, which is a worse user experience than `'upcoming'`. The unit test asserts the more conservative default; the production code needs to match.

## How

- **Page fix** (`apps/web-next/src/pages/events/[id].astro`): gate `'finished'` on BOTH dates parseable AND `now >= endsAtMs`; gate `'live'` on `startsAt` parseable AND `now >= startsAtMs`; everything else is `'upcoming'`. Inline comment documents the full 4-case contract.
- **Test mirror fix** (`apps/web-next/src/lib/event-lifecycle-tab.test.ts`): update the local `deriveDefaultTab` re-implementation (the test cannot import `.astro` frontmatter) to match the corrected page contract; expand the comment to spell out the defensive-fallback rules so the test serves as a runnable spec.
- **Issue file** (`.copilot/issues/ISS-EVT-LIFECYCLE-TAB-001.md`): documents the symptom, root cause, impact, and 4 acceptance criteria.

## Risks

- Blast radius is bounded to the lifecycle-tab default derivation on `/events/[id]`. The fix only changes behavior for events with malformed `startsAt` (rare, caused by Directus data quality); well-formed events render identically.
- One `apps/api` test failure (`apps/api/test/users.spec.ts` clock-ordering) is **pre-existing on `origin/main`** (tracked as `ISS-USR-CLOCK-001` / `wf-20260704-fix-096-pre-existing-api-test-flakes`). This PR does NOT touch `apps/api/**`.

## Testing

| Check | Command | Result |
|---|---|---|
| Targeted test (was failing) | `cd apps/web-next && pnpm test src/lib/event-lifecycle-tab.test.ts` | 9/9 pass |
| Full `apps/web-next` suite | `cd apps/web-next && pnpm test` | 40 files / 1017 tests pass |
| Typecheck | `cd apps/web-next && pnpm typecheck` | 0 errors, 0 warnings |
| Build | `cd apps/web-next && pnpm build` | Server built in 13.98s |
| Lint (this PR's diff) | `cd apps/web-next && pnpm lint` | No new warnings (2 pre-existing warnings in unrelated files) |

Closes ISS-EVT-LIFECYCLE-TAB-001 (local issue file; GitHub issue to be created via `scripts/sync-github-project.sh` after merge).

## Checklist
- [x] Tests added/updated (test mirror updated to match corrected page contract; existing 9 cases all pass)
- [x] Docs updated (inline comments in both files document the contract)
- [x] No new dependencies
- [x] Manually tested locally (`pnpm test`, `pnpm typecheck`, `pnpm build` all green)
