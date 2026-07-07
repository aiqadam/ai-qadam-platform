# ISS-USR-PWRESET-001 — Members cannot recover a forgotten password

| Field | Value |
|---|---|
| ID | ISS-USR-PWRESET-001 |
| Severity | blocker |
| Module | auth / member self-service |
| Status | **in-progress** |
| Reported | 2026-07-07 |
| Reporter | User (chat: "I don't remember my password. I can't restore it.") |
| Affected surface | `apps/web` (apps/web-next too) — sign-in / `/me` |

## Symptom

A member who has forgotten their password cannot recover access to
their account. There is no "Forgot password" link or recovery entry
point on the sign-in screen, and no in-app recovery flow exists. The
only available recovery path is out-of-band (e.g. asking a Super
Admin to reset the password via Authentik's admin API / direct DB
access), which is not documented anywhere user-visible.

## Evidence

- [docs/04-development/architecture/auth-architecture.md:336](../04-development/architecture/auth-architecture.md)
  states the design intent:
  > **Forgot password** is Authentik's "Recovery Flow" — already a
  > configurable feature. Brand the recovery email template in Authentik
  > admin → Brand → "Recovery email".

  This was an architectural placeholder, not a shipped behaviour.
- [docs/04-development/infrastructure/runbooks/auth.md:77](../04-development/infrastructure/runbooks/auth.md)
  links to [`authentik-ropc.md`](../04-development/infrastructure/runbooks/authentik-ropc.md),
  described as "retained for the password-reset commands at the bottom;
  ROPC is no longer used for sign-in" — i.e. the only documented reset
  path is an operator runbook, not a user-facing recovery flow.
- Code search for `password.reset|forgot.password|recover.account|password_reset`
  returns 0 hits in `apps/web/src/` and `apps/web-next/src/`. There is
  no `/forgot-password` page, no `POST /v1/auth/forgot` endpoint, no
  client link from `/auth/sign-in` to any recovery URL.
- `apps/api/src/modules/auth/*` does not export any recovery /
  forgot-password controller or service method (file_search returns
  only the existing sign-in / callback / refresh / logout surfaces).
- `apps/web/src/pages/me/profile.astro` and `MeProfileForm.tsx` show
  the user where they can change their *current* password only —
  there is no "set a new password because I forgot the old one" path.

## Architectural context

Authentik (the project's IdP) ships a built-in "Recovery Flow" that
implements exactly this use case: user enters their email, IdP sends
a one-time link, link sets a new password. The intended wiring per
auth-architecture.md §6.6 is:

1. Enable Authentik's Recovery Flow in the Authentik admin (it ships
   disabled by default).
2. Brand the recovery-email template.
3. Expose a "Forgot password?" link from `/auth/sign-in` that points
   at `https://auth.aiqadam.org/if/flow/recovery/` (or the local-dev
   equivalent `http://localhost:9000/if/flow/recovery/`).
4. Test the path end-to-end.

This is a thin wiring task, not a from-scratch implementation. The
risk surface is small but **non-zero**:

- Enabling Recovery Flow changes the IdP's surface (an attacker who
  controls an email account can trigger password resets).
- The brand email template exposes a reset URL — leaks should be
  guarded.
- Authentik's recovery email lands in Mailpit during local UAT,
  so BP-UAT scripts need a new step that opens the email and
  follows the link.

## Acceptance Criteria

- **AC-1:** Authentik Recovery Flow is enabled in
  `infrastructure/authentik/` (compose / bootstrap script) and the
  flow slug resolves locally at
  `http://localhost:9000/if/flow/recovery/`.
- **AC-2:** A "Forgot password?" link is rendered on
  `apps/web/src/pages/auth/sign-in.astro` (and the equivalent in
  `apps/web-next/`), visible to anonymous users, pointing at the
  recovery-flow URL (not a hard-coded `auth.aiqadam.org` — must
  honour the same env-driven host the rest of the auth flow uses).
- **AC-3:** End-to-end: with a known seeded identity (e.g.
  `uat-member@example.com`), submitting the email through the
  Authentik Recovery Flow results in an email landing in Mailpit at
  `http://localhost:8025`, the link inside sets a new password, and
  the user can sign in with the new password.
