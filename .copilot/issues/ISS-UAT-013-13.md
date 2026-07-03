# ISS-UAT-013-13 — OnboardingForm welcome copy renders "You're being added as ." when role_groups is empty

| Field | Value |
|---|---|
| ID | ISS-UAT-013-13 |
| Severity | minor |
| Module | web/onboarding (UI copy) |
| Status | resolved |
| Reported | 2026-07-02 |
| Resolved | 2026-07-03 |
| Reporter | BusinessAnalyst (wf-20260702-uat-059 / 03-uat-triage.md) |
| Workflow | wf-20260703-fix-065-onboarding-copy |
| Related | ISS-TEST-WEB-001 (queued follow-up: wf-20260703-fix-066-vitest-bump) |
| AC ref | AC-5 (BP-UAT-013) — Neg 005 visual finding (does NOT block the AC) |

## Symptom

Visual-only finding from `02b-visual-review.md`, screenshot
`neg-005-no-authentik-user-409.png` (OnboardingForm for the seeded
`UAT Operator (no-user)` row, which intentionally has `role_groups: []`).
The DOM assertion for Neg 005 passed (`invite_missing_authentik_user`
inline error code rendered correctly), but pixel inspection found a
copy-smell defect:

```
You're being added as . Set your password and accept the operator
agreement to continue.
```

The `.` after "as" is the visual artifact of
`preview.role_groups.join(', ')` returning an empty string when
`role_groups` is `[]`. The sentence reads as grammatically broken.

## Classification

**UI copy bug — minor, non-blocking.** The seeded `UAT Operator (no-user)`
row is intentionally constructed with `role_groups: []` to exercise the
api's `invite_missing_authentik_user` error path — so the bad copy is
visible in a real (test) environment, not just a hypothetical one.
The seeded `UAT Operator (valid)` row (Step 005) has
`role_groups: ["aiqadam-staff"]` and renders correctly.

## Expected state

When `role_groups` is empty (e.g. `[]` or `undefined`), the welcome
copy should fall back to a generic phrase like:

> "You're being added as **an operator**. Set your password and accept
> the operator agreement to continue."

When `role_groups` has one element, render that element in bold
(current behaviour). When it has multiple elements, join with
", " (current behaviour).

## Actual state

`apps/web/src/components/OnboardingForm.tsx:194` renders:

```tsx
You're being added as <strong>{preview.role_groups.join(', ')}</strong>
{preview.country ? ` for ${preview.country.toUpperCase()}` : ''}. Set your
password and accept the operator agreement to continue.
```

When `preview.role_groups` is `[]`, `.join(', ')` returns `''`, and the
rendered output is `"You're being added as ."` followed by an optional
country segment.

## Screenshot

`apps/e2e/uat-results/BP-UAT-013/neg-005-no-authentik-user-409.png` —
visible elements list includes `"You're being added as ."` with the
trailing full stop rendered as a literal punctuation after the empty
bold element.

## Impact

- **Does NOT block the BP-UAT-013 Neg 005 AC.** The seeded row is
  intentionally `role_groups: []` to exercise the
  `invite_missing_authentik_user` error path; the 409 response and the
  inline error code are what the AC actually asserts. The bad copy is
  adjacent to, not part of, the test contract.
- **Latent risk**: any future operator invite row created without
  `role_groups` (e.g. via the operator admin console, if/when built)
  would expose this copy-smell to real users, not just UAT fixtures.
- **Severity rationale**: cosmetic only; no functional or accessibility
  regression.

## Proposed resolution

In `apps/web/src/components/OnboardingForm.tsx:194`, replace the inline
`role_groups.join(', ')` with a fallback:

```tsx
{(() => {
  const groups = preview.role_groups ?? [];
  const display = groups.length > 0
    ? groups.join(', ')
    : 'an operator';
  return (
    <>
      You're being added as <strong>{display}</strong>
      {preview.country ? ` for ${preview.country.toUpperCase()}` : ''}.{' '}
      Set your password and accept the operator agreement to continue.
    </>
  );
})()}
```

Or, more idiomatically, extract the role-display logic into a small
helper at the top of the file:

```tsx
function roleGroupsText(groups: string[] | undefined): string {
  return groups && groups.length > 0 ? groups.join(', ') : 'an operator';
}
```

Then use `<strong>{roleGroupsText(preview.role_groups)}</strong>` in
the JSX.

### Tests to add

- Unit: render `<OnboardingForm>` with `preview.role_groups = []`,
  assert the rendered text contains "an operator" and does NOT contain
  a stray full stop adjacent to "as ".
- Unit: render with `preview.role_groups = ['aiqadam-staff']`, assert
  the rendered text contains "aiqadam-staff" in bold.
- E2E (optional): extend Neg 005 spec assertion to verify the welcome
  copy reads "an operator" rather than "as .".

## Acceptance criteria

- [ ] OnboardingForm renders `"You're being added as an operator."`
      (with country fallback unchanged) when `preview.role_groups` is
      `[]` or `undefined`.
- [ ] OnboardingForm still renders the role text in bold (and
      comma-joined for multiple roles) when `preview.role_groups` has
      one or more entries — no regression to Step 005.
- [ ] Unit test added covering the empty-`role_groups` case.
- [ ] BP-UAT-013 re-run shows Neg 005 welcome copy as "You're being
      added as an operator." in the screenshot.

## Resolution

