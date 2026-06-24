# Test Strategy — FR-MIG-031

**Workflow:** wf-20260625-feat-025
**Agent:** TestStrategist
**Date:** 2026-06-25

---

## Requirement

**FEAT-WEB-031** — Production cutover prep for `apps/web-next/`:

- **Step 1 (cookie parity):** Middleware accepts both `aiqadam-refresh` (canonical,
  post-cutover) and `aiqadam-next-refresh` (legacy, 24h overlap). The
  `REFRESH_COOKIE_NEXT` constant value is now `'aiqadam-refresh'`; `REFRESH_COOKIE_LEGACY`
  is `'aiqadam-next-refresh'`.

- **Step 2 (SEO re-enablement):** `<meta name="robots" content="noindex,nofollow">` removed
  from `Layout.astro`; `robots.txt` disallow-all replaced with permissive ruleset; `PageHead.astro`
  now emits OG/Twitter cards, `<link rel="canonical">`, Plausible analytics, Google Fonts preconnect;
  default title updated to `'AI Qadam'`.

Acceptance criteria to cover: **AC-1 through AC-8** (AC-9 is a manual smoke gate, not automated).

---

## Rubric Score

| Criterion | Applicable? | Points |
|---|---|---|
| Touches tenant-scoped data | No | 0 |
| New API endpoint | No | 0 |
| Business rule with edge cases (capacity, waitlist, dates) | No | 0 |
| Cross-module service call | No — existing calls, no new paths | 0 |
| New database query | No | 0 |
| Pure function / utility | `ssrAuthBootstrap` + `hasRefresh` — pure logic with inputs/outputs | 0 |
| UI-only change (no logic) | Step 2 is HTML/head — no logic | 0 |

**Total score: 0**

**Justification:** The middleware change is a 2-constant flip — the `hasRefresh` OR-check
already exists and is not modified. No DB queries are introduced. No new module boundaries are
crossed. The SEO changes are HTML meta additions to a static component; there is no business
logic involved. Integration tests (Testcontainers) are not warranted. E2E Playwright
assertions on `robots.txt` and rendered `<head>` content are appropriate for the SEO/robots
half, but because the existing E2E suite already runs against a live dev server (not
Testcontainers), they are classified as **E2E** (Playwright static-response + DOM
assertions).

---

## Required Test Levels

- [x] **Unit** — `ssrAuthBootstrap` / `hasRefresh` cookie-detection logic (Vitest)
- [ ] Integration (Testcontainers) — NOT required (score < 4, no DB)
- [x] **E2E (Playwright)** — `robots.txt` static file + rendered `<head>` SEO assertions

---

## Existing Test Infrastructure

### Unit tests (Vitest)

- Config: `apps/web-next/vitest.config.ts` — `environment: 'node'`, glob `src/**/*.test.{ts,tsx}`.
- Pattern: re-implement the function under test locally (avoids Astro/ESM import issues with
  Vitest); inject mocks via `vi.fn()`; AAA pattern, one `describe` per function.
- Reference: `apps/web-next/src/lib/api-ssr.test.ts` — canonical example (mocks `fetch` as
  `vi.fn()`, passes it explicitly to helper functions under test).
- **No existing middleware test file.** `apps/web-next/src/middleware.test.ts` must be created
  by TestDesigner.

### E2E tests (Playwright)

- Specs live in `apps/e2e/tests/`.
- `smoke-public.spec.ts` already has:
  - `robots.txt has Sitemap reference + disallows /me + /admin` (lines 89–99) — currently
    checks `Disallow: /me` and `Disallow: /admin/` but **not** `Disallow: /workspace/`.
  - `homepage loads + has nav + has Plausible script` (lines 12–36) — checks for
    `link[rel="canonical"]` and `meta[name="twitter:card"]`, but the Plausible script selector
    (`script[src*="analytics.aiqadam.org/js/script.js"]`) is stale: `PageHead.astro` now
    loads from `plausible.io/js/script.js`, not a self-hosted endpoint. **This existing test
    will break** and must be updated by TestDesigner.
