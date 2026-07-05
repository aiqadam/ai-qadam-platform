# 07 — Test Results (TestRunner) — wf-20260701-fix-044 (ISS-LEAD-DISC-001)

**Recorded:** 2026-07-01
**Author:** TestRunner
**Branch:** `fix/ISS-LEAD-DISC-001-lead-form-discoverability`
**Workflow type:** issue-resolution
**Issue:** [ISS-LEAD-DISC-001](../../../issues/ISS-LEAD-DISC-001.md)

> Per AGENTS.md §6.1 + orchestrator pre-flight instructions: the live stack was
> pre-validated in `00-preflight.md`. This agent ran the live tests against that
> stack and did not defer.

---

## Pre-flight (live, just before tests)

| Service | URL | HTTP code | Notes |
|---|---|---|---|
| `apps/web` (Astro) | `http://127.0.0.1:4321/` | **200** | PID 32536, `astro dev --port 4321` (node 24) |
| `apps/api` (NestJS) | `http://127.0.0.1:3000/health` | **0 (no listener on `/health`)** | API process PID 16380 is running (`node dist/main.js`); its configured port is `3000`, NOT `3001` as the orchestrator pre-flight note claimed. Astro proxy `apps/web/astro.config.mjs` is wired to `:3000` (rewrites `/api/*` → `/*` and forwards). All test traffic in this spec uses `baseURL: http://localhost:4321`, so it traverses the Astro proxy, not `:3000` directly. |
| Mailpit | `http://127.0.0.1:8025/` | **200** | (per `00-preflight.md`, container `aiqadam-mailpit` healthy) |
| Directus | `http://127.0.0.1:8200/server/ping` | **200** | (per `00-preflight.md`, container `aiqadam-directus` healthy) |

**API contract probe (Node `fetch`, same transport Playwright uses):**
- `POST http://127.0.0.1:4321/api/v1/leads` (proxy) with
  `{"email":"preflight-debug@example.test","honeypot":"","sourceUrl":"http://127.0.0.1:4321/"}`
  → **500 Internal Server Error**. API stderr (last lines):
  ```
  DirectusError: Directus 400 /users: {"errors":[{"message":"Validation failed for field \"email\".
  Value has to be a valid email address.","extensions":{"field":"email","type":"email","path":[],
  "code":"FAILED_VALIDATION"}}]}
    at LeadsService.insertLead (.../apps/api/dist/modules/leads/leads.service.js:58:25)
  ```
- Direct `/users` round-trip to Directus with `debug@example.com` → **200 OK**
  (returns a freshly-created user row).
- Direct `/users` round-trip to Directus with `debug@aiqadam.test` → **400
  FAILED_VALIDATION** ("Value has to be a valid email address").

**Conclusion of pre-flight:** the stack is up, but the API's leads controller
delegates email validation to Directus, and Directus's built-in `is-email`
validator rejects the `.test` TLD. This is a **known fact** documented in
`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` Retry-2 header:
> Email domain switched from `@aiqadam.test` to `@example.com` for happy path
> because Directus's `is-email` validator rejects the `.test` TLD.

So the new regression spec, which uses `*@aiqadam.test` for its happy-path
and honeypot submissions, will fail at the API boundary — NOT because of a
code regression in the fix, but because of a test-data choice that is
incompatible with the running Directus config. This was not caught in test
design (TestDesigner should have read the BP-UAT-013 note).

---

## Execution Summary

| Suite | Total | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| Type-check (`tsc --noEmit`, `apps/e2e/tsconfig.json`) | 1 | **1** | 0 | 0 | Clean — no errors, no warnings. |
| Biome (`biome check` on the new spec) | 1 | **0** | 1 | 0 | 1 lint error in the spec file (see `## Lint / Format Check`). |
| Unit (`pnpm test`) | n/a | – | – | – | Per `06-test-strategy.md`: unit tests NOT REQUIRED (no logic to test). Not run. |
| Integration (Testcontainers) | n/a | – | – | – | Per `06-test-strategy.md`: NOT REQUIRED (no API/DB change). Not run. |
| E2E — new spec (`lead-form-within-fold.spec.ts`) | 16 invocations (8 tests × 2 projects) | **6** | **10** | 0 | 3 tests × 2 projects fail geometrically (T1/T2/T3). 2 tests × 2 projects fail at API boundary (T6/T7). T4, T5, T8 pass × 2 projects = 6 passing. |
| E2E — BP-UAT-013 re-run (Steps 001–004) | 5 invocations (1 project, 4 steps + 1 screenshot step) | **3** | **2** | 0 | Steps 001, 002-screenshot, 004 pass. Steps 002, 003 fail at Mailpit boundary (RESEND_API_KEY unset — known issue per ISS-UAT-013-7). |
| Manual visual screenshots | 6 (3 viewports × 2 themes) | **6** | – | – | Written to `apps/e2e/uat-results/ISS-LEAD-DISC-001/`. |