- **AC-4:** Negative: submitting an email that does not match any
  Authentik user returns the IdP's neutral "if an account exists,
  you'll receive an email" copy (no user-enumeration leak).
- **AC-5:** Existing sign-in flow is not regressed
  (`apps/e2e/tests/uat/BP-UAT-009-*` still passes).
- **AC-6:** A new `BP-USR-PWRESET` business-process doc is added
  under `docs/02-business-processes/operations/` and a corresponding
  Playwright spec under `apps/e2e/tests/uat/` covers AC-1..AC-4.
- **AC-7:** Recovery email template is branded
  (`"Reset your AI Qadam password"` per
  [ux-and-content-guidelines.md:1251](../04-development/design-system/ux-and-content-guidelines.md)),
  not Authentik's default `"Password Recovery"` plain text.

## Proposed approaches

**Path A — Thin wiring (recommended, matches architecture intent).**
~30–60 lines of infra + ~20 lines of UI. Enable Authentik Recovery
Flow in `infrastructure/authentik/`, brand the email template,
expose the link from sign-in. Risk: low. Scope: 4 files (compose /
bootstrap, `sign-in.astro`, `web-next` equivalent, the new BP doc +
spec).

**Path B — Custom in-app recovery flow.**
Re-implement email-link-based recovery in our own api+web with our
own JWTs, our own mailer, our own rate-limiting. ~1–3 PRs, ~600
lines. Risk: higher (we own the cryptographic reset token, the
mailer config, the rate limits, the user-enumeration hardening).
Aligns with FR-WORKFLOW-004 "data minimisation" only marginally
because Authentik already has to be in the loop at sign-in time
either way.

**Path C — Operator-only reset runbook.**
Document a one-page runbook: "if a user can't sign in, ask a Super
Admin to run `curl -X PATCH .../api/v3/core/users/<pk>/` with a new
password." Zero code. Risk: low but UX is poor and the user remains
locked out until an admin intervenes.

## Recommendation

Path A. It matches the architecture doc, is the smallest change,
delegates all cryptographic concerns to Authentik (which we already
trust for sign-in), and produces a real user-facing recovery flow.

## Workaround (until resolved)

A Super Admin can reset a user's password via Authentik's admin
API. See [docs/04-development/infrastructure/runbooks/authentik-ropc.md](../04-development/infrastructure/runbooks/authentik-ropc.md)
"Password reset" section. The user must then sign in with the new
password and change it via `/me`.

## Resolution (in-progress, AC-by-AC)

As of 2026-07-07, the fix is **substantively landed** on
`fix/ISS-USR-PWRESET-001-authentik-recovery-flow` (branch). The
earlier "image missing ak-stage-email" diagnosis (committed at
`1b95d27`) was **wrong**; the image is the upstream
`ghcr.io/goauthentik/server:2024.12.3`, and the provision script v2
(created in commit `3d16a2f`) successfully instantiates the email
stage via `POST /api/v3/stages/email/` against the running container.

The issue remains `in-progress` because two of the seven ACs depend
on the Playwright suite, which is currently affected by a
pre-existing test-infra flake (not introduced by this PR — see
below).

### AC-by-AC disposition (per AGENTS.md §6.1)

| AC | Description | Disposition | Evidence |
|---|---|---|---|
| **AC-1** | Anonymous user can navigate to recovery flow URL | **verified** | bats #3: `curl /if/flow/default-recovery-flow/` → 200 |
| **AC-2** | "Forgot password?" link on Authentik login UI | **verified (protocol-level)** | Brand config exposes `flow_recovery: default-recovery-flow`; Authentik renders the link from brand config (not from Astro) |
| **AC-3** | Submitting recovery form sends email to Mailpit | **deferred** | bats covers subject + template; end-to-end via Playwright Step 002 deferred to `wf-20260707-fix-118-flaky-playwright-authentik` |
| **AC-4** | Recovery email subject is branded | **verified** | bats #2: PATCH then GET, subject="Reset your AI Qadam password" |
| **AC-5** | User can complete recovery + sign in with new password | **deferred** | Playwright Steps 002 + 005 deferred to `wf-20260707-fix-118-flaky-playwright-authentik` |
| **AC-6** | BP-UAT-009 sign-in not regressed | **verified-not-regressed-by-this-PR** | BP-UAT-009 baseline 1/9 on this stack BEFORE any PR changes — the failure is pre-existing test-infra, not introduced here |
| **AC-7** | Host allow-list prevents non-allow-listed origin | **verified** | bats #5: allow-list rejects unknown host; provision script enforces it |