- `smoke-workspace.spec.ts` already has:
  - `robots.txt disallows /workspace/` (lines 33–38) — already correct, covers the
    `Disallow: /workspace/` assertion. No change needed.
- No parity spec currently checks noindex removal — the parity suite (`parity-cross-cutting.spec.ts`)
  does not inspect `<meta name="robots">`. A new assertion is needed.

---

## Unit Test Plan

Target file: `apps/web-next/src/middleware.test.ts` (new file)
Test framework: Vitest
Pattern: re-implement `ssrAuthBootstrap` logic locally (same approach as `api-ssr.test.ts`)
to sidestep `astro:middleware` ESM import issues. Alternatively, extract `hasRefresh` and
`ssrAuthBootstrap` into a testable helper module; either approach is acceptable — TestDesigner
to choose based on import feasibility.

| Target | Happy Path | Failure Paths |
|---|---|---|
| `REFRESH_COOKIE_NEXT` constant value | Equals `'aiqadam-refresh'` | — |
| `REFRESH_COOKIE_LEGACY` constant value | Equals `'aiqadam-next-refresh'` | — |
| `hasRefresh` — canonical cookie present | Returns `true` when `aiqadam-refresh=<val>` in cookie header | Returns `false` when cookie header is empty |
| `hasRefresh` — legacy cookie present | Returns `true` when `aiqadam-next-refresh=<val>` in cookie header | — |
| `hasRefresh` — host-legacy cookie present | Returns `true` when `__Host-aiqadam-refresh=<val>` in cookie header | — |
| `hasRefresh` — both cookies present | Returns `true` when both `aiqadam-refresh` and `aiqadam-next-refresh` are present | — |
| `ssrAuthBootstrap` — canonical cookie | Calls `/v1/auth/refresh` and returns `{ auth: SsrAuth, setCookie }` | Returns `{ auth: null, setCookie: null }` when refresh endpoint returns non-2xx |
| `ssrAuthBootstrap` — legacy cookie (overlap) | Calls `/v1/auth/refresh` (24h overlap path) and returns populated auth | Returns `{ auth: null, setCookie: null }` on network error (catch path) |
| `ssrAuthBootstrap` — no cookies | Returns `{ auth: null, setCookie: null }` immediately (no fetch call) | — |

### Detailed unit test cases

```
describe('Cookie constants — post-cutover values', () => {
  it('REFRESH_COOKIE_NEXT equals aiqadam-refresh')
  it('REFRESH_COOKIE_LEGACY equals aiqadam-next-refresh')
})

describe('hasRefresh — cookie detection', () => {
  it('returns true when only aiqadam-refresh cookie is present')        // AC-1, AC-4
  it('returns true when only aiqadam-next-refresh cookie is present')   // AC-2, AC-4
  it('returns true when only __Host-aiqadam-refresh cookie is present') // legacy host
  it('returns true when both aiqadam-refresh and aiqadam-next-refresh are present')
  it('returns false when cookie header is empty string')                 // AC-3
  it('returns false when cookie header contains unrelated cookies only')
})

describe('ssrAuthBootstrap — auth bootstrap', () => {
  it('calls /v1/auth/refresh when aiqadam-refresh cookie present')      // AC-1
  it('calls /v1/auth/refresh when aiqadam-next-refresh cookie present') // AC-2
  it('returns auth: null with no fetch when no refresh cookie present') // AC-3
  it('returns auth: null when /v1/auth/refresh returns non-2xx')
  it('returns auth: null when /v1/auth/me returns non-2xx')
  it('returns auth: null on network error (fetch throws)')
  it('propagates set-cookie from refresh response')
})
```

**Implementation note for TestDesigner:** `middleware.ts` imports `defineMiddleware` from
`astro:middleware`. This cannot be imported in a plain Vitest `node` environment. The
recommended approach (matching `api-ssr.test.ts`) is to locally re-declare the testable
sub-functions (`hasRefresh` check and `ssrAuthBootstrap`) with the same logic, or to export
them from `middleware.ts` under a `// @vitest-environment` comment block. Check whether
`astro:middleware` can be mocked with `vi.mock('astro:middleware', () => ({ defineMiddleware: (fn) => fn }))`.
If that stub works, import directly; otherwise re-implement locally.