---

## Type Check

```bash
cd apps/e2e && pnpm exec tsc --noEmit -p tsconfig.json
```

**Result:** PASS. Zero errors, zero warnings.

---

## Lint / Format Check

```bash
cd apps/e2e && pnpm exec biome check tests/lead-form-within-fold.spec.ts --no-errors-on-unmatched
```

**Result:** FAIL — 1 fixable lint error in the test file (the test, not the
production code):

```
tests/lead-form-within-fold.spec.ts:205:18 lint/style/useTemplate  FIXABLE
× Template literals are preferred over string concatenation.
  203 │       email: HAPPY_EMAIL,
  204 │       honeypot: '',
> 205 │       sourceUrl: BASE_URL + '/',
        │                  ^^^^^^^^^^^^^^
Checked 1 file in 7ms. No fixes applied.
Found 1 error.
```

**Classification:** `failed-retry-tests` — TestDesigner should replace
`BASE_URL + '/'` with `` `${BASE_URL}/` `` (the suggested biome fix).

Per agent instructions ("Do NOT modify any test or production code"), the
file was **not edited** by this agent.

---

## E2E — `apps/e2e/tests/lead-form-within-fold.spec.ts`

### Command

```bash
cd apps/e2e && pnpm exec playwright test \
  --config playwright.config.ts \
  tests/lead-form-within-fold.spec.ts \
  --reporter=list
```

### Per-test result

| Test | Project | Outcome | AC | Notes |
|---|---|---|---|---|
| **T1** email input is inside 1440×900 viewport without scrolling | desktop | ❌ **FAIL** | AC-1 | `expect(box.y + box.height).toBeLessThanOrEqual(900)` → `Received: 1452.98` |
| **T1** | mobile (Pixel 5) | ❌ **FAIL** | AC-1 | Same assertion. Email input `bottom = 1452.98` on a Pixel 5 viewport (height ≈ 851) — way below. |
| **T2** email input is inside 1280×720 viewport without scrolling | desktop | ❌ **FAIL** | AC-1 | `Received: 1452.98`, expected ≤ 720. |
| **T2** | mobile | ❌ **FAIL** | AC-1 | Same. |
| **T3** email input is inside 1024×768 viewport without scrolling | desktop | ❌ **FAIL** | AC-1, AC-2 | `Received: 1355.48`, expected ≤ 768. |
| **T3** | mobile | ❌ **FAIL** | AC-1, AC-2 | Same. |
| **T4** nav 'Get updates' link is visible and points at `/#newsletter` | desktop | ✅ **PASS** | AC-3 | `getByRole('link', { name: /get updates/i })` resolves; `href` = `/#newsletter`. |
| **T4** | mobile | ✅ **PASS** | AC-3 | Same. |
| **T5** clicking the nav link scrolls the form into view without occluding the email input | desktop | ✅ **PASS** | AC-2, AC-3 | After click, `emailInput.boundingBox().y = 73` (≥ 56 sticky nav height) and `y + height = 116` (≤ 680 = 720 − 40). |
| **T5** | mobile | ✅ **PASS** | AC-2, AC-3 | Same (with Pixel 5 viewport). |
| **T6** POST `/api/v1/leads` returns 202 and is idempotent on resubmit | desktop | ❌ **FAIL** | AC-4 | `expect(first.status()).toBe(202)` → `Received: 500`. Cause: Directus rejects `*@aiqadam.test` with 400 FAILED_VALIDATION, which the API re-throws as 500. |
| **T6** | mobile | ❌ **FAIL** | AC-4 | Same. |
| **T7** honeypot submission is silently discarded (no Mailpit row) | desktop | ❌ **FAIL** | AC-4 | First assertion: success panel heading `Check your inbox` never appears (timeout 5 s) because the form submission's POST returns 500, so the form never transitions to success state. Downstream Mailpit assertion is therefore not reached. |
| **T7** | mobile | ❌ **FAIL** | AC-4 | Same. |
| **T8** `/#newsletter` deep-link honours `scroll-margin-top: 72px` | desktop | ✅ **PASS** | AC-3 | After deep-link, `emailInput.boundingBox().y = 81` (≥ 72). |
| **T8** | mobile | ✅ **PASS** | AC-3 | Same. |

