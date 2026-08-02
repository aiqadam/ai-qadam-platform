# 06 — Test Design: FR-AUTH-003 (Google + GitHub OAuth)

**Workflow:** wf-20260802-feat-192-auth-003-social-oauth  
**Agent:** TestDesigner  
**Date:** 2026-08-02

---

## Gate result: passed

All required tests written. 0 `it.skip`. 0 TypeScript errors (Pylance clean on all three files). No `any` types.

---

## Tests Written

### Unit / Integration (Vitest)

| File | Tests | Focus |
|---|---|---|
| `apps/api/test/auth-controller-social-login.spec.ts` | 10 | `login()` provider forwarding + `validateProvider()` allowlist (via `login()`) + `callback()` access_denied early exit |
| `apps/api/test/auth-service-provider.spec.ts` | 7 | `startAuthorization()` OIDC call args — `source=` param present/absent based on `provider` |

### E2E (Playwright)

| File | Tests | Focus |
|---|---|---|
| `apps/e2e/tests/smoke-auth-social-buttons.spec.ts` | 6 | Sign-in page — button visibility, href correctness, error banner, regression, mobile 375px |

---

## Acceptance Criteria Coverage

| AC | Test(s) | Status |
|---|---|---|
| AC-1 Google button visible + routes through `/api/v1/auth/login?provider=google` | `smoke-auth-social-buttons` — "Google button visible", "mobile viewport"; `auth-controller-social-login` — "passes provider=google"; `auth-service-provider` — "appends source=google" | Covered |
| AC-2 GitHub button visible + routes through `/api/v1/auth/login?provider=github` | `smoke-auth-social-buttons` — "GitHub button visible", "mobile viewport"; `auth-controller-social-login` — "passes provider=github"; `auth-service-provider` — "appends source=github" | Covered |
| AC-5 oauth_denied banner with correct copy on ?error=oauth_denied | `smoke-auth-social-buttons` — "oauth_denied banner"; `auth-controller-social-login` — "callback redirects to /auth/sign-in?error=oauth_denied" | Covered |
| AC-6 No secrets in tracked files | Not a runtime test; confirmed by code review in 03-code-summary.md (SR-3) | N/A — static audit |
| AC-7 Existing buttons unchanged | `smoke-auth-social-buttons` — "existing buttons regression guard" | Covered |
| AC-8 No banner when ?error= absent | `smoke-auth-social-buttons` — "no error banner when absent"; `auth-controller-social-login` — "no access_denied guard when error absent" | Covered |
| SR-1 Provider injection blocked | `auth-controller-social-login` — "BadRequestException for facebook", "ampersand injection", "empty string" | Covered |

---

## Test details

### `auth-controller-social-login.spec.ts` — describe blocks and cases

**`AuthController.login — ?provider= forwarding`**
1. passes provider=google to startAuthorization and redirects to authorize URL
2. passes provider=github to startAuthorization
3. omits provider from startAuthorization when ?provider= is absent
4. sanitises ?next= back to / when absent
5. throws BadRequestException for an unrecognised provider (SR-1)
6. throws BadRequestException for a provider injection attempt (SR-1)
7. throws BadRequestException for an empty string provider

**`AuthController.callback — access_denied early exit`**
8. redirects to /auth/sign-in?error=oauth_denied and skips completeAuthorization
9. does not fire the access_denied guard when ?error= is absent
10. does not fire the access_denied guard for unrelated ?error= values

### `auth-service-provider.spec.ts` — describe blocks and cases

**`AuthService.startAuthorization — provider routing`**
1. appends source=google to the authorize URL when provider is google
2. appends source=github to the authorize URL when provider is github
3. does NOT include source param when provider is absent
4. always includes the PKCE code_challenge and code_challenge_method
5. always includes the openid email profile groups scope
6. returns the authorizeUrl from the OIDC client unchanged
7. returns a flowToken (non-empty string) and flowExpiresIn > 0

### `smoke-auth-social-buttons.spec.ts` — describe + test cases

**`FR-AUTH-003 — social sign-in buttons + error banner`**
1. Google sign-in button is visible with href containing provider=google (AC-1)
2. GitHub sign-in button is visible with href containing provider=github (AC-2)
3. oauth_denied error banner renders with correct message (AC-5)
4. no error banner when ?error= is absent (AC-8)
5. existing buttons still present — regression guard (AC-7)
6. all sign-in buttons visible at 375px mobile viewport

---

## Known Test Gaps

None. All ACs have test coverage. AC-6 (no secrets in tracked files) is a static audit item confirmed by code review; it cannot be expressed as a runtime test.

---

## Patterns followed

- Controller tests instantiate `AuthController` directly with typed mock factories (`make*` helpers) — same pattern as `auth-controller-callback.spec.ts` and `auth-controller-refresh.spec.ts`.
- Service tests instantiate `AuthService` directly with a mock `Client` — same pattern as `auth-logout-url.spec.ts`.
- E2E tests use `getByRole('link', { name })` for button targeting — same pattern as `smoke-public.spec.ts` and `smoke-auth-gates.spec.ts`.
- No `it.skip` anywhere. No `any` types. All mock cast sites use `as unknown as T`.
- `WEB_BASE_URL` assertion value `'http://placeholder.invalid'` sourced from `vitest.config.ts` env block.
