# Step 2: Impact Analysis — wf-20260629-fix-035

**Workflow:** wf-20260629-fix-035
**Requirement:** ISS-UAT-013-3
**Date:** 2026-06-29
**Analyst:** ImpactAnalyzer

---

## Validated Requirement

**ISS-UAT-013-3 — FIX-WEB-NEXT-001: Port `LeadCaptureForm` to web-next homepage**

`apps/web-next/src/pages/index.astro` renders only `<Hero>` with no lead capture form.
An anonymous visitor has no way to submit their email and interests — AC-1 of FR-USR-001
is not met on the web-next surface. This blocks the `apps/web` → `apps/web-next` cutover
for the homepage.

### Root-cause correction (issue description was inaccurate)

The issue stated "The `<LeadCaptureForm>` block exists in
`apps/web-next/src/blocks/customer/` (the import path resolves)" — **this is incorrect**.
A directory listing of `apps/web-next/src/blocks/customer/` shows 21 blocks; none is
`LeadCaptureForm`. The component must be **created** (ported from the legacy
`apps/web/src/components/LeadCaptureForm.tsx`), not merely wired.

---

## Affected Layers

### API (NestJS)

No changes required. `POST /api/v1/leads` (LeadsController) is already implemented and
the endpoint is proxied in `apps/web-next/astro.config.mjs` via `/api → localhost:3000`.

### DB Changes Required

**No.** The `leads` table already exists. No migration needed.

### Frontend — `apps/web-next`

Three files are affected:

| File | Change Type | Notes |
|---|---|---|
| `apps/web-next/src/blocks/customer/LeadCaptureForm.tsx` | **CREATE** | Port from `apps/web/src/components/LeadCaptureForm.tsx`. Must replace all `style={{}}` with Tailwind + CSS variable classes. Must NOT use `var(--destructive, #c00)` fallback. |
| `apps/web-next/src/blocks/customer/index.ts` | **MODIFY** | Add `export { LeadCaptureForm } from './LeadCaptureForm';` |
| `apps/web-next/src/pages/index.astro` | **MODIFY** | Import `LeadCaptureForm` and render `<LeadCaptureForm client:load />` in `<main>` below `<Hero>`. |

### Bot / Workers

Not affected.

---

## Critical Constraints for CodeDeveloper

### CRITICAL — parity suite: zero inline `style=` attributes

`apps/e2e/tests/parity/parity-cross-cutting.spec.ts` (project `v2-chromium`) asserts
`inlineStyleCount === 0` on every rendered page including `/`. The source
`LeadCaptureForm.tsx` uses pervasive `style={{}}` throughout. If ported as-is, the
parity suite fails. **All inline styles must be replaced** with Tailwind utility classes
or `className` references to the design system component classes (`.btn`, `.input`,
`.card`, etc.).

### CRITICAL — AGENTS.md §11 token fallback violation

Source contains `color: 'var(--destructive, #c00)'` — explicitly forbidden in new code.
Must be replaced with `className="text-destructive"` (Tailwind) or `color: var(--destructive)`.

---

## Test Scope

### Unit (`apps/web-next`)

**New file required:** `apps/web-next/src/blocks/customer/LeadCaptureForm.test.tsx`

Required cases:
- Renders `input[type="email"]` and submit button in idle phase
- Renders "Check your inbox" after `submitLead` resolves
- Renders error paragraph when `submitLead` rejects
- Honeypot field has `aria-hidden="true"` and `tabIndex={-1}`
- Submit button disabled when email is empty
- `submitLead()` posts correct JSON body (mock `fetch`)

### E2E / UAT

Existing parity suite (`parity-cross-cutting.spec.ts`) covers `/` for zero inline styles.
New UAT coverage targeting port 4322 (web-next) is deferred to ISS-UAT-013-3 follow-up
work; out of scope for this fix.

---

## gate_result

```yaml
gate_result:
  status: passed
  step: 2
  attempt: 1
  timestamp: "2026-06-29T00:05:00Z"
  summary: "3 files (1 create, 2 modify). No API/DB/shared-types changes. Two critical violations in source component identified for CodeDeveloper."
  db_changes_required: false
```