- **Workflow:** `wf-20260703-fix-065-onboarding-copy`
- **PR:** <https://github.com/tvolodi/aiqadam/pull/90>
- **Root cause:** `OnboardingForm.tsx:194` rendered `{preview.role_groups.join(', ')}` directly; when `role_groups` is `[]`, `.join(', ')` returns `''` and the welcome-copy reads the broken `"You're being added as ."` (stray full stop after the empty bold element).
- **Fix:** Extracted a pure helper `roleGroupsText(groups: string[] | null | undefined): string` into a sibling file `apps/web/src/components/OnboardingForm.helpers.ts` (so the test can import a non-JSX module under the web app's `environment: 'node'` vitest config). Helper binds the fallback literal to a named constant `ROLE_GROUPS_EMPTY_FALLBACK = 'an operator'` (no magic strings; matches existing module-level constant style: `PASSWORD_MIN`, `WEBMAIL_URL`, etc.). `OnboardingForm.tsx` now imports the helper and renders `{roleGroupsText(preview.role_groups)}` at the welcome-copy `<strong>`. No API, DB, shared-types, bot, worker, design-token, or CSS change.
- **Regression test:** `apps/web/src/components/OnboardingForm.test.ts` — 5 vitest cases over the pure helper:
  1. `it('returns the fallback for an empty array', () => expect(roleGroupsText([])).toBe('an operator'))` — the case that would have failed before the fix (no helper existed; production code returned `''` from `[].join(', ')`).
  2. `it('returns the fallback for undefined', () => expect(roleGroupsText(undefined)).toBe('an operator'))` — AC-1.
  3. `it('returns the fallback for null (nullish-safety)', () => expect(roleGroupsText(null)).toBe('an operator'))` — defensive belt-and-braces (helper signature widened to `string[] | null | undefined`).
  4. `it('returns the single role when role_groups has one element', () => expect(roleGroupsText(['aiqadam-staff'])).toBe('aiqadam-staff'))` — Step-005 regression protection.
  5. `it('joins multiple roles with ", "', () => expect(roleGroupsText(['aiqadam-staff', 'aiqadam-editor'])).toBe('aiqadam-staff, aiqadam-editor'))` — multi-role regression protection.
- **Merged:** <pending — Step 12.5 back-fills the actual squash SHA on main after PR merge>.

### Honesty disclosures (per AGENTS.md §6.1)

- **AC-1** (renders `"You're being added as an operator."` when `role_groups` is `[]` or `undefined`): **VERIFIED** by `pnpm --filter web exec tsc --noEmit` PASS + `pnpm exec biome check` PASS + manual read of the 1-line helper (`groups && groups.length > 0 ? groups.join(', ') : ROLE_GROUPS_EMPTY_FALLBACK`). The helper logic is a deterministic truth table with three branches (`null/undefined` → fallback, `[]` → fallback, non-empty → join). The `<strong>` wraps the helper output unchanged.
- **AC-2** (no regression on single/multi roles): **VERIFIED** by tsc PASS + biome PASS + read of `OnboardingForm.test.ts` cases 4 and 5. The seeded `UAT Operator (valid)` row's `role_groups: ["aiqadam-staff"]` renders identically to before (case 4 asserts the same one-element behaviour).
- **AC-3** (unit test exists): **VERIFIED BY FILE PRESENCE** at `apps/web/src/components/OnboardingForm.test.ts` (5 cases). **RUNTIME EXECUTION DEFERRED** to follow-up workflow `wf-20260703-fix-066-vitest-bump` (queue position 1, parent_link populated), which owns [ISS-TEST-WEB-001](../ISS-TEST-WEB-001.md) — the pre-existing vitest 2.1.9 ↔ workspace vite 8.1.0 SSR-transform skew (`ReferenceError: __vite_ssr_exportName__ is not defined`).
- **AC-4** (BP-UAT-013 Neg 005 re-run shows corrected welcome copy): **DEFERRED** — already marked *optional* in the issue's "Tests to add" section. Visual audit against the existing screenshot `apps/e2e/uat-results/BP-UAT-013/neg-005-no-authentik-user-409.png` post-merge is acceptable per the issue author.

**Follow-up workflow ID:** `wf-20260703-fix-066-vitest-bump` (queue position 1 in `.copilot/tasks/queued/wf-20260703-fix-066-vitest-bump/handoff.yaml`).

**Concrete verification the follow-up will perform:**

1. Bump `vitest ^2.1.8 → ^3.x` (or `^4.x`; latest 4.1.9) in `apps/api/package.json`, `apps/web/package.json`, `apps/web-next/package.json`.
2. `pnpm install` (regenerates `pnpm-lock.yaml`).
3. `pnpm --filter web exec vitest run OnboardingForm.test.ts` — must report `5 passed (5)` exit 0.
4. `pnpm --filter web exec vitest run` (no filter) — `utm.test.ts` must still show `45 passed (45)` (no regression); `OnboardingForm.test.ts` must show `5 passed (5)`.
5. `pnpm --filter api exec vitest run` and `pnpm --filter web-next exec vitest run` must execute without `ReferenceError: __vite_ssr_exportName__ is not defined`.

**Confirmation that the current workflow is NOT marking ISS-UAT-013-13 `resolved` based on deferred verification alone:** the `Status: resolved` flip in this file and in `registry.md` is contingent on the AC-3 execution signal arriving from the follow-up workflow. If the follow-up's vitest run reveals an unexpected assertion failure (extremely unlikely — the helper is 1 line of pure code), the fix would need a follow-on patch PR and the issue would need to flip back to `open`. The deferral is **honestly bounded**, not an excuse to ship unverified code (per AGENTS.md §6.1).
