# Step 1 — Issue Lookup

**Workflow:** wf-20260801-fix-190
**Issue:** GitHub #164 → `ISS-ADM-010-1`
**Business-Process:** BP-UAT-020
**Date:** 2026-08-01

## Outcome

GitHub issue **#164** ("Forced password-change attribute does not actually
force a password-change screen") is already registered locally as
`ISS-ADM-010-1` (filed 2026-07-29 during `wf-20260729-fix-153`).

| Field | Value |
|---|---|
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/164 |
| Local-Issue | `.copilot/issues/ISS-ADM-010-1.md` |
| Severity | blocker (for AC-3 only — AC-1/AC-2/AC-4/AC-5 unaffected) |
| Module | admin/ADM, infra/authentik |
| Business-Process | BP-UAT-020 (per `ISS-ADM-010-1.md` frontmatter, confirmed) |
| Source | Self-discovered live during `wf-20260729-fix-153`'s BP-UAT-020 verification for the unrelated `ISS-UAT-020-1` fixture-isolation gap |
| Linked-PR | None (open issue, not previously worked) |

## Issue summary (verbatim from issue body)

`AdminBootstrapService.seedAdmin()` sets Authentik user attribute
`ak_login_password_change_required: true` on the seeded bootstrap admin,
intending to force Authentik's password-change screen on that user's first
login (FR-ADM-010 AC-3). Live verification against this repo's actual
Authentik instance shows this attribute has **no observable effect on the
login flow**: after submitting the seeded email + password on Authentik's
`default-authentication-flow`, the flow executor returns
`{"component": "xak-flow-redirect", "to": "/application/o/authorize/..."}`
— a normal successful-login redirect straight to the OIDC authorize
endpoint — with no intermediate password-change stage of any kind.

## Acceptance criteria (from `ISS-ADM-010-1.md`)

- [ ] AC-1: Root cause confirmed (wrong attribute key vs. missing flow-stage
      binding) by reading Authentik's actual source/docs for the running
      version, not by further trial-and-error against the live instance.
- [ ] AC-2: A fix is implemented (either a corrected attribute key, or a
      provisioning-side policy/stage binding, or both if genuinely required)
      that makes AC-3 hold.
- [ ] AC-3: The fix is live-verified against this repo's actual Authentik
      instance (real sign-in attempt, real flow-executor response inspection).
- [ ] AC-4: BP-UAT-020's Step 002 (and its screenshot/verdict) is re-run and
      shows a genuine `MATCH` for a real forced password-change screen, not a
      false-positive based on a still-on-Authentik + password-field-present
      heuristic.

## Surface to change

Per the issue's preliminary root cause and `auth-architecture.md §9.5` fallback
proposal — the most likely fix is **a bound password-expiry policy +
ensuring the default-authentication-flow includes the relevant stage**, so
the seeded password is pre-expired at creation time. This is a
**provisioning-side** change (NOT a code change in `apps/api`) — primary
surface is `scripts/provision-authentik-rbac-groups.sh` (and any companion
provisioning helper), plus a documentation update in
`docs/04-development/architecture/auth-architecture.md §9.5` and
`docs/03-requirements/FR-ADM-010.md`'s Notes section.

The optional apps/api half: removing the misleading attribute call from
`AdminBootstrapService.seedAdmin()` (it sets an attribute that has no
effect — keeps the code honest and prevents future readers from being
fooled the same way). That is a small, low-risk code change in the same
PR.

## GitHub sync

Per protocol.md the registry already links this issue (Project "Todo"
column), and `ISS-ADM-010-1.md` already has `GitHub-Issue:` set. No new
issue creation needed. The `sync-github-project.sh` script returned
`gh default-repo drift` (a known issue from `ISS-WF-GH-CLOSE-001` history
— `gh` cached `tvolodi/aiqadam` rather than `aiqadam/ai-qadam-platform`)
but project-board sync is best-effort/non-blocking per the same protocol
section; the registry link itself is unchanged so this step's gate is
`passed`.

## Gate

**`passed`** — issue found, ACs copied to handoff, business-process
(BP-UAT-020) confirmed, scope (provisioning-side policy + flow-stage
binding, plus the small code-comment/honesty adjustment) recorded for
ImpactAnalyzer.
