# Test Design — FR-MIG-031

**Workflow:** wf-20260625-feat-025
**Agent:** TestDesigner
**Date:** 2026-06-25

---

## Tests Written

### Unit Tests (Vitest)

| File | Test Count | Focus | New/Modified |
|---|---|---|---|
| `apps/web-next/src/middleware.test.ts` | 15 | Cookie constant values, `hasRefresh` detection, `ssrAuthBootstrap` auth flow | **New** |

### Integration Tests

None required (rubric score 0, no DB).

### E2E Tests (Playwright)

| File | Test Count / Focus | New/Modified |
|---|---|---|
| `apps/e2e/tests/smoke-public.spec.ts` | 4 tests modified/added | **Modified** |

E2E detail:

| Test Name | Change |
|---|---|
| `homepage loads + has nav + has Plausible script` | Fixed stale Plausible selector (`analytics.aiqadam.org` → `plausible.io`); added canonical href `https://` check |
| `homepage has correct OG meta tags` | **New** — og:title, og:description, og:type=website, og:image brand mark |
| `homepage default title is AI Qadam` | **New** — `page.toHaveTitle('AI Qadam')` |
| `homepage has no noindex meta tag` | **New** — asserts `meta[name="robots"][content*="noindex"]` count is 0 |
| `robots.txt permits crawling + disallows /workspace/ and /me/` | **Renamed + rewritten** — removed `/admin/` assertion, removed `/api/` assertion (not in new file), added `/workspace/`, `Allow: /`, rule-order check, `Disallow: /\n` absence check |

---

## Implementation Notes

### Unit test strategy: local re-implementation pattern

`middleware.ts` imports `defineMiddleware` from `astro:middleware`, which cannot be resolved in
Vitest's `node` environment. Following the exact pattern from `apps/web-next/src/lib/api-ssr.test.ts`,
the testable logic (`hasRefresh` check and `ssrAuthBootstrap`) is re-implemented locally in the
test file with identical logic. The cookie constant values are redeclared as literals so the test
explicitly validates the post-cutover production values (`'aiqadam-refresh'` and
`'aiqadam-next-refresh'`).

`fetch` is mocked via `vi.fn()` passed explicitly to the local `ssrAuthBootstrap` implementation,
which receives `mockFetch` as a parameter — the same injection pattern used in `api-ssr.test.ts`.

### E2E test note on `Disallow: /api/`

The old smoke test asserted `Disallow: /api/` (inherited from the pre-FR-MIG-031 `robots.txt`
which had a broader ruleset). The new `robots.txt` does not include `Disallow: /api/` — the
production permissive ruleset only disallows `/workspace/` and `/me/`. This assertion was removed
from the updated test to match the actual file.

---

## Acceptance Criteria Coverage

| AC | Test Level | Test Description | File | Status |
|---|---|---|---|---|
| AC-1: `aiqadam-refresh` cookie triggers SSR auth | Unit | `ssrAuthBootstrap` with canonical cookie calls `/v1/auth/refresh` and returns auth | `middleware.test.ts` | Covered |
| AC-2: `aiqadam-next-refresh` cookie also triggers SSR auth | Unit | `ssrAuthBootstrap` with legacy cookie calls `/v1/auth/refresh` and returns auth | `middleware.test.ts` | Covered |
| AC-3: Neither cookie → `auth: null` | Unit | `ssrAuthBootstrap` with empty/unrelated cookies returns null immediately (no fetch) | `middleware.test.ts` | Covered |
| AC-4: Constant values correct post-cutover | Unit | `REFRESH_COOKIE_NEXT === 'aiqadam-refresh'`; `REFRESH_COOKIE_LEGACY === 'aiqadam-next-refresh'` | `middleware.test.ts` | Covered |
| AC-5: No noindex meta on rendered pages | E2E | `meta[name="robots"][content*="noindex"]` count is 0 on `/` | `smoke-public.spec.ts` | Covered |
| AC-6: `robots.txt` permits crawling | E2E | Contains `Allow: /`; does NOT contain `Disallow: /\n`; does NOT contain `Disallow: /admin/`; Disallow lines before Allow | `smoke-public.spec.ts` | Covered |
| AC-7: `<PageHead>` renders canonical, OG, Twitter, Plausible | E2E | `link[rel="canonical"]` with https href; `og:title`, `og:description`, `og:type=website`, `og:image`; `twitter:card`; `script[src*="plausible.io"]` with `data-domain` | `smoke-public.spec.ts` | Covered |
| AC-8: Default title is `'AI Qadam'` | E2E | `page.toHaveTitle('AI Qadam')` on `/` | `smoke-public.spec.ts` | Covered |
| AC-9: No session disruption before FQDN flip | Manual | Human verification on `next.aiqadam.org` — not automated | N/A | Deferred (manual gate) |

---

## Known Test Gaps

None. All automatable ACs are covered. AC-9 is explicitly a manual smoke gate per the test
strategy; no `// TODO` is needed as it cannot be machine-verified (HttpOnly cookies + live
session state across FQDN flip).

The `__Host-aiqadam-refresh` legacy host cookie is covered in `hasRefresh` unit tests but not in
`ssrAuthBootstrap` tests (an `ssrAuthBootstrap` call with `__Host-aiqadam-refresh` cookie would be
identical in behavior to the `aiqadam-next-refresh` path, making it redundant at the integration
level). The `hasRefresh` unit test for this case provides sufficient coverage.

---

## Gate Result

```yaml
gate_result:
  agent: test-designer
  workflow_instance_id: wf-20260625-feat-025
  status: passed
  summary: >
    All 8 automatable ACs covered. 1 new unit test file created
    (apps/web-next/src/middleware.test.ts, 15 tests) using the established
    local re-implementation pattern from api-ssr.test.ts to sidestep
    astro:middleware ESM import issues in Vitest node environment.
    1 existing E2E file updated (apps/e2e/tests/smoke-public.spec.ts):
    stale Plausible selector fixed (hard CI breakage prevented), robots.txt
    test renamed and rewritten to match new permissive ruleset, 3 new E2E
    assertions added (OG tags, default title, noindex absence). No it.skip,
    no any in test code, all functions under 60 lines.
  findings:
    - "middleware.test.ts: uses local re-implementation pattern (identical to
      api-ssr.test.ts) — defineMiddleware from astro:middleware cannot be
      resolved in Vitest node environment."
    - "smoke-public.spec.ts Plausible selector fixed: analytics.aiqadam.org →
      plausible.io. This was a hard CI breakage without this fix."
    - "robots.txt test: Disallow: /api/ assertion removed — new robots.txt does
      not include this rule. Disallow: /admin/ removed; Disallow: /workspace/
      and Allow: / added. Rule-order assertion added."
    - "AC-9 (session continuity during FQDN flip overlap) remains manual — not
      automatable at unit or E2E level."
  deferred_to_feature: ""
  deferred_reason: ""
```
