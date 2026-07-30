# 06-test-strategy.md — wf-20260707-fix-118-flaky-playwright-authentik

**Issue**: ISS-USR-PWRESET-001 — this workflow's stated scope at intake was
"fix the pre-existing Authentik Playwright hydration flake blocking
AC-3/AC-5 verification." That scope was wrong. There was no hydration
flake. Twelve independent, evidence-backed root causes were found and
fixed, the most significant of which is that the password-recovery
feature shipped in PR #131 (merged 2026-07-07) was never actually
functional end-to-end in this environment.

**Date**: 2026-07-30
**Branch**: `fix/ISS-USR-PWRESET-001-playwright-authentik-flake`

---

## 1. Correcting the parent workflow's diagnosis

`wf-20260707-fix-117`'s `07-test-results.md` attributed BP-UAT-009's 1/9
and BP-USR-PWRESET's 0/6 baseline failures to "a pre-existing test-infra
timing issue with Authentik 2024.12.3 Lit web-component hydration." That
diagnosis was never verified against a live re-run with correct
invocation — it was inferred from the shape of the failures (timeouts at
Authentik-rendered elements) without checking whether the test itself was
even being invoked correctly.

Every failure in this workflow was root-caused by direct evidence (a
live re-run, a screenshot, a docker log line, a Django ORM query, or a
live Authentik API response) before being fixed. None was a timing
flake. Retrying any of these tests would have failed forever, at any
timeout — they were correctness bugs, not races (with the narrow
exception of cause #10, which genuinely was a navigation race, but not
the "Lit hydration" one hypothesized).

## 2. The 12 root causes

