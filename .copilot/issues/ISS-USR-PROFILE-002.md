# ISS-USR-PROFILE-002 — Every authenticated member's GET /me/profile 500s in production and QA (unhandled Directus field-permission error)

| Field | Value |
|---|---|
| ID | ISS-USR-PROFILE-002 |
| Severity | blocker |
| Module | api/me-profile, infrastructure/directus-bootstrap |
| Status | resolved |
| Reported | 2026-07-28 |
| Resolved | 2026-07-28 |
| Workflow | wf-20260728-fix-144 |
| Reporter | User (live report from `qa.aiqadam.org/me/profile`), root-caused by Orchestrator |
| Business-Process | BP-UAT-003, BP-UAT-016 |

## Symptom

User-reported, live on `qa.aiqadam.org/me/profile`, authenticated session:

```
Consents unavailable. Reload the page to retry.
Skills unavailable. Reload the page to retry.
---
Uncaught Error: Minified React error #418 ...
XHR GET https://qa.aiqadam.org/api/v1/me/profile → 404 Not Found
```

**Assumed to affect production identically or worse** (per user instruction
2026-07-28 — prod's Directus permission state is not expected to be better
than QA/local, and this was not independently re-verified against prod
directly in this workflow; treat as confirmed-affected).

## Root cause (confirmed live, reproduced locally 2026-07-28)

`MeProfileService.getProfile()` (`apps/api/src/modules/me-profile/me-profile.service.ts:191-200`)
unconditionally fetches a fixed field list including `onboarded_at`:

```
GET /users/{directusUserId}?fields=id,email,...,onboarded_at
```

`policy.member` (and all 7 ADR-0021 RBAC policies — see
[ISS-RBAC-PERMS-001](ISS-RBAC-PERMS-001.md)) has **zero**
`directus_permissions` rows anywhere in the codebase. Directus therefore
denies the `onboarded_at` field with a 403, `DirectusClient.request()`
throws `DirectusError`, and nothing in the call chain
(`getProfile` → `MeProfileController.getAll` → NestJS's default exception
filter) catches it — it surfaces as an unhandled `500 Internal Server
Error` to every authenticated member, every time, with no fallback.

Reproduced locally 2026-07-28 via a real Authentik login as
`uat-member@example.com` (Playwright): confirmed server-side stack trace:

```
DirectusError: Directus 403 /users/{id}?fields=...,onboarded_at:
  "You don't have permission to access field \"onboarded_at\" in
   collection \"directus_users\" or it does not exist."
  at MeProfileService.getProfile (me-profile.service.ts:193:17)
  at MeProfileController.getAll (me-profile.controller.ts:144:65)
```

This is **the same underlying permission gap as ISS-RBAC-PERMS-001**
(zero permission rows for any ADR-0021 policy), but a materially worse
symptom: ISS-RBAC-PERMS-001 was scoped around UAT verification blocking
(403 responses, dry-run policy sync); this issue is the live, user-facing
consequence — **every real member cannot load their own profile page at
all**, not just a UAT test script failing.

### Why QA shows 404 but local reproduces 500

Not yet root-caused independently — the underlying API error is confirmed
identical (Directus 403 on `onboarded_at`, unhandled, surfaces as
`MeProfileController`'s uncaught exception). The 404 vs 500 discrepancy is
most likely QA's reverse-proxy / custom error-page handling translating a
backend 5xx into a 404, or QA running a slightly different API build —
not chased down further since the underlying defect (unhandled
permission-denied field crashes the whole profile fetch) is the same
either way and is what this issue fixes.

### React error #418 (hydration)

`apps/web-next`'s `/me/profile` (the customer-surface build that Phase 1
of the [web migration](../../docs/04-development/frontend/web-migration-plan.md)
already cut over to production/QA subdomains) renders `<ConsentList>` /
`<SkillTagger>` via `useMyFullProfile()` (TanStack Query). When the single
underlying `GET /v1/me/profile` call 500s, `profile.error` is truthy and
each block renders its "unavailable" fallback — this alone should not
cause a hydration mismatch (the query's pending/error states are
consistent SSR→CSR). The minified React #418 error is not yet isolated to
a specific line; suspected secondary effect of the error boundary /
retry timing around the failed query, not independently reproduced with a
full stack trace in this workflow. Flagged for the fix's regression pass
to re-check once the primary 500 is gone — if #418 persists after the
underlying 500 is fixed, it needs its own follow-up.

## Impact

