# Impact Analysis: FR-MIG-022

**Requirement:** `/events/[id]/survey + /feedback/csat + /leads/*` pages
**Analyzer:** ImpactAnalyzer
**Timestamp:** 2026-06-24T06:35:00Z
**Workflow:** wf-20260624-feat-017

---

## Changed Files

### New Files to Create

| File | Type | Rendering | Notes |
|------|------|-----------|-------|
| `apps/web-next/src/pages/events/[id]/survey.astro` | Astro SSR page | `prerender = false` | Reuses `<FormRenderer>` block; fetches form via MIG-019 pattern |
| `apps/web-next/src/pages/feedback/csat.astro` | Astro SSR page | `prerender = false` | Token validation in frontmatter; renders `<CsatForm>` island |
| `apps/web-next/src/pages/leads/thank-you.astro` | Astro SSG page | `prerender = true` | Static content, no API calls |
| `apps/web-next/src/pages/leads/verified.astro` | Astro SSG page | `prerender = true` | Static content, no API calls |
| `apps/web-next/src/pages/leads/verify-failed.astro` | Astro SSG page | `prerender = true` | Static content, no API calls |
| `apps/web-next/src/blocks/customer/CsatForm.tsx` | React island | client:load | New component; ports v1 `CsatForm.tsx` to web-next |

### Files to Modify

| File | Change | Rationale |
|------|--------|-----------|
| `apps/web-next/src/lib/api-ssr.ts` | Add `fetchCsatTokenStatus()` and `fetchEventSurveyContext()` | SSR helpers needed for token validation and survey page context |

### Reference Files (read-only, patterns to follow)

| File | Purpose |
|------|---------|
| `apps/web/src/pages/events/[id]/survey.astro` | Survey page v1 pattern |
| `apps/web/src/pages/feedback/csat.astro` | CSAT page v1 pattern |
| `apps/web/src/pages/leads/*.astro` | Leads pages v1 pattern |
| `apps/web/src/components/CsatForm.tsx` | CsatForm component v1 pattern |
| `apps/web/src/lib/forms-api.ts` | `fetchEventSurvey` and `fetchSurveyEventContext` pattern |
| `apps/web-next/src/blocks/customer/FormRenderer.tsx` | Reusable form renderer block |
| `apps/api/src/modules/workspace/csat.service.ts` | CSAT service with token minting/verification |

---

## New Dependencies

**No new npm packages required.**

All required packages are already present in the web-next workspace:

- `@astrojs/react` — Astro React integration (already configured)
- `react` / `react-dom` — React 19 (already present)
- `tailwindcss` / `@tailwindcss/vite` — Tailwind 4 (already configured)
- `lucide-react` — Icons (already used throughout the codebase)

The `CsatForm` component uses only native React state management (`useState`) with no additional dependencies beyond what's already in the design system.

---

## DB Changes Required

**No database schema changes required.**

The CSAT system already exists:
- `POST /v1/feedback/csat` endpoint is implemented in `apps/api/src/modules/workspace/csat.controller.ts`
- `CsatService` handles token minting, verification, and response persistence
- Tables (`interaction_deliveries`, `interaction_responses`) are already present in Directus

The leads pages are static SSG with no database interaction.

---

## API Changes Required

**No new API endpoints required.**

Existing endpoints:

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `POST /v1/feedback/csat` | POST | Submit CSAT response (rating + optional comment) | **Exists** |
| `GET /v1/forms/:slug` | GET | Fetch public form schema | **Exists** (via MIG-019) |
| `GET /v1/telegram/events/:slug` | GET | Event context (title, speakers) | **Exists** |
| `GET /v1/telegram/events/:id/survey` | GET | Event-attached survey form | **Exists** |

SSR helpers to add to `api-ssr.ts`:

1. **`fetchCsatTokenStatus(req, token)`** — Validates a CSAT token without consuming it (for SSR token validation on `/feedback/csat`). This requires a new API endpoint `GET /v1/feedback/csat/status` or reusing the existing `CsatService.verifyToken()` via a controller.

