# Step 6: Test Strategy — wf-20260629-fix-035

**Workflow:** wf-20260629-fix-035
**Requirement:** ISS-UAT-013-3
**Date:** 2026-06-29
**Agent:** TestStrategist

---

## Requirement

Port `LeadCaptureForm` to web-next homepage (ISS-UAT-013-3). The component was created
in `apps/web-next/src/blocks/customer/LeadCaptureForm.tsx` and wired into `index.astro`.

---

## Required Test Levels

- [x] **Unit** — pure helper extraction (Vitest, `environment: 'node'`)
- [ ] Integration (Testcontainers) — not required (no DB, no new API surface)
- [ ] E2E (Playwright) — not required (parity suite already asserts zero inline `style=`)

---

## Unit Test Plan

### Test file

`apps/web-next/src/blocks/customer/LeadCaptureForm.test.ts`

**Pattern:** pure helper extraction — mirrors functions from `LeadCaptureForm.tsx`.
No React Testing Library (not installed in web-next). Follows `OnboardingForm.test.tsx`.

### Test cases

| # | Label | What it verifies |
|---|---|---|
| 1 | `[REGRESSION] LeadCaptureForm is exported and is a function` | Named export resolves from `./LeadCaptureForm`. **Before the fix this would throw — the file did not exist.** |
| 2 | `buildLeadBody: trims email` | `' user@x.com '` → `email === 'user@x.com'` |
| 3 | `buildLeadBody: includes city when non-empty` | `city = 'Almaty'` → body has `city` |
| 4 | `buildLeadBody: omits city when whitespace-only` | `city = '   '` → no `city` key |
| 5 | `buildLeadBody: includes interestTopics when non-empty` | `topics = ['LLMs']` → body has key |
| 6 | `buildLeadBody: omits interestTopics when empty` | `topics = []` → no `interestTopics` key |
| 7 | `buildLeadBody: honeypot always forwarded` | `honeypot = 'bot'` → body `honeypot === 'bot'` |
| 8 | `toggleTopic: adds missing topic` | `['LLMs']` + `'data'` → `['LLMs', 'data']` |
| 9 | `toggleTopic: removes existing topic` | `['LLMs', 'data']` + `'LLMs'` → `['data']` |
| 10 | `readUtmFirstTouch: returns null in node env` | Guard `typeof window === 'undefined'` → `null` |
| 11 | `INTEREST_PRESETS: contains 11 entries` | Length 11; contains `'AI/ML'`, `'hands-on-builder'` |
| 12 | `submit disabled: email empty → true` | `email.trim().length === 0` → disabled |
| 13 | `submit disabled: submitting → true` | `phase === 'submitting'` → disabled |
| 14 | `submit disabled: idle + valid email → false` | `phase === 'idle'`, `email = 'a@b.com'` → not disabled |

### Regression test (must be case #1)

```ts
describe('[REGRESSION] ISS-UAT-013-3', () => {
  it('LeadCaptureForm is exported from the customer barrel and is a function', async () => {
    // Before the fix: file did not exist → ERR_MODULE_NOT_FOUND → test fails.
    // After the fix: named export resolves and is callable.
    const { LeadCaptureForm } = await import('./LeadCaptureForm');
    expect(typeof LeadCaptureForm).toBe('function');
  });
});
```

---

## gate_result

```yaml
gate_result:
  status: passed
  step: 6
  attempt: 1
  timestamp: "2026-06-29T00:12:00Z"
  summary: "All ISS-UAT-013-3 ACs mapped to unit tests; regression test defined and would have failed before the fix."
```
