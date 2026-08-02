# Step 4 — Security Review

**Workflow:** wf-20260802-fix-194
**Step:** 4 — Security Review (SecurityReviewer equivalent)
**Date:** 2026-08-02

## Threat-model delta

| Invariant | Status | Notes |
|---|---|---|
| Tenant isolation | N/A | No tenant, country, or session logic touched |
| Auth at controller level | N/A | No controller changes; `apps/web-next/src/pages/events/[id].astro` is a public route gated by `countryFromHost` (unchanged) |
| Zod validation at boundaries | N/A | No new external inputs; `event.startsAt` and `event.endsAt` already flow through `toApiEvent`/`cms.ts` upstream of this page, where they are not currently Zod-validated but that's a pre-existing concern outside this PR's scope |
| No secrets in code | PASS | No new env vars, no new constants, no logging |
| No cross-schema queries | N/A | No DB queries touched |
| Rate limiting | N/A | No API endpoint changes |
| CSRF | N/A | GET-only page route (Astro SSR) |
| N+1 queries | N/A | No new queries introduced |

## Defense-in-depth observation (deferred, not a blocker)

`event.startsAt` and `event.endsAt` arriving from Directus are
typed as required strings in `ApiEvent`, but are not Zod-validated
before reaching this page. The `Date.parse` defensive-fallback in
this PR is a Layer-2 mitigation against malformed ISO strings; a
proper Layer-1 fix would validate at the Directus boundary. The
defensive fallback is correct as written and the test asserts the
intended behavior; a Layer-1 validator is **not** required to
resolve the CI failure and would expand the blast radius
unnecessarily for a targeted bugfix.

This is filed as a separate observation in the issue file's
"Acceptance criteria" — but NOT promoted to its own issue, since
the malformed-data scenario is genuinely rare in practice (Directus
field types constrain the values upstream) and the existing
fallback now correctly handles all 4 malformed-data combinations.

## Gate

PASS — no security invariants violated. The change is a
defensive-fallback correctness fix with no new attack surface.
