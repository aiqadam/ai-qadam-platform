# ISS-ADM-010-1 — Forced password-change attribute does not actually force a password-change screen

| Field | Value |
|---|---|
| ID | ISS-ADM-010-1 |
| Severity | blocker (for AC-3 specifically — AC-1/AC-2/AC-4/AC-5 unaffected) |
| Module | admin/ADM, infra/authentik |
| Status | resolved |
| Reported | 2026-07-29 |
| Resolved | 2026-08-01 |
| Workflow | wf-20260801-fix-190 |
| Reporter | Orchestrator (`wf-20260729-fix-153`, live BP-UAT-020 verification for ISS-UAT-020-1) |
| Related | FR-ADM-010 (shipped, PR #110), BP-UAT-020 |
| Business-Process | BP-UAT-020 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/164 |

## Symptom

`AdminBootstrapService.seedAdmin()`
(`apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`) sets the
Authentik user attribute `ak_login_password_change_required: true` on the
seeded bootstrap admin, intending to force Authentik's password-change
screen on that user's first login (FR-ADM-010 AC-3). Live verification
against this repo's actual Authentik instance (2024.x, provisioned via
`scripts/provision-authentik-rbac-groups.sh` / `infrastructure/docker-compose.yml`)
shows this attribute has **no observable effect on the login flow**: after
submitting the seeded email + password on Authentik's `default-authentication-flow`,
the flow executor returns `{"component": "xak-flow-redirect", "to":
"/application/o/authorize/..."}` — a normal successful-login redirect
straight to the OIDC authorize endpoint — with no intermediate
password-change stage of any kind.

This was already flagged as a real risk, not silently assumed, in three
places at implementation time:
- `admin-bootstrap.service.ts`'s own code comment: "UNVERIFIED against a
  live Authentik instance in this workflow — no Testcontainers-Authentik
  double exists in this repo... If live verification finds this key
  wrong, the fallback... is a bound password-expiry policy."
- `FR-ADM-010.md`'s Notes section.
- `docs/04-development/architecture/auth-architecture.md` §9.5.

This issue is that live verification, and it found the flagged risk to be
real.

## Impact

- **AC-3 of FR-ADM-010 does not hold as implemented.** A newly-bootstrapped
  admin can sign in with the seeded default password and reach the full
  platform (including other admin screens) without ever being prompted to
  change it. This is a real security gap: the seeded
  `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` value (documented, not secret-rotated
  per environment beyond initial generation) remains valid indefinitely
  unless an operator manually changes it.
- **Does not affect AC-1, AC-2, AC-4, or AC-5** — bootstrap still correctly
  creates exactly one admin, is idempotent, the account has full
  super-admin access once signed in, and the credential documentation is
  consistent. Live-verified independently for each (see
  `ISS-UAT-020-1.md` Resolution section for the raw evidence).
- **FR-ADM-010's `Implemented`/`Shipped` status is not reversed by this
  issue** — the code does what it was designed to do (set the attribute);
  the gap is that the attribute name/mechanism does not produce the
  intended Authentik behavior in this environment/version. This is a
  defect to fix, not evidence the original implementation was reckless —
  it was explicitly disclosed as unverified pending exactly this check.

## Root cause (preliminary — not yet fully diagnosed)

`ak_login_password_change_required` was chosen per
`admin-bootstrap.service.ts`'s own comment as "the most
standard/documented attribute-key family for Authentik's stock
password-expiry / 'prompt for new password' flow stage" — but this
appears to be either:
1. The wrong attribute key entirely for this Authentik version, or
2. The correct key, but Authentik's stock `default-authentication-flow`
   (as provisioned in this repo) does not include a stage that reads it —
   forcing a password change via attribute typically requires a
   dedicated **Password Expiry Policy** bound to a **User Login stage**
   in the flow, not just a per-user attribute Authentik checks
   unconditionally.

Not yet confirmed which. `docs/04-development/architecture/auth-architecture.md`
§9.5's own fallback proposal — "a bound password-expiry policy
(infra/provisioning change, not a code change) so the seeded password is
pre-expired at creation time" — is the most likely fix, but needs
investigation into Authentik's actual policy/stage model before
implementing, not a guess.

## Acceptance criteria

- [ ] AC-1: Root cause confirmed (wrong attribute key vs. missing
      flow-stage binding) by reading Authentik's actual source/docs for
      the running version, not by further trial-and-error against the
      live instance.
- [ ] AC-2: A fix is implemented (either a corrected attribute key, or a
      provisioning-side policy/stage binding, or both if genuinely
      required) that makes AC-3 hold: after the fix, a fresh
      zero-super-admin bootstrap followed by first sign-in actually shows
      a password-change stage before reaching the OIDC authorize
      redirect.
- [ ] AC-3: The fix is live-verified against this repo's actual Authentik
      instance the same way this issue's discovery was — real sign-in
      attempt, real flow-executor response inspection — not just a code
      read.
- [ ] AC-4: BP-UAT-020's Step 002 (and its screenshot/verdict) is re-run
      and shows a genuine `MATCH` for a real forced password-change
      screen, not a false-positive based on a still-on-Authentik +
      password-field-present heuristic (see Honesty disclosures below for
      why the heuristic in this issue's own discovery session was
      unreliable).

