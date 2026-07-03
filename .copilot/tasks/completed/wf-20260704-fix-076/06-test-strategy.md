# Step 6 — Test Strategy

**Workflow:** wf-20260704-fix-076
**Issue:** ISS-UAT-009-3
**Date:** 2026-07-04
**Agent:** TestStrategist

---

## Requirement

ISS-UAT-009-3 — Leaderboard self-row renders the signed-in user's display name and the `You` self-indicator concatenated with no visible space, separator, or badge boundary (`UAT MemberYou`). Visual-only design-system FAIL surfaced by `wf-20260702-uat-058/02b-visual-review.md` (BP-UAT-009 step-006 screenshot review).

**Resolution shape** (from `02-impact-analysis.md` + `03-code-summary.md`): the client-side `highlightMe` script in `apps/web/src/pages/leaderboard.astro` is updated to (a) wrap `.name` / `.pname` + chip in an inline-flex `.me-name-wrap` container so the chip is a **sibling** of the name rather than a child of the ellipsis-clipped text node, (b) apply the canonical `.badge.mono` pattern to the chip, and (c) harden the script with three idempotency guards. One file changed (`leaderboard.astro`), ~30 LOC.

**Acceptance criteria** (from `01-issue-lookup.md`):

| # | AC |
|---|---|
| AC-1 | Leaderboard row component located and self-indicator rendering fixed |
| AC-2 | Visual re-check: self-row renders with clear separation between name and `You` indicator (space or badge boundary) |
| AC-3 | No regression to other leaderboard row states (non-self rows unaffected) |

**Required regression test** (issue brief): at least one test that (1) would have FAILED before the fix (documents the original bug) and (2) PASSES after the fix.

---

## Rubric Score

| Criterion | Points | This change |
|---|---|---|
| Touches tenant-scoped data | +2 | No — leaderboard is read-only, not tenant-scoped write path |
| New API endpoint | +2 | No |
| Business rule with edge cases | +2 | No — visual rendering only, no logic |
| Cross-module service call | +1 | No |
| New database query | +1 | No |
| Pure function / utility | 0 | n/a |
| UI-only change (no logic) | 0 | **Yes — 1 Astro page, CSS + client-side DOM injection** |

**Total: 0.** Per the rubric: score < 4 → unit tests sufficient.
**However**, the issue brief explicitly demands a regression test that documents the original bug, and `AGENTS.md §6.1` (production-readiness) requires the live visual gate (UAT re-run) be the authoritative verification for visual changes of this class.

**Effective test mix (brief-driven, not rubric-driven):**

- **Unit (vitest):** NONE — explicitly blocked by `ISS-TEST-WEB-001`.
- **Integration (Testcontainers):** NONE — no API, no DB, no service call.
- **E2E (Playwright):** YES — extend `BP-UAT-009.spec.ts` Step 006 with a DOM-structure assertion that pins the chip's *parent* element to `.me-name-wrap` (a sibling of `.name`), then re-run BP-UAT-009 Step 006 against the live stack.
- **Live UAT re-run:** YES — required by AGENTS.md §6.1.

---

## Required Test Levels

- [ ] Unit (vitest) — **NOT APPLICABLE** (blocked by `ISS-TEST-WEB-001`; UI-only)
- [ ] Integration (Testcontainers) — **NOT APPLICABLE** (no API/DB change)
- [x] E2E (Playwright, BP-UAT-009 Step 006) — required
- [x] Live UAT re-run + visual screenshot review — required by AGENTS.md §6.1

---

## Why not a vitest unit test (explicit)

`ISS-TEST-WEB-001` (open, blocker, owned by `wf-20260703-fix-066-vitest-bump`) makes any vitest test that imports a sibling module fail at module-eval time with `ReferenceError: __vite_ssr_exportName__ is not defined`.

**Recommendation:** Do not write a vitest test in this workflow. If a future test-strategy pass wants unit-level coverage, extract `wrapSelfChip(nameEl: HTMLElement): void` to `apps/web/src/lib/leaderboard-self-chip.ts` and add a `.test.ts` next to it. That refactor is out of scope for ISS-UAT-009-3.

