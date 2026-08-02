# 03 — Code Summary: FR-AUTH-003 (Google + GitHub OAuth)

**Workflow:** wf-20260802-feat-192-auth-003-social-oauth  
**Agent:** CodeDeveloper  
**Date:** 2026-08-02

---

## Gate result: passed

TypeScript typecheck: 0 errors (`pnpm --filter api typecheck`, `pnpm --filter web-next typecheck`).  
Biome lint: 0 errors on all changed files.

---

## Changes

### `apps/api/src/modules/auth/auth.service.ts`

- `startAuthorization()` input widened from `{ next: string }` to `{ next: string; provider?: 'google' | 'github' }`.
- Added conditional spread `...(input.provider !== undefined ? { source: input.provider } : {})` to `authorizationUrl()` options — appends Authentik's `source=<slug>` param when a provider is requested, routing the OIDC flow through the matching OAuth Source.

### `apps/api/src/modules/auth/auth.controller.ts`

- Added module-level `VALID_PROVIDERS = ['google', 'github'] as const` and `type OAuthProvider`.
- `login()`: added `@Query('provider') providerRaw: string | undefined` parameter; calls `validateProvider()` before `startAuthorization()`. Invalid values throw `BadRequestException('invalid provider')`.
- `callback()`: added early-exit guard `if (req.query.error === 'access_denied')` **before** the `completeAuthorization` try/catch — redirects to `${env.WEB_BASE_URL}/auth/sign-in?error=oauth_denied`. Ordering is critical: `openid-client` throws `OPError` for `?error=` params in the callback URL.
- Added `validateProvider(raw)` module-level helper — guards against provider injection via the `VALID_PROVIDERS` allowlist (SR-1).

### `apps/web-next/src/pages/auth/sign-in.astro`

- Added `googleSignInUrl` and `githubSignInUrl` vars using same `encodeURIComponent(safeNext)` pattern as `passwordSignInUrl`.
- Added `oauthError = url.searchParams.get('error')` read.
- Error banner: shown only when `oauthError === 'oauth_denied'`; message "Sign-in was cancelled. Please try again." Uses design-system tokens (`border-destructive/30`, `bg-destructive/10`, `text-destructive`).
- Two new `btn btn-secondary` anchor elements: "Continue with Google" and "Continue with GitHub".
- Existing buttons ("Continue with password", "Sign in with email link") and Telegram widget unchanged (AC-7, AC-8).

### `scripts/provision-authentik-oauth-sources.sh` (new)

- Idempotent: GET `/api/v3/sources/oauth/<slug>/` before POST.
- Slugs `google` and `github` match `VALID_PROVIDERS` in the controller.
- Credentials read from `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` env vars only — no secrets in any tracked file (AC-6).
- Windows curl idiom per AGENTS.md §6.1.
- Host guard: refuses non-`localhost`/`127.0.0.1`/`auth.aiqadam.org` targets.

---

## Security notes (SR items from impact analysis)

| # | Risk | Disposition |
|---|---|---|
| SR-1 | Provider injection via `source=` | Mitigated — `VALID_PROVIDERS` allowlist; any unrecognised value throws `BadRequestException` before `startAuthorization()` is called |
| SR-2 | `access_denied` redirect destination | Fixed — destination is `env.WEB_BASE_URL + /auth/sign-in?error=oauth_denied`; no user input reaches the redirect URL |
| SR-3 | No secrets in tracked files | Confirmed — credentials only in Authentik env via provisioning script |
