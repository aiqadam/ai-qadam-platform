# ADR-0016: Web auth flow — HttpOnly refresh + in-memory access token

## Status
Accepted, 2026-05-15

## Context
[ARCHITECTURE.md §"Identity and security"](../../.claude/ARCHITECTURE.md) originally said: "JWT for API, secure HttpOnly cookies for web." That phrasing leaves the actual web flow underspecified — does the web app use cookie-based sessions (with CSRF tokens) or in-memory bearer tokens (with refresh) or some hybrid?

Three realistic flows:

1. **Cookie session + double-submit CSRF.** Authentik-issued session ID stays in HttpOnly cookie; every state-changing request carries a CSRF token in a custom header that the server cross-checks against a cookie value. Browser-native, no JS state to manage, but adds CSRF plumbing on every state-changing endpoint.

2. **Bearer JWT in JS memory, no cookie.** Access token held in JS state, sent as `Authorization` header. Cleanest separation from cookie-based attack surface — but loses session on tab close/reload, and any XSS reads the token immediately.

3. **HttpOnly refresh cookie + short-lived in-memory access token (the modern OIDC client pattern).** Refresh token in HttpOnly cookie (XSS can't steal). Short-lived access token in JS memory, sent as `Authorization` header. Page reload re-mints access via refresh.

## Decision
Use **flow 3**: HttpOnly refresh cookie + short-lived in-memory access token.

### Implementation

- **Authentik issues both tokens at login** via the standard OIDC code flow.
- **API sets the refresh token in an HttpOnly, Secure, SameSite=lax cookie** scoped to `aiqadam.org`. Path: `/v1/auth/`. Cookie name: `__Host-aiqadam-refresh` (the `__Host-` prefix enforces Secure, no Domain attribute, path=/).
- **Web app holds the access token in React state** (not `localStorage`, not `sessionStorage`). Sent as `Authorization: Bearer <access>` on each fetch.
- **Access token TTL: 10 minutes.** Short enough that XSS theft is bounded; long enough that refresh round-trips don't dominate normal browsing.
- **Refresh token TTL: 14 days** (matches [SECURITY.md §"Authentication"](../../.claude/SECURITY.md) session-lifetime rule).
- **Refresh token rotates on every use** — used refresh becomes invalid; receiving a previously-used refresh token at the API is a strong replay-attack signal and revokes the entire session chain.
- **On 401 response**, the web app calls `POST /v1/auth/refresh` (cookie auto-attached). On success, it gets a new access token and retries the original request once. On failure, the user is sent to the login flow.
- **Logout** clears both: the API sends `Set-Cookie` with empty value + `Max-Age=0` to delete the cookie server-side; the web app discards the in-memory access token.
- **For non-web clients** (Telegram bot, CRM, server-to-server), bearer JWT is used directly with longer-lived service-account tokens — they don't go through this refresh flow.

## Rationale

- **XSS resilience for the long-lived secret.** An XSS attack can read the access token from JS memory, but it expires in 10 minutes and the attacker cannot extend the session because they cannot read the HttpOnly refresh cookie.
- **Page reload survives.** Refresh cookie is still there, so the app re-mints the access token on app boot — user stays "logged in" across reloads, tab close/reopen, etc. Good UX.
- **Mobile-friendly via the same flow.** A future Capacitor/PWA wrap of the web app uses the same refresh + access pattern (cookies work in WebView). Native bot has its own service-account token and doesn't share this flow.
- **Modern OIDC client standard.** Documented in OAuth 2.1 Browser-Based Apps BCP. Authentik supports it natively via the `id_token` + `refresh_token` flow.
- **No CSRF token plumbing needed.** State-changing requests carry the access token in the `Authorization` header, which the same-origin policy prevents cross-origin JS from setting on a target's behalf — so cross-origin attackers can't abuse the user's session even though the cookie auto-attaches to refresh requests.

## Consequences

- ✅ **Best-of-both:** cookie security for the long-lived secret, bearer header for the request flow.
- ✅ **Page reload preserves session** — major UX improvement over flow 2.
- ✅ **No CSRF token plumbing** — every state-changing endpoint just checks the bearer.
- ⚠️ **Refresh-on-401 retry logic** must not infinite-loop. Implementation: retry exactly once; second 401 propagates as auth failure.
- ⚠️ **Refresh endpoint is itself a CSRF surface** (cookies auto-attach). Mitigations: refresh endpoint accepts only `POST`, returns response opaque to cross-origin JS without explicit CORS, refresh tokens rotate on every use so a stolen-and-replayed refresh becomes detectable and revokes the chain.
- ⚠️ **10-minute access expiry mid-long-running-request.** The first 401 triggers refresh + retry; if the access expires *during* a single request that doesn't 401 (e.g., a long file upload), the upload may fail in unusual ways. Mitigation: long-running operations (uploads, exports) get their own short-TTL signed URL outside this flow.
- ⚠️ **Brief "logged out" flash on initial page load** while the refresh round-trip completes. Mitigated by Astro middleware doing the refresh server-side on first render where possible (the middleware reads the cookie, calls refresh, hydrates the access token into the SSR context, and the React island starts with state already populated).
- 📝 **Refresh endpoint is rate-limited** (5 attempts per 15 minutes per IP per [SECURITY.md §"Rate limiting"](../../.claude/SECURITY.md)). Combined with rotation, this makes brute-force impractical.

## Supersedes
The unspecific "JWT for API, HttpOnly cookies for web" text in [ARCHITECTURE.md §"Identity and security"](../../.claude/ARCHITECTURE.md). Rewritten in this Round 2A to point at this ADR.

## References
- OAuth 2.1 Browser-Based Apps BCP (IETF draft) — pattern reference.
- [Authentik OIDC docs](https://goauthentik.io/docs/providers/oauth2) — token issuance configuration.
- [SECURITY.md §"Authentication"](../../.claude/SECURITY.md) — session lifetime, MFA, rate-limit constraints.
