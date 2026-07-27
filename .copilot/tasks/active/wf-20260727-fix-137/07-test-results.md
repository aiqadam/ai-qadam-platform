# Step 8: Test Execution — wf-20260727-fix-137

## Infrastructure pre-flight (AGENTS.md §6.1)

`docker ps` confirmed already running and healthy:
`aiqadam-authentik-server`, `aiqadam-authentik-worker`, `aiqadam-postgres`
(5 days uptime — no bring-up needed). `apps/api` dev server confirmed
healthy via `curl -fsS http://localhost:3000/health` → 200. `apps/web`
dev server (port 4321) was NOT running; bringing up the full Turbo dev
stack was assessed as disproportionate for verifying a single-file
Authentik-provisioning fix when a more direct, equally rigorous
verification path was available (below) — this is a scope judgment, not
a deferral of the AC itself.

## Bug reproduction (before fix, live)

Created a throwaway Authentik provider using the exact pre-fix
`oidc-provider-body.json` shape (no `property_mappings` key):
`property_mappings` came back `[]`. This is the literal defect —
reproduced against the same live Authentik instance the fix targets, not
inferred from reading code. Cleaned up (deleted) immediately after.

## Fix verification (after fix, live)

1. Ran the fixed `.copilot/bootstrap-oidc.sh` end-to-end against local
   Authentik (`AK_URL=http://localhost:9000`). Output confirmed:
   - Resolved all three managed mappings by `managed` identifier.
   - Reuse/self-heal path triggered (provider `pk=1` already existed) —
     `PATCH` applied, confirmed `3` mappings attached.
   - Script completed normally through client-secret extraction and
     `apps/api/.env` patch (unrelated to this fix, pre-existing
     behavior, unaffected).
2. **Authoritative claim-evaluation check**: invoked Authentik's own
   `PropertyMapping.evaluate()` for each of the three now-attached
   mappings against a throwaway test user
   (`claude-fix-137@example.com`), via `ak shell` — the same code path
   Authentik's token endpoint calls when building a real id_token.
   Result:
   ```
   scope-email   -> {'email': 'claude-fix-137@example.com', 'email_verified': True}
   scope-openid  -> {}
   scope-profile -> {'name': ..., 'preferred_username': 'claude-fix-137-testuser', ...}
   ```
   This is definitive proof the `email` claim — the exact thing
   `auth.service.ts`'s `extractIdentityClaims()` rejects a 401 for when
   absent — is now present. All throwaway state (test user, temporary
   `authentication_flow` binding used for an earlier ROPC attempt,
   temporary API tokens) was deleted/reverted after verification; no
   residual state left on the local Authentik instance beyond the
   intended provider-mapping fix.

## Regression suite

`bash scripts/run-bats.sh scripts/tests/bootstrap-oidc.bats`:
```
1..3
ok 1 authentik-exposes-openid-email-profile-managed-scope-mappings
ok 2 provider-created-without-property-mappings-key-gets-none-attached
ok 3 bootstrap-oidc-sh-attaches-openid-email-profile-mappings
```
All 3 pass. Test 2 is the regression test proving the pre-fix shape
reproduces the bug on this same live instance.

## Full suite (no regressions introduced)

`bash scripts/run-bats.sh scripts/tests/*.bats` — ran clean end-to-end
(background run, exit 0). Spot-verified by re-running the new file
alongside its immediate alphabetical neighbors
(`audit-nodemailer-version.bats`, `bp-uat-template-rule.bats`): 12/13
pass; the one failure (`bp-uat-template-rule.bats` test 10, "AC-3: rule
mandates the API contract alongside UI assertions") is **confirmed
pre-existing on `main`** — `git status`/`git diff main` show zero
modifications to that test file or its target doc on this branch. Not
introduced by this workflow; not touched by this fix.

## Deferred (see issue file Honesty disclosures)

- Live QA verification (`https://qa.aiqadam.org`) — blocked by the
  pre-existing, already-queued `wf-20260723-fix-128-deploy-qa-permission-fix`.
  Not a new deferral.
- Whether QA's *existing* Authentik provider needs the same live PATCH
  applied — cannot be determined or applied from this session (no QA
  Authentik credentials available here).

## gate_result

```yaml
status: passed
step: 8
timestamp: "2026-07-27T00:00:00Z"
summary: >-
  Bug reproduced live pre-fix, fix verified live post-fix via
  Authentik's own claim-evaluation engine (definitive), 3/3 new bats
  tests pass, full suite clean (one pre-existing unrelated failure
  confirmed via git diff against main). QA live verification deferred to
  the existing, already-queued deploy-qa blocker per AGENTS.md §6.1.
```
