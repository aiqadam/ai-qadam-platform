# Step 5 — Security Review: FEAT-MIG-004 (AsyncSelect block)

**Reviewer:** SecurityReviewer
**Workflow:** wf-20260623-feat-007
**Files reviewed:**
- `apps/web-next/src/blocks/workspace/AsyncSelect.tsx`
- `apps/web-next/src/blocks/workspace/Form.tsx` — `AsyncSelectField` + `case 'async-select'`
- `apps/web-next/src/blocks/workspace/AsyncSelect.stories.tsx`
- `apps/web-next/src/blocks/workspace/AsyncSelect.test.tsx`

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1: Tenant isolation | ❌ No DB | **N/A** | Pure UI block; no queries |
| INV-2: Secrets by reference | ✅ Yes | **PASS** | No literals matching `password`/`secret`/`apiKey`/`token`/`Bearer`. No network calls. No secrets touched. |
| INV-3: Auth at controller level | ❌ No controller | **N/A** | UI-only block; no auth surface |
| INV-4: Validation at boundaries | ✅ Partial | **PASS** | `loadOptions` is caller-supplied (parameterized: `(input: string) => Promise<AsyncSelectOption[]>`). The `input` string typed by the caller is the external boundary. No raw user HTML reaches the DOM. |
| INV-5: No cross-schema queries | ❌ No queries | **N/A** | No database access |
| INV-6: Rate limiting | ❌ No HTTP | **N/A** | No HTTP endpoints |
| INV-7: CSRF protection | ❌ No server ops | **N/A** | Pure client-side component |
| INV-8: No `dangerouslySetInnerHTML` | ✅ Yes | **PASS** | All user-supplied content (`opt.label`) rendered via JSX expressions `{opt.label}` — React escapes by default. No raw HTML injection found. |
| INV-9: No N+1 queries | ❌ No DB | **N/A** | `loadOptions` is a single async call; no loop-driven queries |
| INV-10: Drizzle parameterization | ❌ No DB | **N/A** | No SQL |
| INV-11: HttpOnly tokens | ❌ No storage | **N/A** | No token storage; `value` is in-memory only |

---

## XSS Deep-Dive (INV-8 Extension)

The only user-supplied data rendered as text is `opt.label` in `OptionItem` and in the story fixtures. React's JSX `{opt.label}` escapes text content — even if a malicious `label` like `<img src=x onerror=alert(1)>` were stored in an option, React would render it as the literal string, not execute it.

The `value` field is used only in `key`, `id` attribute expressions (`${listboxId}-opt-${opt.value}`), and `aria-selected`. All are JSX attribute expressions which React also escapes. No `dangerouslySetInnerHTML` anywhere in the diff.

---

## Other Observations

- **`IslandRoot` wrapper** — Correct per ADR-38 for provider-coupled blocks. Stable React root maintained.
- **`cancelled` flag** — The `useFetchOptions` cleanup function sets `cancelled = true` before calling `setOptions` / `setAsyncState`, preventing state updates on unmounted components. Correct.
- **Error handling** — Error state is caught and surfaced as a user-visible message. No internal details leaked.
- **No `any`** — All params typed via `AsyncSelectProps` / `AsyncSelectOption` interfaces. No `as` casts.
- **No new dependencies** — Confirmed; only existing packages used.
- **`loadOptions` caller-supplied** — The block accepts `loadOptions` as a prop. Callers in the Astro/Next layer own the fetch implementation and are responsible for their own auth, rate limiting, and validation at that layer. This is the correct boundary.

---

## BLOCKER Findings

**None.**

---

## MAJOR Findings

**None.**

---

## Gate Result

```markdown
## Gate Result

gate_result:
  workflow_id: "wf-20260623-feat-007"
  workflow_type: "requirement-development"
  requirement_ref: "FEAT-MIG-004"
  decision: "passed"
  status: passed
  notes: "AsyncSelect is a pure UI block with no direct security surface. All user-supplied data (option labels, values) is escaped via React's default JSX escaping. No dangerouslySetInnerHTML, no secrets, no DB, no auth, no network calls. loadOptions is a caller-supplied parameter with typed inputs — callers in the Astro/Next layer own their own validation and auth. No BLOCKER or MAJOR findings."
  retry_count: 1
  timestamp: "2026-06-23T09:20:00Z"
```