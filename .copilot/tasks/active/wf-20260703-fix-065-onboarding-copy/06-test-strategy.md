# Test Strategy — wf-20260703-fix-065-onboarding-copy

**Agent:** TestStrategist
**Workflow type:** issue-resolution
**Issue:** [ISS-UAT-013-13](../../issues/ISS-UAT-013-13.md) — minor UI copy-smell
**Branch:** `fix/ISS-UAT-013-13-onboarding-copy`

---

### Requirement

**ISS-UAT-013-13:** `OnboardingForm` welcome copy renders `"You're being added as ."` when `role_groups` is `[]` / `undefined`. Fix: pure helper `roleGroupsText(groups: string[] | null | undefined): string` in `apps/web/src/components/OnboardingForm.helpers.ts` returns `groups.join(', ')` when `groups && groups.length > 0`, else `'an operator'`. Called from JSX at `apps/web/src/components/OnboardingForm.tsx` line ~195.

### Rubric score

| Criterion | Points | Hit? |
|---|---|---|
| Touches tenant-scoped data | +2 | No |
| New API endpoint | +2 | No |
| Business rule with edge cases (capacity/waitlist/dates) | +2 | No — nullishness only |
| Cross-module service call | +1 | No |
| New database query | +1 | No |
| Pure function / utility | 0 | **Yes** |
| UI-only change (no logic) | 0 | No — logic change |

**Total: 0 → unit tests sufficient.** Integration (Testcontainers) NOT required.

### Required test levels

- [x] Unit (vitest, `environment: 'node'`) — required (AC-3)
- [ ] Integration (Testcontainers) — not required (rubric 0)
- [ ] E2E (Playwright) — optional (Neg 005 spec extension, optional per issue author)
- [ ] Visual — optional (manual audit against existing `neg-005-no-authentik-user-409.png` post-merge acceptable)

### Test inventory

| # | Test (already in `apps/web/src/components/OnboardingForm.test.ts`) | Level | Maps to |
|---|---|---|---|
| 1 | `it('returns the fallback for an empty array', () => expect(roleGroupsText([])).toBe('an operator'))` | Unit | **AC-1 + Step-6 regression test** |
| 2 | `it('returns the fallback for undefined', () => expect(roleGroupsText(undefined)).toBe('an operator'))` | Unit | AC-1 |
| 3 | `it('returns the fallback for null', () => expect(roleGroupsText(null)).toBe('an operator'))` | Unit | AC-1 (defensive) |
| 4 | `it('returns the single role when role_groups has one element', () => expect(roleGroupsText(['aiqadam-staff'])).toBe('aiqadam-staff'))` | Unit | AC-2 |
| 5 | `it('joins multiple roles with ", "', () => expect(roleGroupsText(['aiqadam-staff', 'aiqadam-editor'])).toBe('aiqadam-staff, aiqadam-editor'))` | Unit | AC-2 |

**Why test the pure function, not the component:** `apps/web/vitest.config.ts` declares `environment: 'node'` with no jsdom — the existing pure-`.ts` test footprint (`utm.test.ts`) is the precedent.

### Acceptance criteria → test mapping

| AC | Level | Status this workflow |
|---|---|---|
| AC-1 (renders "an operator" when `[]` or `undefined`) | Unit cases 1, 2, 3 | Written; **execution deferred** to `wf-20260703-fix-066-vitest-bump` |
| AC-2 (single/multi roles no regression) | Unit cases 4, 5 | Written; **execution deferred** to `wf-20260703-fix-066-vitest-bump` |
| AC-3 (unit test exists) | File present at `OnboardingForm.test.ts` | **File present**; runtime pass/fail deferred |
| AC-4 (BP-UAT-013 Neg 005 re-run shows corrected screenshot) | Visual / optional | Deferred optional |

### Named regression test (Step 6 protocol requirement)

```
File:     apps/web/src/components/OnboardingForm.test.ts
Describe: roleGroupsText
It:       'returns the fallback for an empty array'
Assert:   expect(roleGroupsText([])).toBe('an operator')
```