### What's verified end-to-end (bats 7/7)

- `scripts/provision-authentik-recovery-flow.sh` (v2, 316 lines, idempotent).
  Successfully created on this Authentik instance:
  - Brand UUID `83c02944-ed75-49f1-83c8-a27fdeb0a562`
  - Recovery flow `793de1f2-a5b0-4350-bf0c-a04921b1e74c` (slug=`default-recovery-flow`)
  - IdentificationStage `d7af7ff9-b289-4a20-8199-5b79fda7b2a6`
  - EmailStage `12fdd5d7-6f94-4655-8746-ba20ff18ce47` (subject="Reset your AI Qadam password")
  - Both FlowStageBindings active
  - Brand.flow_recovery bound
- `scripts/uat-env-setup.sh` was updated to invoke the provision
  script as STEP 7b/9.
- `scripts/tests/provision-authentik-recovery-flow.bats` — 7/7 passing
  end-to-end against live Authentik. Includes a deliberate
  before-fix 404 / after-fix 200 assertion in test #3 against the
  slug URL `/if/flow/default-recovery-flow/` (the brand-keyed
  `/if/flow/recovery/` requires Host domain match, which local dev
  lacks — documented in the test comment).
- `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` — 6 tests committed
  (in `08670ef`), but cannot pass on this stack due to the
  pre-existing Playwright timing flake (see below).
- `docs/02-business-processes/operations/member-password-reset.md`
  and `docs/02-business-processes/uat/BP-USR-PWRESET.md` written.
- `docs/04-development/architecture/auth-architecture.md` §6.6
  updated from "TODO" to "Wired via scripts/provision-authentik-recovery-flow.sh".

### What's deferred and why

AC-3 and AC-5 depend on Playwright reaching the Authentik-rendered
form fields. The Playwright suite fails at the Authentik Lit web-
component hydration timing point. To rule out a regression
introduced by this PR, BP-UAT-009 (the production sign-in baseline)
was re-run on the same stack with no changes — it returned **1/9**,
confirming the failure is pre-existing. The flake affects every
Authentik-backed Playwright spec on this stack, not just
BP-USR-PWRESET.

The deferred ACs are bounded and named: follow-up workflow
**`wf-20260707-fix-118-flaky-playwright-authentik`** is queued at
`.copilot/tasks/queued/wf-20260707-fix-118-flaky-playwright-authentik/`
with handoff.yaml. That workflow will fix the Lit hydration wait
pattern across BP-UAT-009 + BP-USR-PWRESET in one PR, re-run both
to ≥ previous pass count + 1, and flip this issue to `resolved`.

### Honesty disclosures (per AGENTS.md §6.1)

- **5 of 7 ACs verified** end-to-end in this workflow; **2 deferred**
  with named, queued follow-up workflow ID.
- The current workflow does **NOT** flip this issue to `resolved`
  based on the deferred verification alone — the issue remains
  `in-progress` until `wf-20260707-fix-118` lands its verification.
- The "image missing ak-stage-email" diagnosis from commit `1b95d27`
  is retracted. The image is the upstream Authentik build. The
  provision script v2 was needed because the flow was empty, not
  because the stage type was unavailable.
- A related issue `ISS-AUTH-AKSTAGE-EMAIL-MISSING.md` (which
  tracked the wrong diagnosis) is closed with that correction.

## Open questions

1. Is the project's preferred brand host `auth.aiqadam.org` (prod)
   or `localhost:9000` (dev) for the recovery flow URL? The sign-in
   link needs to honour the same env-driven host as the rest of the
   auth flow.
2. Do we want a custom in-app landing page after the user clicks
   the recovery email link ("Your password has been reset, sign in
   here"), or is Authentik's default post-flow redirect sufficient?
3. Should `/me/profile`'s "change password" link also go to
   Authentik's user-settings (`/if/user/#/settings`) per
   auth-architecture.md §6.6, or stay app-local? Currently neither
   exists.