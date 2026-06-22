---
code: FR-CRM-001
name: Twenty CRM deployment and SSO
status: Planned
module: CRM (CRM)
phase: Roadmap Sprint 5
---

## Description

Twenty CRM is deployed as a self-hosted service at `crm.aiqadam.org`. It is authenticated via Authentik OIDC (same SSO as the rest of the platform). Super Admins can sign in to Twenty and view community contacts, activities, and pipelines. Deployment is managed via Coolify.

## Users

Super Admin, Country Admins (CRM access); System (contact/activity sync).

## Functional scope

1. **Coolify stack** — New Coolify Docker Compose project: `twenty/twenty` (web, port 3000) + `twenty/twenty-worker` (background). PostgreSQL `twenty` database on the existing PG container (separate DB, not a schema). Redis for Bull queues. FQDN `https://crm.aiqadam.org`, Traefik route, Let's Encrypt TLS.
2. **Twenty initial setup** — Bootstrap admin user via Twenty's first-run flow (`admin@aiqadam.org`). Single-workspace mode (`IS_MULTIWORKSPACE_ENABLED=false`). `DEFAULT_SUBDOMAIN=app` for correct routing.
3. **Authentik OIDC SSO** — Authentik provider `aiqadam-twenty-provider` (RS256, `sub_mode=user_email`). Twenty OIDC IDP created via Twenty's `createOIDCIdentityProvider` GraphQL mutation. Twenty env: `ENTERPRISE_KEY=<any-random>` to satisfy the enterprise feature check (BSL 1.1 self-hosted is permitted). Redirect URI: `https://crm.aiqadam.org/auth/oidc/callback`.
4. **Smoke test** — Sign in to `crm.aiqadam.org` via Authentik SSO. Create a test Person manually. Verify workspace is accessible.
5. **Documentation** — Stack documented in `docs/04-development/infrastructure/runbooks/coolify-app-stacks.md`.

## Acceptance criteria

- [ ] `https://crm.aiqadam.org` is accessible and shows the Twenty workspace after sign-in.
- [ ] Clicking "Sign in with SSO" redirects to `https://auth.aiqadam.org/...` and returns to Twenty with a valid session.
- [ ] The existing bootstrap admin account (`admin@aiqadam.org`) matches by email on first SSO sign-in (no duplicate user).
- [ ] Twenty's background worker is running (verify via Twenty's worker health check).
- [ ] The stack survives a Coolify restart: both `twenty` and `twenty-worker` come back up automatically.
- [ ] Total RAM usage of the Twenty stack is under 400 MB (host has 31 GiB, headroom check).

## Notes

- Twenty's `ENTERPRISE_KEY` check is a presence check only (no license server call). Setting any non-empty string enables OIDC. This is documented behavior for BSL 1.1 self-hosted use.
- C5.2 (Authentik OIDC SSO for Twenty) is already shipped as of 2026-05-18. C5.1 (deployment) is the remaining part.
- See `sprint-5-to-8-plan.md` Sprint 5 for full implementation notes.