**Why this is the regression test:**

| Property | Before fix | After fix |
|---|---|---|
| Production expression | `preview.role_groups.join(', ')` — `[].join(', ')` → `''` | `roleGroupsText(preview.role_groups)` — `roleGroupsText([])` → `'an operator'` |
| Rendered text | `"You're being added as ."` (broken) | `"You're being added as an operator."` (correct) |
| The test's assertion | **FAILS** — `roleGroupsText` did not exist; the production expression returns `''`, not `'an operator'` | **PASSES** — helper returns the documented fallback |

### Execution plan for follow-up `wf-20260703-fix-066-vitest-bump`

The follow-up handoff at `.copilot/tasks/queued/wf-20260703-fix-066-vitest-bump/handoff.yaml` already references `OnboardingForm.test.ts` in `context_refs`.

1. **Bump vitest** in `apps/api/package.json`, `apps/web/package.json`, `apps/web-next/package.json` from `^2.1.8` to `^3.x` (or `^4.x`; latest 4.1.9). `pnpm install`.
2. **Pre-flight**: `pnpm exec tsc --noEmit` + `pnpm exec biome check` across the three apps must stay clean.
3. **Targeted run**: `pnpm --filter web exec vitest run OnboardingForm.test.ts` → **must report `5 passed (5)` exit 0** (primary AC-3 signal).
4. **Regression check**: `pnpm --filter web exec vitest run` → `utm.test.ts` must still show `45 passed (45)`.
5. **Cross-app**: `pnpm --filter api exec vitest run` + `pnpm --filter web-next exec vitest run` execute without `ReferenceError: __vite_ssr_exportName__ is not defined`.
6. **Close-out**: back-fill ISS-TEST-WEB-001; flip the deferral record in `handoff.yaml` to `verified`; no second PR for ISS-UAT-013-13 needed.

### Honest disposition

| Concern | TODAY (this workflow) | FOLLOW-UP |
|---|---|---|
| Code correct | ✅ tsc + biome clean | — |
| Test file present | ✅ 5 cases committed | — |
| Test execution | ❌ Blocked by ISS-TEST-WEB-001 | ✅ 5/5 + 45/45 |
| AC-3 status | Deferred-with-named-queue-ref | Verified retroactively |

This workflow does **not** mark ISS-UAT-013-13 `resolved` based on deferred verification alone — the resolution flip happens at Step 9 and the QualityGate enforces `verified-or-deferred-with-queue-ref` per AGENTS.md §6.1.

### Step 6 constraint compliance

| Constraint | How this plan satisfies it |
|---|---|
| Would have failed before the fix | `roleGroupsText([]) === 'an operator'` cannot pass against the pre-fix `[].join(', ')` which returns `''` |
| Passes after the fix | Helper returns `'an operator'`, assertion holds |
| Documents the original bug | Test name + in-file comment point at the missing empty-array fallback |
| Named in the plan | "Named regression test" section names file, describe, it, assert |

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T18:25:00Z
  summary: Test strategy for ISS-UAT-013-13 — rubric score 0 (pure frontend render-text fix; one-line pure helper); unit tests sufficient; integration (Testcontainers) not required; E2E and visual marked optional per issue author. 5 unit cases already written at apps/web/src/components/OnboardingForm.test.ts covering AC-1 (empty/undefined/null → 'an operator'), AC-2 (single and multi-element join regression), and the Step-6-required regression test (roleGroupsText([]) === 'an operator', documents the original bug where [].join(', ') returned ''). Test execution deferred to queued follow-up wf-20260703-fix-066-vitest-bump (ISS-TEST-WEB-001) which owns the vitest 2.1.9 ↔ vite 8.1.0 SSR-transform skew; follow-up will bump vitest in apps/api, apps/web, apps/web-next and run pnpm --filter web exec vitest run OnboardingForm.test.ts to confirm 5/5 pass + utm.test.ts 45/45 no regression.
  output_file: .copilot/tasks/active/wf-20260703-fix-065-onboarding-copy/06-test-strategy.md
```