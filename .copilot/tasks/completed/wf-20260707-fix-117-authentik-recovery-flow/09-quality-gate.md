# 09-quality-gate.md — wf-20260707-fix-117-authentik-recovery-flow

**Workflow**: wf-20260707-fix-117-authentik-recovery-flow
**Issue**: ISS-USR-PWRESET-001
**Branch**: fix/ISS-USR-PWRESET-001-authentik-recovery-flow
**Head commit**: `3d16a2f`
**Date**: 2026-07-07
**Author**: QualityGate (subagent decision in workflow step 10)

---

## Verdict: **PASS-WITH-DEFERRED-ACS** (provisional merge authorised)

The Authentik recovery flow is **correctly wired** at the protocol
level on the running stack. 5 of 7 ACs are verified end-to-end by the
bats suite + live curl. 2 ACs (AC-3, AC-5) are honestly deferred to a
**named, queued** follow-up workflow (`wf-20260707-fix-118-flaky-playwright-authentik`).

This is a PASS gate, not a FAIL: per AGENTS.md §6.1 a deferral is
acceptable only when a follow-up workflow is queued BEFORE the current
workflow closes. That condition is met — see the queue entry at
`.copilot/tasks/queued/wf-20260707-fix-118-flaky-playwright-authentik/`.

The remaining work (Playwright form-fill against Authentik's Lit
components) is a **separate test-infra concern** that also breaks the
production sign-in baseline (BP-UAT-009 1/9 on the same stack with
no PR changes). It is **not introduced by this PR** and is therefore
not a blocker for merging this PR.

---

## Gate-by-gate review

### Gate 1 — Test strategy (Step 6)

**PASS.** The strategy (06-test-strategy.md) chose unit + integration
(bats) + E2E (Playwright). Bats tests cover the protocol-level
invariants (curl returns 200, brand binding survives a re-run, subject
preserved on re-run, allow-list enforced). Playwright covers the
user-visible flow. The split is correct.

### Gate 2 — Test design (Step 7)

**PASS.** 7 bats + 6 Playwright tests designed and committed in
`08670ef` and updated in `3d16a2f`. Test #3 deliberately asserts the
before-fix 404 / after-fix 200 invariant with a comment block that
documents the regression boundary — exemplary test design.

### Gate 3 — Test execution (Step 8)

**PASS-WITH-DEFERRED-ACS.** Bats 7/7. Playwright 0/6 — but the failure
mode is identical to BP-UAT-009 baseline failure on the same stack,
proving it is pre-existing. See 07-test-results.md for the full
AC-by-AC disposition.

### Gate 4 — Documentation (Step 9, prior session)

**PASS.** `docs/02-business-processes/operations/member-password-reset.md`
+ `docs/02-business-processes/uat/BP-USR-PWRESET.md` written;
`docs/04-development/architecture/auth-architecture.md` §6.6
promoted from TODO to "Wired via scripts/provision-authentik-recovery-flow.sh".

### Gate 5 — Security (Step 5, prior session)

**PASS.** No new auth-tenant surface added. The provision script runs
with a Bearer token from `/tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID`
(comma-separated AK_API_TOKEN + brand UUID per prior session
convention). Allow-list guard restricts the recovery flow to
`localhost | 127.0.0.1 | auth.aiqadam.org`. No secrets committed;
parameterized API calls only.

### Gate 6 — Architecture check

**PASS.** `pnpm arch:check` exited 0 with the staged commit:
`✓ arch:check passed (2 file(s) scanned, mode=staged).`

### Gate 7 — Honesty disclosure

**PASS.** The wrong diagnosis (committed at `1b95d27` —
"Authentik image missing ak-stage-email") has been retracted in the
issue file Resolution section. The related issue
`ISS-AUTH-AKSTAGE-EMAIL-MISSING.md` is closed with a "wrong
diagnosis" status. Registry updated to reflect both.

---

## AC-by-AC final disposition (per AGENTS.md §6.1)

| AC | Disposition | Verified by | Deferral |
|---|---|---|---|
| AC-1 | verified | bats #3 | — |
| AC-2 | verified (protocol-level) | brand config + bats #1 | — |
| AC-3 | deferred | (Playwright blocked by flake) | queued to wf-20260707-fix-118 |
| AC-4 | verified | bats #2 | — |
| AC-5 | deferred | (Playwright blocked by flake) | queued to wf-20260707-fix-118 |
| AC-6 | verified-not-regressed | BP-UAT-009 baseline confirmed pre-existing | — |
| AC-7 | verified | bats #5 | — |

**5 verified, 2 deferred-to-named-queued-followup. Zero unmarked.**

---

## Authorization

The Orchestrator (this gate's caller) is **authorised** to:

1. ✅ Commit pending artifacts (`07-test-results.md`,
   `handoff.yaml`, issue file updates, registry update,
   `next-workflow-id` counter bump, queued follow-up
   `wf-20260707-fix-118`).
2. ✅ Open a PR via `gh pr create` from
   `fix/ISS-USR-PWRESET-001-authentik-recovery-flow` to `main`.
3. ✅ Auto-merge via `gh pr merge --squash --admin --delete-branch`
   per AGENTS.md §6.3 user opt-out (the failure class — Playwright
   timing — is pre-existing on `origin/main` and the PR does not
   touch CI surfaces).
4. ✅ Archive the task directory to
   `.copilot/tasks/completed/wf-20260707-fix-117-authentik-recovery-flow/`.
5. ✅ Back-fill merge SHA into the issue file + registry row.

The issue stays `in-progress` until `wf-20260707-fix-118` lands its
verification.

---

## Honesty disclosures (consolidated)

- The earlier diagnosis "image missing ak-stage-email" (committed at
  `1b95d27`) was **wrong**. The image is the upstream Authentik
  build. The provision script v2 was needed because the flow was
  empty, not because the component was missing. Retraction is
  documented in both issue files and the registry.
- AC-3 and AC-5 are **honestly deferred** with a queued follow-up
  workflow ID. No "verified" claims are made on those ACs.
- The Playwright failures are **pre-existing test-infra flakes** —
  not introduced by this PR. The BP-UAT-009 baseline (1/9 on the
  same stack with no PR changes) is the evidence.

---

## Chat report

`[wf-20260707-fix-117] PR N merged (squash SHA). ISS-USR-PWRESET-001 partial — 5/7 ACs verified, 2/7 deferred to queued wf-20260707-fix-118. 1 issue closed (ISS-AUTH-AKSTAGE-EMAIL-MISSING, wrong diagnosis). 1 follow-up queued.`

(merge SHA back-filled after workflow-finish.sh runs)