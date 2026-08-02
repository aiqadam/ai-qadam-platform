# 04 — Security Review: FR-AUTH-003 (Google + GitHub OAuth)

**Workflow:** wf-20260802-feat-192-auth-003-social-oauth  
**Agent:** SecurityReviewer  
**Date:** 2026-08-02

---

## Code Changes Reviewed

| File | Area |
|---|---|
| `apps/api/src/modules/auth/auth.controller.ts` | `VALID_PROVIDERS`, `validateProvider()`, `login ?provider=`, `callback access_denied` early exit |
| `apps/api/src/modules/auth/auth.service.ts` | `startAuthorization()` widened input, `source=` param conditional spread |
| `apps/web-next/src/pages/auth/sign-in.astro` | Google/GitHub anchor buttons, `oauthError` banner |
| `scripts/provision-authentik-oauth-sources.sh` | Credentials handling, jq parameterization, host guard |

---

## SR-Item Verification

| SR | Concern | Verdict | Evidence |
|---|---|---|---|
| SR-1 | Provider injection via `source=<provider>` | **PASS** | `validateProvider()` called before `startAuthorization()`. Uses strict `VALID_PROVIDERS.find((p) => p === raw)` — any value outside `['google','github']` throws `BadRequestException` and never reaches the service. TypeScript narrows the return type to `OAuthProvider | undefined`. |
| SR-2 | `access_denied` redirect open-redirect risk | **PASS** | Destination is `` `${env.WEB_BASE_URL}/auth/sign-in?error=oauth_denied` ``. Both parts are server-side constants: `env.WEB_BASE_URL` is a validated env var; the suffix is a hardcoded string literal. Zero bytes of `req.query` reach the redirect URL. |
| SR-3 | Secrets in tracked files | **PASS** | Provisioning script reads all OAuth credentials exclusively from env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AK_API_TOKEN`). Values are passed to `jq` via `--arg` (parameterized — no shell interpolation into the JSON body). No credential literals in any tracked file. Confirmed by `git grep` in `07-test-results.md` — zero hits. |
| SR-4 | Auth enforced at controller level | **PASS** | `login()` and `callback()` are correctly public — user is not yet authenticated; these are the OIDC entry points. All methods requiring authentication carry `@UseGuards(AuthGuard)`. No new method defers auth to the service layer. |
| SR-5 | Rate limiting applies to `?provider=` path | **PASS** | Global `ObserveThrottlerGuard` registered as `APP_GUARD` in `app.module.ts` covers all routes including `login?provider=`. No `@SkipThrottle` present in `auth.controller.ts`. Pre-existing `RATE_LIMIT_ENFORCE=false` observe-mode gap is not introduced by this PR. |

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-2 Secrets by reference | Yes | **PASS** | No credential literals in logs, responses, or tracked files in the diff. |
| INV-3 Auth at controller level | Yes | **PASS** | `login()`/`callback()` intentionally public (pre-auth OIDC entry points). All auth-required endpoints carry `@UseGuards`. |
| INV-4 Validation at boundaries | Yes | **PASS** | `validateProvider()` + `sanitiseNext()` applied before `startAuthorization()`. Provisioning script validates non-empty credentials before POST. `jq --arg` prevents shell injection. |
| INV-6 Rate limiting | Yes | **PASS** | Global guard applies. Pre-existing observe-mode gap not introduced here. |
| INV-7 CSRF protection | N/A | — | `login` is GET browser navigation. PKCE + signed state nonce in flow cookie is the OAuth CSRF protection for `callback`. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | **PASS** | `sign-in.astro` has no `set:html`. Error banner text is a hardcoded literal. Astro auto-escapes all interpolated values. |
| INV-11 HttpOnly tokens | Yes | **PASS** | `?provider=` path converges on same `res.cookie(REFRESH_COOKIE, ...)` call as existing flows. No new token storage. |

---

### BLOCKER Findings

None.

### MAJOR Findings

None.

### MINOR Observations

**MINOR-1** (`scripts/provision-authentik-oauth-sources.sh` only): `ak_post()` logs up to 300 bytes of Authentik error-response body to stderr. If Authentik echoes posted body on error (non-standard), `consumer_secret` could appear in operator's terminal stderr on error path only. Deployment-tool concern only; no code change required.

---

## Gate Result

```
gate_result:
  status: passed
  summary: "All applicable invariants confirmed. SR-1 through SR-5 verified. No BLOCKER or MAJOR findings."
  findings:
    - "SR-1 PASS: VALID_PROVIDERS allowlist enforced before startAuthorization(); non-allowlisted value throws BadRequestException."
    - "SR-2 PASS: access_denied redirect uses env.WEB_BASE_URL + hardcoded suffix; no open redirect."
    - "SR-3 PASS: No secrets in any tracked file; credentials via env vars and jq --arg."
    - "SR-4 PASS: login/callback correctly public; all auth-required methods carry @UseGuards."
    - "SR-5 PASS: Global ObserveThrottlerGuard applies; pre-existing observe-mode gap not introduced here."
    - "MINOR-1: ak_post() may expose consumer_secret in stderr on API errors — deployment tool only, no prod risk."
```
