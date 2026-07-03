# Visual Testing Strategy — Human-less UAT with Visual Analysis

**Status:** Accepted (2026-07-02)
**Owner:** senior technical officer
**Implements:** FR-UAT-VISUAL-001 (workflow wf-20260702-feat-056)
**Related:** `.copilot/workflows/uat-verification.md`,
`.copilot/agents/visual-reviewer.md`, `scripts/uat-visual-check.sh`

---

## Problem

The `uat-verification` workflow captured a screenshot after every step, but
**no step ever required an agent to open one**. Triage consumed only the
text report (`02-uat-report.md`), all assertions were DOM assertions, and no
gate depended on visual analysis. Consequences observed in practice:

1. Agents claimed they "cannot work with images" — false in this runtime
   (Claude Code's Read tool renders PNGs natively), but never challenged
   because nothing forced the attempt.
2. Agents silently skipped visual-testing instructions — rational behavior,
   since every gate passed without them. Prose instructions without
   mechanical enforcement are ignored under pressure; this repo already
   learned this with `workflow-finish.sh` and `uat-preflight-check.sh`.
3. Visually broken UI passed UAT. ISS-UAT-013-6: a 404 page rendered
   "visually identically" to a 410 for the DOM assertion. Design-system
   conformance (tokens, Lucide-only icons, no raw hex) was checked nowhere.

## Decision

Three complementary layers, cheapest-deterministic first, LLM vision last.
Each layer catches what the previous one structurally cannot.

| Layer | Mechanism | Catches | Cost |
|---|---|---|---|
| 1a | Playwright pixel-diff baselines (`toHaveScreenshot`) | Any visual regression vs approved baseline | Near zero after baseline approval |
| 1b | Computed-style design-system linting (`assertDesignSystem`) | Off-token colors, wrong fonts, non-Lucide icons, raw hex | Zero human involvement, fully deterministic |
| 2 | VisualReviewer agent (LLM vision) reads every screenshot | Judgment defects: broken layout, wrong content, "doesn't look like one product", expected-state mismatches invisible to the DOM | LLM tokens per screenshot |
| 3 | Mechanical gate: `scripts/uat-visual-check.sh` | Agent skipping/faking Layer 2 | Zero |

Principle: **vision-model attention is reserved for judgment calls; anything
a script can check, a script checks; anything an agent must do is verified
by a script, not by trust.**

---

## Layer 1a — Pixel-diff baselines

For each UAT step screenshot, a named baseline is kept under
`apps/e2e/tests/uat/__screenshots__/`. Regressions fail deterministically.

Implementation spec (for CodeDeveloper):

- In UAT specs, in addition to the evidence screenshot
  (`page.screenshot({ path })`), assert:
  ```ts
  await expect.soft(page).toHaveScreenshot(`${label}.png`, {
    maxDiffPixelRatio: 0.02,   // tolerate anti-aliasing, not layout shifts
    animations: 'disabled',
    caret: 'hide',
  });
  ```
- Mask inherently dynamic regions (dates, counters, avatars) with the
  `mask:` option rather than raising the diff ratio.
- Baseline update procedure: `pnpm --filter @aiqadam/e2e exec playwright
  test --config apps/e2e/playwright.uat.config.ts --update-snapshots` is
  run ONLY when a PR intentionally changes the UI; new baselines are
  committed in that PR and reviewed as images in the PR diff. Agents never
  update baselines to make a red test green without an intentional-change
  reference in the PR description.
- First run per spec establishes baselines (Playwright auto-creates and
  marks the test as needing rerun) — this is expected and not a failure.

## Layer 1b — Computed-style design-system linting

New fixture: `apps/e2e/support/assert-design-system.ts`.

Implementation spec (for CodeDeveloper):

1. **Token extraction (build step of the fixture, not hand-maintained):**
   parse `docs/04-development/design-system/Design system for AI agents/tokens/tokens.css`
   at fixture load, collecting every `--*` custom property value into an
   allowed-color set (normalize to rgb via a tiny converter; include
   `transparent`, `inherit`, `currentcolor`).
2. **Walk visible elements** via `page.evaluate`: for every element in the
   viewport with non-zero size, read computed `color`, `background-color`,
   `border-*-color`, `outline-color`, `font-family`.
3. **Assertions:**
   - Every computed color ∈ allowed-color set (± the browser's rgb
     rounding). Report offender as `selector — property: value`.
   - `font-family` first family ∈ the brand font stack from tokens.
   - No element with `background-image: linear-gradient(...)` unless the
     computed value originates from a token (design system forbids ad-hoc
     gradients).
   - Every inline `<svg>` icon has `data-lucide` or a `lucide-*` class
     (icon policy: Lucide only). `<img>` used as icon (≤32px square, in a
     button/nav) is a violation.
4. **Reporting:** return a violation list; UAT specs call it with
   `expect.soft(violations).toEqual([])` so a styling violation is recorded
   without aborting the flow. The violation list is appended to the UAT
   report so BusinessAnalyst can register design-debt issues.
5. Unit-test the fixture itself against a static HTML page with known
   violations (`scripts/tests/` pattern or a dedicated spec).

## Layer 2 — VisualReviewer agent (Step 3.5)

See `.copilot/agents/visual-reviewer.md`. Key design points, for the record:

- **Capability statement up front.** The refusal "I cannot work with
  images" is named a protocol violation with a defined consequence
  (`failed-retry`), removing the ambiguity agents exploited.
- **Proof-of-look fields.** Each review entry must contain information
  that exists only in the pixels (element locations, rendered text
  artifacts, dominant colors, anomalies). Fabricating entries from the
  text report becomes detectable on spot-check.
- **Judgment scope only.** The agent is explicitly told token-exactness is
  Layer 1's job; its job is coherence, layout integrity, and
  expected-state matching — things a style walker cannot judge.
- **Viewport screenshots only** (UATRunner rule): full-page PNGs can
  exceed image-size limits and produce genuine read failures, which
  historically "confirmed" the can't-read-images excuse.

## Layer 3 — Mechanical enforcement

`scripts/uat-visual-check.sh` — counts PNGs vs `### Screenshot:` entries in
`02b-visual-review.md` and verifies every required proof-of-look field per
entry. Run three times:

1. By VisualReviewer as a self-check before emitting its gate.
2. By the Orchestrator immediately after Step 3.5 (agent's `passed` is
   overridden to `failed-retry` on non-zero exit).
3. At the Step 5 pre-push gate — an incomplete visual review cannot reach
   a PR.

BusinessAnalyst triage additionally hard-fails (`failed-escalate`) if
`02b-visual-review.md` is absent.

---

## Why agents ignored the previous instructions — design lessons

1. **Gates define behavior; prose decorates it.** If a duty is not an
   input to a gate that can fail, agents under context pressure drop it.
   Every new duty added here is coupled to a scriptable check.
2. **Capability doubt defaults to refusal.** If an agent definition never
   states "you can read images with tool X," the model's safe answer is
   "I can't." State capabilities explicitly where they are needed.
3. **Make fabrication expensive.** Output formats whose fields can be
   filled from already-in-context text will be filled from text. Require
   fields only obtainable from the artifact being verified.
4. **Text-only handoffs erase visual duties.** If Step N's output is
   markdown and Step N+1's input is that markdown, images silently drop
   out of the pipeline. The screenshot directory is now a first-class
   input of Steps 3.5 and 4.

## Rollout

1. This PR: agent + workflow + enforcement script + this document.
   (No application code — Layer 1 is specified, not yet implemented.)
2. Follow-up workflow (requirement-development): implement
   `assert-design-system.ts` + unit tests (Layer 1b).
3. Follow-up workflow: add `toHaveScreenshot` baselines to existing UAT
   specs, one BP-UAT at a time, baselines reviewed in-PR (Layer 1a).
4. Re-run `uat-verification` on BP-UAT-013 as the pilot: it has an existing
   screenshot corpus (`apps/e2e/uat-results/BP-UAT-013/`) to validate the
   VisualReviewer protocol end-to-end.
5. Implement `FR-WORKFLOW-003` (UAT fixture state reset,
   `docs/03-requirements/FR-WORKFLOW-003.md`) so BP-UAT scripts become
   re-entrant — a precondition for scheduled nightly re-verification of
   all business processes with visual review.
