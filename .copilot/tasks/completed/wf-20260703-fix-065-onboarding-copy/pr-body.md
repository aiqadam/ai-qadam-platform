Resolves ISS-UAT-013-13.

## What

Renders the OnboardingForm welcome copy with a grammatically complete phrase when an invite preview's `role_groups` field is empty. Before this fix, `[].join(', ')` returned `''` and the rendered text read the broken `"You're being added as ."` (stray full stop). After this fix, the empty case renders as `"You're being added as an operator."`.

## Why

Visual-only finding from the BP-UAT-013 visual review pass (screenshot `neg-005-no-authentik-user-409.png`). Reported by BusinessAnalyst as a minor UI copy-smell — does not block AC-5 Neg 005 (the DOM assertion for the inline error code still passed), but exposes latent risk for any future operator-invite row created without `role_groups`.

## How

- Extract a pure helper `roleGroupsText(groups: string[] | null | undefined): string` into a sibling file `apps/web/src/components/OnboardingForm.helpers.ts` (so tests can import a non-JSX module under the web app's `environment: 'node'` vitest config). The fallback literal is bound to a named constant `ROLE_GROUPS_EMPTY_FALLBACK = 'an operator'` (no magic strings).
- `OnboardingForm.tsx` imports the helper and renders `{roleGroupsText(preview.role_groups)}` at the welcome-copy `<strong>` (was: `{preview.role_groups.join(', ')}`).
- No API, DB, shared-types, bot, worker, design-token, or CSS change. No new dependencies. No `as` casts, no `any`. The helper is 1 line of pure logic with three deterministic branches (`[]` / nullish / non-empty).

## Risks

Blast radius is zero — a leaf UI render. The only possible user-visible effect is the wrong fallback phrase, same severity as the bug being fixed.

## Testing

- `pnpm --filter web exec tsc --noEmit` — PASS.
- `pnpm exec biome check` — PASS (one pre-existing `noExcessiveCognitiveComplexity` warning on the `onSubmit` arrow at `OnboardingForm.tsx:96`, exists on `main` since commit `00e016e`, NOT introduced by this change).
- Unit test file added at `apps/web/src/components/OnboardingForm.test.ts` (5 cases over the pure helper covering empty, undefined, null, single-element, multi-element). **Runtime execution deferred** to the queued follow-up workflow `wf-20260703-fix-066-vitest-bump` / [ISS-TEST-WEB-001](../../issues/ISS-TEST-WEB-001.md) — pre-existing vitest 2.1.9 ↔ workspace vite 8.1.0 SSR-transform skew (`ReferenceError: __vite_ssr_exportName__ is not defined`). The follow-up bumps vitest in apps/api, apps/web, apps/web-next, then runs `pnpm --filter web exec vitest run OnboardingForm.test.ts` to confirm 5/5 pass. Verified not-a-regression: `utm.test.ts` (existing pure-`.ts`) still passes 45/45.

## Documentation

- One bullet added to `docs/04-development/standards.md` (Part IV "Unit test rules") — documents the `.ts`-sibling helper pattern for vitest `environment: 'node'` apps.
- One sentence added to the design-system readme (copy rules) — forbids inline `array.join(...)` in UI sentences without an empty-value fallback.

## Honesty disclosure (per AGENTS.md §6.1)

AC-3 (test execution) is deferred to the queued follow-up workflow `wf-20260703-fix-066-vitest-bump` (queue position 1, `parent_link` populated). AC-4 (BP-UAT-013 re-run) is optional per the issue author. The fix itself (AC-1 + AC-2) is verified by `tsc` + `biome` + manual read of the 1-line pure helper.

## Checklist

- [x] Tests added (5 unit cases)
- [x] Docs updated (standards.md + design-system readme)
- [x] No new dependencies
- [x] tsc + biome clean (one pre-existing warning on main, not introduced)