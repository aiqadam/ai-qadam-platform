# 06 — Test Strategy (TestStrategist) — wf-20260701-fix-044 (ISS-LEAD-DISC-001)

**Recorded:** 2026-07-01
**Author:** TestStrategist
**Branch:** `fix/ISS-LEAD-DISC-001-lead-form-discoverability`
**Issue:** [ISS-LEAD-DISC-001](../../../issues/ISS-LEAD-DISC-001.md)
**Workflow type:** issue-resolution

---

## Requirement

`FEAT-LEAD-DISC` (synthetic id; no formal FR exists — discoverability is a UX bug) —
make `<LeadCaptureForm />` discoverable on `apps/web` homepage `/`. The form already
renders at byte offset 103,217 / 109,416 (~94 % down the body) and is unreachable on
a 1440×900 viewport. The form itself is byte-identical to `main` and its backend
(POST `/api/v1/leads` → 202, idempotent, honeypot silent) already works end-to-end.
The gap is purely **visual placement + a stable in-page anchor + a nav link**.

Implemented per `03-code-summary.md`:

1. `<LeadCaptureForm client:load />` section moved to directly after
   `<UpcomingEventsGrid>` and before the 3-stat strip in
   `apps/web/src/pages/index.astro`.
2. The form's wrapping `<section>` carries `id="newsletter"` and
   `style="scroll-margin-top: 72px;"`.
3. A new nav link `Get updates` / `Новости` (locale `nav.get_updates`) in
   `apps/web/src/components/Nav.astro` between Leaderboard and Sign-in,
   pointing at `/#newsletter`.
4. Locale files `apps/web/src/locales/en.json` and `ru.json` updated.

Untouched: `LeadCaptureForm.tsx`, `Layout.astro`, all of `apps/api/`,
`apps/web-next/`, `apps/bot/`, `apps/workers/`, `packages/`.

---

## Rubric Score

| Criterion | Points |
|---|---|
| Touches tenant-scoped data | 0 |
| New API endpoint | 0 |
| Business rule with edge cases | 0 |
| Cross-module service call | 0 |
| New database query | 0 |
| Pure function / utility | 0 |
| UI-only change (no logic) | 0 |
| **Total** | **0** |

**Rubric recommendation:** "score < 4 → unit tests sufficient." That
recommendation does **not fit** this change — there is no function whose
return value can be asserted at the unit level, no DB row, no API response
shape that changed. The signal is geometric: a DOM element must be inside
a viewport at first paint, and an anchor must scroll that element into
view while a sticky header does not occlude it.

**Override (per AGENTS.md §6.1 + protocol.md "regression test must exist"
clause):** unit tests are not appropriate; integration / Testcontainers
tests are not appropriate; the verification lives at the pixel level via
E2E (Playwright) + manual visual check.

---

## Required Test Levels

- [ ] Unit (vitest) — **NOT REQUIRED** — no logic to test
- [ ] Integration (Testcontainers) — **NOT REQUIRED** — no API or DB change
- [ ] E2E (Playwright) — **REQUIRED** — primary verification
- [ ] Manual visual check — **REQUIRED** — screenshots per viewport × theme

---

## E2E Test Plan

### New spec: `apps/e2e/tests/lead-form-within-fold.spec.ts`

**Owner:** TestDesigner (next step).
**Project:** default smoke project (not UAT).

### Viewport matrix

| Viewport | Use case | AC ref |
|---|---|---|
| `1440×900` (Desktop Chrome HiDPI) | Primary spec from issue | AC-1, AC-2 |
| `1280×720` (default Desktop Chrome) | Existing smoke baseline | AC-1, AC-2 |
| `1024×768` (laptop, lower-bound ≥1024) | AC-2 boundary | AC-2 |

### Tests

| # | Test name | Entry point | Exit assertion | AC ref |
|---|---|---|---|---|
| T1 | `1440×900: email input is in initial paint without scrolling` | `page.goto('/')` (no scroll) | `emailInput.boundingBox()` is fully inside `[0, 0, 1440, 900]` | AC-1 |
| T2 | `1280×720: email input is in initial paint without scrolling` | `page.goto('/')` | `emailInput.boundingBox()` is fully inside `[0, 0, 1280, 720]` | AC-1 |
| T3 | `1024×768: email input is in initial paint without scrolling` | `page.goto('/')` | `emailInput.boundingBox()` is fully inside `[0, 0, 1024, 768]` | AC-1, AC-2 |
| T4 | `nav 'Get updates' link is visible and points at /#newsletter` | `page.goto('/')` | `getByRole('link', { name: /get updates/i })` is visible; `href` = `/#newsletter` | AC-3 |
| T5 | `clicking the nav link scrolls the form into view without occluding the email input` | click nav link | after click, `emailInput.boundingBox().y` is `≥ 56` and `< 900 - 40` | AC-2, AC-3 |
| T6 | `POST /api/v1/leads returns 202 for a new email and idempotent on resubmit` | fill `uat-lead-fold@aiqadam.test`, submit; repeat | first response: `{accepted: true}`; second response: identical | AC-4 |
| T7 | `honeypot submission is silently discarded` | set honeypot, fill, submit | success panel shows; Mailpit count for honeypot address is 0 | AC-4 (honeypot) |
| T8 | `form anchor survives scroll-margin-top: 72px` | `page.goto('/#newsletter')` | email input top `≥ 72px` from viewport top | AC-3 (sub-clause) |

