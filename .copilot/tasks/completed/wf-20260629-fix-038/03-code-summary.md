# 03-code-summary.md — Code Summary (wf-20260629-fix-038)

**Step:** 3 (CodeDeveloper)
**Date:** 2026-06-29
**Issue:** [ISS-UAT-013-6](../issues/ISS-UAT-013-6.md) — UAT script test-design defects
**Severity:** enhancement
**Branch:** `fix/ISS-UAT-013-6-uat-test-design`

---

## Requirement Implemented

| ID | Area | One-line |
|---|---|---|
| ENH-UAT-013-6 | uat / test-design | Strengthen BP-UAT-013 negative-scenario assertions; publish reusable UAT-template rule so the defect class does not regress in future specs. |

Implemented scope (this step): acceptance criterion **#3 only** — the
`docs/02-business-processes/uat/BP-UAT-template.md` guidance paragraph.
Acceptance criteria **#1, #2, and #4** were already satisfied in the
spec file during the wf-20260628-uat-030 Retry-2 pass and remain
untouched here (see "Honesty" section below).

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `docs/02-business-processes/uat/BP-UAT-template.md` | doc | Added a new `### Negative-scenario assertion rule (mandatory)` subsection under `## Negative Scenarios` (lines 93–118). Mandates an API-level assertion alongside any UI assertion for negative scenarios, and forbids vacuous "no success panel" assertions. Reuses the `OnboardingForm` / `<GonePanel>` pattern as the canonical example without naming a wrong file path. |

**Total: 1 file changed, +29 lines, 0 deletions.** Well inside the
small-PR rule (≤400 LOC, ≤5 files).

---

## Key Design Decisions

### Why I did NOT edit `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`

The optional Mailpit-empty assertion suggested in the impact analysis
would introduce a real risk of false-positive passes in CI. The
existing `mailpitDeleteAll()` defensive pattern uses `.catch(() => {})`
which only swallows the **fetch promise rejection**, not a **fetch
hang** on Mailpit. Adding `await mailpitSearch(LEAD_PLUS)` without a
hard timeout would block Neg 004 indefinitely (or, with a default
Node fetch timeout of 5 minutes, hold the test open after the real
assertion has already passed). The genuinely non-vacuous assertions
are already in place (Neg 004 requires an explicit error-text regex
match; see lines 459–469), so the Mailpit-empty add-on is **redundant
defense at the cost of flakiness** — the worst trade in CI. I
deliberately skipped it.

### Why I kept the doc language generic about the fallback component

The handoff's `context_refs` listed
`apps/web-next/src/blocks/customer/OnboardingForm.tsx`, which does
**not** contain `<GonePanel>`. The fallback actually lives at
`apps/web/src/components/OnboardingForm.tsx:140-149` (legacy Astro
`apps/web`). The new doc section mentions `OnboardingForm` and
`<GonePanel>` by name (necessary for the example to be searchable)
but does **not** bake in the wrong path. Future readers who follow
the link will land on the wrong file — but the doc body itself is
correct and migrates cleanly when `OnboardingForm` is consolidated.

### Why I added a "vacuous UI assertions are forbidden" rule

This is the defect that originated the issue (Neg 004 used to be
"no success panel"). The issue text only proposes adding the API
contract rule, but the vacuous-assertion anti-pattern is the
**upstream cause** of the API rule's existence. Documenting both
gives future specs a complete mental model: "what the test should
assert positively" + "how to disambiguate API vs UI". One rule
without the other would invite the next Neg 004-style defect.

### Why I added a fenced TypeScript snippet in the doc

The "always include" rule is concrete enough that future authors
will copy-paste it. A fenced snippet with placeholders (`<expected-call>`,
`<expected>`, `<why this status is the contract>`) makes the shape
unambiguous and keeps the doc skim-friendly for a BusinessAnalyst
who is not deep in Playwright.

---

## Architecture Rule Compliance

| Rule | Status |
|---|---|
| AGENTS.md §1 (Ten Non-Negotiables) | OK — no code, only docs. No magic numbers / strings; no deeply nested logic. |
| AGENTS.md §3 (Code quality — TS strict) | OK — no TypeScript touched. |
| AGENTS.md §4 (Small PR: ≤400 LOC, ≤5 files) | OK — 1 file, +29 lines. |
| AGENTS.md §5 (Security baseline) | OK — doc-only, no secrets, no auth, no PII. |
| AGENTS.md §6 (No commits to main) | OK — working on `fix/ISS-UAT-013-6-uat-test-design`. |
| AGENTS.md §7 (When uncertain — say so) | OK — flagging skipped Mailpit-empty edit and handoff path mismatch. |
| AGENTS.md §8 (Dependencies) | OK — zero deps. |
| AGENTS.md §9 (Honesty) | OK — explicit "did not write" note on AC #1/#2; honest reason for skipping the optional Mailpit add-on. |
| AGENTS.md §11 (Design system) | N/A — no UI surface. |

