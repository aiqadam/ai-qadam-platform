# 06 — Test Strategy: FR-AUTH-003 (Google + GitHub OAuth)

**Workflow:** wf-20260802-feat-192-auth-003-social-oauth  
**Agent:** TestStrategist  
**Date:** 2026-08-02

---

## Required Test Levels

- [x] Unit (vitest, mock OIDC client and all external dependencies)
- [x] Integration (controller + service instantiated directly, mock OIDC client, no Testcontainers — no database I/O in new logic paths)
- [x] E2E (Playwright, UI presence only — no real OAuth round-trip in CI)

> **No Testcontainers rationale:** `validateProvider`, `startAuthorization` with `source=`, and `access_denied` guard have zero database I/O. Testcontainers reserved for tests that assert DB state.

---

## Unit/Integration Test Plan

### `apps/api/test/auth-controller-social-login.spec.ts` (new)
- `validateProvider(undefined)` → `undefined`
- `validateProvider('google')` → `'google'`
- `validateProvider('github')` → `'github'`
- `validateProvider('facebook')`, `validateProvider('')`, `validateProvider('GOOGLE')` → `BadRequestException`
- `login()` no provider → calls `startAuthorization({ next: '/' })` without `provider` key
- `login()` `provider=google` → calls `startAuthorization({ next: '/', provider: 'google' })`
- `login()` `provider=invalid` → throws `BadRequestException`, `startAuthorization` not called
- `callback()` `error=access_denied` → redirect to `*/auth/sign-in?error=oauth_denied`, `completeAuthorization` not called

### `apps/api/test/auth-service-provider.spec.ts` (new)
- `startAuthorization({ next: '/me' })` → `authorizationUrl` called WITHOUT `source` property
- `startAuthorization({ next: '/me', provider: 'google' })` → called WITH `source: 'google'`
- `startAuthorization({ next: '/me', provider: 'github' })` → called WITH `source: 'github'`
- PKCE and scope invariants always present

---

## E2E Test Plan

### `apps/e2e/tests/smoke-auth-social-buttons.spec.ts` (new)
- Google button visible + href contains `provider=google` (AC-1)
- GitHub button visible + href contains `provider=github` (AC-2)
- `oauth_denied` banner visible with correct copy at `?error=oauth_denied` (AC-5)
- No banner without `?error=` param
- Existing buttons regression guard (AC-7)
- 375px mobile viewport — all buttons visible (AC-4)

---

## AC → Test Mapping

| AC | Test Level | Notes |
|---|---|---|
| AC-1: Google flow → /me | E2E (href) + UAT (live) | E2E asserts href; live OAuth → UAT-only |
| AC-2: GitHub flow → /me | E2E (href) + UAT (live) | Same split |
| AC-3: Email user signs in via Google → same account | UAT-only | Authentik-side deduplication, queued in wf-20260802-uat-193-auth-003 |
| AC-4: 375px mobile visible | E2E | smoke-auth-social-buttons.spec.ts |
| AC-5: Deny → /auth/sign-in?error=oauth_denied | Unit + E2E | Unit: callback() guard; E2E: banner text |
| AC-6: No secrets in tracked files | Static (git grep) | Verified in 07-test-results.md |
| AC-7 (regression) | E2E | Existing buttons still present |
| AC-8 (layout readiness) | E2E (qualitative) | flex-col layout handles ≥3 buttons |

---

## Gate Result

```
gate_result:
  status: passed
  summary: "All 8 ACs mapped to concrete tests. AC-3 UAT deferral is honest, bounded, and owned by a queued workflow."
```