### Why this would have FAILED on `main` and PASSES now

| Test | On `main` | On this branch |
|---|---|---|
| T1–T3 (fold) | emailInput at ~1300px → bbox outside `[0,0,W,H]` ⇒ **FAIL** | bbox inside viewport ⇒ **PASS** |
| T4 (nav link) | getByRole resolves 0 elements ⇒ **FAIL** | new nav link present ⇒ **PASS** |
| T5 (nav click) | T4 short-circuits ⇒ **FAIL** | nav click scrolls to anchor with 72px margin ⇒ **PASS** |
| T6, T7 (API + honeypot) | Pass (unchanged) | Pass (unchanged) — confirms no regression |
| T8 (anchor) | no `#newsletter` exists ⇒ **FAIL** | `scroll-margin-top: 72px` honoured ⇒ **PASS** |

6 of 8 tests fail on `main` and pass on the branch — satisfies protocol.md "regression test must exist" requirement.

### Re-run: `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`

**Owner:** TestRunner.
**Scope:** Steps 001, 002, 003, 004 only.

| Step | Verifies |
|---|---|
| 001 — Submit lead | Form reachable without scroll on this branch; POST 202; success panel. |
| 002 — Email in mailpit | Mailpit has verify email. |
| 003 — Verify link click | `/api/v1/leads/verify?token=...` redirects to `/leads/verified`. |
| 004 — Idempotency | Second submission 202; Mailpit unchanged. |

## Manual Visual Check Plan

**Matrix:** 3 viewports × 2 themes = 6 screenshots in `apps/e2e/uat-results/ISS-LEAD-DISC-001/`:

| Viewport | Theme | File |
|---|---|---|
| 1440×900 | light | `1440x900-light.png` |
| 1440×900 | dark | `1440x900-dark.png` |
| 1280×720 | light | `1280x720-light.png` |
| 1280×768 | dark | `1280x768-dark.png` |
| 1024×768 | light | `1024x768-light.png` |
| 1024×768 | dark | `1024x768-dark.png` |

## AC → Test mapping

| AC | Test Level | Test |
|---|---|---|
| AC-1 | E2E + Manual | T1/T2/T3 + 6 screenshots |
| AC-2 | E2E + Manual | T1/T2/T3 + T5 + 1024px screenshots |
| AC-3 | E2E | T4 + T5 + T8 |
| AC-4 | E2E + UAT + Unit | T6/T7 + BP-UAT-013 Steps 001+004 + api unit suite |
| AC-5 | UAT re-run | BP-UAT-013 Steps 001–004 |

## Honesty Disclosures

- Above-the-fold estimate (form ≈ 620–740 px from viewport top) is from stacked-padding sum, NOT measured on a real monitor. T1/T2/T3 bounding-box assertions are the empirical truth.
- T4 uses EN copy `/get updates/i`. If locale list grows beyond RU, TestDesigner must extend selectors.
- Mail-side caveat from ISS-UAT-013-7 (`RESEND_API_KEY` unset) NOT addressed here. Step 002 of BP-UAT-013 will still fail at Mailpit boundary. Out of scope.
- `apps/web-next` not in scope — different surface.

## Gate Result

```yaml
gate_result:
  status: passed
  gate_name: test_strategy
  decided_at: "2026-07-01T20:24:00Z"
  decided_by: test_strategist
  retry_count: 0
  notes: >-
    Strategy complete. Rubric score 0 (UI-only) — unit/integration not appropriate.
    Override documented. One new Playwright spec
    (apps/e2e/tests/lead-form-within-fold.spec.ts) carries the primary regression:
    6 of its 8 tests fail on main and pass on this branch.
    Re-run of BP-UAT-013 Steps 001-004 covers AC-5.
    Manual visual check: 6 screenshots at 3 viewports × 2 themes.
    All 5 ACs mapped to at least one test. No new dependencies.
```