**Totals: 6 passed, 10 failed** (out of 16 invocations).

### Empirical measurements (collected by a separate one-shot Playwright probe,
the spec does not assert these directly — included as evidence)

| Element | y (px) | height (px) | bottom (px) | Viewport |
|---|---|---|---|---|
| `<h1>` (hero "UAT Open Event (UZ)") | 434 | 46 | 480 | 1440×900 |
| `<section id="newsletter">` (form section) | **1242** | 536 | 1778 | 1440×900 |
| `<input type="email">` (form's email field) | **1410** | 43 | 1453 | 1440×900 |
| `document.body.scrollHeight` | – | – | 2226 | 1440×900 |

These numbers were collected at `data-theme: light`, `viewport: 1440×900`,
no scroll. They match the test assertions (T1's `Received: 1452.98` is the
email input's `bottom` rounded; T3's `Received: 1355.48` is the same field
at the 1024×768 viewport, slightly different layout).

### Interpretation

The CodeDeveloper fix moved `<LeadCaptureForm client:load />` upward in
`apps/web/src/pages/index.astro`. The DOM tree on this branch shows the form
section IS now positioned between `UpcomingEventsGrid` and the 3-stat strip,
and the `<section>` carries the expected `id="newsletter"` (`sectionCount: 1`).
The nav link "Get updates" / `#newsletter` is present. The anchor deep-link
honours `scroll-margin-top: 72px`.

But: **the hero card in this fixture alone is ~1240 px tall** (it renders the
UAT fixture event "UAT Open Event (UZ)" with its image column at 50 % width
on 1440 px and 100 % on narrower viewports). Because `UpcomingEventsGrid` is
only one short row of upcoming events, the cumulative document height before
the form section is ~1242 px — well past 900. The form is **closer** to the
fold than on `main` (where it was at offset 103 217 / 109 416 bytes ≈ y≈1700+
px in a similarly tall page), but it is **still below the fold** at every
viewport tested.

In other words: **AC-1 (form visible without scrolling on 1440×900) is
empirically NOT satisfied** by this fix. The CodeDeveloper's honesty
disclosure ("I did not empirically measure the form's position on a real
1440×900 monitor. The above-the-fold conclusion is based on the impact
analyzer's stacked-padding estimate") turned out to be load-bearing — the
estimate was off by ~600 px. T1, T2, T3 all fail for the same reason and
should be routed back to CodeDeveloper.

AC-2 is satisfied: from any viewport ≥ 1024 px wide, a visitor reaches the
form with **one** user action (the nav-click in T5 brings the input to
`y = 73`, fully visible). This is the "at most one user action" floor in
the AC text. (Re-reading: AC-2 reads "via at most one user action (scroll
OR click), without needing to discover blank space below a stats panel." The
nav link satisfies this — the visitor does not have to discover blank space,
they click an explicit nav item.)

AC-3 is satisfied (T4, T5, T8 all pass).

AC-4 is **partially verified**: the form-submission endpoint contract is
unchanged from `main` and the regression-spec assertions are correct in
intent, but the spec's choice of `*@aiqadam.test` is rejected by Directus
in the current stack. This is a **test-design defect** — the spec should
use `*@example.com` (matching BP-UAT-013's pattern). The test-design fix
is one line per test (change the domain in `HAPPY_EMAIL` and
`HONEYPOT_EMAIL`). Once that's changed, T6 and T7 will pass on the same
branch.

---

## E2E — BP-UAT-013 Steps 001–004 re-run (AC-5)

### Command

```bash
cd apps/e2e && pnpm exec playwright test \
  --config playwright.uat.config.ts \
  tests/uat/BP-UAT-013-signup.spec.ts \
  -g "Step 001|Step 002|Step 003|Step 004" \
  --reporter=list
```

### Per-step result

| Step | Outcome | Notes |
|---|---|---|
| **Step 001** Submit lead capture form on homepage | ✅ **PASS** (2.3 s) | Form is reachable (BP-UAT-013 uses an `aria-label` selector and explicitly scrolls if needed; the form-submit succeeds with `uat-lead-new@example.com`). This is the boundary AC-5 cares about: BP-UAT-013 Step 001 still passes against the fix branch. |
| **Step 002** Verify email arrives in mail catcher | ❌ **FAIL** (timeout 60 s) | Per orchestrator pre-flight note ("Step 002 will likely fail at Mailpit boundary because RESEND_API_KEY is unset per ISS-UAT-013-7 — acknowledge in your report, do NOT classify as a fix regression") and `06-test-strategy.md` Honesty Disclosures ("Mail-side caveat from ISS-UAT-013-7 (`RESEND_API_KEY` unset) NOT addressed here. Step 002 of BP-UAT-013 will still fail at Mailpit boundary. Out of scope."). API logs `EmailService` warning `[email skipped: RESEND_API_KEY not set]`. Mailpit never receives the verify email. **Not classified as a fix regression.** |
| **Step 002-screenshot** Open mailpit web UI | ✅ **PASS** (805 ms) | Mailpit UI loads. Empty inbox is the visual evidence supporting the Step 002 failure diagnosis. |
| **Step 003** Click verification link | ❌ **FAIL** | `expect(msgs.length).toBeGreaterThan(0)` → `Received: 0`. Cascades from Step 002 — there is no verify email to click. **Not classified as a fix regression** (same root cause). |
| **Step 004** Re-submit the same email (idempotency) | ✅ **PASS** (7.2 s) | Second POST returns 202 (idempotency preserved). AC-5 boundary satisfied. |

**Totals: 3 passed, 2 failed** (5 invocations).

---

## Manual visual screenshots

Script: `apps/e2e/capture-lead-fold-shots.cjs` (created and removed during
this run — see `## Reproduction`). Output directory:
`apps/e2e/uat-results/ISS-LEAD-DISC-001/`.

| Viewport | Theme | File | Visual content (above the fold) |
|---|---|---|---|
| 1440×900 | light | `1440x900-light.png` | nav (with "Get updates"), hero card, **no form** |
| 1440×900 | dark | `1440x900-dark.png` | same; dark theme applied |
| 1280×720 | light | `1280x720-light.png` | nav, hero, **no form** |
| 1280×768 | dark | `1280x768-dark.png` | nav, hero, **no form** |
| 1024×768 | light | `1024x768-light.png` | nav, hero (single-column), **no form** |
| 1024×768 | dark | `1024x768-dark.png` | same; dark theme applied |

**Visual evidence** — every screenshot shows the same view: nav row (now
with the new "Get updates" link), AI Qadam tagline, and the hero card
("UAT Open Event (UZ)" with Register button). The form's email input is
NOT visible in any of the 6 captures; the Astro dev toolbar is visible at
the bottom of each.

These screenshots visually corroborate the empirical measurement above:
the form sits below the visible viewport at every tested breakpoint.

---

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| T1 (1440×900, both projects) | `tests/lead-form-within-fold.spec.ts:70` | `expect(box.y + box.height).toBeLessThanOrEqual(900)` received `1452.98` | **failed-retry-code** — the fix's section reorder did not get the form above the fold; CodeDeveloper must move it higher (e.g. before `UpcomingEventsGrid` or replace the hero card with a more compact variant for the fixture data). |
| T2 (1280×720, both projects) | `tests/lead-form-within-fold.spec.ts:94` | `expect(box.y + box.height).toBeLessThanOrEqual(720)` received `1452.98` | **failed-retry-code** (same root cause as T1). |
| T3 (1024×768, both projects) | `tests/lead-form-within-fold.spec.ts:122` | `expect(box.y + box.height).toBeLessThanOrEqual(768)` received `1355.48` | **failed-retry-code** (same root cause as T1). |
| T6 (POST 202 idempotent, both projects) | `tests/lead-form-within-fold.spec.ts:200` | `expect(first.status()).toBe(202)` received `500` | **failed-retry-tests** — the test uses `*@aiqadam.test`; Directus rejects it with `is-email` FAILED_VALIDATION (consistent with how `BP-UAT-013-signup.spec.ts` already documents this fact in its Retry-2 header). TestDesigner should change the constants `HAPPY_EMAIL` and `HONEYPOT_EMAIL` to use `*@example.com`. |
| T7 (honeypot silently discarded, both projects) | `tests/lead-form-within-fold.spec.ts:221` | First assertion: success panel heading never appears (timeout 5 s) — same root cause as T6 | **failed-retry-tests** (same root cause as T6). |
| Biome: `lint/style/useTemplate` line 205 | `tests/lead-form-within-fold.spec.ts:205` | `BASE_URL + '/'` should be `` `${BASE_URL}/` `` | **failed-retry-tests** — trivial style fix, biome's auto-fix is one line. |
| BP-UAT-013 Step 002 | `tests/uat/BP-UAT-013-signup.spec.ts:214` | Mailpit never receives the verify email — `RESEND_API_KEY` is unset in `apps/api/.env` (ISS-UAT-013-7). | **failed-escalate (out of scope)** — explicitly called out in `06-test-strategy.md` Honesty Disclosures and the orchestrator pre-flight note ("acknowledge in your report, do NOT classify as a fix regression"). Should be tracked under a follow-up workflow tied to ISS-UAT-013-7, not ISS-LEAD-DISC-001. |
| BP-UAT-013 Step 003 | `tests/uat/BP-UAT-013-signup.spec.ts:239` | Cascades from Step 002. | **failed-escalate (out of scope)** — same root cause. |

---

## Flaky Tests

None observed. Both projects' T1–T3 failures had identical `Received` values
across retries (the geometry is deterministic for this fixture data).

---

## Reproduction (commands the next agent can re-run)

> These commands were used to produce this report. The temporary helper
> scripts (`capture-lead-fold-shots.cjs`, `measure-form.cjs`) were removed
> after the run; they are documented here for re-execution.

```bash
# 0. Pre-flight
curl.exe -s -o /dev/null -w "web:%{http_code}¥n"      http://127.0.0.1:4321/
curl.exe -s -o /dev/null -w "api-3000:%{http_code}¥n" http://127.0.0.1:3000/health   # 0 — no /health endpoint
curl.exe -s -o /dev/null -w "mailpit:%{http_code}¥n"   http://127.0.0.1:8025/
curl.exe -s -o /dev/null -w "directus:%{http_code}¥n"  http://127.0.0.1:8200/server/ping

# 1. Type-check
cd apps/e2e && pnpm exec tsc --noEmit -p tsconfig.json

# 2. Biome
cd apps/e2e && pnpm exec biome check tests/lead-form-within-fold.spec.ts --no-errors-on-unmatched

# 3. New regression spec (default Playwright config, NOT uat)
cd apps/e2e && pnpm exec playwright test ¥
  --config playwright.config.ts ¥
  tests/lead-form-within-fold.spec.ts ¥
  --reporter=list

# 4. BP-UAT-013 Steps 001–004 re-run (AC-5)
cd apps/e2e && pnpm exec playwright test ¥
  --config playwright.uat.config.ts ¥
  tests/uat/BP-UAT-013-signup.spec.ts ¥
  -g "Step 001|Step 002|Step 003|Step 004" ¥
  --reporter=list
```

The capture script (run once and removed) — kept here verbatim for
re-execution:

```javascript
// apps/e2e/capture-lead-fold-shots.cjs
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const OUT = path.resolve(__dirname, 'uat-results', 'ISS-LEAD-DISC-001');
const BASE = process.env.UAT_BASE_URL ?? 'http://127.0.0.1:4321';
const matrix = [
  { name: '1440x900-light', viewport: { width: 1440, height: 900 }, theme: 'light' },
  { name: '1440x900-dark',  viewport: { width: 1440, height: 900 }, theme: 'dark' },
  { name: '1280x720-light', viewport: { width: 1280, height: 720 }, theme: 'light' },
  { name: '1280x768-dark',  viewport: { width: 1280, height: 768 }, theme: 'dark' },
  { name: '1024x768-light', viewport: { width: 1024, height: 768 }, theme: 'light' },
  { name: '1024x768-dark',  viewport: { width: 1024, height: 768 }, theme: 'dark' },
];
(async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const m of matrix) {
    const ctx = await browser.newContext({ viewport: m.viewport });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), m.theme);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, m.name + '.png'), fullPage: false });
    await ctx.close();
  }
  await browser.close();
})();
```

---

## Honesty Disclosures

1. **No code or test was modified by this agent.** All failure data above is
   from running the spec file and the BP-UAT-013 step selector as written by
   the TestDesigner and previous workflows. The TestRunner classification
   follows the matrix in `.copilot/agents/test-runner.md`.
2. **The orchestrator pre-flight (`00-preflight.md`) stated `apps/api` was
   "assumed up" on port 3001.** It is in fact up on **port 3000** (env
   `PORT=3000`), and `apps/web/astro.config.mjs` proxies `/api/*` to it. The
   test spec uses `baseURL: http://localhost:4321` (the Astro proxy), so the
   port mismatch did not affect the test outcome — but the pre-flight note
   was inaccurate and should be corrected in `00-preflight.md` for the next
   workflow that hits the API directly.
3. **The `test-directus-body.json` file created during pre-flight probing
   was removed**; the temporary `capture-lead-fold-shots.cjs` and
   `measure-form.cjs` helper scripts were also removed. The only persistent
   additions from this run are: the 6 PNG files under
   `apps/e2e/uat-results/ISS-LEAD-DISC-001/`, the auto-generated failure
   screenshots under `apps/e2e/test-results/`, and this report.
4. **The orchestrator pre-flight instructions explicitly told me NOT to defer
   because "the stack is incomplete."** Per AGENTS.md §6.1 I report the live
   result rather than defer; the API's behaviour against `.test` emails is
   real, not assumed. The `*@example.com` fix in the spec is a TestDesigner
   one-liner — calling it out as a deferral-with-followup would be
   dishonest bookkeeping for a known one-line fix.
5. **The visual evidence (6 PNGs) corroborates the empirical measurement.**
   None of the 6 viewport × theme combinations shows the email input above
   the fold. AC-1 is empirically unmet.
6. **AC-2 is satisfied via the nav link** (T5 passes on both projects), even
   though AC-1 is not. Re-reading the AC text in the issue file confirms
   these are distinct ACs; a reviewer should decide whether "visible on
   first paint" is a blocker for this fix or whether "reachable in one
   click" is sufficient.

---

## Gate Result

```yaml
gate_result:
  status: failed
  gate_name: test_runner
  decided_at: "2026-07-01T20:35:00Z"
  decided_by: test_runner
  retry_count: 0
  notes: >-
    Type-check clean. Biome dirty (1 useTemplate lint in the spec).
    New regression spec (apps/e2e/tests/lead-form-within-fold.spec.ts):
    6 passed / 10 failed (out of 16 invocations across 2 projects).
      * T1, T2, T3 (6 fails) — geometry: email input bottom at y≈1452px on
        1440x900 / 1280x720; ≈1355px on 1024x768. The fix's section
        reorder did not get the form above the fold because the hero
        card alone is ~1240px tall. Route to CodeDeveloper — the impact
        analysis estimate was off by ~600px.
      * T6, T7 (4 fails) — API returns 500 because Directus's is-email
        validator rejects the .test TLD. The spec should use *@example.com
        (matching BP-UAT-013's already-documented pattern). Route to
        TestDesigner.
      * T4, T5, T8 (6 passes) — nav link present and correct; scroll
        behaviour and scroll-margin-top honour the 72px threshold.
    BP-UAT-013 Steps 001, 002-screenshot, 004 pass (3/5). Steps 002, 003
    fail at Mailpit boundary because RESEND_API_KEY is unset (ISS-UAT-013-7);
    this is out-of-scope and explicitly acknowledged in 06-test-strategy.md
    and the orchestrator pre-flight — NOT a fix regression.
    Manual visual screenshots: 6 PNGs written to
    apps/e2e/uat-results/ISS-LEAD-DISC-001/, all confirm form is below
    the fold visually.

    AC summary (per ISS-LEAD-DISC-001 §"Acceptance criteria"):
      AC-1 (visible on 1440x900 without scrolling): FAILED (empirical)
      AC-2 (one click or scroll from any >=1024px viewport): PASSED via nav
      AC-3 (nav entry + #newsletter anchor): PASSED
      AC-4 (POST 202 + idempotent + honeypot): UNVERIFIED (T6/T7 fail on
            test-data incompatibility with Directus, not on code)
      AC-5 (BP-UAT-013 Steps 001-004): PARTIAL — 001/004 PASS; 002/003
            fail at Mailpit boundary (out of scope per 06-strategy)

    Classification:
      failed-retry-code  — T1/T2/T3 (form not above fold) → CodeDeveloper
      failed-retry-tests — T6/T7 (uses .test TLD rejected by Directus)
                           + biome useTemplate at line 205 → TestDesigner
      failed-escalate    — BP-UAT-013 Steps 002/003 (RESEND_API_KEY unset,
                           tracked separately under ISS-UAT-013-7)

    AC-1 is empirically unmet. The CodeDeveloper's own honesty disclosure
    ("I did not empirically measure the form's position on a real 1440x900
    monitor") was load-bearing. Recommend CodeDeveloper move the form
    BEFORE UpcomingEventsGrid (or replace the hero card with a compact
    summary card) and re-run this spec.
```
