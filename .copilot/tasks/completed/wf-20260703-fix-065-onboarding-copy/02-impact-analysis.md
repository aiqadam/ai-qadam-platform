# Impact Analysis — wf-20260703-fix-065-onboarding-copy

**Issue:** [ISS-UAT-013-13](../../issues/ISS-UAT-013-13.md) — minor UI copy-smell in `apps/web/src/components/OnboardingForm.tsx`. When `preview.role_groups` is `[]` or `undefined`, `role_groups.join(', ')` returns `''` and the rendered text reads `"You're being added as ."` (stray full stop). Proposed fix: a `roleGroupsText(groups: string[] | undefined): string` helper that returns the joined string when length > 0, else the literal `"an operator"`.

**Severity:** minor (UI copy only; non-blocking for AC-5 BP-UAT-013).
**Branch:** `fix/ISS-UAT-013-13-onboarding-copy`.

---

## Validated Requirement

Three sub-requirements, all observable in rendered output:

1. `role_groups === []` **or** `role_groups === undefined` → bold reads `"an operator"`.
2. `role_groups.length === 1` → bold reads that single role (regression-protected; AC-2).
3. `role_groups.length >= 2` → bold reads comma-joined roles (regression-protected; AC-2).

---

## Affected Layers

| Layer | Affected? | Notes |
|---|---|---|
| **API (NestJS)** | No | `role_groups` payload shape (`RoleGroup[]`) on `/v1/onboard/preview` is unchanged. The api continues to return the same DTO. |
| **DB Changes Required** | No | No schema, no migration. |
| **Shared Types** | No | `InvitePreview.role_groups: string[]` in `OnboardingForm.tsx:25` is a local interface, not part of `packages/shared-types/`. |
| **Frontend (Astro + React islands)** | **Yes — single file** | `apps/web/src/components/OnboardingForm.tsx` only. |
| **Bot (Python)** | No | Bot does not render this UI. |
| **Workers (BullMQ)** | No | No queue/processor impact. |
| **Design tokens / CSS** | No | No new color, no new class, no new icon. |

---

## Affected Files

| File | Change | Reason |
|---|---|---|
| `apps/web/src/components/OnboardingForm.tsx` | Add `const ROLE_GROUPS_EMPTY_FALLBACK = 'an operator';` near other module-level constants; add `export function roleGroupsText(groups: string[] \| undefined): string { return groups && groups.length > 0 ? groups.join(', ') : ROLE_GROUPS_EMPTY_FALLBACK; }` in the same area; replace `{preview.role_groups.join(', ')}` at line 194 with `{roleGroupsText(preview.role_groups)}`. | The only file that contains the offending render. |
| `apps/web/src/components/OnboardingForm.test.ts` *(new)* | Add a vitest test over the pure helper covering: (a) empty array → `'an operator'`; (b) undefined → `'an operator'`; (c) single-element → that element; (d) two-element → comma-joined. | AGENTS.md §3: every public function has a unit test; issue AC-3. |

**Files NOT touched:**

- `apps/web/src/components/workspace/AdminInvitesList.tsx:158` — uses `inv.role_groups.join(', ')` in a `<td>`. **Out of scope**: that row is rendered in the admin console where every invite was created with at least one role group (the `AdminUserCreateForm.tsx:154` always sends `role_groups: [role]`). The api `createInvite` endpoint rejects rows with no role. Adding the helper here would be premature scope creep; leaving it as `join(', ')` matches the existing admin-table rendering semantics.
- `apps/web/src/components/workspace/AdminUserCreateForm.tsx` — submits `role_groups: [role]`. No display logic, no change needed.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/onboard/preview` | GET | None | No |
| `/v1/onboard/accept` | POST | None | No |
| `/v1/admin/invites` | (various) | None | No |

No DTO changes. No contract changes. Purely frontend render fix.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `OnboardingForm.tsx` | `roleGroupsText()` | Local helper, same file (exported only for testability) |
| `OnboardingForm.tsx` | `/api/v1/onboard/preview`, `/api/v1/onboard/accept` | `fetch()` (unchanged) |

No new cross-module service calls. No new shared-types imports. No new dependency injection.

---

## Risk Flags

- **Security Review Required:** No. No auth, no PII, no new endpoint, no input boundary change. `role_groups` is server-controlled; client cannot influence it.
- **Architecture Rule Risks:** None.
- **i18n concern (informational, not blocking):** The component currently renders hard-coded English strings. i18next is the platform standard but is **not yet** wired into this component. Pre-existing copy-localization gap, not introduced by this fix. **Recommendation:** file a follow-up issue rather than expanding scope of this workflow.
- **Test environment caveat:** `apps/web/vitest.config.ts` declares `environment: 'node'`. A React-component render test with `@testing-library/react` typically needs `environment: 'jsdom'`. **Mitigation:** test the **pure function** `roleGroupsText` directly under `environment: 'node'` — this avoids jsdom and matches the existing test infrastructure's footprint. This is the recommended approach.
- **Magic-string rule (AGENTS.md §1 rule 3):** define `const ROLE_GROUPS_EMPTY_FALLBACK = 'an operator'` at module scope and use it inside the helper, consistent with the existing `PASSWORD_MIN`, `WEBMAIL_URL`, etc., constants in the same file.
- **Function-length rule (60 lines):** the helper is 1 line of logic + signature — trivially compliant.

---

## Test Scope

| Type | Required? | Target |
|---|---|---|
| **Unit (vitest, node env)** | **Yes** — AC-3 | `roleGroupsText(groups)` over four inputs: `[]`, `undefined`, `['aiqadam-staff']`, `['a', 'b']`. |
| **Component render test (jsdom)** | Optional | Only if `jsdom` is already wired — pure-function unit test is sufficient for AC-3. |
| **Integration (Testcontainers)** | No | No backend change. |
| **E2E (Playwright)** | Optional (AC-4) | Neg 005 spec assertion could be extended. Marked optional; visual audit against existing screenshot `neg-005-no-authentik-user-409.png` post-merge is acceptable. |

---

## Recommended Approach

1. **CodeDeveloper (single-file change, `OnboardingForm.tsx`):**
   - Add `const ROLE_GROUPS_EMPTY_FALLBACK = 'an operator';` near the other module-level constants.
   - Add `export function roleGroupsText(groups: string[] \| undefined): string { return groups && groups.length > 0 ? groups.join(', ') : ROLE_GROUPS_EMPTY_FALLBACK; }`.
   - Replace `{preview.role_groups.join(', ')}` at line 194 with `{roleGroupsText(preview.role_groups)}`.

2. **TestDesigner / TestRunner (new file `OnboardingForm.test.ts`):**
   - Test the **pure function** `roleGroupsText` directly. Add `export` to the helper so the test file can import it.

3. **DocWriter:** No doc changes required.

4. **No orchestrator infrastructure work.** Per Step 1 (`01-issue-lookup.md`), this AC does not require live infrastructure.

5. **PR size estimate:** ~10 lines of code + ~20 lines of test. Well under the 400-line / 5-file PR cap (AGENTS.md §4).

6. **Risks:** essentially zero. Pure render-text change in a leaf component, covered by a unit test over a pure function.

---

## Gate Result

```
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T00:00:00Z
  summary: Pure frontend render-text fix in apps/web/src/components/OnboardingForm.tsx (single file + new unit test); no API, DB, shared-types, bot, worker, design-token, or architecture-rule impact; recommended path is a small pure-function helper with a named fallback constant.
  output_file: .copilot/tasks/active/wf-20260703-fix-065-onboarding-copy/02-impact-analysis.md
```