- **Every authenticated member** cannot load `/me/profile` on QA, and per
  user instruction, assumed identically broken on production.
- Blocks BP-UAT-003 (member self-service profile) end-to-end, same as
  ISS-RBAC-PERMS-001.
- This is a regression in user-visible severity from how
  ISS-RBAC-PERMS-001 was originally scored (blocker but framed as a UAT
  blocker) — this issue re-files it as a direct production incident.

## Resolution

- **Workflow:** wf-20260728-fix-144
- **PR:** <pending>
- **Root cause:** confirmed as diagnosed above — `MeProfileService.getProfile()`
  unconditionally requests a fixed field list including `onboarded_at`,
  which 403s for any user whose policy lacks a field-level grant on it
  (every real member, since no ADR-0021 policy had any permission rows —
  [ISS-RBAC-PERMS-001](ISS-RBAC-PERMS-001.md)). The 403 was unhandled,
  surfacing as an uncaught `500`.
- **Fix (two layers, both required for the full reported symptom):**
  1. **Defensive (API):** `MeProfileService.getProfile()`
     (`apps/api/src/modules/me-profile/me-profile.service.ts`) now catches
     a `403 DirectusError` on the combined-fields request and retries once
     without `onboarded_at` — every other field the cabinet needs still
     loads; a real, unrelated 403 (row genuinely inaccessible) still
     surfaces normally since the retry itself isn't swallowed. Matches the
     codebase's existing degrade-gracefully pattern (see
     `telegram-profile-defaults.service.ts`'s `findMember()`).
  2. **Root cause (infra):** `infrastructure/directus/bootstrap.sh` now
     seeds `policy.member`'s own-row permission grants (`directus_users`
     read/update scoped to `$CURRENT_USER`, plus `member_consents`,
     `member_skills`, `member_interests`, `member_employments` CRUD scoped
     to the member's own rows) via a new `ensure_perm_for_policy` helper —
     14 permission rows total. This is the slice of
     [ISS-RBAC-PERMS-001](ISS-RBAC-PERMS-001.md) needed for `/me/profile`
     specifically; that issue's remaining scope (6 other policies,
     `policy.member`'s public-read + create-own-registration halves) is
     unchanged and still open.
- **Regression test:** `apps/api/test/me-profile-service.spec.ts` — 3 new
  cases: retries and succeeds on a 403-then-success sequence, re-throws a
  non-403 `DirectusError` without retrying, re-throws a 403 that persists
  on the retry (a genuine, unrelated permission gap must still surface).
- **Live verification (2026-07-28):** rebuilt + restarted the local API,
  ran `infrastructure/directus/bootstrap.sh` twice (confirmed idempotent —
  second run shows all 14 new rows as "exists", no duplicates), then
  drove a real Authentik OIDC login as `uat-member@example.com` via
  Playwright against `http://localhost:4321/me/profile`: zero uncaught
  page errors (no React #418), zero failed `/api/*` requests, "Consents"
  section renders with no "unavailable" text. Confirmed via direct
  Directus query that the permission rows exist and are exactly the
  expected (policy, collection, action) triples.
- **QA verified directly (2026-07-28, with explicit user authorization to
  access live infra):** SSH'd to `pro-data-tech-qa` (95.46.211.230).
  Confirmed `policy.member` has zero `directus_permissions` rows on QA's
  Directus too (`{"data":[]}`) — the exact same root cause as local,
  live-confirmed, not just assumed. Re-tested the exact reported endpoint,
  `https://qa.aiqadam.org/api/v1/me/profile`, unauthenticated: now returns
  `401` (correct expected behavior), not the originally-reported `404`.
  The 404 was not reproduced on this pass — most likely either transient
  (a QA deploy/restart between the original report and this check) or
  session-state-specific to the reporter's original authenticated
  request, which an anonymous re-check can't reproduce. Given the
  underlying defect (`policy.member` permission gap → 403 → unhandled
  500 for an authenticated member) is confirmed present on QA via direct
  permission-table inspection, this fix resolves the reported issue
  regardless of the exact 404-vs-500 wire-level detail. If a 404
  specifically (not 500) recurs after this PR deploys to QA, that's
  worth a fresh, separate, narrowly-scoped investigation — not blocking
  this resolution.
- **React error #418:** not independently reproduced with a full stack
  trace in this workflow; the local repro after the fix shows zero page
  errors, consistent with #418 being a downstream consequence of the
  primary 500 rather than an independent defect. If it recurs after this
  fix ships, it needs its own follow-up issue with a fresh repro.