| # | Cause | Evidence | Fix |
|---|---|---|---|
| 1 | Manual test invocation without loading `apps/e2e/.env.uat` and without `FORCE_REGEN=1 pnpm uat:seed` hits an unseeded/wrong fixture email, producing "Invalid password" | Direct manual run reproduced this exact failure before any code was touched | Documented as an invocation gotcha in this file; not a code fix — `playwright.uat.config.ts`'s own header already documents the correct invocation, this workflow just didn't follow it at first |
| 2 | `BP-UAT-009.spec.ts` Step 005's `getByText(/your registrations\|check-in qr\|.../i)` false-positived on `AnonView`'s own promotional subtitle ("Track your registrations, see your check-in QR codes...") | Screenshot of the passing AnonView page; `grep` confirmed the exact string in `apps/web/src/components/MeDashboard.tsx:609` | Replaced with `getByRole('heading', { name: /^your registrations$/i })` — targets the authenticated dashboard's actual `<h2>`, which cannot collide with AnonView's `<p>` copy |
| 3 | `BP-USR-PWRESET.spec.ts` Step 001 checked for the "Forgot password?" link on the wrong flow stage (identification, before Authentik renders it) and expected the brand-keyed URL (`/if/flow/recovery/`), which 404s locally by design | A timed probe confirmed the link is absent for 5+ seconds on the identification stage and only appears after advancing to the password stage, with an href already resolved to the slug URL | Added `RECOVERY_FLOW_URL` constant (slug URL) for all direct navigations; Step 001 now submits the identifier first, then checks for the link |
| 4 | Authentik's `docker-compose.yml` service definitions never configured `AUTHENTIK_EMAIL__*` at all | `docker exec aiqadam-authentik-worker python3 -c "import authentik.root.settings as s; print(s.EMAIL_HOST, s.EMAIL_PORT)"` returned `localhost 25` (Django's SMTP default); worker logs showed `ConnectionRefusedError` on every `send_mail` task | Added `AUTHENTIK_EMAIL__HOST=mailpit`, `AUTHENTIK_EMAIL__PORT=1025`, `AUTHENTIK_EMAIL__USE_TLS=false`, `AUTHENTIK_EMAIL__USE_SSL=false`, `AUTHENTIK_EMAIL__FROM` to both `authentik-server` and `authentik-worker` in `infrastructure/docker-compose.yml` |
| 5 | Independent of #4: the `aiqadam-recovery-email` `EmailStage` DB row had `use_global_settings=false` with the same stale `host=localhost, port=25` hardcoded directly on the row | Django ORM query against `authentik.stages.email.models.EmailStage` after fix #4 was applied and containers recreated — email still failed identically until this row was separately corrected | Fixed the live row via Django shell; made `scripts/provision-authentik-recovery-flow.sh`'s `ensure_email_stage()` re-assert `use_global_settings: true` on every idempotent re-run (previously only patched `subject`); added bats regression test `regression-use-global-settings-repaired-by-rerun` |
| 6 | `BP-USR-PWRESET.spec.ts` Step 002 extracted the reset link from the emailed HTML into `linkMatch` but never navigated to it, and assumed password entry happens in the same browser session as identifier submission | A live-captured recovery email + a direct screenshot of the post-identifier-submit page ("Recover your account — Check your Inbox for a verification email") | Split `submitRecoveryFlow` into `submitRecoveryIdentifier` + `completeRecoveryPasswordEntry`; Step 002 now calls `page.goto(linkMatch![1])` between them |
| 7 | Step 003's expected neutral-copy text ("If an account exists... you'll receive an email shortly") was never verified against real output | A live probe against an unknown email showed the actual rendered copy: "Recover your account" / "Check your Inbox for a verification email" — confirmed identical for a known vs. unknown email, which is the actual anti-enumeration property being tested | Corrected the expected-text regex |
| 8 | **THE MAJOR FINDING**: the recovery flow's `FlowStageBinding`s only ever included an identification stage (order 10) and email stage (order 20) — no password-entry stage existed at all | `curl .../api/v3/flows/bindings/?target=<recovery-flow-uuid>` returned exactly 2 results; following a real emailed flow_token link showed "Successfully verified Email." then a silent redirect to the login page with no password form ever rendered | Resolved and bound Authentik's own built-in `default-password-change-prompt` (PromptStage, order 30) and `default-password-change-write` (UserWriteStage, order 40) — the same pair Authentik's own default recovery flow blueprint uses — via a new `resolve_existing_stage_uuid()` helper in the provision script |
| 9 | `signInViaAuthentik`'s identifier-stage button locator only matched `/continue/i`, missing "Log in" | Screenshot showing the identifier stage's button reads "Log in", not "Continue", after the password-set stage completed | Broadened to `/continue\|log in\|next\|sign in/i`, matching `BP-UAT-009.spec.ts`'s already-correct equivalent |
| 10 | Step 002 raced the recovery flow's own async post-success redirect (`net::ERR_ABORTED`), then wrongly assumed a fresh Authentik round-trip was always required afterward | Screenshot at the exact failure moment showed a mid-navigation Authentik shell with a still-visible green success toast; a later run's failure screenshot showed the browser already fully authenticated on `/me` | Replaced an initial (ineffective) `waitForLoadState` with `waitForURL(/\/if\/flow\/default-authentication-flow\//)`; added an already-authenticated check (`page.url().startsWith(BASE_URL + '/me')`) before falling back to an explicit sign-in |
| 11 | `/me/profile` has no password-change form at all — the previous password-restore block's `if ((await currentPw.count()) > 0)` guard silently no-op'd every run | `grep`/read of `apps/web/src/components/MeProfileForm.tsx` confirmed no `currentPassword`/`newPassword` fields exist anywhere in the file (matches `ISS-USR-PWRESET-001.md`'s own open question #3) | Replaced the restore block with a second full pass through the same (now-working) recovery flow to reset the password back to `MEMBER_PASSWORD` |
| 12 | `waitForRecoveryEmail` returned whichever message was newest at the first non-empty poll — no way to distinguish a genuinely new message from an already-consumed one from an earlier request to the same recipient | The restore block (fix #11) got stuck at "Check your Inbox" forever — screenshot confirmed the browser was on the identifier-already-submitted screen, meaning the second poll immediately re-returned the FIRST request's stale, already-used link | Added an `excludeIds: ReadonlySet<string>` parameter (default empty, backward compatible); the restore block passes the first email's ID so the poll waits for a genuinely new message |

## 3. Regression test requirement (per this workflow's own Step 6 gate)

Per `issue-resolution.md` Step 6: "The plan MUST include at least one
regression test that would have failed before the fix and passes after."

- `scripts/tests/provision-authentik-recovery-flow.bats`'s new
  `regression-use-global-settings-repaired-by-rerun` test forces the
  exact drifted `use_global_settings=false` + stale `host=localhost,
  port=25` state, re-runs the provision script, and asserts it is
  repaired — directly encodes cause #5 as a would-have-failed-before /
  passes-after check.
- The Playwright suites themselves (`BP-UAT-009.spec.ts`,
  `BP-USR-PWRESET.spec.ts`) are the regression coverage for causes
  #2/3/6/7/8/9/10/11/12 — every one of the specific assertions or flow
  steps that previously failed now passes, live-verified in this same
  workflow (see `07-test-results.md`).
- Cause #4 (missing `AUTHENTIK_EMAIL__*`) is covered transitively: any
  test that depends on the recovery email actually arriving in Mailpit
  (BP-USR-PWRESET Steps 002/004) would fail immediately if this
  regressed.

## 4. E2E Test Plan

| Row | Spec | What it verifies | Pre-fix | Post-fix |
|---|---|---|---|---|
| 1 | `BP-UAT-009.spec.ts` (full suite) | Sign-in/sign-out regression baseline not broken by this PR | 1/9 (documented baseline) | 7/9 live-verified this session (2 remaining are pre-existing soft-assertion discrepancies between the BP-UAT-009 script's original expectations and already-documented, unrelated actual app behavior — see §5) |
| 2 | `BP-USR-PWRESET.spec.ts` (full suite) | AC-1 through AC-7 of ISS-USR-PWRESET-001 | 0/6 (documented baseline) | 6/6 live-verified this session |
| 3 | `scripts/tests/provision-authentik-recovery-flow.bats` | Provision script idempotency + the new use_global_settings regression | 7/7 (documented baseline) | 8/8 live-verified this session |

## 5. Honesty disclosure on BP-UAT-009's remaining 2/9 (per AGENTS.md §6.1)

Two BP-UAT-009 tests still fail on soft assertions this session, both
**pre-existing and already documented in the spec file's own header
comments** (not introduced or worsened by this workflow):

- **Step 004 (Sign out)**: Authentik's RP-Initiated Logout renders a
  confirmation interstitial ("You've logged out of AI Qadam Platform
  (local).") instead of auto-redirecting to `/auth/signed-out`. Already
  flagged for BusinessAnalyst in the spec's own comments (lines
  289-302). The test's **hard** assertion (session cookie cleared)
  still passes.
- **Step 005 (Protected page after sign-out)**: the script originally
  expected a 302 redirect; the actual, intentional app behavior (per
  `MeDashboard.tsx`'s `AnonView`) is a 200 response with an in-page
  anonymous CTA. Already flagged for BusinessAnalyst in the spec's own
  comments (lines 10-24). The test's **hard** assertions (no
  authenticated-only content visible; footer regression guard) still
  pass.

Neither is new, neither is a regression from this workflow's changes,
and both are scoped to a separate BusinessAnalyst triage decision, not
this issue.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "12 independent root causes found and fixed, all live-verified; 2 BP-UAT-009 pre-existing soft-assertion discrepancies documented, unrelated to this workflow's changes."
  findings:
    - "No Lit-hydration timing flake exists or ever existed; the parent workflow's diagnosis is corrected."
    - "The original PR #131 recovery flow was never functional end-to-end — missing password-entry stage bindings (cause #8) is the most significant finding."
```
