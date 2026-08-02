# ISS-ADM-010-1 — Forced password-change attribute does not actually force a password-change screen

| Field | Value |
|---|---|
| ID | ISS-ADM-010-1 |
| Severity | blocker (for AC-3 specifically — AC-1/AC-2/AC-4/AC-5 unaffected) |
| Module | admin/ADM, infra/authentik |
| Status | resolved |
| Reported | 2026-07-29 |
| Resolved | 2026-08-02 (PR #231, squash `11a21f4`) |
| Workflow | wf-20260801-fix-191 (final fix) / wf-20260801-fix-190 (first attempt, kept on main) |
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
- **PR:** https://github.com/aiqadam/ai-qadam-platform/pull/229 — merged at commit `6a26a1e`, **kept on `main`** because the code-shape improvement (cleaner PATCH, no deprecated attribute-set) is net-positive even though it does not deliver the AC.
- **Root cause:** The shipped code set the Authentik user attribute `ak_login_password_change_required: true` — a pre-2024.x attribute-key approach that the running Authentik 2024.x ignores entirely. The flow executor returned `{"component": "xak-flow-redirect", "to": "/application/o/authorize/..."}` directly, with no intermediate password-change stage.
- **Initial fix (did not work):** Removed the misleading attribute-set call. Replaced with `AuthentikClient.setForcePasswordChangeNextLogin(userPk, true)` — a new method that issues `PATCH /api/v3/core/users/{pk}/` with `password_change_next_login: true` directly on the user body. The constant `FORCE_PASSWORD_CHANGE_ATTRIBUTE` and its 25-line "UNVERIFIED" comment block were deleted; the file's block-level docs reflect the new mechanism. New regression test asserts `authentik.patchAttributes` is never called with the deprecated key (AGENTS.md §9 honesty-in-tests).
- **Live verification result (Step 13, 2026-08-01):** The PATCH call succeeds — Authentik docker logs at `15:57:42.984` and `15:57:43.157` (request IDs `6a07a0f9…` and `030d4bbf…`) both show `status: 200`. **But the field is silently ignored.** Evidence: (a) the `/api/v3/core/users/{pk}/` OPTIONS schema does not list `password_change_next_login` as a writable field; (b) the `User` model has no such attribute (`User._meta.get_fields()` shows only `password`, `last_login`, `password_change_date` for password-related state); (c) the bootstrap admin's `attributes` is empty `{}` and the response body does not include the field; (d) per design, the flow executor still returns `xak-flow-redirect` straight to OIDC with no password-change stage — same `verdict: 'MISMATCH'` shape as the original discovery. The fix replaced one ignored attribute-set with another ignored user-body field. **ISS-ADM-010-1 is NOT actually resolved by PR #229.** GitHub issue #164 is reopened to reflect this; the local `Status` flips back to `open` and `Resolved` is annotated.
- **Regression test:** the new unit test "does not patch the deprecated forced-password-change attribute" in `apps/api/test/admin-bootstrap.service.spec.ts` continues to pass. It only proves the old mechanism is gone — which is true — not that the new one works. The unit-test layer is honest about this: there is no test asserting "Authentik honors `password_change_next_login`" because we cannot fake that without a Testcontainers-Authentik double, and the project's explicit gap statement is "no Testcontainers-Authentik double exists in this repo" (FR-ADM-010.md Notes).
- **Honesty disclosure 3 (new, added after Step 13 re-verification):** the previous Resolution's "Fix" subsection was over-claimed. The deletion of the obsolete attribute-set is real and good, but the new `setForcePasswordChangeNextLogin` method is a different flavor of the same kind of no-op — present, syntactically correct, accepted by the API, but with no user-observable effect on the AC. The PR carries the code-shape improvement (the api no longer writes a deprecated attribute) and is **kept on `main`** for that reason, but this issue is **not closed**. The minimal honest file reflecting the current state is what you are reading now.
- **Honesty disclosure 4 (named follow-up):** the real fix is a different shape. Two candidate paths are documented in
  `docs/04-development/architecture/auth-architecture.md` §9.5
  and `docs/03-requirements/FR-ADM-010.md` Notes — (a) trigger the `default-password-change` recovery flow's email magic-link on bootstrap so the admin must complete the password-change flow before they can sign in normally; (b) upgrade Authentik to a build that supports `ForcePasswordChange` on the user body (the field name is introduced in a 2025.x release — 2024.12.3 doesn't have it). Queue ID `wf-20260801-fix-191-authentik-forced-pwd-change-real-fix` will be opened when this workflow closes.
- **Honesty disclosure 5 (Step 13 re-verification, 2026-08-02, wf-20260801-fix-191):** The ExpressionPolicy approach (PR #231, squash `11a21f4`) was confirmed live via the Authentik flow executor API. After submitting the seeded admin credentials to `POST /api/v3/flows/executor/default-authentication-flow/`, the response was `{"component": "ak-stage-prompt", "fields": [{"field_key": "password", ...}, {"field_key": "password_repeat", ...}]}` — the forced password-change prompt is now shown. This is `verdict: MATCH` for AC-3. The `BP-UAT-020.md` AC-3 checkbox has been ticked. **ISS-ADM-010-1 is resolved.** GitHub issue #164 was closed by the squash commit's `closes #164` trailer.

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
