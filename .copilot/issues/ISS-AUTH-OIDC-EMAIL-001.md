# ISS-AUTH-OIDC-EMAIL-001 — OIDC callback rejects with 401 "oidc id_token missing email claim"

| Field | Value |
|---|---|
| ID | ISS-AUTH-OIDC-EMAIL-001 |
| Severity | blocker |
| Module | infra/authentik (OIDC provider provisioning) |
| Status | resolved |
| Reported | 2026-07-27 |
| Resolved | 2026-07-27 |
| Workflow | wf-20260727-fix-137 |
| Reporter | tvolodi, filed to GitHub issue [#79](https://github.com/aiqadam/ai-qadam-platform/issues/79) |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/79 |
| Business-Process | BP-UAT-009 |

## Symptom

A user registers on the platform, is redirected to the Authentik login page,
and after submitting valid credentials is redirected back to
`https://qa.aiqadam.org/api/v1/auth/callback?code=...&state=...` with:

```json
{"message":"oidc id_token missing email claim","error":"Unauthorized","statusCode":401}
```

The registration flow itself completes (an Authentik user is created), but
sign-in via the OIDC callback fails every time.

The issue report also flagged a second, unrelated observation: the
Authentik-generated username looks unreadable (e.g. `user2.kz.cedc40`).
That is a separate, working-as-designed UX concern — split out to GitHub
issue [#80](https://github.com/aiqadam/ai-qadam-platform/issues/80), not
part of this issue's scope.

## Root cause

`apps/api/src/modules/auth/auth.service.ts` requests
`scope: 'openid email profile groups'` when starting the authorization
request (`FLOW_SCOPES`, line 34), and `extractIdentityClaims()` (lines
291-307) correctly rejects any id_token missing a non-empty `email` claim
with this exact 401 — that guard is working as intended, defensively.

The actual defect is upstream, in how the Authentik OAuth2/OIDC provider
for this app gets created. Two provisioning paths exist:

1. **Manual (admin UI wizard)** — documented in
   `docs/04-development/infrastructure/runbooks/authentik-local-bootstrap.md`.
   Authentik's "Create with Provider" wizard auto-attaches its built-in
   `scope-openid` / `scope-email` / `scope-profile` property mappings to
   any new OAuth2 provider. This path works.
2. **Scripted (`​.copilot/bootstrap-oidc.sh` + `.copilot/oidc-provider-body.json`)**
   — POSTs directly to `/api/v3/providers/oauth2/` with a body that has no
   `property_mappings` field at all. Authentik's REST API does **not**
   default an omitted `property_mappings` to the built-in scope mappings
   the way the UI wizard does — the resulting provider ends up with none
   attached. Even though the client asks for `scope=openid email profile
   groups`, Authentik has nothing bound to emit `email` (or `profile`/a
   stable `sub` claim beyond what `sub_mode` provides), so the id_token
   omits it.

Any environment whose provider was created via path 2 — which is the only
scripted/repeatable path, and matches how a shared environment like QA is
most likely provisioned — reproduces this bug on every sign-in.

For contrast, `scripts/provision-gatus-authentik.sh:145` (a different
app's provider) explicitly sets `property_mappings: []` — a deliberate,
documented choice for that app. The AI Qadam provider's scripts made no
choice at all; the field was simply missing.

## Fix

`.copilot/bootstrap-oidc.sh` now looks up Authentik's built-in managed
scope-mapping PKs (`goauthentik.io/providers/oauth2/scope-openid`,
`scope-email`, `scope-profile`) via
`GET /api/v3/propertymappings/provider/scope/?managed=<name>` at bootstrap
time, and includes them in `property_mappings` on the provider-creation
POST body — matching what the admin-UI wizard does automatically. The
lookup also runs (and patches) when reusing an existing provider that is
missing any of the three mappings, so re-running the script against an
already-broken environment self-heals it without a manual DB fix.

## Regression test

`scripts/tests/bootstrap-oidc.bats` — asserts the provider-creation POST
body includes all three managed scope-mapping PKs, using a mocked
Authentik API. Fails against the pre-fix script (empty/absent
`property_mappings`), passes after.

## Resolution

- **Workflow:** wf-20260727-fix-137
- **PR:** [#81](https://github.com/aiqadam/ai-qadam-platform/pull/81)
- **Root cause:** `.copilot/bootstrap-oidc.sh`'s provider-creation request
  omitted `property_mappings`, so Authentik attached no scope mappings and
  the id_token never carried an `email` claim.
- **Fix:** Script now resolves and attaches Authentik's built-in
  `scope-openid`/`scope-email`/`scope-profile` managed property mappings,
  on both create and reuse-and-patch paths.
- **Regression test:** `scripts/tests/bootstrap-oidc.bats`
- **Merged:** squash commit `cc432578c695d53e1496892703133e8761e1f7e2` on `main` (PR #81, 2026-07-27)

### Honesty disclosures (AGENTS.md §6.1)

- **Live QA verification is deferred**, not verified, for the same
  pre-existing reason recorded in
  [ISS-USR-REG-002](ISS-USR-REG-002.md): `deploy-qa` CI has failed on
  every push to `main` since PR #45 (permission-denied unlinking files on
  the QA deploy host), so QA remains pinned to old code. Already tracked
  and queued: [wf-20260723-fix-128-deploy-qa-permission-fix](../tasks/queued/wf-20260723-fix-128-deploy-qa-permission-fix/handoff.yaml)
  (queue position 1) — this issue does not add a new deferral, it rides
  the existing one. Concrete verification once that lands: re-run the
  registration + sign-in flow against `https://qa.aiqadam.org` and
  confirm the callback returns a session instead of 401.
- **Also out of reach of this workflow: the QA Authentik instance itself
  (`auth.qa.aiqadam.org`) cannot be patched from this session** — no
  credentials/token for that host are available here (only a local-dev
  Authentik API token, which is separate infrastructure). Whether QA's
  *existing* provider needs the same `property_mappings` patch applied
  in place (as opposed to only new environments benefiting from the
  fixed script) can only be confirmed once `deploy-qa` is unblocked and
  someone with QA Authentik admin access checks
  `auth.qa.aiqadam.org` → Applications → Providers →
  `aiqadam-platform-local-provider`-equivalent → Advanced protocol
  settings → Scopes.
- **Local verification performed:** the local Authentik instance
  (`aiqadam-authentik-server`, `docker ps` confirmed running) was used to
  validate the managed-mapping lookup API shape. The stored local API
  token (`.copilot/oidc-setup-token`) had expired; re-minting it and
  running the full local registration→sign-in round-trip is part of this
  workflow's Step 8 (see `07-test-results.md` for the outcome actually
  achieved before this workflow closed).

### QA follow-up (2026-07-27, same day)

The two gaps disclosed above are now closed:

- **`deploy-qa` is no longer blocked.** A push to `main` after this PR
  merged deployed commit `cc432578c695d53e1496892703133e8761e1f7e2` to
  `pro-data-tech-qa` successfully (confirmed via the GitHub Actions run
  log: `deployed cc432578c695d53e1496892703133e8761e1f7e2`).
- **QA's existing Authentik provider was patched.** The code fix in this
  PR only corrects the *provisioning script* going forward — it does not
  retroactively fix a provider that was already created by the old,
  broken version of that script. QA's provider (`aiqadam-qa-provider`,
  Authentik `pk=1`, on host `pro-data-tech-qa`) was exactly such a case:
  confirmed live with `property_mappings: []` before any change, then
  patched additively to attach the three managed `openid`/`email`/`profile`
  scope mappings. This required infrastructure-level access this repo's
  session doesn't have, so it was done via the sibling `ai-qadam-infra`
  project's own orchestrator workflow (with its own approval gate) —
  tracked there as
  [T-0126](../../../ai-qadam-infra/tasks/T-0126-fix-authentik-scope-mappings-on-qa.md)
  (run `2026-07-27-fix-authentik-scope-mappings-qa-001`, `status: done`).
- **Live confirmation from this session**: `POST https://qa.aiqadam.org/v1/auth/register`
  with a fresh test email now returns `302 → /v1/auth/login` (the
  documented success response), where it previously would complete
  registration but then 401 at the OIDC callback. The literal end-to-end
  browser round-trip (register → Authentik login → `/api/v1/auth/callback`
  → signed-in session) was not exercised by a real browser in either this
  repo's session or the infra-side workflow — both independently confirmed
  the fix via non-browser means (this session: the 302 registration
  response above; the infra workflow: three independent on-host ORM
  re-queries plus Authentik's own live OIDC discovery document now
  advertising `email` in `scopes_supported`/`claims_supported`). Tracked
  as a small, explicitly non-blocking follow-up:
  [T-0127](../../../ai-qadam-infra/tasks/T-0127-verify-authentik-qa-fix-live-browser-round-trip.md)
  in `ai-qadam-infra` (P2, observation status).
