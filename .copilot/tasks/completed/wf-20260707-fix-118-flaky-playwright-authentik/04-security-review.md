# 04-security-review.md — wf-20260707-fix-118-flaky-playwright-authentik

**Reviewer**: Orchestrator (direct, per this repo's protocol — no
production code path touched, security-relevant surface is narrow
enough for a direct review; see scope below).

---

## Scope of the diff

```
apps/e2e/tests/uat/BP-UAT-009.spec.ts        (test-only)
apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts    (test-only)
infrastructure/docker-compose.yml             (local-dev infra config)
scripts/provision-authentik-recovery-flow.sh  (local-dev provisioning script)
scripts/tests/provision-authentik-recovery-flow.bats (test-only)
```

No `apps/api`, `apps/web`, or `apps/web-next` production source file is
touched.

## Findings

### 1. `docker-compose.yml`'s new `AUTHENTIK_EMAIL__*` block

Adds an SMTP relay configuration pointing Authentik at the already-local-only
`mailpit` service. `infrastructure/docker-compose.yml`'s own header
comment states this file is exclusively for local development ("Apps ...
run on the host for fast feedback; this compose brings up the persistent
+ state-bearing services they connect to via 127.0.0.1... Production runs
on Coolify [superseded — see ADR-0040] on the platform host; this file
does not apply there."). Mailpit itself has no authentication and is
bound to `127.0.0.1` only (`ports: - "127.0.0.1:${MAILPIT_SMTP_PORT:-1025}:1025"`).
No secret values are introduced — `AUTHENTIK_EMAIL__FROM` is a
non-secret display address, and no credentials are configured (Mailpit
requires none). **No security regression.**

### 2. `scripts/provision-authentik-recovery-flow.sh`'s new stage bindings

`resolve_existing_stage_uuid()` and the two new `ensure_flow_stage_binding`
calls **bind Authentik's own pre-existing built-in stages**
(`default-password-change-prompt`, `default-password-change-write`) —
the same stage objects Authentik ships and uses in its own default
recovery flow blueprint. No new stage type, no new credential-handling
code, and no new attack surface is introduced; this closes a gap where
the flow was previously *incomplete* (a security-neutral-to-positive
change, since an incomplete flow that could not complete meant no
security review of the completion path had ever actually been possible
either way).

The script's existing host allow-list guard (`ALLOWED_HOSTS="localhost
127.0.0.1 auth.aiqadam.org"`, refusing to run against any other
`AUTHENTIK_URL` host) is **unchanged** by this diff and continues to
prevent this script from being pointed at an unintended host.

### 3. `use_global_settings` re-assertion in `ensure_email_stage()`

Forcing `use_global_settings: true` on every idempotent re-run means the
email stage's SMTP transport is always sourced from Authentik's global
config (itself sourced from `AUTHENTIK_EMAIL__*` env vars, see finding
1) rather than a per-stage override that could silently drift to an
unintended host. This is a **defense-in-depth improvement**, not a
regression — the previous behavior (silently keeping whatever
`use_global_settings` value happened to be in the database) was the
more fragile state.

### 4. Local diagnostic token — confirmed not in the diff

During diagnosis, a throwaway local Authentik API token
(`aiqadam-ci-probe-token`, scoped to this developer's local Authentik
instance only) was minted via Django shell and cached at
`/tmp/aiqadam-secrets-AK_API_TOKEN` — the same path and pattern the
existing `provision-authentik-recovery-flow.bats` suite already expects
and documents (`AK_TOKEN_FILE='/tmp/aiqadam-secrets-AK_API_TOKEN'`).
`grep` of the actual diff (`git diff origin/main...HEAD`) for
token/secret/credential patterns returned no matches. The token file
itself has been deleted (`/tmp` scratch, never tracked, never
committed). No prod/QA Authentik instance was ever reachable from this
session — the diagnostic token was scoped to `localhost:9000` only.

### 5. Test-file changes

All Playwright/bats changes are assertion, navigation, and flow-control
corrections within existing test files — no new privileged operations,
no new external calls beyond what the tests already made (Mailpit API,
Authentik API, both already-integrated local test dependencies).

## Conclusion

**No security regression.** The most security-relevant part of this
diff (binding Authentik's own built-in password-change stages) uses
existing, vendor-shipped stage objects and closes a functional gap
rather than opening one. The `AUTHENTIK_EMAIL__*` config addition is
scoped to an already local-only, unauthenticated dev dependency.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "No security regression; diff is test-only + local-dev-only infra config + use of Authentik's own built-in stages."
  findings: []
```