---

## Integration Test Plan

Not required. Score < 4. The middleware makes HTTP calls to the API; these are covered by
mocking `fetch` in unit tests. No DB-touching paths are introduced.

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| (none required) | — | — |

---

## E2E Test Plan

All E2E tests live in `apps/e2e/tests/`. Tests run against the live dev server.

| User Flow | File | Entry Point | Exit Assertion | New/Update? |
|---|---|---|---|---|
| No noindex on public pages | `smoke-public.spec.ts` | GET `/` | `meta[name="robots"]` with `noindex` content not present in DOM | **New assertion** (add to existing homepage test or new test) |
| robots.txt — workspace disallowed | `smoke-workspace.spec.ts` | GET `/robots.txt` | Body contains `Disallow: /workspace/` (before `Allow: /`) | Already exists — no change needed |
| robots.txt — /me/ disallowed | `smoke-public.spec.ts` | GET `/robots.txt` | Body contains `Disallow: /me/` | **Update existing test** — rename "disallows /me + /admin" to "disallows /workspace/ and /me/"; remove `/admin/` assertion (not in new robots.txt); add `/workspace/` |
| robots.txt — Allow / present | `smoke-public.spec.ts` | GET `/robots.txt` | Body contains `Allow: /` | **New assertion** in existing robots.txt test |
| robots.txt — rule order | `smoke-public.spec.ts` | GET `/robots.txt` | `Disallow:` lines appear before `Allow: /` line in the body string | **New assertion** |
| OG tags on homepage | `smoke-public.spec.ts` | GET `/` | `og:title`, `og:description`, `og:image`, `og:type=website` present | **New/extend** existing homepage test |
| Twitter card on homepage | `smoke-public.spec.ts` | GET `/` | `meta[name="twitter:card"][content="summary_large_image"]` present | Already partially asserted — verify selector still matches |
| Canonical link on homepage | `smoke-public.spec.ts` | GET `/` | `link[rel="canonical"]` has count 1 and href starts with `https://` | Already asserted (`toHaveCount(1)`) — add href check |
| Plausible script on homepage | `smoke-public.spec.ts` | GET `/` | `script[src*="plausible.io/js/script.js"]` has `data-domain="aiqadam.org"` | **Update existing** — selector must change from `analytics.aiqadam.org` to `plausible.io` |
| Default title is "AI Qadam" on homepage | `smoke-public.spec.ts` | GET `/` | `<title>` text equals `AI Qadam` | **New assertion** |
| ogImage defaults to brand mark when no prop | `smoke-public.spec.ts` | GET `/` | `meta[property="og:image"]` content contains `/brand/aiqadam-mark.png` | **New assertion** |

### Existing tests that need updates

1. **`smoke-public.spec.ts` — Plausible script assertion (line 21):**
   Current selector: `script[src*="analytics.aiqadam.org/js/script.js"]`
   Required: `script[src*="plausible.io/js/script.js"]`
   This test will **fail** against the updated `PageHead.astro` without this fix.

2. **`smoke-public.spec.ts` — robots.txt assertion (lines 89–99):**
   Currently expects `Disallow: /admin/` which is NOT in the new `robots.txt`.
   Must be updated to expect `Disallow: /workspace/` instead.
   The `/me` assertion remains valid (`Disallow: /me/` is in the new file).

---

## Acceptance Criteria to Test Mapping

