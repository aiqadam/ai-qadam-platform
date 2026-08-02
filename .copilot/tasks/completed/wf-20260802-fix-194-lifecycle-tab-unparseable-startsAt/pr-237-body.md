## What
Fixes the lifecycle-tab `defaultTab` bug on event detail pages: when `startsAt` is unparseable but `endsAt` is in the past, the page short-circuits to `'finished'` instead of degrading safely to `'upcoming'`.

## Why
ISS-EVT-LIFECYCLE-TAB-001 — the inline ternary in `apps/web-next/src/pages/events/[id].astro` lines 105-110 short-circuits to `'finished'` whenever `now >= endsAtMs` is true, even if `startsAtMs` is `NaN`. The test for this defensive fallback (`event-lifecycle-tab.test.ts`) was added in PR #150 (wf-20260730-feat-155) but the page logic was never updated to match.

## How
- Added `Number.isNaN()` guards in the `defaultTab` derivation in `apps/web-next/src/pages/events/[id].astro`
- Mirrored the same guard logic in the test's local `deriveDefaultTab` function (Vitest cannot import .astro frontmatter)
- Now: `finished` requires BOTH dates parseable AND now past endsAt; `live` requires startsAt parseable AND now past startsAt; everything else is `upcoming`

## Risks
Minimal. Behavior change is strictly limited to a defensive fallback case (unparseable startsAt). All 1017 web-next tests pass; 9/9 targeted test cases pass.

## CI Override (per AGENTS.md §6.3 user opt-out)

The `ci-cd` build is also failing on 3 unrelated tests in `apps/api/test/telegram-auth-service.spec.ts` (lines 371, 384, 402) — these expect `{directusUserId, isTemp, country}` but the lookup response now also includes `role: null` (added by FR-BOT-003, PR #220, commit `639467b`). My PR has zero diff on `apps/api/`; verified by `git diff origin/main HEAD -- apps/api/` returning empty. This is a pre-existing test gap on `origin/main` and is filed as a separate follow-up workflow.

## Testing
- Targeted test: 9/9 pass (was 8/9)
- Full web-next suite: 40 files / 1017 tests pass
- Typecheck: 0 errors, 0 warnings
- Build: success

## Honesty disclosure
The `telegram-auth-service.spec.ts` failures on this PR are **pre-existing** on `origin/main` (caused by FR-BOT-003) and are NOT fixed by this PR. Follow-up workflow `wf-20260802-fix-195` queued to address them.

## Checklist
- [x] Tests added / updated
- [x] All targeted tests pass
- [x] arch:check passed for staged files
