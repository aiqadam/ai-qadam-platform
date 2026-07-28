# Security Review — wf-20260728-fix-145 (ISS-INFRA-QA-DIRECTUS-SCHEMA-001)

## Code Changes Reviewed

- `deploy/docker-compose.qa.yml` (repo-tracked, 1 line + comment added)
- Live infra changes on `pro-data-tech-qa` (95.46.211.230): Directus
  schema (`bootstrap.sh` + `flows-bootstrap.sh` run), `deploy/.env`
  (`DIRECTUS_TOKEN` fixed, `RBAC_SYNC_WRITE_ENABLED` added), `api`
  container recreated twice.

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | No tenant-scoped query logic changed. |
| INV-2 Secrets by reference | Yes | Pass | The repo diff itself contains no secret literal — `DIRECTUS_TOKEN: ${DIRECTUS_ADMIN_TOKEN:?...}` is a variable reference, resolved from `deploy/.env` (gitignored, host-local), same pattern every other env var in this file already uses. The real token value was only ever typed into SSH commands against the live host, never committed. |
| INV-3 Auth at controller level | No | N/A | Not a controller change. |
| INV-4 Validation at boundaries | No | N/A | Not an input-handling change. |
| INV-5 No cross-schema queries | No | N/A | Not a query change. |
| INV-6 Rate limiting | No | N/A | No new endpoint. |
| INV-7 CSRF | No | N/A | No new state-changing browser endpoint. |
| INV-8 No dangerouslySetInnerHTML | No | N/A | Infra/compose change only. |
| INV-9 No N+1 queries | No | N/A | Not a query-pattern change. |
| INV-10 Drizzle parameterization | No | N/A | No SQL. |
| INV-11 HttpOnly tokens | No | N/A | Not a browser-token change. |

## Security-critical review: what this workflow actually did to a shared live environment

This workflow's real risk surface is operational (live infra mutation),
not code-shaped, so the review focuses there instead of the standard
invariant table:

1. **Schema bootstrap (`bootstrap.sh` + `flows-bootstrap.sh`).** Read-then-
   write, idempotent by construction (every collection/policy/permission/
   flow creation is preceded by an existence check). Reviewed the script
   in full before running: no destructive operation touches pre-existing
   QA data (the only `DELETE`s are (a) this workflow's own prior
   `revoke_public_read` addition, scoped to a single named policy/
   collection/action triple, and (b) `drop_field` calls for 7 named,
   already-obsolete `operator_invites` columns that don't exist yet on a
   freshly-bootstrapped QA — confirmed no-op). Verified post-run that the
   `directus_users` PII-leak permission
   ([ISS-SEC-DIRECTUS-USERS-PUBLIC-001](../../issues/ISS-SEC-DIRECTUS-USERS-PUBLIC-001.md))
   was NOT introduced on QA — anonymous read still correctly `403`s.
2. **`DIRECTUS_TOKEN` fix.** Set to the SAME value already present in
   `DIRECTUS_ADMIN_TOKEN` on the same host — no new secret was minted,
   generated, or transmitted outside the existing trust boundary (SSH to
   a host the user's own key already has root access to). The compose
   file fix makes this authoritative going forward (single source of
   truth) rather than two independently-settable values that can drift.
3. **`RBAC_SYNC_WRITE_ENABLED=true`.** This flips a dry-run flag to a
   real-write flag — the code path it enables
   (`DirectusPolicyApplier.apply()`) was already reviewed and fixed for
   correctness in `wf-20260728-fix-143`/`144` (own-row `$CURRENT_USER`
   scoping, verified via a genuine cross-user permission test in that
   workflow). Enabling it on QA does not introduce new code, only
   activates already-reviewed code on a second environment.
4. **Container recreation (`docker compose up -d --no-deps api`, twice).**
   Scoped to `--no-deps api` specifically — does not touch or restart
   `directus`, `authentik-server`, `postgres`, or any other QA service.
   Brief connection drop for in-flight API requests during recreation
   (standard rolling-restart risk, no different from a normal deploy).

## BLOCKER Findings

None.

## MAJOR Findings

None.

## Gate Result

```markdown
gate_result:
  status: passed
  summary: "No BLOCKER or MAJOR findings. Live infra changes were idempotent, reviewed before execution, scoped narrowly (--no-deps api), and did not introduce new secrets or reintroduce the prior PII-leak finding. Repo-tracked compose fix references an existing env var, no literal secret in the diff."
  findings: []
```
