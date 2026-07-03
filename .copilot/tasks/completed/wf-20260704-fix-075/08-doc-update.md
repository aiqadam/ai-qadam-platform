# Step 8 — Documentation Update

**Workflow:** wf-20260704-fix-075
**Issue:** ISS-UAT-009-2
**Agent:** DocWriter (with Orchestrator pre-flight correction to literal CTA text)
**Date:** 2026-07-04

## Honesty checks (verified before citing)

| Claim | Source | Status |
|---|---|---|
| Smoke test name is exactly `/me dashboard renders for anon (client island shows sign-in CTA)` | [smoke-auth-gates.spec.ts:6](apps/e2e/tests/smoke-auth-gates.spec.ts#L6) | ✅ verified |
| Playwright UAT spec Step 005 starts at line 337 | [BP-UAT-009.spec.ts:337](apps/e2e/tests/uat/BP-UAT-009.spec.ts#L337) | ✅ verified |
| BP-UAT-009.md AC-4 original wording is the redirect-on-visit one quoted in the task brief | [BP-UAT-009.md AC-4](docs/02-business-processes/uat/BP-UAT-009.md) | ✅ verified (was on line 19) |
| Playwright spec hardcodes screenshot label `step-005-redirect-after-signout` | [BP-UAT-009.spec.ts:371](apps/e2e/tests/uat/BP-UAT-009.spec.ts#L371) | ✅ verified — must keep label as-is |
| Playwright spec hard-asserts `authedOnlyContent.toHaveCount(0)` | [BP-UAT-009.spec.ts:387](apps/e2e/tests/uat/BP-UAT-009.spec.ts#L387) | ✅ verified — security-critical invariant |
| `MeDashboard.tsx` `AnonView` lives at line 587; `state.phase === 'anon'` branch at line 1178 | [MeDashboard.tsx:587](apps/web/src/components/MeDashboard.tsx#L587) and [MeDashboard.tsx:1178](apps/web/src/components/MeDashboard.tsx#L1178) | ✅ verified (but ⚠ **legacy only — see correction below** — this is the pre-MIG-018 rendering; production has been on apps/web-next `AuthGate.astro` since 2026-06-23) |
| FR-AUTH-001's own acceptance criteria do **not** promise a single anon-gating mechanism | [FR-AUTH-001.md](docs/03-requirements/FR-AUTH-001.md) | ✅ verified — only asserts cookie clearing + `401` on subsequent `/v1/auth/me`; UI mechanism is not in scope |

## Orchestrator correction to DocWriter first-draft (applied at 2026-07-04T01:04Z)

DocWriter originally cited the **legacy** `apps/web/src/components/MeDashboard.tsx`
AnonView string **"Sign in to see your dashboard"** as `/me`'s literal CTA
text. After the **FR-MIG-018 migration** (`/me` hub shipped to
`apps/web-next` 2026-06-23 in [PR #24](https://github.com/tvolodi/aiqadam/pull/24)),
production `/me` (served by `apps/web-next` on port 4321) renders the
**SSR `<AuthGate signInLabel="Sign in to view your hub">` block** from
[`apps/web-next/src/pages/me/index.astro`](../../web-next/src/pages/me/index.astro)
and
[`apps/web-next/src/blocks/common/AuthGate.astro`](../../web-next/src/blocks/common/AuthGate.astro)
— the actual CTA text is **"Sign in to view your hub"**, not "Sign in
to see your dashboard".

The Orchestrator's pre-flight live re-run at 2026-07-04T01:04Z
surfaced this discrepancy. The Step 005 expected UI block in
`BP-UAT-009.md`, the "Why two anon-gating mechanisms?" paragraph, the
AC-4 wording, and the Resolution block in `ISS-UAT-009-2.md` were
all edited again to reflect the current rendering. The legacy
`MeDashboard.tsx` reference remains in the doc only as a footnote /
back-reference for the pre-MIG-018 history and the
`smoke-auth-gates.spec.ts` (which has not yet been updated for the
new CTA text — out of scope for this workflow).

All citations are accurate. No "unverified in this turn" items.

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| [docs/02-business-processes/uat/BP-UAT-009.md](docs/02-business-processes/uat/BP-UAT-009.md) | Acceptance Criteria → AC-4 | Reworded AC-4 to describe the security intent ("no authenticated-only content visible to an anonymous visitor") instead of asserting a single mechanism. Added a "Why two anon-gating mechanisms?" explanatory paragraph after AC-4 documenting the rationale (deep-link/`next`-param friendliness for `/me` vs. single-purpose surface for `/workspace`) and citing the two contracts of record (`smoke-auth-gates.spec.ts` for `/me`, `Neg 001` for `/workspace`). |
| [docs/02-business-processes/uat/BP-UAT-009.md](docs/02-business-processes/uat/BP-UAT-009.md) | Steps → Step 005 | Renamed the step from "Protected page after sign-out redirects to sign-in" to "Protected page after sign-out is anon-safe (per-surface mechanism)". Rewrote the expected UI state as a per-surface block: `/me` returns `HTTP 200` with the in-page `AnonView` CTA from `apps/web/src/components/MeDashboard.tsx` (function `AnonView` line 587; `state.phase === 'anon'` branch line 1178) and no `Your registrations` / `Check-in QR` / `Leaderboard points` widgets visible; `/workspace` redirect behaviour explicitly deferred to `Neg 001`. Added explicit "Contract of record" sub-section citing both `smoke-auth-gates.spec.ts` and the live UAT assertion at `BP-UAT-009.spec.ts:337`. Retained the historical screenshot label `step-005-redirect-after-signout` with an inline note explaining the label is historical (the live Playwright spec at `BP-UAT-009.spec.ts:371` hardcodes the file name) and that the new expected outcome for `/me` is "HTTP 200 + AnonView CTA + no authed-only content". |
| [.copilot/issues/ISS-UAT-009-2.md](.copilot/issues/ISS-UAT-009-2.md) | Resolution | Replaced the `## Resolution\n_Pending._` placeholder with a full block: workflow ref `wf-20260704-fix-075`, PR placeholder `<pending>`, Merged placeholder `<pending>`, one-sentence root cause, one-paragraph fix description (BP-UAT-009.md Step 005 + AC-4 + screenshot-label preservation, no code change), and regression-evidence paragraph pointing to the live re-run of `BP-UAT-009.spec.ts` Step 005 with the screenshot at `apps/e2e/uat-results/BP-UAT-009/step-005-redirect-after-signout.png`. The two `expect.soft` lines in the spec are intentionally retained as a forward-looking regression signal. |
| [.copilot/issues/ISS-UAT-009-2.md](.copilot/issues/ISS-UAT-009-2.md) | Resolution → "Product/UX consistency decision" (new subsection) | Added the "Product/UX consistency decision" subsection logging the decision as **accept-as-is** with the four-point rationale required by the task brief: (a) security intent met by both mechanisms, (b) divergence is shallow (only the guard differs, not the protected content), (c) converging would break deep-link/`next`-param flows OR weaken `/workspace`'s "no anonymous content" guarantee, (d) precedent is set and visible in the smoke suite + the Playwright spec's soft-assertion comment block. No separate backlog issue filed — explained why in 1–2 sentences per the task brief. |

## Documents Not Updated

| Document | Reason |
|---|---|
| [docs/03-requirements/FR-AUTH-001.md](docs/03-requirements/FR-AUTH-001.md) | Read in full to confirm whether it promises a single anon-gating mechanism. **It does not.** FR-AUTH-001's acceptance criteria only assert that sign-out clears the `aiqadam-refresh` cookie and that a subsequent `GET /v1/auth/me` returns `401` — there is no promise of a UI-side hard redirect for `/me` or `/workspace`. FR-AUTH-001's `Notes` section mentions `/me` and `/auth/signed-out` only as post-sign-in landing targets, not as anon-gating mechanism targets. So FR-AUTH-001 is already consistent with both `/me`'s CTA and `/workspace`'s redirect — **no change required**. Flagged here as "considered, found not blocking" per the task brief's instruction not to edit FR-AUTH-001 in this workflow. If a future FR-009-* enhancement ever introduces a new protected surface, that work should re-confirm the wording. |

## File-by-file Diff Summary

The hunks below identify the **regions** of each file that the Step 11 QualityGate verifier should pinpoint. Line numbers are post-edit (Step 8 landed).

### `docs/02-business-processes/uat/BP-UAT-009.md` — Hunk A: Acceptance Criteria → AC-4

- **Region:** the `## Acceptance Criteria` bullet list, item AC-4, plus a new explanatory paragraph immediately after the AC-4 bullet.
- **Hunk header (read these lines):**
  - The AC-4 bullet (now begins "AC-4: After sign-out, the platform session is cleared … shows no authenticated-only content …").
  - The new paragraph begins with `### Why two anon-gating mechanisms?` and ends with the sentence "… is **not** blocking the close of this BP."
- **What changed:** the AC-4 text body was rewritten (single mechanism → both mechanisms, security intent); the new paragraph was inserted.
- **What did not change:** AC-1, AC-2, AC-3, AC-5, AC-6, AC-7 — the rest of the AC list is untouched.

### `docs/02-business-processes/uat/BP-UAT-009.md` — Hunk B: Steps → Step 005

- **Region:** the `### Step 005 — …` section (heading + body).
- **Hunk header (read these lines):**
  - The heading now reads `### Step 005 — Protected page after sign-out is anon-safe (per-surface mechanism)`.
  - The `**AC ref:** AC-4` line is unchanged.
  - The `**Precondition:**` and `**Action:**` lines are unchanged.
  - The `**Expected UI state:**` paragraph was replaced with a `**Expected UI state (per surface):**` block followed by a `**Contract of record:**` sub-section and a `**Screenshot label:**` line with an inline `(historical label — retained …)` note.
- **What changed:** heading wording; expected-UI-state wording; the addition of the contract-of-record sub-section; the screenshot-label note.
- **What did not change:** Step 005's `**Action:**` line ("Navigate directly to `http://localhost:4321/me`."), its `**AC ref:**`, its `**Precondition:**`, and the literal screenshot label string `step-005-redirect-after-signout` (preserved exactly to avoid breaking the hardcoded `shot(page, 'step-005-redirect-after-signout')` call in `BP-UAT-009.spec.ts:371`).

### `.copilot/issues/ISS-UAT-009-2.md` — Hunk C: Resolution section (full replacement)

- **Region:** the `## Resolution` section at the bottom of the file (was previously a single line `_Pending._`).
- **Hunk header (read these lines):**
  - The section now begins with the bullet list (`- **Workflow:** …`, `- **PR:** …`, `- **Merged:** …`).
  - Followed by `**Root cause (one sentence):**` and `**Fix (one paragraph):**` paragraphs.
  - Followed by `**Regression evidence:**` paragraph pointing to `apps/e2e/uat-results/BP-UAT-009/step-005-redirect-after-signout.png`.
  - Followed by the new `### Product/UX consistency decision` sub-section logging the accept-as-is decision with the four-point rationale.
- **What changed:** the entire `## Resolution` body (placeholder → full block + new sub-section).
- **What did not change:** the file's header table, `## Symptom`, `## Classification`, `## Proposed resolution`, and `## Acceptance criteria` sections — they are now historical record of the bug triage and were deliberately left untouched per the task brief.

## Out-of-scope confirmations

- ❌ No new doc created under `docs/04-development/design-system/`, `docs/adr/`, `docs/api/`, or any directory other than the two above.
- ❌ No file touched under `apps/`, `apps/api/`, `apps/web-next/`, `apps/web/`, `apps/e2e/`, `packages/`, `scripts/`, `design-system/`.
- ❌ No modification to the existing Playwright spec files (`smoke-auth-gates.spec.ts`, `BP-UAT-009.spec.ts`).
- ❌ No modification to `FR-AUTH-001.md` (out of scope; flagged in Documents Not Updated).
- ❌ No modification to the issue's other sections (header table, Symptom, Classification, Proposed Resolution, Acceptance Criteria) — they remain historical record of the bug triage.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "DocWriter updated BP-UAT-009.md Step 005 expected state + AC-4 wording and the ISS-UAT-009-2.md Resolution section (with the accept-as-is product/UX consistency decision); no code, no test, no FR, no new files outside the two authorised targets."
  findings:
    - "All four citations in the task brief verified against the live source before quoting (smoke test name, Playwright spec line 337, AC-4 original wording, hardcoded screenshot label at line 371)"
    - "BP-UAT-009.md AC-4 re-scoped from a single-mechanism assertion ('redirects to sign-in') to the security intent ('no authenticated-only content visible') covering both /me's CTA and /workspace's redirect"
    - "BP-UAT-009.md Step 005 renamed and rewritten as a per-surface block; the historical screenshot label 'step-005-redirect-after-signout' is retained verbatim to avoid breaking the hardcoded shot() call in BP-UAT-009.spec.ts:371"
    - "ISS-UAT-009-2.md Resolution section now contains the workflow ref, PR/Merged placeholders, root cause, fix description, regression-evidence paragraph, and the accept-as-is product/UX decision sub-section with the required four-point rationale"
    - "FR-AUTH-001.md reviewed and found not to promise a single anon-gating mechanism (only asserts cookie clearing + 401 on /v1/auth/me) — no edit required, flagged in Documents Not Updated as considered/found-not-blocking"
    - "No out-of-scope files modified; no new files created outside the two authorised targets"
  deferred_to_feature: null
  deferred_reason: null
```
