# Step 4: Code Summary

**Workflow:** wf-20260728-fix-139 · **Issue:** [ISS-USR-REDIRECT-001](../../../issues/ISS-USR-REDIRECT-001.md)

## Changes

1. `apps/web-next/src/pages/auth/sign-in.astro` — `rawNext` defaults to
   `/me` (was `/`) when `?next=` is absent; sanitization fallback also
   changed to `/me`.
2. `apps/web/src/pages/auth/sign-in.astro` — same change, for parity
   (both apps share the same sign-in redirect pattern).
3. `apps/web-next/src/blocks/common/AppNav.astro` — "Sign in" CTA now
   passes `next=/me` instead of `next=/` when the visitor is on the
   homepage; every other page keeps passing its own `currentPath`
   unchanged (no behavior change for gated-page entry points).
4. `apps/web/src/components/Nav.astro` — same CTA fix, for parity.

## Why this is sufficient

`postLoginRedirectUrl(next)` (`auth.service.ts:169`) and the OIDC
flow-cookie mechanism (`auth.controller.ts` `login`/`callback`) are
unchanged — they already correctly redirect to whatever `next` they're
given. The defect was entirely in *what `next` defaults to* at the two
points where a value is first chosen (the nav CTA, and the bare
`/auth/sign-in` page). Fixing both call sites closes the gap without
touching shared OIDC/session infrastructure.

## Why this does not regress existing behavior

- Every workspace/gated-page "Sign in" CTA (`AuthGate.astro`,
  `Workspace.tsx`, all `workspace/*.tsx` panels, `ForumThread.tsx`,
  `RegistrationCTA.tsx`, etc.) already passes an explicit,
  page-specific `next` value — none of them go through the new
  homepage-only branch or the sign-in.astro default. `ISS-UAT-009-2`/
  BP-UAT-009 coverage of the `/workspace` redirect is untouched.
- `sign-in.astro`'s default only applies when `?next=` is **absent**
  from the URL entirely — any caller that already passes `?next=X`
  (including `?next=/`, if anyone explicitly wants that) is unaffected.

## Out of scope (see impact analysis)

The self-registration welcome-email recovery-link path
(`ISS-USR-REDIRECT-002`) is a separate, larger fix queued as
`wf-20260728-fix-140-recovery-flow-redirect` — not touched by this
change.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "4 files changed, all additive default-value changes to next= computation. No changes to postLoginRedirectUrl, auth.controller.ts, or the flow-cookie mechanism. No DB/API contract changes."
```