| AC | Test Level | Test Description | File |
|---|---|---|---|
| AC-1: `aiqadam-refresh` cookie triggers SSR auth | Unit | `ssrAuthBootstrap` with canonical cookie calls `/v1/auth/refresh` and returns auth | `middleware.test.ts` (new) |
| AC-2: `aiqadam-next-refresh` cookie also triggers SSR auth | Unit | `ssrAuthBootstrap` with legacy cookie calls `/v1/auth/refresh` and returns auth | `middleware.test.ts` (new) |
| AC-3: Neither cookie → `auth: null` | Unit | `ssrAuthBootstrap` with empty cookies returns null immediately | `middleware.test.ts` (new) |
| AC-4: Constant values correct post-cutover | Unit | `REFRESH_COOKIE_NEXT === 'aiqadam-refresh'`; `REFRESH_COOKIE_LEGACY === 'aiqadam-next-refresh'`; both present in `hasRefresh` | `middleware.test.ts` (new) |
| AC-5: No noindex meta on rendered pages | E2E | `meta[name="robots"]` with `noindex` content not present on `/` DOM | `smoke-public.spec.ts` (new assertion) |
| AC-6: `robots.txt` does not disallow-all; permits crawling | E2E | `robots.txt` body does NOT contain `Disallow: /` (the old disallow-all rule); contains `Allow: /` | `smoke-public.spec.ts` (update existing test) |
| AC-7: `<PageHead>` renders canonical, OG, Twitter, Plausible, preconnect | E2E | Assertions on `link[rel="canonical"]`, `og:title`, `og:description`, `og:image`, `twitter:card`, `script[src*="plausible.io"]` | `smoke-public.spec.ts` (update + extend) |
| AC-8: Default title is `'AI Qadam'` | E2E | `<title>` text on `/` equals `AI Qadam` (not `AI Qadam (next)`) | `smoke-public.spec.ts` (new assertion) |
| AC-9: No session disruption before FQDN flip | Manual / smoke | Human verification on `next.aiqadam.org` post-deploy — not automated; 24h overlap window holds by unit test coverage of `hasRefresh` | N/A — manual gate |

---

## Notes for TestDesigner

### Priority order

1. **Update `smoke-public.spec.ts` first** — the Plausible selector mismatch on line 21 is a
   hard breakage. Fix it before adding new assertions.
2. **Create `middleware.test.ts`** — new file at `apps/web-next/src/middleware.test.ts`.
   Follow the `api-ssr.test.ts` pattern exactly (local re-implementation of functions,
   `vi.fn()` mock for `fetch`). Check `vi.mock('astro:middleware', ...)` stub first.
3. **Update robots.txt assertions** — remove `/admin/` expectation, add `/workspace/` and
   `Allow: /` expectations, add rule-order assertion.
4. **Add remaining E2E assertions** — noindex absence, OG tags, default title, brand-mark ogImage.

### What NOT to test

- `signed-out.astro` cookie clear order — this is client-side JS that fires on a logout page;
  it has no observable browser-test surface (the cookies are HttpOnly and not readable via JS)
  and the clear order is confirmed correct by code inspection in the security review. Not
  testable at unit or E2E level.
- The FQDN flip (Step 5) — permanently human-only; out of scope.
- Google Fonts preconnect links — these are pure `<link rel="preconnect">` hints that carry no
  content; asserting their presence is low-value. Skip.

---

## Gate Result

gate_result:
  status: passed
  summary: "Test strategy is complete: all 8 automatable ACs are mapped to either new Vitest unit tests (middleware cookie logic, AC-1 through AC-4) or Playwright E2E assertions (SEO/robots, AC-5 through AC-8); rubric score is 0 (unit-only), but E2E assertions for static-file and DOM checks are warranted given the existing Playwright infrastructure."
  findings:
    - "No existing middleware test file — apps/web-next/src/middleware.test.ts must be created by TestDesigner."
    - "smoke-public.spec.ts line 21 Plausible script selector is stale (analytics.aiqadam.org vs plausible.io) — must be fixed or this test will fail in CI against the updated PageHead.astro."
    - "smoke-public.spec.ts lines 89-99 robots.txt test expects Disallow: /admin/ which is absent from the new robots.txt — must be removed and Disallow: /workspace/ added."
    - "smoke-workspace.spec.ts already correctly asserts Disallow: /workspace/ — no change needed there."
    - "AC-9 (session continuity on next.aiqadam.org pre-flip) is a manual smoke gate; hasRefresh unit tests provide the machine-verifiable confidence."
    - "Integration tests (Testcontainers) are not required — score 0, no DB, no new API surface."
    - "TestDesigner should verify vi.mock('astro:middleware') viability before choosing re-implementation vs direct import strategy."
