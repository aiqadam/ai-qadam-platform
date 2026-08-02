# 08 — Doc Update: FR-AUTH-003 (Google + GitHub OAuth)

**Workflow:** wf-20260802-feat-192-auth-003-social-oauth  
**Agent:** DocWriter  
**Date:** 2026-08-02

---

## Gate result: passed

---

## Changes made

### `docs/03-requirements/FR-AUTH-003.md`

- `status` frontmatter: `Planned` → `Implemented`
- Added **Implementation notes** section at the bottom documenting:
  - `GET /v1/auth/login?provider=google|github` passes `source=<slug>` to Authentik
  - `GET /v1/auth/callback` returns `302` to `/auth/sign-in?error=oauth_denied` on `?error=access_denied`
  - Web: `/auth/sign-in` (apps/web-next) shows Google and GitHub sign-in buttons + error banner
  - Provisioning: `scripts/provision-authentik-oauth-sources.sh`

### `docs/03-requirements/requirements-registry.md`

- Row 11 (FR-AUTH-003) Status column: `Planned` → `Shipped`

---

## Documents not changed

| Document | Reason skipped |
|---|---|
| `docs/04-development/architecture/architecture.md` | No new module or module boundary introduced; OAuth flow routes through the existing Auth module |
| `docs/api/` | OpenAPI is auto-generated from NestJS decorators; no manual supplement exists for the auth endpoints |
| `docs/adr/` | No new architecture decision; the Authentik Sources pattern is already established |
| `docs/04-development/standards.md` | No new coding convention introduced |
| `docs/04-development/security/security.md` | No new security rule; provider-injection guard (VALID_PROVIDERS allowlist) follows the existing boundary-validation rule already documented |
