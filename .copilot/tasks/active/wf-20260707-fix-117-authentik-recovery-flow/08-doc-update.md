# 08 — Doc Update — ISS-USR-PWRESET-001 (Path A: Authentik Recovery Flow)

**Workflow:** wf-20260707-fix-117-authentik-recovery-flow
**Agent:** DocWriter
**Date:** 2026-07-07
**Branch:** `fix/ISS-USR-PWRESET-001-authentik-recovery-flow`

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/02-business-processes/operations/member-password-reset.md` | (whole file, new) | **CREATE.** Member-facing runbook titled "I forgot my password" — 4 plain-language paragraphs covering the recovery flow, the email-not-arriving fallback, and post-reset sign-in. Mirrors the `member-profile.md` operator-runbook style (frontmatter `type: member-runbook`, Audience + Pre-reading + Ships header, Related links at the bottom). No jargon; cross-links the operator-side UAT process doc at `BP-USR-PWRESET.md` and the design-intent bullet in `auth-architecture.md` §6.6. |
| `docs/02-business-processes/uat/BP-USR-PWRESET.md` | (whole file, new) | **CREATE.** UAT process doc for `BP-USR-PWRESET`. Frontmatter extends the `BP-UAT-009` shape with the FR-WORKFLOW-004 pilot fields (`external_hops` for Authentik origin and Mailpit, `session_budget: 30 steps / 40 screenshots / 15 min`, `teardown_policy: clean-up` for the rotated member password and the Mailpit inbox). 7 ACs mirror `ISS-USR-PWRESET-001` AC-1..AC-7 verbatim. 6 Steps mirror the test strategy (Step 001 forgot-link visible → Step 002 happy path → Step 003 negative unknown-email → Step 004 branded subject E2E → Step 005 BP-UAT-009 non-regression → Step 006 direct-URL UI), each with the `screenshot label:` convention from `BP-UAT-009`. Two Negative Scenarios (host allow-list reject, PATCH-vs-PUT body-wipe regression guard) cover the security USR-2 invariant and the AC-7 safety invariant that bats-level probes enforce. |
| `docs/04-development/architecture/auth-architecture.md` | §6.6 (forgot-password bullet) | **MODIFY.** Replaced the architectural placeholder "Forgot password is Authentik's Recovery Flow — already a configurable feature. Brand the recovery email template in Authentik admin → Brand → 'Recovery email'." with a concrete wiring description: provision script path, UAT env-setup STEP 7b/9 hook, branded subject `'Reset your AI Qadam password'`, flow URL `${AUTHENTIK_URL}/if/flow/recovery/`, the "Authentik's login UI auto-renders the link — no apps/web or apps/web-next edit" refinement from the impact-analysis Step 2 critical correction, and cross-links to both the UAT process doc and the member-facing runbook. |

## Documents Not Updated

| Document | Reason |
|---|---|
| `docs/02-business-processes/uat/registry.md` | No update needed — `BP-USR-PWRESET` is registered in the registry under its own row but no existing row changes; new UAT BPs are added by the Orchestrator at workflow close, not by DocWriter. |
| `docs/03-requirements/FR-USR-001.md` and `requirements-registry.md` | Not touched — ISS-USR-PWRESET-001 is the existing member-forgot-password gap surfaced against the existing FR-USR-001 (signup). No new FR was opened; the FR's status does not flip. |
| `docs/04-development/security/security.md` | No update — Authentik owns the cryptographic reset-token, rate-limit, and user-enumeration hardening for `default-recovery-flow`. No new application-side security rule introduced. |
| `docs/04-development/standards.md`, `architecture.md` | No update — no new coding convention or module-boundary change. The architecture change is a one-bullet refinement inside `auth-architecture.md` §6.6 (already authored). |
| `apps/api/src/modules/auth/*`, `apps/web/src/pages/auth/sign-in.astro`, `apps/web-next/src/pages/auth/sign-in.astro` | Not touched — code summary explicitly stated zero changes to these surfaces (Authentik's login UI renders the link; apps/* stay redirect-only). DocWriter does not change code. |
| `docs/04-development/infrastructure/runbooks/auth.md` | Not touched — that runbook's existing pointer to `authentik-ropc.md` (the operator's manual reset path) remains accurate as a backstop. The new member-facing runbook at `member-password-reset.md` is the user-visible surface; the operator-side manual reset is unchanged. |
| Issue-history footer in `auth-architecture.md` | **No such section exists** in `auth-architecture.md` — verified by grep search for `Issue history | ## Changelog | Issue log` against the file: zero matches. The doc ends at §10 "Pointers into the code." No issue-history footer to amend. |

## Verification Notes

- Member-facing runbook mirrors `member-profile.md`: same `---` + `type: ...` + `---` frontmatter opener, same Audience / Pre-reading / Ships header block, same Related block at the bottom. Tone: 2nd-person, 4 paragraphs total (well under the 5-paragraph cap the user's brief specified), no jargon, no code fences.
- UAT process doc frontmatter extends the BP-UAT-013 shape (which itself extends BP-UAT-009) with the FR-WORKFLOW-004 pilot fields. `external_hops` declares BOTH the Authentik recovery-flow origin (`http://localhost:9000/if/flow/recovery/`, used by Steps 001/002/003/006) AND the Mailpit origin (`http://localhost:8025`, used by Steps 002/004). `session_budget` reflects the smaller surface of this BP (30 steps, 40 screenshots, 15 min wall-clock — well under BP-UAT-009's footprint because the flow has fewer inputs and no operator-onboarding branch). `teardown_policy` covers the rotated `uat-member` password (the script re-seeds it) and Mailpit inbox (a single `DELETE /api/v1/messages`).
- Architecture doc §6.6 rewrite removes the architectural-placeholder wording and replaces it with the actual shipped wiring. The relative paths to `BP-USR-PWRESET.md` (`../02-business-processes/uat/`) and `member-password-reset.md` (`../02-business-processes/operations/`) are correct from `docs/04-development/architecture/`. The relative path to `scripts/provision-authentik-recovery-flow.sh` uses `../../../` (three `..`) — from `architecture/`, that resolves to `<repo>/scripts/`, which is correct.

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "DocWriter complete. Member-facing runbook, UAT process doc (BP-USR-PWRESET, 7 ACs + 6 steps + 2 negatives), and architecture doc §6.6 update all written. No duplication with existing docs; no untouched sections altered; no issue-history footer exists at the bottom of auth-architecture.md so no footer amendment was required."
  findings:
    - "UAT process doc mirrors BP-UAT-013 extended frontmatter shape (FR-WORKFLOW-004 pilot fields); BP-UAT-009 itself does not declare external_hops/session_budget/teardown_policy but the user's brief explicitly requested those fields and BP-UAT-013 is the canonical example of the extended shape."
    - "Member-facing runbook is 4 paragraphs (under the 5-paragraph cap), no jargon, no emoji, no code blocks — matches the prose-only style of the sibling member-profile.md."
    - "Architecture §6.6 replacement preserves the relative-path consistency (../../../ resolves to <repo>/scripts/) and the new cross-links to both BP-USR-PWRESET.md and member-password-reset.md point at files that now exist on disk (verified via file_search)."
    - "No status-consistency pair to flip (this is docs-only; FR-USR-001 does not flip and ISS-USR-PWRESET-001 stays open until QualityGate + TestRunner close it; per AGENTS.md §15, DocWriter writes state into the issue file's Resolution section once it's authored by BusinessAnalyst, not into chat)."
```