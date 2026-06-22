---
code: FR-AUTH-001
name: Email / password sign-in and sign-out
status: Shipped
module: Auth (AUTH)
phase: Phase 1 (V1)
---

## Description

Members sign in to the platform using their email address and password. Authentication is delegated entirely to Authentik (OIDC provider). The web app acts as a Relying Party — it never handles credentials directly. Sign-out triggers an RP-initiated logout so the Authentik session is also terminated (SSO → SLO).

## Users

Member, Speaker, Organizer, Country Admin, Super Admin.

## Functional scope

1. **Sign-in entry point** — `/auth/sign-in` issues a `302` redirect to Authentik's authorization endpoint with a safe `next` validation (relative path only, no open redirect).
2. **OIDC callback** — `/v1/auth/callback` on the API exchanges the code for tokens, sets an `HttpOnly` refresh-token cookie (`aiqadam-refresh`), and redirects the browser to `next` or `/me`.
3. **Token refresh** — `POST /v1/auth/refresh` issues a new short-lived access token from the refresh cookie. Rotates the refresh token on every call (single-use).
4. **Auth state endpoint** — `GET /v1/auth/me` returns `{ id, email, authentikSubject, groups[] }` for the currently authenticated user given a valid Bearer token.
5. **SSR auth bootstrap** — The Astro middleware calls `/v1/auth/refresh` + `/v1/auth/me` once per SSR request, injects `window.__AIQADAM_AUTH__` so React islands get auth state on first paint without parallel refresh calls.
6. **Sign-out** — `POST /v1/auth/sign-out` revokes the refresh cookie, returns `{ logoutUrl }` (Authentik's `end_session_endpoint`). Client navigates to `logoutUrl` for full SSO sign-out; falls back to `/auth/signed-out`.
7. **`/auth/signed-out`** page — Landing page confirming sign-out (RP-initiated logout target).

## Acceptance criteria

- [ ] Visiting `https://uz.aiqadam.org` unsigned: clicking "Sign in" redirects to `https://auth.aiqadam.org/...` with correct `redirect_uri` and `state`.
- [ ] After successful sign-in at Authentik, the browser lands at `/me` (or the `next` path if provided and valid).
- [ ] The refresh cookie is `HttpOnly`, `Secure`, `SameSite=Lax`.
- [ ] Calling `GET /v1/auth/me` with a valid Bearer returns the correct user fields including `groups[]`.
- [ ] Calling `POST /v1/auth/refresh` with an already-used refresh token returns `401` (replay attack blocked).
- [ ] Parallel island calls to `/v1/auth/refresh` result in exactly one real refresh call (dedup via `window.__AIQADAM_AUTH__` SSR blob + module-level in-flight Promise).
- [ ] Sign-out clears the cookie and redirects through Authentik's `end_session_endpoint`; a subsequent `/v1/auth/me` returns `401`.
- [ ] An invalid or tampered `next` param is rejected; the redirect lands at `/me` instead.

## Notes

- Token lifecycle: short-lived access token (in-memory, not persisted); long-lived refresh token (cookie, rotated on use).
- Authentik OIDC application must set `sub_mode=user_email` for stable user identity across token refreshes.
- Legacy cookie name `__Host-aiqadam-refresh` must be accepted alongside `aiqadam-refresh` during the transition period.
- See ADR-0016 for the full web auth flow.
