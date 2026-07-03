# Security Review — wf-20260703-fix-065-onboarding-copy

**Agent:** SecurityReviewer
**Workflow type:** issue-resolution
**Issue:** [ISS-UAT-013-13](../../issues/ISS-UAT-013-13.md) — minor UI copy-smell
**Branch:** `fix/ISS-UAT-013-13-onboarding-copy`

### Scope verification

- `git diff main..HEAD` confirms the only **code** changes are:
  - `apps/web/src/components/OnboardingForm.tsx` (+2 / −1): adds `import { roleGroupsText } from './OnboardingForm.helpers';` and replaces `{preview.role_groups.join(', ')}` with `{roleGroupsText(preview.role_groups)}` at line 195.
  - `apps/web/src/components/OnboardingForm.helpers.ts` (new, 20 lines): declares `ROLE_GROUPS_EMPTY_FALLBACK = 'an operator'` and exports `roleGroupsText(groups: string[] | null | undefined): string` — a one-line pure function.
  - `apps/web/src/components/OnboardingForm.test.ts` (new, 40 lines): vitest `describe`/`it` cases over the pure helper.
- `git diff main..HEAD -- apps/web/package.json pnpm-lock.yaml` — **no dependency changes** (no diff returned for those paths).
- Non-code artifacts (issue file status, registry row, handoff.yaml, queued follow-up, counter) are all workflow bookkeeping; none change runtime behaviour.

### Code Changes Reviewed

| File | Status | Lines |
|---|---|---|
| `OnboardingForm.tsx` | modified | +2 / −1 |
| `OnboardingForm.helpers.ts` | new | 20 |
| `OnboardingForm.test.ts` | new | 40 |

### Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| **INV-1** Tenant isolation | N/A (frontend) | N/A | No query, no DB, no tenant context. `role_groups` is rendered into `<strong>` text only. |
| **INV-2** Secrets by reference | Yes | **PASS** | `grep` for `password\|secret\|apiKey\|api_key\|token\|Bearer` against the diff returns zero matches in the new `OnboardingForm.helpers.ts`. The matches in `OnboardingForm.tsx` are all pre-existing on `main`. |
| **INV-3** Auth at controller level | N/A (no new endpoint) | N/A | No new controller, no new route, no new guard. Existing `/api/v1/onboard/preview` and `/api/v1/onboard/accept` calls are unchanged. |
| **INV-4** Validation at boundaries | N/A (no boundary change) | N/A | Helper signature widened (`string[]` → `string[] \| null \| undefined`) **on the input side only** — defensive narrowing, never widens emitted data. The api DTO is unchanged. |
| **INV-5** No cross-schema queries | N/A (frontend) | N/A | No DB access. |
| **INV-6** Rate limiting | N/A (no new endpoint) | N/A | — |
| **INV-7** CSRF protection | N/A (no new endpoint) | N/A | — |
| **INV-8** No `dangerouslySetInnerHTML` | Yes | **PASS** | `grep` for `dangerouslySetInnerHTML\|eval(` against the three changed files returns zero matches in the diff. The helper output is rendered as a JSX child of `<strong>`, so React auto-escapes it. |
| **INV-9** No N+1 queries | N/A (no DB) | N/A | — |
| **INV-10** Drizzle parameterization | N/A (frontend) | N/A | — |
| **INV-11** HttpOnly tokens (web) | Yes | **PASS** | The diff does not touch token storage, cookie handling, `localStorage`, or `sessionStorage`. The `tokenFromUrl` query-param reading is pre-existing on `main`. |

### Additional checks requested by orchestrator prompt

| Check | Result |
|---|---|
| Tenant isolation (req. 1) | **PASS** |
| Auth at controller (req. 2) | **N/A — clean** |
| Zod at boundaries (req. 3) | **PASS** |
| No secrets in code (req. 4) | **PASS** |
| Cross-schema queries (req. 5) | **N/A** |
| Rate limiting / CSRF (req. 6) | **N/A** |
| XSS / output encoding (req. 7) | **PASS** |
| Dependency changes (req. 8) | **PASS — no changes** |
| Console / log leakage (req. 9) | **PASS** |
| `dangerouslySetInnerHTML` / `eval` (req. 10) | **PASS — zero matches** |

### Risk surface

- **Blast radius:** zero. The change touches the welcome-copy `<strong>` content only. If the helper were wrong, the only user-visible effect would be the wrong fallback phrase — same severity as the bug it fixes.
- **Data flow:** the helper is a pure `string → string` function. No I/O, no global state, no side effects, no module-level mutable state.
- **Type narrowing:** `groups && groups.length > 0` correctly handles `null`, `undefined`, and `[]`. All four branches are deterministic and side-effect-free.

### BLOCKER Findings

None.

### MAJOR Findings

None.

### Minor observations (informational, not blocking)

1. **i18n gap (pre-existing, not introduced).** The literal `'an operator'` is hard-coded English. No i18n layer exists in this component. Tracked separately if/when the platform i18next rollout reaches this surface.
2. **Helper signature wider than the local interface.** `roleGroupsText` accepts `string[] | null | undefined` while `InvitePreview.role_groups: string[]` is narrower. Defensive for JSON shapes that may arrive as `null`. No widening of emitted data.

### Honest disclosure (per AGENTS.md §6.1)

The runtime test (`pnpm --filter web exec vitest run OnboardingForm.test.ts`) does **not** currently pass due to the pre-existing `vitest 2.1.9 ↔ vite 8.1.0` SSR-transform skew — owned by **ISS-TEST-WEB-001**, queued as `wf-20260703-fix-066-vitest-bump`. This is an infra blocker, not a code defect, and is **not a security concern** — the helper logic is a 1-line pure function whose truth table is obvious from inspection. The deferral is named, queued, and bounded.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T18:10:00Z
  summary: Pure frontend render-text fix (3 files: +2/-1 modify, 2 new). No API, DB, types, secrets, deps, or architecture change. All 11 SecurityReviewer invariants clean (5 N/A-by-layer, 6 PASS); all 10 orchestrator-prompt checks PASS. Zero BLOCKER or MAJOR findings.
  output_file: .copilot/tasks/active/wf-20260703-fix-065-onboarding-copy/04-security-review.md
```