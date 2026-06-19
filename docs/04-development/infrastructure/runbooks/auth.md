# Runbook: Auth-system day-2 operations

**Audience:** on-call engineer when the auth path is misbehaving (login fails, sessions don't propagate, OIDC redirect loops, RBAC sync stops applying), or when a planned operation touches the auth system (Authentik upgrade, signing-key rotation, OIDC client config change).

**Pre-reading:** [`docs/04-development/architecture/auth-architecture.md`](../../architecture/auth-architecture.md) (the JWT-in-cookie + OIDC + Authentik chain), [ADR-0032](../../../adr/0032-operator-tools-must-sso-or-embed.md) (the policy every operator-facing tool follows), [`authentik-local-bootstrap.md`](authentik-local-bootstrap.md) (Authentik provider setup against local; useful for understanding the prod config).

**Total time:** Authentik upgrade ~30 min; signing-key rotation ~15 min plus a propagation window; RBAC sync failure investigation 15–60 min depending on cause.

> **Scaffold** — concrete sequences land per operation as we run them in anger. Track Sprint 0.13 in `docs/01-business/community-platform-roadmap.md` §7. The trio of recent PRs #129 / #131 / #132 (auth-flow hardening + the flow-cookie TTL + the prompt=login fix) is the closest thing we have to a real Authentik debugging case study; consult those PR descriptions before opening an issue against the auth flow.

## Pre-conditions

- Engineer has Authentik admin (the `akadmin` account; password at `/tmp/aiqadam-secrets-AK_PW`) — see [`reference-secrets-cache`](../../.claude/projects/-home-drukker-aiqadam/memory/reference_secrets_cache.md)
- Engineer has Coolify access (env-var edits + restart of `aiqadam-api` + `aiqadam-web`)
- Engineer has prod-host SSH (`ssh aiqadam-prod`) for inspecting nginx / container logs
- Loki query is available at `/workspace/observability` (or directly via the Loki container) — useful for `aiqadam-api` auth-callback traces

## Steps

This section is per-operation. Pick the one you're doing:

### A. Authentik upgrade

1. Read upstream release notes — flag breaking changes (esp. flow / policy semantics).
2. Backup Authentik DB via the standard restic job (see [`restic-backups.md`](restic-backups.md)).
3. Coolify → `aiqadam-authentik` → bump image tag → deploy.
4. Verify login via incognito → `auth.aiqadam.org` succeeds; verify chained login via `aiqadam.org/v1/auth/start` returns a JWT cookie.
5. Roll back via Coolify if step 4 fails — old image tag is still available.

### B. JWT signing-key rotation

1. New `JWT_SECRET` written via `printf %s '<new>' > /tmp/aiqadam-secrets-JWT_SECRET` (32+ chars random).
2. Push to Coolify env on `aiqadam-api`.
3. Restart `aiqadam-api`.
4. *Existing JWTs are invalidated; users will need to re-login.* If grace period is desired, support both old + new for a window — currently NOT implemented; design lives in [`auth-architecture.md`](../../architecture/auth-architecture.md) (TBD).

### C. RBAC sync service not applying group changes (Sprint 2.2)

> Pre-condition: F-S2.2 RBAC sync has shipped. Until then, group claims are placeholder-only per [PR #125](https://github.com/viktordrukker/aiqadam/pull/125).

1. Read sync-service logs in Loki (`{container="aiqadam-api"} |= "rbac_sync"`).
2. Check Authentik group membership matches expected user (`auth.aiqadam.org/api/v3/core/users/<id>` → groups field).
3. Check Directus permission policy state matches expected role (`cms.aiqadam.org/policies?filter=...`).
4. If a step in the state-machine is stuck: replay via the admin retry button in `/workspace/observability` (TBD; lands with F-S2.2).

### D. OIDC redirect loop / stuck on Authentik

Reference the 2026-05-20 incident captured in PRs #129–#132. Symptoms then: user lands on Authentik with "Successfully logged in!" toast, but the chain never completes back to `/workspace`. Root cause was `prompt=login` + `max_age=0` interactions with the Authentik authorize endpoint. Fix was to drop both flags + bump the flow-cookie TTL from 60s → 600s. If a similar symptom appears: replicate in an incognito session, capture the full network trace, compare against those PR descriptions.

## Verification

- For all paths: a fresh incognito login on `aiqadam.org` → `/workspace` → redirects through Authentik → lands back on `/workspace` showing the operator's display name within 10 seconds.
- For RBAC sync: a deliberate group change in Authentik propagates to Directus within 60 seconds (the F-S2.2 SLO).

## Rollback

- Authentik upgrade: redeploy old image tag in Coolify.
- JWT secret rotation: re-set the OLD value in Coolify and restart `aiqadam-api`. This re-validates the old JWTs (the cookie hasn't expired). Note: if any user changed their password during the window, they'll need to log in again regardless.
- RBAC sync failure: per-engine retry from the admin UI (TBD F-S2.2).

## Common failure modes

*(Grows from real incidents. Carries over the 2026-05-20 OIDC redirect bug as the seed entry; see PRs #129–#132 for the full story.)*

| Symptom | Root cause | Fix |
|---|---|---|
| Stuck on Authentik login page with "Successfully logged in!" toast, no redirect | `prompt=login` + `max_age=0` on the authorize URL | Drop both flags (PR #131) |
| Flow cookie expires mid-login (60s default too short for slow networks) | Authentik default + cluster latency | Bump TTL to 600s (PR #132) |
| Playwright smoke flake on workspace redirect | `waitForURL` races multi-hop chain | Poll `page.url()` instead (PR #130) |

## References

- [`docs/04-development/architecture/auth-architecture.md`](../../architecture/auth-architecture.md) — the design this runbook operates
- [ADR-0032](../../../adr/0032-operator-tools-must-sso-or-embed.md) — the policy
- [ADR-0021](../../../adr/0021-rbac-manifest.md) — RBAC manifest (Proposed); F-S2.2 turns it on
- [`authentik-local-bootstrap.md`](authentik-local-bootstrap.md) — local Authentik provider setup
- [`authentik-ropc.md`](authentik-ropc.md) — password-reset commands (ROPC otherwise deprecated)
- PRs [#129](https://github.com/viktordrukker/aiqadam/pull/129) [#131](https://github.com/viktordrukker/aiqadam/pull/131) [#132](https://github.com/viktordrukker/aiqadam/pull/132) — the 2026-05-20 auth-flow hardening case study
