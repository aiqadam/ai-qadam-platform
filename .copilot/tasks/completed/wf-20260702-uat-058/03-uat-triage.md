## UAT Triage — BP-UAT-009

**Report file:** .copilot/tasks/active/wf-20260702-uat-058/02-uat-report.md
**Visual review file:** .copilot/tasks/active/wf-20260702-uat-058/02b-visual-review.md
**Overall verdict:** partial

### Failure Classification

| Step | Label | Failure Type | Issue Registered |
|---|---|---|---|
| 4 | "Sign out" (step-004-signed-out-page) — DOM + visual MISMATCH: browser stops on Authentik's RP-Initiated Logout confirmation interstitial instead of auto-redirecting to `/auth/signed-out`, despite a valid `id_token_hint` | Flow bug | ISS-UAT-009-1 |
| 5 | "Protected page after sign-out" (step-005-redirect-after-signout) — DOM + visual MISMATCH: `/me` returns HTTP 200 with in-page AnonView CTA instead of a hard redirect; inconsistent with `/workspace`'s hard-redirect pattern (Negative 001) | Spec/product mismatch (script correction) + flow inconsistency (flagged for product follow-up) | ISS-UAT-009-2 |
| 6 (visual-only) | "Sign in with valid next param" (step-006-next-param-redirect) — DOM PASS, design-system FAIL: leaderboard self-row renders "UAT MemberYou" with no space/separator | UI bug | ISS-UAT-009-3 |
| 5 (visual-only) | step-005-redirect-after-signout — large unbalanced empty black region below the AnonView CTA card | UI bug | ISS-UAT-009-4 |

Note: Steps 1, 2, 3, 6 (DOM), and all three negative scenarios (neg-001,
neg-002, neg-003) passed both the DOM assertion and visual review
(`expected_state_verdict: MATCH`, `design_system: PASS` or `PASS (n/a)`) — no
issues registered for those. step-003's visual review flagged a `PARTIAL`
expected-state note (screenshot shows `/me`, not a devtools cookie panel) —
this is a known, pre-documented Playwright/devtools limitation called out in
BP-UAT-009's own Notes section ("Playwright cannot read HttpOnly cookies via
`context.cookies()`... it can only verify their presence"), not a new defect,
so no issue was registered for it. neg-002's visual review noted a minor
viewport-boundary screenshot-capture artifact (cropped card at the bottom
edge) — a capture-method note, not a product or spec defect, so no issue was
registered for it either.

### Classification Rationale