2. **`fetchEventSurveyContext(req, eventId)`** — Fetches event title, speakers for survey header. Can reuse existing `/v1/telegram/events/:id` endpoint.

---

## Security Considerations

### CSAT Token Handling

1. **Token is the credential** — Unlike authenticated flows, the CSAT token (`?t=`) is the only auth mechanism. It must be:
   - Validated server-side in Astro frontmatter (never trust client-side validation alone)
   - HMAC-verified via `CsatService.verifyToken()` with 30-day TTL
   - Consumed idempotently (API already handles this with `responded_at` check)

2. **Token in URL** — Query parameters appear in server logs and browser history. The token is short-lived (30 days) and single-use per delivery, so this is acceptable. However:
   - Never log the full token value
   - Consider `no-cache` headers to prevent caching of the form page

3. **CSRF considerations** — CSAT submissions are idempotent and tied to a delivery token, so CSRF is low-risk. However, the existing API already uses token-based verification which prevents CSRF.

### Lead Pages (SSG)

- No auth, no sensitive data
- Static pages are safe from injection
- Consider adding `Cache-Control` headers for static pages

### Survey Page

- Form submission uses MIG-019's existing pattern (POST to `/v1/forms/:slug/responses`)
- The event ID comes from the URL path, not a token — ensure proper URL sanitization

---

## Complexity Assessment

**Overall: Low**

### Breakdown by Page

| Page | Complexity | Reasoning |
|------|------------|-----------|
| `/leads/thank-you` | Very Low | Static SSG, one HTML card, copy from v1 |
| `/leads/verified` | Very Low | Static SSG, one HTML card, copy from v1 |
| `/leads/verify-failed` | Very Low | Static SSG, one HTML card, copy from v1 |
| `/feedback/csat` | Low | SSR with token validation; existing API endpoint; new island component |
| `/events/[id]/survey` | Low-Medium | SSR with form fetch; depends on MIG-019 `FormRenderer`; needs event context |

### Key Risk Factors

1. **MIG-019 dependency** — The survey page reuses `<FormRenderer>` from MIG-019. If MIG-019 is delayed, the survey page cannot be fully tested.

2. **SSR helper API** — May need a new API endpoint (`GET /v1/feedback/csat/status`) for CSAT token validation. This adds a small backend change.

3. **Token validation UX** — Invalid/expired tokens should show a clean error page, not crash. Ensure proper error handling in frontmatter.

### Effort Estimate

| Component | Estimated Effort |
|-----------|------------------|
| Three static leads pages | 2-3 hours |
| CsatForm island component | 3-4 hours |
| CSAT page with token validation | 2-3 hours |
| Survey page with event context | 3-4 hours |
| SSR helpers in api-ssr.ts | 1-2 hours |
| Testing and polish | 2-3 hours |
| **Total** | **~15-20 hours** |

---

## Gate Result

**Status:** passed
**Attempt:** 1
**Timestamp:** 2026-06-24T06:35:00Z

**Summary:** FR-MIG-022 has low impact scope. Six pages to create (5 new Astro pages + 1 new React island component), one SSR helper module to extend, no database changes, and no new API endpoints needed beyond potential reuse of existing endpoints. Security considerations are manageable — CSAT token handling is well-understood from the v1 implementation. The main risk is the MIG-019 dependency for the survey page's FormRenderer, which should be coordinated with that team.

**Changed Files:**
- `apps/web-next/src/pages/events/[id]/survey.astro` (new)
- `apps/web-next/src/pages/feedback/csat.astro` (new)
- `apps/web-next/src/pages/leads/thank-you.astro` (new)
- `apps/web-next/src/pages/leads/verified.astro` (new)
- `apps/web-next/src/pages/leads/verify-failed.astro` (new)
- `apps/web-next/src/blocks/customer/CsatForm.tsx` (new)
- `apps/web-next/src/lib/api-ssr.ts` (modify: add SSR helpers)

**DB Changes:** no
**API Changes:** no (uses existing CSAT endpoint; may add `GET /v1/feedback/csat/status` if needed for token validation)
