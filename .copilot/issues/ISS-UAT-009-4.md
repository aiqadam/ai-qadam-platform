# ISS-UAT-009-4 — /me AnonView leaves a large unbalanced empty region below the sign-in CTA card

| Field | Value |
|---|---|
| ID | ISS-UAT-009-4 |
| Severity | minor |
| Module | web/me (AnonView layout) |
| Status | open |
| Reported | 2026-07-02 |
| Resolved | — |
| Reporter | BusinessAnalyst (wf-20260702-uat-058 / 03-uat-triage.md) |
| Workflow | — |
| AC ref | AC-4 (BP-UAT-009, step-005) — visual-only finding, layered on top of ISS-UAT-009-2's mechanism finding |

## Symptom

Visual-only finding from `02b-visual-review.md`, screenshot
`step-005-redirect-after-signout.png` (`/me` page rendered for an anonymous
visitor, `AnonView` state):

```
Large, unused solid-black region occupying roughly the bottom 55% of the
viewport below the sign-in CTA card. The AnonView card (heading "Sign in to
see your dashboard", body copy, "Sign in" button) is short and centered in the
upper-middle of the page; the remainder of the page is empty page background
with no footer or additional content — a visually unbalanced/incomplete
impression relative to the fuller layouts seen on step-002/003/006 (signed-in
`/me`, leaderboard).
```

Noted independently in both the per-screenshot review and the visual review's
Cross-Screenshot Consistency section as worth flagging. `design_system: PASS`
on token/color/typography grounds — this is a layout-completeness issue, not
an off-brand styling violation.

## Classification

**UI bug** (layout / empty-state). Distinct from ISS-UAT-009-2, which covers
the *mechanism* (in-page CTA vs. redirect); this issue covers the *visual
completeness* of that CTA page once rendered.

## Root cause (hypothesis)

`apps/web/src/components/MeDashboard.tsx`'s `AnonView` renders only the CTA
card with no filler content (no footer, no secondary section, no
illustration/empty-state graphic) — on typical viewport heights the card does
not fill the page, leaving the remaining background exposed. Likely missing
either:
1. A page-level footer that other pages (signed-in `/me`, leaderboard) include
   but `AnonView` omits, or
2. Vertical centering / min-height constraints that assume more content than
   `AnonView` actually renders, or
3. A deliberate empty-state pattern (illustration, secondary CTA, "why sign
   in" bullets) that was never added.

## Proposed resolution

Compare `AnonView`'s render tree against the signed-in `/me` view and the
site-wide footer/layout wrapper to determine whether:
- `AnonView` is missing the standard page footer (quick fix — verify layout
  wrapper is applied consistently), or
- The empty-state card needs additional content to avoid a mostly-empty page
  on common viewport heights.

## Acceptance criteria

- [ ] Root cause identified (missing footer vs. missing empty-state content)
- [ ] `/me` AnonView page no longer shows a large unbalanced empty region on
      the standard UAT viewport size
- [ ] Visual re-check confirms the fix; no regression to the signed-in `/me`
      layout

## Resolution

_Pending._
