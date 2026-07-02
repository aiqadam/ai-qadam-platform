# ISS-UAT-009-3 — Leaderboard self-row renders "UAT MemberYou" with no space/separator

| Field | Value |
|---|---|
| ID | ISS-UAT-009-3 |
| Severity | minor |
| Module | web/leaderboard (UI) |
| Status | open |
| Reported | 2026-07-02 |
| Resolved | — |
| Reporter | BusinessAnalyst (wf-20260702-uat-058 / 03-uat-triage.md) |
| Workflow | — |
| AC ref | AC-2 (BP-UAT-009, step-006) — visual-only finding, not a DOM/AC failure |

## Symptom

Visual-only finding from `02b-visual-review.md`, screenshot
`step-006-next-param-redirect.png` (Leaderboard page, reached after sign-in via
`next=/leaderboard`). The DOM assertion for this step passed (browser correctly
landed at `/leaderboard`), but pixel inspection found a design-system defect:

```
The current user's leaderboard row renders the name text as "UAT MemberYou"
with no visible space, separator, or badge boundary between the display name
("UAT Member") and the "You" self-indicator. Reads as concatenated text, not a
rendering crash — a missing space or missing badge/pill container around the
self-indicator.
```

Confirmed via `design_system: FAIL` in the visual review (Copy rules /
Component consistency) — not present on any other screenshot in the run.

## Classification

**UI bug.** Missing visual separation (space, or badge/pill styling) between
two adjacent text nodes in the leaderboard row component.

## Root cause (hypothesis)

Likely in the leaderboard row component (search for the self-indicator
rendering logic, e.g. a component under `apps/web/src/components/` responsible
for leaderboard rows) — the "You" self-indicator is concatenated directly onto
the display name string without a separating space or without being wrapped in
its own badge/pill element with margin, e.g.:

```tsx
// suspected pattern:
<span>{member.displayName}{isSelf && 'You'}</span>
// should likely be:
<span>{member.displayName}</span>
{isSelf && <span className="badge">You</span>}
```

Exact file/line not yet located — needs a code-developer investigation pass
against the leaderboard row rendering component.

## Proposed resolution

Locate the leaderboard row component and either:
1. Add a space/margin between the display name and the "You" self-indicator, or
2. Wrap "You" in a proper badge/pill component (preferred, matches design
   system's use of badges elsewhere, e.g. rank "01 · GOLD" styling) with its
   own spacing.

## Acceptance criteria

- [ ] Leaderboard row component located and self-indicator rendering fixed
- [ ] Visual re-check: self-row renders with clear separation between name and
      "You" indicator (space or badge boundary)
- [ ] No regression to other leaderboard row states (non-self rows unaffected)

## Resolution

_Pending._
