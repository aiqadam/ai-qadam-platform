---
code: FR-MIG-017
name: /auth/sign-in + /auth/signed-out pages
status: Not Started
module: Migration (MIG)
phase: Rebuild M3
---

## Description
The two auth boundary pages. `/auth/sign-in` initiates the Authentik OIDC flow; `/auth/signed-out` is the RP-initiated logout landing. Both are required for the SLO (single log-out) flow to work correctly in v2.

## Users
All visitors.

## Functional scope
1. `pages/auth/sign-in.astro` — redirects to Authentik authorization endpoint with correct `redirect_uri` (v2 callback URL). Preserves `?next=` param for post-login redirect.
2. `pages/auth/signed-out.astro` — renders a "You've been signed out" landing with a "Sign back in" link. Reads tenant cookie to show correct subdomain context. Clears `aiqadam-next-refresh` cookie.

## Acceptance criteria
- [ ] Visiting `/auth/sign-in` redirects to `auth.aiqadam.org/application/o/authorize/...`.
- [ ] After Authentik login, user is redirected back to `/` (or `?next=` value).
- [ ] Visiting `/auth/signed-out` renders the landing and shows no auth state in `<AppNav>`.
- [ ] `aiqadam-next-refresh` cookie is cleared on `/auth/signed-out`.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/auth/sign-in.astro` + `auth/signed-out.astro`.
- SLO flow: Authentik calls `/auth/signed-out` as the post-logout redirect URI — must match the registered Authentik client config for `next.aiqadam.org`.
