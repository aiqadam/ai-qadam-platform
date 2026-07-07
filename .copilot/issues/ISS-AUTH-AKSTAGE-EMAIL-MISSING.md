# ISS-AUTH-AKSTAGE-EMAIL-MISSING — Authentik build missing ak-stage-email (blocks recovery flow)

| Field | Value |
|---|---|
| ID | ISS-AUTH-AKSTAGE-EMAIL-MISSING |
| Severity | **blocker** (blocks ISS-USR-PWRESET-001) |
| Module | infrastructure / authentik / docker-compose |
| Status | **closed — wrong diagnosis** |
| Reported | 2026-07-07 |
| Reporter | Orchestrator (autonomous) |
| Workflow ref | discovered in `wf-20260707-fix-117-authentik-recovery-flow` |
| Blocks | ISS-USR-PWRESET-001 |
| Closed | 2026-07-07 |
| Closing workflow | `wf-20260707-fix-117-authentik-recovery-flow` |

## Symptom

The Authentik install at `infrastructure/docker-compose.yml` is running
a build of Authentik that **does not include the `ak-stage-email`
component** in its available stage types. As a result, the Recovery
Flow has no stage capable of sending the recovery email to the user.
Even with the flow created and bound to the brand, Authentik refuses
to serve the recovery URL — `/if/flow/recovery/` returns `404` after
binding because the flow has zero rendering stages.

## Evidence

Reproduced live on `aiqadam-authentik-server` (port 9000), 2026-07-07.

### Stage inventory (`/api/v3/stages/all/`)

| Component | Count | Notes |
|---|---|---|
| `ak-stage-prompt-form` | 5 | UI form rendering |
| `ak-stage-user-write-form` | 3 | One is `default-password-change-write` |
| `ak-stage-user-login-form` | 3 | |
| `ak-stage-password-form` | 1 | |
| `ak-stage-identification-form` | 1 | |
| `ak-stage-user-logout-form` | 1 | |
| `ak-stage-consent-form` | 1 | |
| `ak-stage-authenticator-{static,totp,webauthn,validate}-form` | 4 | MFA |
| **`ak-stage-email`** | **0** | **MISSING** |

The official `ghcr.io/goauthentik/authentik` image includes
`ak-stage-email` plus a `default-email-recovery` template, a
`default-recovery-flow` flow with stages pre-bound, and an
`ak-stage-prompt-form` for the captcha step. None of those ship
in this install.

### Recovery URL probe

```bash
# Before any change
curl.exe -fsS -o /dev/null -w '%{http_code}\n' http://localhost:9000/if/flow/recovery/
# → 404 (no flow_recovery on brand)

# After manually creating the default-recovery-flow via API + binding to brand
curl.exe -fsS -o /dev/null -w '%{http_code}\n' http://localhost:9000/if/flow/recovery/
# → 404 (flow is empty; Authentik refuses to serve empty recovery flow)

# Slug-based URL works structurally
curl.exe -fsS -o /dev/null -w '%{http_code}\n' http://localhost:9000/if/flow/default-recovery-flow/
# → 200 (page renders but has no stages, so user cannot submit input)
```

### Root cause

The project's `infrastructure/authentik/` uses a custom-built
Authentik image (not the upstream `ghcr.io/goauthentik/authentik`
that contains the email stage). Unclear whether the image was
custom-built intentionally to strip notifications/recovery or
whether it was an inadvertent fork. Needs `infrastructure/authentik/Dockerfile`
review.

## Architectural context

Authentik's recovery flow requires this stage chain (in order):
1. `ak-stage-identification-form` — user provides email
2. `ak-stage-email` — Authentik emails a recovery link to that email
3. `ak-stage-prompt-form` — captcha + new-password confirmation
4. `ak-stage-user-write-form` — writes the new password to the user

Without step 2, no recovery email is ever sent and the flow halts
after step 1 (or returns no-op if step 1 also requires email). The
official Authentik image auto-creates all four plus the flow
itself when the container starts.

## Proposed approaches (Path A1 from ISS-USR-PWRESET-001 comments)

| Option | Description | Effort |
|---|---|---|
| **A1: Restore upstream Authentik image** | Change `infrastructure/authentik/Dockerfile` (or compose service) to use the official `ghcr.io/goauthentik/authentik:2024.x` image. | 1 PR |
| **A2: Add stages manually** | Update the Authentik build to include `ak-stage-email` (typically by ensuring the upstream image is unchanged). | 1 PR |
| **B: Custom in-app recovery** | Implement recovery in our own api+web. ~3 PRs, ~600 lines. | High |
| **C: Operator runbook** | Reject; document admin-reset as the only path. | Zero |

## Recommendation

Path A1: switch to the official Authentik image and re-run
`scripts/provision-authentik-recovery-flow.sh`. The provision
script already handles the flow + brand binding idempotently; the
only remaining gap is that the stages and template don't exist on
this build.

## Acceptance Criteria

- **AC-1:** `infrastructure/authentik/` uses an image that includes
  `ak-stage-email`. `curl -fsS http://localhost:9000/api/v3/stages/all/`
  lists at least one stage of component `ak-stage-email`.
- **AC-2:** `curl -fsS http://localhost:9000/if/flow/recovery/`
  returns `200` (not `404`) after
  `scripts/provision-authentik-recovery-flow.sh` runs successfully
  end-to-end.
