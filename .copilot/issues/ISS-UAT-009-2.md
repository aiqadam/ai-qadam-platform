# ISS-UAT-009-2 — /me uses in-page AnonView CTA while /workspace hard-redirects; BP-UAT-009 Step 005 spec asserts the wrong mechanism

| Field | Value |
|---|---|
| ID | ISS-UAT-009-2 |
| Severity | minor |
| Module | web/auth-gating (uat/test-design + product consistency) |
| Status | open |
| Reported | 2026-07-02 |
| Resolved | — |
| Reporter | BusinessAnalyst (wf-20260702-uat-058 / 03-uat-triage.md) |
| Workflow | — |
| AC ref | AC-4 (BP-UAT-009) |

## Symptom

During the BP-UAT-009 run on 2026-07-02, Step 005 (protected page after
sign-out) failed its literal expected UI state:

```
Expected: Navigate to http://localhost:4321/me with no session. Browser
          redirects (3xx) to http://localhost:4321/auth/sign-in. The /me
          dashboard content is NOT visible.
Actual:   /me returns HTTP 200 (not a redirect) and renders in-page with a
          "Sign in to see your dashboard" CTA (AnonView), per
          apps/web/src/components/MeDashboard.tsx. Nav correctly shows
          "Sign in" (session genuinely anonymous). No authenticated-only
          content (registrations/points/check-in QR) was visible.
```

In the same run, Negative 001 (`/workspace` visited anonymously) DID hard
redirect via `window.location.replace()` client-side once the auth bootstrap
resolved to anon — confirmed passing. So the two "protected" surfaces in this
app use two different anon-gating mechanisms:

| Surface | Anon-visitor mechanism |
|---|---|
| `/workspace` | Hard client-side redirect to `/auth/sign-in` (`window.location.replace()`) |
| `/me` | HTTP 200, in-page `AnonView` CTA ("Sign in to see your dashboard") |

## Classification

**Two-part finding, both closed by this issue:**

1. **Spec/reality mismatch — NOT a product bug for `/me` in isolation.**
   `apps/e2e/tests/smoke-auth-gates.spec.ts` (`S0.10 — auth gates`, test
   `'/me dashboard renders for anon (client island shows sign-in CTA)'`)
   already asserts HTTP 200 + in-page CTA as the **intended, existing**
   behavior for `/me`. BP-UAT-009's Step 005 was written assuming a hard
   redirect, which does not match either the smoke suite's expectation or the
   live app. This is the same class of finding as ISS-UAT-013-10 (spec/seed
   misalignment) — here it is spec/product misalignment. The underlying
   security intent (no authenticated-only content leaked to anon visitors) is
   satisfied regardless of mechanism, confirmed in the same step.

2. **Genuine architectural inconsistency — worth tracking as a product
   question**, independent of whether either individual behavior is "wrong":
   `/me` and `/workspace` are both protected member-facing surfaces but use
   different anon-gating patterns (in-page CTA vs. hard redirect). This is
   inconsistent UX (an anon visitor bookmarking/sharing a `/me` link sees a
   flash of the shell + CTA; the same visitor hitting `/workspace` is bounced
   immediately) and inconsistent implementation (two different guard patterns
   to maintain). Whether to standardize on one pattern for both surfaces is a
   product decision, not something BusinessAnalyst should resolve unilaterally
   by picking a "correct" answer — flagging for follow-up triage instead.

## Proposed resolution

- **Immediate (spec fix):** Update `docs/02-business-processes/uat/BP-UAT-009.md`
  Step 005 expected UI state to match `/me`'s actual, already-intended behavior
  (HTTP 200, in-page `AnonView` CTA, no authenticated-only content), mirroring
  the assertion already codified in `smoke-auth-gates.spec.ts`. Update AC-4's
  Step 005 mapping accordingly (AC-4's redirect-on-visit language should be
  scoped to protected surfaces that actually redirect, or reworded to describe
  "no authenticated content is leaked" rather than "redirects to sign-in").
- **Follow-up (product decision, separate from the spec fix):** Decide whether
  `/me` and `/workspace` should converge on a single anon-gating pattern. Not
  blocking — file as a product/UX backlog item if the team wants consistency;
  no urgency since neither individual behavior is insecure.

## Acceptance criteria

- [ ] BP-UAT-009 Step 005 expected UI state updated to describe the in-page
      `AnonView` CTA (HTTP 200, no auth-only content) instead of a hard 3xx
      redirect
- [ ] AC-4 wording reviewed/adjusted so it accurately covers both `/me`'s
      CTA-gating and `/workspace`'s redirect-gating without asserting a single
      mechanism for both
- [ ] Step 005 in BP-UAT-009 passes on live re-run against the corrected spec
- [ ] Product/UX decision on `/me` vs `/workspace` consistency logged
      (accept-as-is or scheduled as a separate enhancement) — not a blocker for
      closing this issue

## Resolution

_Pending._
