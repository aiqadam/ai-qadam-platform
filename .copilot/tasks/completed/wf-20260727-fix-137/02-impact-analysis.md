# Step 2: Impact Analysis — wf-20260727-fix-137

## Affected surface

- `.copilot/bootstrap-oidc.sh` — the only script that provisions the AI
  Qadam platform's own Authentik OAuth2/OIDC provider (other
  `provision-*-authentik.sh` scripts provision separate apps: Gatus,
  Backrest, Storybook, web-next — confirmed by grep, not touched here).
- `.copilot/oidc-provider-body.json` — generated artifact of the script
  (regenerated on every run); updated as a byproduct of running the fixed
  script once for local verification.

## Not affected

- `apps/api/src/modules/auth/*` — no application code changes. The 401
  guard in `extractIdentityClaims()` (`auth.service.ts:299-301`) is
  correct defensive behavior and stays as-is; it was the messenger, not
  the bug.
- `apps/api/src/modules/auth/registration.service.ts` — the username
  generation (`deriveUsername`) is a separate, working-as-designed
  concern, split to GitHub issue #80 per user decision at Step 1.
- No DB migration needed (Step 3 skipped).
- No `docs/` conventions gap identified beyond what's already noted in
  the issue file (Step 10 — doc update — skipped; the runbook's manual
  path was always correct, only the scripted path was wrong).

## Blast radius

Small and contained: a bootstrap/provisioning script for local and
likely-QA Authentik setup. Re-running the script against an
already-correct environment is a no-op beyond re-attaching the same
mapping PKs (idempotent — proven live: local provider already had the
mappings from a prior manual run, and the patch step confirmed 3/3
without changing behavior). Re-running against a broken environment
self-heals it (proven live via the reuse/patch path against the actual
local provider, pk=1).

## Live environments this fix does NOT reach

`auth.qa.aiqadam.org` (QA's Authentik) cannot be patched from this
session — no credentials for that host here. See the issue file's
Honesty disclosures section; this rides the pre-existing, already-queued
`wf-20260723-fix-128-deploy-qa-permission-fix` blocker (QA pinned to old
code since PR #45), same as `ISS-USR-REG-002`.

## gate_result

```yaml
status: passed
step: 2
timestamp: "2026-07-27T00:00:00Z"
summary: >-
  Single-file fix (.copilot/bootstrap-oidc.sh) plus a generated-artifact
  byproduct (.copilot/oidc-provider-body.json). No app code, no DB
  migration, no doc gap. Blast radius: local/QA Authentik provisioning
  only, idempotent and self-healing.
```
