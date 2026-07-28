# Test Results — wf-20260728-fix-144 (ISS-USR-PROFILE-002)

## Regression test

`apps/api/test/me-profile-service.spec.ts` — 3 new cases added under
`describe('MeProfileService.getProfile — degrades gracefully on
field-permission 403 (ISS-USR-PROFILE-002)')`:

```
npx vitest run test/me-profile-service.spec.ts
✓ retries without onboarded_at when the full field list 403s, and returns the rest of the profile
✓ re-throws a non-403 DirectusError without retrying
✓ re-throws a 403 that persists on the retry (a real, unrelated permission gap)
✓ (27 pre-existing cases in the same file, unaffected)

Test Files  1 passed (1)
     Tests  30 passed (30)
```

## Live infrastructure verification (AGENTS.md §6.1 — real run, not deferred)

1. **Local API rebuilt + restarted** to load both the defensive
   `getProfile` fix and pick up the new permission rows.
2. **`infrastructure/directus/bootstrap.sh` run twice** against local
   Directus — confirmed idempotent (all 15 new permission rows —
   14 for `policy.member` + 1 revoke — show "exists"/"already absent" on
   the second run, no duplicates created).
3. **Real authenticated browser session** via Playwright: signed in as
   `uat-member@example.com` through the actual Authentik OIDC flow
   against `http://localhost:4321/me/profile` (the real customer-facing
   page). Assertions: zero uncaught page errors (no React #418), zero
   failed `/api/*` requests, "Consents" section renders with no
   "unavailable" fallback text visible.
4. **Direct Directus queries** confirmed the exact expected
   `directus_permissions` rows exist with the correct `(policy,
   collection, action, permissions, fields)` shape.

## Live verification against QA (with explicit user authorization, 2026-07-28)

SSH'd to `pro-data-tech-qa` (95.46.211.230) and confirmed the same root
cause is present live: `policy.member` has zero `directus_permissions`
rows on QA's Directus too. Attempted to apply the same permission-row fix
directly to QA and discovered a **larger, separate blocker**: QA's
Directus has no application schema at all (`policy.member` doesn't even
exist as a policy row — `bootstrap.sh` has apparently never been run
against QA). This is filed as
[ISS-INFRA-QA-DIRECTUS-SCHEMA-001](../../issues/ISS-INFRA-QA-DIRECTUS-SCHEMA-001.md)
and deliberately NOT fixed live in this session (running the full
`bootstrap.sh` against a live shared environment needs its own reviewed,
separate action — not a same-session drive-by, per explicit user
instruction). This means the code fix in this PR is correct and complete
for its own scope, but will not take visible effect on QA until
ISS-INFRA-QA-DIRECTUS-SCHEMA-001 is separately resolved.

## Full suite

```
npx vitest run
Test Files  1 failed | 99 passed (100)
     Tests  1 failed | 1299 passed (1300)
```

Same pre-existing, unrelated `test/users.spec.ts` timing flake as prior
workflows in this session (confirmed pre-existing on `origin/main`,
reproduced identically with this PR's diff stashed out).

## Gate Result

```markdown
gate_result:
  status: passed
  summary: "3/3 new regression tests pass; full suite 1299/1300 (1 pre-existing unrelated flake); live local verification via real browser + Authentik login confirms the fix; QA verification surfaced a separate, larger, properly-disclosed blocker (ISS-INFRA-QA-DIRECTUS-SCHEMA-001) that this PR's own scope does not need to resolve."
  findings: []
```