---

## E2E Test Plan (Playwright)

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| **BP-UAT-009 Step 006 — Sign in with `next=/leaderboard`, then verify self-row chip DOM structure** | `http://localhost:4321/auth/sign-in?next=/leaderboard` (existing Step 006 entry point) | Hard assertions on the signed-in member's row: (1) `.lb-row.is-me[data-user-id="<uat-member userId>"]` exists; (2) the chip's parent element is `.me-name-wrap`, NOT `.name`; (3) the chip carries classes `badge mono me-chip`; (4) the chip text is `'You'`; (5) all **non-self** `.lb-row` and `.podium-card` elements have **zero** `.me-name-wrap` and **zero** `.me-chip`. |

### Recommended DOM-level assertions to add inside the existing Step 006 test block

```ts
// === Regression: leaderboard self-row chip DOM structure (ISS-UAT-009-3) ===
const myUserId = await page.evaluate(() => {
  const row = document.querySelector('.lb-row.is-me, .podium-card.is-me');
  return row?.getAttribute('data-user-id') ?? null;
});

if (myUserId !== null) {
  const rowSel = `[data-user-id="${CSS.escape(myUserId)}"]`;

  // (1) Hard: the row has exactly one .me-name-wrap and one .me-chip.
  const wrapCount = await page.locator(`${rowSel} .me-name-wrap`).count();
  expect(wrapCount, 'self-row must contain exactly one .me-name-wrap').toBe(1);
  const chipCount = await page.locator(`${rowSel} .me-chip`).count();
  expect(chipCount, 'self-row must contain exactly one .me-chip').toBe(1);

  // (2) Hard: the chip's parent is the wrap (not the ellipsis-clipped name).
  const chipParentClass = await page
    .locator(`${rowSel} .me-chip`)
    .first()
    .evaluate((el) => el.parentElement?.className ?? null);
  expect(chipParentClass, '.me-chip parent must be .me-name-wrap').toBe('me-name-wrap');

  // (3) Hard: chip carries the canonical badge pattern.
  const chipClass = await page
    .locator(`${rowSel} .me-chip`)
    .first()
    .evaluate((el) => el.className);
  expect(chipClass, '.me-chip must carry "badge mono me-chip"').toBe('badge mono me-chip');

  // (4) Hard: chip text is 'You'.
  const chipText = await page.locator(`${rowSel} .me-chip`).first().textContent();
  expect(chipText?.trim(), '.me-chip text must be "You"').toBe('You');
}

// (5) Hard: NO non-self row has a chip or a wrap (AC-3 regression guard).
const otherRowsWithChip = await page
  .locator('.lb-row:not(.is-me) .me-chip, .podium-card:not(.is-me) .me-chip')
  .count();
expect(otherRowsWithChip, 'non-self rows must NOT carry a .me-chip').toBe(0);
const otherRowsWithWrap = await page
  .locator('.lb-row:not(.is-me) .me-name-wrap, .podium-card:not(.is-me) .me-name-wrap')
  .count();
expect(otherRowsWithWrap, 'non-self rows must NOT carry a .me-name-wrap').toBe(0);
```

The block is inserted between `hideDevToolbar(page)` and the URL hard assertion inside the existing Step 006 test block.

---

## Live UAT Re-Run (authoritative visual gate per AGENTS.md §6.1)

The Orchestrator runs the live BP-UAT-009 suite. This is **not** a new test artifact — it is the same Playwright run that originally surfaced the bug in `wf-20260702-uat-058`, re-executed against the fix.

### Pre-flight checklist (Orchestrator, before the run)

1. `docker compose up -d` for apps/web + Authentik compose services.
2. `curl -fsS http://localhost:4321/leaderboard` returns 200.
3. `curl -fsS http://localhost:9000/if/flow/default-authorization-flow/` returns 200.
4. `scripts/uat-seed.sh` has been run; `uat-member@aiqadam.test` exists in Authentik AND appears in the leaderboard.
5. If any pre-flight fails, fix the infra before the run.

### Run

