# 02-impact-analysis.md — Impact Analysis (wf-20260629-fix-038)

**Step:** 2 (ImpactAnalyzer)
**Date:** 2026-06-29
**Issue:** [ISS-UAT-013-6](../issues/ISS-UAT-013-6.md) — UAT script test-design defects
**Severity:** enhancement

---

## Validated Requirement

| ID | Area | One-line |
|---|---|---|
| ENH-UAT-013-6 | uat / test-design | Strengthen BP-UAT-013 negative-scenario assertions so Neg 004 verifies the actual rejection (error message + Mailpit-empty) and Neg 002 / 003 are pinned with API-level 410 assertions + explanatory comments; add reusable UAT-template doc guidance so future specs don't regress. |

This is an **ENHANCEMENT** — no bug fix that touches product code. Goal: make
UAT negative-scenario assertions in `BP-UAT-013-signup.spec.ts` non-vacuous
and publish a doc rule that prevents the same defect class in future specs.

---

## Files Already Cross-Checked (vs proposed changes)

| Path | Current state vs. issue proposal |
|---|---|
| `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` | **Already substantively complete from Retry-2 pass.** Neg 002/003 retain `expect(apiRes.status()).toBe(410)` (lines 391, 414) plus the pinned comment block (lines 364-376). Neg 004 now requires an explicit error-text regex match AND a no-success-panel check (lines 425-481). Residual gap: Mailpit-empty inbox check for LEAD_PLUS. |
| `apps/web-next/src/blocks/customer/OnboardingForm.tsx` | **Path in handoff is wrong.** The GonePanel lives in `apps/web/src/components/OnboardingForm.tsx:140-149` (legacy Astro `apps/web`). `apps/web-next/.../OnboardingForm.tsx` is the 3-step wizard from FR-MIG-020 and does NOT contain GonePanel. No app-code change in scope regardless. |
| `docs/02-business-processes/uat/BP-UAT-template.md` | Has `## Negative Scenarios` section but **lacks** the API-contract-must-assert rule paragraph that acceptance criterion #3 requires. |
| `docs/02-business-processes/uat/BP-UAT-013.md` | Optional cross-reference edit; not strictly required. |

---

## Affected Layers

| Layer | Status | Notes |
|---|---|---|
| API (NestJS) | No | `emailField()` plus-addressing message unchanged; `OnboardingController.preview` 410 contract unchanged. |
| DB / Drizzle schemas | No | No migration. |
| Shared Types | No | No new Zod schemas or DTOs. |
| Frontend (`apps/web`) | No (read-only) | `OnboardingForm` GonePanel fallback is a deliberate UX defense. |
| Bot (`apps/bot`) | No | No aiogram handlers touched. |
| Workers (`apps/workers`) | No | No BullMQ changes. |

Enhancement is entirely contained in `apps/e2e/tests/uat/` and
`docs/02-business-processes/uat/`.

---

## Files To Modify (final, this step)

| File | Why | Approx. size |
|---|---|---|
| `docs/02-business-processes/uat/BP-UAT-template.md` | Add the API-contract-must-assert rule paragraph under `## Negative Scenarios` (line 72). | ~10-20 lines added |
| `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` (optional) | Add `mailpitSearch(LEAD_PLUS).length === 0` with `.catch(() => 0)` defensive pattern (matches `mailpitDeleteAll()` style at line 124). | ~5-10 lines added |

**Total: 1-2 files, ≤30 lines.** Well inside the small-PR rule (400 LOC / 5 files).

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mailpit unreachable in CI | Medium | New Neg 004 check throws 5xx | Match `mailpitDeleteAll()` pattern: `.catch(() => 0)` so a missing mail catcher fails **soft** with a clear skip, not a hard failure. |
| DocWriter references `apps/web-next/.../OnboardingForm.tsx` | Medium | Doc chase into dead file | Handoff context_refs will be cleaned before Step 3. Use generic "fallback error panel" wording in the doc to de-name the component. |
| Lead form's error surface changes in future | Low-medium | Neg 004 UI text regex stops matching | Broad regex used (line 469). Mailpit-empty is regex-independent. |
| `test.beforeAll` extraction of the 410 check | Low | Coupling breaks Step 005/006 | **Recommendation: do NOT promote to beforeAll.** Keep per-test assertion; add comment block. Per-test is independent and simpler. |

---

## Blast Radius

| Boundary | Affected |
|---|---|
| Test suite (e2e) | `BP-UAT-013-signup.spec.ts` only. |
| Production runtime | **None.** |
| Drizzle schema | **None.** |
| Authentik / SMTP / Mailpit | **None.** Pre-existing Mailpit gaps are ISS-UAT-013-7 territory and out of scope. |
| Docs | `BP-UAT-template.md` only. |
| `.env.uat`, `uat-seed.sh`, `uat-preflight-check.sh` | **None.** |

---

## Dependencies

- No new pnpm packages.
- Reuses existing helpers: `mailpitSearch`, `mailpitDeleteAll`,
  `hideDevToolbar`, `shot`, `setReactInputValue`.
- Testcontainers not needed (Mailpit at `UAT_MAILPIT_URL` is reused).

---

## Architecture / Rule Compliance

| Rule | Status |
|---|---|
| AGENTS.md §1 (Ten Non-Negotiables) | OK — ≤60 LOC per function, named constants, no magic numbers. |
| AGENTS.md §3 (TypeScript strict) | OK — only existing test code strengthened. |
| AGENTS.md §4 (Small PR: ≤400 LOC, ≤5 files) | OK — 1-2 files, ≤30 lines. |
| AGENTS.md §5 (Security baseline) | OK — purely test/doc. No secrets, no auth. |
| AGENTS.md §6 (No commits to main) | OK — wired to wf-20260629-fix-038. |
| AGENTS.md §7 (When uncertain — say so) | OK — flagging apps/web-next path mismatch. |
| AGENTS.md §8 (Dependencies) | OK — zero new deps. |

---

## Honesty Notes (AGENTS.md §9)

- **Handoff's `apps/web-next/src/blocks/customer/OnboardingForm.tsx` target
  path is wrong.** The GonePanel "this link can't be used" UI lives in
  `apps/web/src/components/OnboardingForm.tsx`. Flagged rather than silently
  rewritten.
- **Most of the issue's proposed spec changes are already in
  `BP-UAT-013-signup.spec.ts` from the Retry-2 pass** (file carries an
  explicit `Retry-2 changes (per ISS-UAT-013-6):` header at lines 9-22).
  Residual gap: Mailpit-empty inbox check for Neg 004, plus the doc-template
  paragraph. Saying so rather than promising a larger delta.
- **Do not promote the API-level 410 check into `test.beforeAll`.** The two
  negative tests are independent; coupling them adds fragility for marginal
  readability gain. The comment-block approach achieves the same
  "do not remove" goal at lower cost.
- **Mailpit-empty assertion is environment-sensitive.** Following the existing
  `mailpitDeleteAll().catch(...)` defensive pattern.

---

## Gate Result

```
status: passed
attempt: 1
timestamp: 2026-06-29T17:45:00Z
summary: Test-design ENHANCEMENT for ISS-UAT-013-6 is well-scoped.
  Blast radius: apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts and
  docs/02-business-processes/uat/BP-UAT-template.md. No application
  code, schema, API contract, shared-types, bot, or worker changes.
  Most of the spec changes (Neg 004 UI assertion strengthening,
  Neg 002/003 API 410 + comment block) are already in the file from
  Retry-2. Residual gap: doc-template guidance paragraph + optional
  Mailpit-empty assertion. Small PR (≤2 files, ≤30 LOC).
```