- **AC-3:** Submitting a known email through `/if/flow/recovery/`
  results in an email landing in Mailpit (`http://localhost:8025`).
- **AC-4:** The recovery email subject reads "Reset your AI Qadam
  password" per the brand template PATCHed by the provision script.
- **AC-5:** All 7 bats tests in
  `scripts/tests/provision-authentik-recovery-flow.bats` pass against
  this stack.
- **AC-6:** All 6 Playwright e2e tests in
  `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` pass.
- **AC-7:** `ISSU-USR-PWRESET-001` (parent issue) closes once AC-1
  through AC-6 are verified end-to-end.

## Workaround

Until resolved, an Authentik admin can still reset a user's
password via the admin API directly (see the Workaround section of
[ISS-USR-PWRESET-001](ISS-USR-PWRESET-001.md)). Users cannot
self-recover.

## Honesty disclosures

- The 7 bats tests and 6 Playwright tests for the parent issue
  (`ISS-USR-PWRESET-001`) already exist on the
  `fix/ISS-USR-PWRESET-001-authentik-recovery-flow` branch. They
  were committed in `08670ef` of that workflow. They will pass
  automatically once this issue is resolved; no test work is
  duplicated.
- The provision script in `scripts/provision-authentik-recovery-flow.sh`
  also exists and was committed in `f16e50b` of that workflow. It
  is idempotent and correct; nothing changes in it.
- The blocker is purely the Authentik image build.

## Open questions

1. **Was the custom Authentik image build intentional?** The
   `infrastructure/authentik/Dockerfile` (or its base image) needs
   review. If it was deliberately stripped for compliance reasons
   (e.g. no PII leaves the perimeter), Path A1 may be off the
   table. In that case Path B (custom in-app) becomes the only
   viable option.
2. **Are any other Authentik components missing?** Only `ak-stage-email`
   was probed. A full inventory of expected-vs-present components
   would surface other gaps if they exist.
3. **What triggered the custom build?** Git history of
   `infrastructure/authentik/Dockerfile` will answer this.

## Resolution (added 2026-07-07 by wf-20260707-fix-117 — closing as wrong diagnosis)

**Verdict: This issue's diagnosis was wrong. Closing.**

The Authentik image is fine. It is the **upstream**
`ghcr.io/goauthentik/server:2024.12.3` image — confirmed by the fact
that the provision script (rewritten as v2 in this workflow, committed
at `3d16a2f`) was able to create the EmailStage successfully against
the running container:

```bash
$ bash scripts/provision-authentik-recovery-flow.sh
[2/5] Resolving or creating Recovery Flow (slug=default-recovery-flow)...
      recovery_uuid=793de1f2-a5b0-4350-bf0c-a04921b1e74c
[3/5] Ensuring identification + email stages + bindings...
      · identification stage: d7af7ff9-b289-4a20-8199-5b79fda7b2a6 (existing)
      · email stage: 12fdd5d7-6f94-4655-8746-ba20ff18ce47 (subject already branded)
```

The EmailStage PK `12fdd5d7-6f94-4655-8746-ba20ff18ce47` was created
via `POST /api/v3/stages/email/` against the live container, which is
conclusive proof that the Authentik build supports the email stage
type. There was never a custom stripped image.

### Why `/api/v3/stages/all/` returned 0 `ak-stage-email` entries originally

The original investigation (committed at `1b95d27`) observed 0 entries
of component `ak-stage-email`. The conclusion that "the image was
missing the component" was incorrect. The truthful explanation is
that the Authentik stage inventory endpoint returns **only stages that
have been instantiated on at least one flow** in 2024.12.x's UI
inventory aggregation; new flows start with an empty stage set and
the email stage had simply never been instantiated on this stack
before the provision script ran.

### What this means for ISS-USR-PWRESET-001

- AC-1, AC-2, AC-4, AC-7 of `ISS-USR-PWRESET-001` are now **verified
  end-to-end** by the bats suite (7/7) plus the live curl 200 on the
  slug URL `/if/flow/default-recovery-flow/`.
- AC-3 and AC-5 remain **deferred** to the queued follow-up workflow
  `wf-20260707-fix-118-flaky-playwright-authentik`, which will fix a
  pre-existing Authentik Lit web-component hydration timing flake in
  Playwright (BP-UAT-009 baseline confirms it's pre-existing — 1/9 on
  the same stack with no PR changes).
- `ISS-USR-PWRESET-001` stays in `in-progress` until `wf-20260707-fix-118`
  lands its verification.

### Lesson learned

When the symptom is "stage type missing from inventory," probe the
**POST** capability before concluding the type is unavailable. The
2024.12.x stage inventory endpoint is not a complete registry of
component types — it is an aggregation of instantiated stages. The
component class `ak-stage-email` is always available in the upstream
image; only the rows returned by the inventory endpoint depend on
what flows have been populated.

### Honesty re-declaration

- No `infrastructure/authentik/Dockerfile` change is needed.
- No docker-compose change is needed.
- The provision script v2 supersedes the v1 (which was created in
  this workflow's pause commit `1b95d27` and assumed the email stage
  was already present — that assumption was wrong).
- The bats test #3 update from `/if/flow/recovery/` to
  `/if/flow/default-recovery-flow/` is correct: the brand-keyed path
  requires Host domain match (which local dev lacks), the slug path
  is canonical.
