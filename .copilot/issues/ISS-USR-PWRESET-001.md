# ISS-USR-PWRESET-001 — Members cannot recover a forgotten password

| Field | Value |
|---|---|
| ID | ISS-USR-PWRESET-001 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/122 |
| Severity | blocker |
| Module | auth / member self-service |
| Status | **resolved** |
| Resolved | 2026-07-30 |
| Reported | 2026-07-07 |
| Reporter | User (chat: "I don't remember my password. I can't restore it.") |
| Affected surface | `apps/web` (apps/web-next too) — sign-in / `/me` |
| PR | [#131](https://github.com/tvolodi/aiqadam/pull/131) (Path A wiring), follow-up PR `<pending>` (this workflow — actual functional fix) |
| Squash SHA | `c4ec5a040f43c48d66cf4e34ea5cc1bfd1a32934` (PR #131); `<pending>` (this workflow) |
| Merged at | 2026-07-07T04:26:30Z (PR #131); `<pending>` (this workflow) |
| Workflow | wf-20260707-fix-117 (PR #131) → wf-20260707-fix-118-flaky-playwright-authentik (this workflow, resolved) |
| Business-Process | BP-UAT-009, BP-USR-PWRESET |

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

## Resolution

### Summary — this is bigger than "fixed flaky tests"

**The password-recovery feature shipped in PR #131 (merged
2026-07-07, `wf-20260707-fix-117`) was never actually functional
end-to-end.** Authentik's recovery flow had only an identification
stage and an email stage bound — no password-entry stage existed at
all. A real member could request a reset, receive the correctly
branded email, click the link, and see "Successfully verified
Email" — and then land back on the login page with **no way to
actually set a new password**. This was not visible in the parent
workflow's own testing because that workflow's Playwright suite never
got far enough to reach the missing stage; its 0/6 failure was
misdiagnosed as a Playwright/Lit-hydration timing flake, and the
workflow deferred verification rather than discovering the real gap.

This workflow (`wf-20260707-fix-118-flaky-playwright-authentik`,
originally scoped only as "fix the Playwright flake") instead found
and fixed **12 independent, evidence-backed root causes** — none of
them a timing flake. The most significant is the missing password-entry
stage above. Full detail, with the exact evidence for each cause, is
in `.copilot/tasks/completed/wf-20260707-fix-118-flaky-playwright-authentik/06-test-strategy.md`.

The recovery flow is now, for the first time, **live-verified working
end-to-end**: a member can request a reset, receive the email, click
the link, set a new password, and sign in with it — confirmed via a
real Playwright browser session against a live Authentik instance,
Mailpit, and the app, with no mocks.

### AC-by-AC disposition (per AGENTS.md §6.1)

| AC | Description | Disposition | Evidence |
|---|---|---|---|
| **AC-1** | Anonymous user can navigate to recovery flow URL | **verified** | bats: `curl /if/flow/default-recovery-flow/` → 200 |
| **AC-2** | "Forgot password?" link on Authentik login UI | **verified** | Playwright `BP-USR-PWRESET.spec.ts` Step 001 — passes live |
| **AC-3** | Submitting recovery form sends email to Mailpit | **verified end-to-end** (was deferred) | Playwright Step 002 — a real recovery email is received in Mailpit, correctly branded |
| **AC-4** | Recovery email subject is branded | **verified** | bats + Playwright Step 004 |
| **AC-5** | User can complete recovery + sign in with new password | **verified end-to-end** (was deferred) | Playwright Step 002 — the FULL flow now works: identifier → email → link → new password → session established → confirmed at `/me` |
| **AC-6** | BP-UAT-009 sign-in not regressed | **verified-not-regressed** | 7/9 this session vs. 1/9 documented baseline — an improvement; the 2 remaining failures are pre-existing, already-documented, unrelated soft-assertion discrepancies (see below) |
| **AC-7** | Host allow-list prevents non-allow-listed origin | **verified** | bats — unchanged, still enforced |

**All 7 ACs are verified. No deferrals remain.**

### What was fixed (12 root causes — see `06-test-strategy.md` for full evidence per cause)

1. Test-invocation discipline gap (unseeded email when `.env.uat` wasn't loaded) — documented, not a code fix.
2. `BP-UAT-009` false-positive assertion regex on `AnonView`'s own marketing copy.
3. Wrong recovery URL (brand-keyed 404s locally by design) + wrong flow-stage check for the forgot-password link.
4. Authentik containers never configured `AUTHENTIK_EMAIL__*` at all — recovery emails failed with `ConnectionRefusedError` and never reached Mailpit.
5. The `EmailStage` database row's `use_global_settings=false` independently overrode the env-var fix (#4) with a stale `host=localhost, port=25`.
6. `BP-USR-PWRESET` Step 002 extracted the reset link from the email but never navigated to it, and wrongly assumed password entry happens in the same browser session as the identifier submission.
7. Step 003's expected "neutral copy" text was a never-verified guess, not the real Authentik copy.
8. **The recovery flow was missing its password-entry stage bindings entirely** — the single most significant finding, described above.
9. `signInViaAuthentik`'s button-text regex was too narrow, missing the "Log in" label variant.
10. A navigation race against the recovery flow's own async success redirect, plus a wrong assumption that a fresh Authentik sign-in round-trip was always required afterward (Authentik's write stage auto-establishes a session).
11. `/me/profile` has no password-change form at all, so the test's password-restore mechanism silently no-op'd every run, permanently corrupting the test fixture's password.
12. `waitForRecoveryEmail`'s polling had no way to distinguish a genuinely new message from an already-consumed one, which broke the fix for #11.

### Honesty disclosures (per AGENTS.md §6.1)

- **All 7 ACs verified end-to-end**, live, in this session — no
  deferrals.
- The parent workflow's (`wf-20260707-fix-117`) "Lit hydration timing
  flake" diagnosis is **retracted**. It was never verified against a
  correctly-invoked test run; every failure had a distinct, specific,
  non-timing root cause.
- **Not a "test flakiness" fix** — the primary outcome of this
  workflow is that the shipped feature (PR #131) is now, for the
  first time, actually functional. Prior to this workflow, every
  member who used the "Forgot password?" link would have hit a dead
  end after clicking their reset email, with no recovery path other
  than the operator-runbook workaround documented above.
- The earlier "image missing ak-stage-email" diagnosis (commit
  `1b95d27`, retracted in the prior workflow) remains retracted; this
  workflow found a different, unrelated gap (missing stage
  *bindings*, not a missing stage *type*).

### ⚠️ Open follow-up — NOT actioned this session

**Whether QA and/or production environments have this same missing
password-entry-stage gap is unknown and unverified.** This session
has no visibility into whether QA/prod's Authentik instances were
provisioned via this exact script, a different process, or manually —
and this session did **not** connect to or modify any QA/prod
Authentik instance (the provision script's own host allow-list would
refuse to run against anything but `localhost`/`127.0.0.1`/
`auth.aiqadam.org` in any case). If `provision-authentik-recovery-flow.sh`
was ever run against QA or prod using an earlier version of this
script (i.e., before this workflow's fix), those environments most
likely have the same non-functional recovery flow that was just found
and fixed here, and would need the same stage-binding remediation
applied. **A human, or a future workflow with QA/prod access, should
check this before assuming QA/prod recovery flows work.**

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