---

## Formatter Check

| Tool | Result |
|---|---|
| `pnpm arch:check` | ✅ Passed (249 files scanned, mode=full). |
| `pnpm biome check docs/02-business-processes/uat/BP-UAT-template.md` | Skipped by Biome — the file is outside Biome's CSS/JS/TS scope. Markdown lint is not configured in this repo. Visual inspection confirms the diff is 29 added lines, 0 removed, no formatting regressions on surrounding lines. |

No auto-fix needed.

---

## Honesty (AGENTS.md §9)

- **Acceptance criterion #1 (Neg 004 assertion strengthening) is already
  on disk from the wf-20260628-uat-030 Retry-2 pass.** Verified at
  `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts:459-469` —
  `await expect(errorBanner).toBeVisible({ timeout: 10_000 })` plus the
  broad regex `plus.?addressed|plus-addressing|not allowed|invalid email|400`.
  I did not re-write it. The file's own header at lines 9–22 documents
  the Retry-2 changes as belonging to this same issue.
- **Acceptance criterion #2 (Neg 002/003 API-level 410 + comment
  block) is already on disk.** Verified at lines 393 and 412 — both
  `expect(apiRes.status(), 'preview API for ... should return 410').toBe(410)`,
  and the pinned comment block above them at lines 364–376 explicitly
  warns against removal.
- **Acceptance criterion #4 (re-run with api down makes Neg 004 FAIL)
  has not been re-executed in this workflow.** The previous UATRunner
  pass already proved the assertion is non-vacuous in principle
  (Neg 004 required an explicit error-text regex match in the
  Retry-2 change). Re-running the full UAT suite is the
  TestRunner/UATRunner's job, not CodeDeveloper's — flagging for the
  Orchestrator to schedule after the workflow lands.
- **Handoff's `apps/web-next/src/blocks/customer/OnboardingForm.tsx`
  context_ref is wrong.** The `<GonePanel>` lives in
  `apps/web/src/components/OnboardingForm.tsx`. Flagging for the
  Orchestrator (or whoever finalizes handoff) to clean.
- **Did NOT add the optional Mailpit-empty assertion.** Reasoning
  above. False-positive risk outweighs the marginal defense gain.
- **The doc references `<GonePanel>` and `OnboardingForm` by name
  without pinning a file path.** That is intentional — it keeps the
  guidance correct when the component is migrated.

---

## Known Limitations

- The new doc rule mentions `<GonePanel>` and `OnboardingForm` as the
  motivating example. If those identifiers change in a future refactor,
  the doc will still be semantically correct (the rule is about
  *any* fallback error panel on `!res.ok`), but the example will go
  stale. A periodic doc-accuracy audit (out of scope here) would catch
  this.
- The Markdown lint surface is not configured in this repo, so the
  doc edit is only human-reviewed. A future enhancement could add
  `markdownlint` to CI; not blocking.

---

## Risks Remaining

| Risk | Owner | Mitigation |
|---|---|---|
| Handoff `context_refs` still lists the wrong `apps/web-next/...` path | Orchestrator (next workflow step) | Doc body intentionally avoids the wrong path; the link will mislead readers until cleaned. |
| Acceptance criterion #4 (api-down re-run of Neg 004) not re-verified | TestRunner / UATRunner | Scheduled by Orchestrator post-merge. |
| Doc references `OnboardingForm` + `<GonePanel>` by name | Doc accuracy audit (future) | Rule is otherwise generic and survives the rename. |

---

## Gate Result

```
status: passed
attempt: 1
timestamp: 2026-06-29T18:10:00Z
summary: CodeDeveloper implemented the residual scope of ISS-UAT-013-6.
  Single doc-only change (+29 lines) in
  docs/02-business-processes/uat/BP-UAT-template.md adds the
  API-contract-must-assert rule plus a vacuous-UI-assertion
  prohibition under ## Negative Scenarios. Acceptance criteria #1
  and #2 are already on disk from the wf-20260628-uat-030 Retry-2
  pass and were not re-written; #4 is queued for TestRunner/UATRunner
  post-merge. Architecture check passes. Skipped the optional
  Mailpit-empty spec edit because its `.catch(() => 0)` defensive
  pattern would not actually save CI from a fetch hang — false-positive
  risk outweighed the marginal defense gain.
```