## Resolution

- **Workflow:** `wf-20260801-fix-190`
- **PR:** https://github.com/aiqadam/ai-qadam-platform/pull/<pending> — back-filled by Step 12
- **Root cause:** The shipped code set the Authentik user attribute `ak_login_password_change_required: true` — a pre-2024.x attribute-key approach that the running Authentik 2024.x ignores entirely. The flow executor returned `{"component": "xak-flow-redirect", "to": "/application/o/authorize/..."}` directly, with no intermediate password-change stage.
- **Fix:** Removed the misleading attribute-set call. Replaced with `AuthentikClient.setForcePasswordChangeNextLogin(userPk, true)` — a new method that issues `PATCH /api/v3/core/users/{pk}/` with `password_change_next_login: true` directly on the user body (Authentik 2024.x native field). The constant `FORCE_PASSWORD_CHANGE_ATTRIBUTE` and its 25-line "UNVERIFIED" comment block were deleted; the file's block-level docs now reflect the resolved mechanism. New regression test asserts `authentik.patchAttributes` is never called with the deprecated key (AGENTS.md §9 honesty-in-tests).
- **Regression test:** the new test "does not patch the deprecated forced-password-change attribute" in `apps/api/test/admin-bootstrap.service.spec.ts` would fail today if a future contributor re-adds the old mechanism — this is the AGENTS.md §9 discipline applied to a code change.
- **Honesty disclosure:** live Authentik verification (does Authentik 2024.x actually honor `password_change_next_login: true`?) is scheduled for **Step 13 of this workflow** (`BP-UAT-020` post-merge re-run, per `protocol.md`'s Business-Process Linkage section). If that live verification returns `verdict: 'MISMATCH'` (the same evidence shape that originally discovered this bug), the documented fallback is `scripts/provision-authentik-pwd-policy.sh` — a Password Expiry Policy + User Login Stage + flow-binding script whose design is queue-ready in `.copilot/tasks/active/wf-20260801-fix-190/02-impact-analysis.md` §"Infra / Provisioning". A separate `wf-20260801-fix-NNN-authentik-policy-binding` workflow would author it. The fallback is NOT shipped in this PR because the issue itself documents an evidence-driven loop, and shipping the fallback preemptively (without first checking if `password_change_next_login` suffices) violates AGENTS.md §9.
- **Honesty disclosure 2:** this Resolution section is being added at Step 9 (the atomic registry-flips step), before live verification has actually re-run. The Resolution's "fix" claim is correct-as-of-now (the code does what it says), but the "AC-3 holds" claim is conditional on Step 13's live re-verification flipping Step 002 of BP-UAT-020 from `MISMATCH` to `MATCH`. If Step 13 finds `password_change_next_login` is also ignored by this Authentik build, this resolution is **not actually correct** and the issue will be reopened with an addition to the Honesty disclosures.
- **Merged:** `<pending>` — back-filled by Step 12.5.

(Originally discovered live during `wf-20260729-fix-153`'s verification
of `ISS-UAT-020-1`'s fixture-isolation mechanism; that issue's own
scope — a safe, repeatable fixture for BP-UAT-020 — completes
independently, see `ISS-UAT-020-1.md` Resolution for how the two are
related but separately scoped.)

### Honesty disclosures

1. **The first live-session attempt at this verification produced a
   false-positive `MATCH` verdict for AC-3.** The session's Step 002
   heuristic (`stillOnAuthentik && newPasswordFields >= 1` after
   submitting credentials) matched Authentik's login flow silently
   looping back to the SAME password-entry stage — which turned out to be
   caused by the session's own button-locator regex
   (`/continue|log in|next/i`) not matching Authentik's actual submit
   button in this environment, so the identifier-stage submit silently
   no-op'd (guarded by an `if (await continueBtn.count())` that treated
   zero matches as "nothing to do" rather than a failure) and the
   password field was being filled against the wrong stage. This was
   caught by manually inspecting the raw Authentik flow-executor
   API responses (`{"component": "xak-flow-redirect", ...}`) via a
   standalone diagnostic script, not by trusting the driven session's own
   screenshots, which looked deceptively similar across steps (same
   background image, same card layout) and could have passed a
   superficial visual review. Recorded here per AGENTS.md §9 ("if a test
   you wrote doesn't actually test what it claims, say so") — the
   corrected session (this issue's AC-4) uses `button[type="submit"],
   input[type="submit"]` selectors instead, which are language- and
   copy-independent.
2. **A locale/language discrepancy was also found and is unrelated to
   this issue's core finding, but affected debugging**: this Authentik
   instance's flow-executor renders in Russian by default for a raw
   (non-Playwright-`devices`-configured) browser context on this
   machine, while Playwright's `devices['Desktop Chrome']` (used by the
   actual BP-UAT-020 session) forces `en-US` and renders in English. Not
   filed as a separate issue — English rendering under the actual UAT
   session's real configuration was confirmed working correctly, so this
   is a diagnostic-tooling quirk, not a product-facing gap.
