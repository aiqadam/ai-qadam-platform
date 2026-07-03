# Step 1 — Issue Lookup

**Issue:** ISS-UAT-009-1
**Workflow:** wf-20260704-fix-073
**Date:** 2026-07-04

## Existing registry entries

Searched `.copilot/issues/registry.md` and `.copilot/issues/*.md` for issues
matching keywords: `sign-out`, `logout`, `end_session`, `id_token_hint`,
`Authentik confirmation`, `interstitial`, `RP-Initiated Logout`.

**Results:**

| ID | Status | Summary | Relationship |
|---|---|---|---|
| [ISS-UAT-009-1](../issues/ISS-UAT-009-1.md) | open | (this issue) | primary |
| [ISS-UAT-009-2](../issues/ISS-UAT-009-2.md) | open | `/me` AnonView mechanism mismatch (sibling) | independent — touches Step 005 mechanism, not Step 004 logout |
| [ISS-UAT-009-3](../issues/ISS-UAT-009-3.md) | open | leaderboard self-row concatenation (visual) | independent |
| [ISS-UAT-009-4](../issues/ISS-UAT-009-4.md) | open | AnonView layout empty region (visual) | independent |

No previously-resolved issue exists for this exact symptom. The auth-architecture
doc (`docs/04-development/architecture/auth-architecture.md` §5.3.7) DOES
explicitly anticipate the symptom:

> "To genuinely kill the Authentik session too, hit Authentik's
> `end_session_endpoint` … We don't today because the default flow renders a
> 'are you sure?' page that's clunky."

PR #234 (`b3eee09 fix(auth): RP-Initiated Logout — sign-out now terminates
the Authentik IdP session`) shipped the `end_session_endpoint` integration
on 2026-05-23 anyway because the security requirement (SSO ⇒ SLO) outweighs
the UX cost. The architecture doc's "We don't today" sentence is now stale
and was not updated when PR #234 merged.

## Decision

ISS-UAT-009-1 is the only extant issue for this symptom. The fix path is
**Path B from the issue's "Proposed resolution"**: update the misleading
`buildLogoutUrl()` comment to stop asserting that the confirmation page is
skipped for the hinted case, and update BP-UAT-009's Step 004 expected state
and AC-7 wording to reflect that the Authentik confirmation interstitial is
the **expected** UX when Authentik 2024.x's `default-provider-invalidation-flow`
is bound to the provider — this is institutional knowledge that the team
already weighed when shipping PR #234 and chose IdP-session-termination over
silent auto-redirect.

## Gate Result

gate_result:
  status: passed
  summary: "ISS-UAT-009-1 confirmed as the unique issue for the logout-interstitial symptom; fix path is Path B (spec + comment update)."
  findings:
    - "No prior issue exists with this symptom"
    - "Architecture doc §5.3.7 anticipates the symptom and chose security over UX on 2026-05-23 (PR #234)"
    - "Authentik invalidation flow PK in bootstrap-oidc.sh is `default-provider-invalidation-flow` (built-in), not a custom aiqadam-provider-invalidation"