```bash
pnpm --filter e2e exec playwright test BP-UAT-009 \
  --config apps/e2e/playwright.uat.config.ts
```

### Post-run verification

| Check | Method | Pass criterion |
|---|---|---|
| Step 006 Playwright assertions (1)–(5) | `expect(...)` in the augmented spec | All five hard assertions pass. |
| Screenshot pixel review | `scripts/uat-visual-check.sh` + manual pixel inspection | On the podium card, `You` chip is to the right of `UAT Member` with ≥6px gap and a visible 1px border. NOT concatenated. |
| Non-self rows visually unchanged | Same screenshot | No chip, no wrap, no extra spacing on non-self rows. |

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| **AC-1** (component located + fix applied) | Code-review evidence + Playwright (3) | Fix is in `leaderboard.astro`. Playwright assertion (3) confirms `chipClass === 'badge mono me-chip'`. |
| **AC-2** (clear separation between name and `You`) | Playwright (1)+(2) + live visual review | Playwright asserts the chip's parent is `.me-name-wrap` (not `.name`/`.pname`). Live visual review confirms ≥6px gap + visible 1px border. |
| **AC-3** (non-self rows unaffected) | Playwright (5) | NO `.lb-row:not(.is-me)` / `.podium-card:not(.is-me)` carries a `.me-chip` or `.me-name-wrap`. |
| **Regression test "would have FAILED before the fix"** | Playwright (2) | `chip.parentElement.className === 'me-name-wrap'`. Pre-fix: `'name'` / `'pname'` → fails. Post-fix: `'me-name-wrap'` → passes. |

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `uat-member@aiqadam.test` not in leaderboard top-3 → no `.is-me` row → assertions skipped | Medium | Orchestrator pre-flight confirms seeded; spec's `if (myUserId !== null)` guard makes missing-row path a soft no-op. Visual review still applies. |
| Astro scoped CSS vs. `<style is:global>` split might leak `.me-name-wrap` into other pages | Low | Security review PASSED on INV-1..11. Grep confirms `me-name-wrap` only appears in `leaderboard.astro`. |
| Authentik IdP flakiness during Playwright run | Low | Existing 20s timeout per Authentik field; `workers: 1`; same pattern as `wf-20260702-uat-058`. |
| Test-strategist bias toward "add more tests" rather than honouring the brief | Low | Brief explicitly says "Unit/integration tests: NONE". Strategy is minimum needed. |

---

## Honest constraints

1. **The "would have FAILED before the fix" claim is structural, not empirical.** The claim is grounded in the DOM shape documented in `02-impact-analysis.md` vs. `03-code-summary.md`. TestDesigner should verify the live DOM shape via `page.evaluate(() => ...)` before committing the assertions.
2. **The visual-review sub-step is still the primary visual gate.** DOM assertions document the structural cause; pixel review proves the user actually sees a clean badge. Both must pass.
3. **`ISS-TEST-WEB-001` is unresolved.** Future unit-level coverage requires extracting `wrapSelfChip` to a `.ts` module + bumping vitest. Both explicitly out of scope here.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Strategy complete. No unit tests (ISS-TEST-WEB-001 blocks vitest in apps/web). Single Playwright spec augmented (BP-UAT-009 Step 006) with five DOM assertions that document the original bug and verify the post-fix shape. Live UAT re-run of BP-UAT-009 Step 006 is the authoritative visual gate per AGENTS.md §6.1."
  findings:
    - "ISS-TEST-WEB-001 (counter 4/5, owned by wf-20260703-fix-066-vitest-bump) makes any vitest test in apps/web fail at module-eval time; no unit test is recommended."
    - "Single spec file modified: apps/e2e/tests/uat/BP-UAT-009.spec.ts; ~50 LOC added. Within §4 PR budget."
    - "Regression-test requirement (issue brief) satisfied by assertion (2): chip.parentElement.className === 'me-name-wrap'."
    - "AC-1 / AC-2 / AC-3 all mapped to specific assertions."
    - "Live UAT re-run of BP-UAT-009 Step 006 is authoritative visual gate; Orchestrator pre-flight mandatory."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```