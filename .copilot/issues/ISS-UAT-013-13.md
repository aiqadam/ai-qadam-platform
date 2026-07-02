# ISS-UAT-013-13 — OnboardingForm welcome copy renders "You're being added as ." when role_groups is empty

| Field | Value |
|---|---|
| ID | ISS-UAT-013-13 |
| Severity | minor |
| Module | web/onboarding (UI copy) |
| Status | open |
| Reported | 2026-07-02 |
| Reporter | BusinessAnalyst (wf-20260702-uat-059 / 03-uat-triage.md) |
| Related | — |
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

_Pending._
