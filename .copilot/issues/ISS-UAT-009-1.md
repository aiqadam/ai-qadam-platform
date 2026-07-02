# ISS-UAT-009-1 — Sign-out lands on Authentik's logout interstitial instead of auto-redirecting to /auth/signed-out

| Field | Value |
|---|---|
| ID | ISS-UAT-009-1 |
| Severity | bug |
| Module | api/auth (logout flow) |
| Status | open |
| Reported | 2026-07-02 |
| Resolved | — |
| Reporter | BusinessAnalyst (wf-20260702-uat-058 / 03-uat-triage.md) |
| Workflow | — |
| AC ref | AC-4, AC-7 (BP-UAT-009) |

## Symptom

During the BP-UAT-009 run on 2026-07-02, Step 004 (Sign out) failed its expected
UI state:

```
Expected: browser lands at http://localhost:4321/auth/signed-out with an
          AI Qadam-branded confirmation message.
Actual:   browser stops on Authentik's own RP-Initiated Logout confirmation
          interstitial ("You've logged out of AI Qadam Platform (local).")
          with three manual links (Go back to overview / Log out of authentik /
          Log back into AI Qadam Platform).
```

Confirmed by two independent lines of evidence in the same run:
- `02-uat-report.md` Step 004: DOM/URL assertion recorded the browser stuck on
  `localhost:9000` (Authentik), not `localhost:4321/auth/signed-out`.
- `02b-visual-review.md` step-004-signed-out-page.png: pixel inspection confirms
  zero AI Qadam branding anywhere in the frame — no nav, no dark theme, no teal
  accents, nothing matching the platform's design system.

Local session teardown itself is correct and unaffected: the `aiqadam-refresh`
cookie was verified cleared via `context.cookies()` in the same step.

## Root cause (hypothesis)

`apps/api/src/modules/auth/auth.service.ts` `buildLogoutUrl()` (lines 175–213)
documents two URL shapes:

- **WITH `id_token_hint`** — "happy path... Per OIDC RP-Initiated Logout 1.0 §2,
  when the hint is present the OP **MAY** skip the user-confirmation step and
  run the invalidation flow silently. This is what we want for the common case."
- **WITHOUT `id_token_hint`** — degraded fallback, where the spec explicitly
  requires the confirmation page.

The comment's intent (skip confirmation when a hint is present) relies on the
word "MAY" in the OIDC spec — it is not a guarantee. UATRunner confirmed the
logout URL observed in the trace carried a real, valid `id_token_hint` and a
`post_logout_redirect_uri=http://localhost:4321/auth/signed-out`, yet Authentik
still rendered its confirmation interstitial instead of skipping it. This means
either:

1. Authentik's provider/flow configuration for this application (the
   `aiqadam-provider-invalidation` flow referenced in the same comment block)
   does not have "skip logout confirmation when hint is valid" enabled, or
2. Some other factor (session binding, client auth method, flow stage config)
   is causing Authentik to always show the interstitial regardless of hint
   validity.

This is most likely an **Authentik provider/flow configuration** issue rather
than an AI Qadam API code defect — the API is constructing the URL correctly
per the code and its own documented contract; Authentik's invalidation flow is
the piece not honoring the "MAY skip" happy path the comment assumes.

## Proposed resolution

1. Inspect the Authentik admin UI (or blueprint, if the invalidation flow is
   defined as IaC) for the `aiqadam-provider-invalidation` flow bound to the
   AI Qadam OAuth2/OIDC provider. Look for a "skip confirmation" / stage
   ordering setting that would let a valid `id_token_hint` bypass the
   confirm-logout prompt stage.
2. If no such setting exists in this Authentik version, consider whether the
   invalidation flow's confirmation stage should be removed/bypassed for this
   provider specifically, OR update the code comment in `auth.service.ts` to
   stop asserting the confirmation page is skipped for the hinted case (since
   that has now been observed false in practice) and instead treat the
   interstitial as expected/degraded UX **for all logout paths**, adjusting
   BP-UAT-009's Step 004 expected state and AC-7 accordingly if the interstitial
   truly cannot be bypassed with this Authentik configuration.
3. Whichever path is chosen, re-run BP-UAT-009 Step 004 live to confirm the
   fix.

## Acceptance criteria

- [ ] Root cause confirmed: Authentik provider/flow configuration inspected and
      the reason the confirmation stage renders despite a valid `id_token_hint`
      is identified
- [ ] Either: Authentik flow updated to skip confirmation when hint is valid, OR:
      `auth.service.ts` comment + BP-UAT-009 Step 004 / AC-7 updated to reflect
      that the interstitial is expected behavior with this Authentik version
- [ ] Step 004 in BP-UAT-009 passes on live re-run (browser lands at
      `/auth/signed-out` with AI Qadam branding, OR the revised expected state
      is met)

## Resolution

_Pending._