1. **Step 004 — Flow bug (ISS-UAT-009-1).** The API's own code comments in
   `apps/api/src/modules/auth/auth.service.ts` (`buildLogoutUrl`) document that
   a valid `id_token_hint` is the "happy path" where Authentik "MAY skip the
   user-confirmation step and run the invalidation flow silently." UATRunner
   confirmed a valid `id_token_hint` and `post_logout_redirect_uri` were both
   present in the observed logout URL, yet Authentik still rendered its
   confirmation interstitial — contradicting the happy-path assumption. This
   is real, reproduced-twice behavior (per UATRunner's confidence note), not a
   spec or seed error, and it directly fails AC-7 ("The `/auth/signed-out`
   page is shown after sign-out"). Local session teardown (cookie clear) is
   unaffected and correct, so this is scoped to the redirect/SSO wiring, not
   session security. Root-cause hypothesis in the issue points at Authentik's
   provider/invalidation-flow configuration (the "MAY" in the OIDC spec is not
   a guarantee) rather than the API code itself, since the API constructs the
   URL exactly as documented.

2. **Step 005 — Spec/product mismatch + inconsistency (ISS-UAT-009-2).**
   `apps/e2e/tests/smoke-auth-gates.spec.ts` already asserts `/me`'s HTTP 200 +
   in-page `AnonView` CTA as intended, existing behavior — this is the same
   pattern as ISS-UAT-013-10 (spec/seed misalignment resolved by updating the
   seed to match reality). Here the fix path is to update BP-UAT-009's Step
   005 expected UI state and AC-4 wording to match `/me`'s actual, already
   product-sanctioned behavior. Per the task's guidance, this single issue
   also documents the genuine architectural inconsistency between `/me`
   (in-page CTA) and `/workspace` (hard redirect, confirmed via Negative 001
   passing) as a flagged product/UX follow-up — not resolved unilaterally here
   since neither individual mechanism is insecure, and picking one "correct"
   pattern for both is a product decision, not a BusinessAnalyst call.

3. **Step 006 visual-only — UI bug (ISS-UAT-009-3).** The DOM assertion
   passed (landed at `/leaderboard` correctly), but VisualReviewer's pixel
   inspection found a design-system FAIL: the current user's row concatenates
   "UAT Member" and "You" with no space or badge boundary. This is exactly the
   class of defect Step 3.5 (Visual Review) exists to catch that DOM
   assertions cannot — classified as a straightforward UI bug (missing
   separator/badge styling).

4. **Step 005 visual-only — UI bug (ISS-UAT-009-4).** Independent of the
   redirect-vs-CTA mechanism question (ISS-UAT-009-2), the AnonView page's
   rendered layout leaves roughly the bottom half of the viewport as an empty
   black region — a layout-completeness defect noted both per-screenshot and
   in the visual review's cross-screenshot consistency section, `design_system:
   PASS` on token grounds but flagged as worth BusinessAnalyst's attention.
   Filed as a separate issue from ISS-UAT-009-2 because it concerns the visual
   completeness of the page once rendered, not which navigation mechanism
   produced it — the two would have independent fixes even if ISS-UAT-009-2's
   product-decision follow-up eventually removes the AnonView pattern
   entirely.

### Registry Update

- last_run: 2026-07-02
- status: partial
- issues: [ISS-UAT-009-1, ISS-UAT-009-2, ISS-UAT-009-3, ISS-UAT-009-4]

`docs/02-business-processes/uat/registry.md`'s BP-UAT-009 row updated: Status
`Ready` → `Implemented`, Last Run `2026-07-02`, Run Status `partial`, Open
Issues column lists all four new ISS refs.

### Summary

BP-UAT-009 executed to completion with no environment or pre-flight failures:
7 of 9 test units (6 numbered steps + 3 negative scenarios) passed outright,
and all 3 negative scenarios passed. Two DOM-level discrepancies were found
(Step 004 sign-out redirect, Step 005 protected-page mechanism) and confirmed
independently by VisualReviewer's pixel inspection of the corresponding
screenshots — both are genuine, reproduced findings, not test-authoring
defects. VisualReviewer additionally surfaced two new visual-only findings
invisible to DOM assertions: a design-system FAIL on the leaderboard's
self-indicator text concatenation (step-006) and a layout-completeness gap on
the AnonView page (step-005). All four distinct findings were classified per
the failure taxonomy (one flow bug, one spec/product-mismatch-plus-flagged-
inconsistency, two UI bugs) and registered as ISS-UAT-009-1 through
ISS-UAT-009-4 in `.copilot/issues/`, added to `.copilot/issues/registry.md`,
and cross-referenced in the UAT registry's BP-UAT-009 row. Step 003's
devtools-screenshot PARTIAL note and neg-002's viewport-crop artifact were
reviewed but not issued — both are pre-documented capture-methodology
limitations, not new product or spec defects. No env failures occurred;
triage is complete and unblocked.

## Gate Result

gate_result:
  status: passed
  summary: "BP-UAT-009 triage complete — 4 distinct findings classified (1 flow bug, 1 spec/product mismatch with a flagged inconsistency, 2 UI bugs) and registered as ISS-UAT-009-1..4; UAT registry and issue registry both updated."
  findings:
    - "ISS-UAT-009-1 (bug, flow): Sign-out lands on Authentik's logout confirmation interstitial instead of auto-redirecting to /auth/signed-out despite a valid id_token_hint — fails AC-7; root cause likely Authentik provider/flow config."
    - "ISS-UAT-009-2 (minor, spec/product mismatch + inconsistency): BP-UAT-009 Step 005 spec asserted a hard redirect for /me but the app's intended behavior (already asserted in smoke-auth-gates.spec.ts) is an in-page AnonView CTA; also flags /me vs /workspace anon-gating inconsistency for product follow-up."
    - "ISS-UAT-009-3 (minor, UI bug): Leaderboard self-row renders 'UAT MemberYou' with no space/separator between display name and self-indicator — visual-only, design-system FAIL, DOM assertion passed."
    - "ISS-UAT-009-4 (minor, UI bug): /me AnonView page leaves a large unbalanced empty region (~55% of viewport) below the sign-in CTA card — visual-only layout defect."
