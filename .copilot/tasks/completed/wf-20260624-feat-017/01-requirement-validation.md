# Requirement Validation: FR-MIG-022

**Requirement:** `/events/[id]/survey + /feedback/csat + /leads/*` pages
**Analyst:** RequirementAnalyst
**Timestamp:** 2026-06-24T06:10:00Z
**Workflow:** wf-20260624-feat-017

---

## Raw Input

From `.copilot/tasks/active/wf-20260624-feat-017/handoff.yaml` and `docs/03-requirements/FR-MIG-022.md`:

### Requirement Summary
Six short-form conversion and feedback pages:
1. `pages/events/[id]/survey.astro` — post-event survey form
2. `pages/feedback/csat.astro` — standalone CSAT (1-5 + comment)
3. `pages/leads/thank-you.astro` — lead-magnet conversion confirmation
4. `pages/leads/verified.astro` — email-verified lead confirmation
5. `pages/leads/verify-failed.astro` — verification failure with retry CTA
6. All tokenized pages: validate token server-side; show "link expired" if invalid

### Dependencies
- FR-MIG-019 (`/forms/[slug]` public form renderer) — **In Progress**

### Notes
- v1 reference: `apps/web/src/pages/events/[id]/survey.astro`, `feedback/csat.astro`, `leads/*.astro`
- Tokenized URL handling: validate `?t=` param in Astro frontmatter

---

## Analysis

### Completeness Issues Found

1. **Tokenized URL ambiguity for survey page**: The FR states "Tokenized URL (`?t=<token>`)" for the survey page, but the v1 reference (`apps/web/src/pages/events/[id]/survey.astro`) does NOT use a `?t=` token parameter — it only takes the event ID from the URL path. The survey form submission appears to be tokenized at the form-response level (via MIG-019's `POST /v1/forms/:slug/responses`), not at the page level. This creates a gap: the FR requirement text says to validate a `?t=` token, but the v1 implementation does not have one.

2. **Missing CSAT component for web-next**: The v1 `CsatForm.tsx` component needs migration to web-next. No equivalent exists in `apps/web-next/src/blocks/` or `apps/web-next/src/components/`. This is not a completeness gap in the FR itself, but it requires additional work beyond the page files listed.

3. **API SSR helpers incomplete**: The web-next `api-ssr.ts` has `fetchPublicForm` for MIG-019, but lacks:
   - A CSAT token-validation helper
   - A survey-event-context helper (v1 has `fetchSurveyEventContext` in `apps/web/src/lib/forms-api.ts`)

4. **Missing lead API endpoints verification**: The FR references `/api/v1/leads/verify?token=...` redirects but does not explicitly document the expected API behavior. Need to verify if `POST /v1/leads` and the verify endpoint exist in the API.

### Conflicts with Existing Features

1. **MIG-019 dependency is In Progress**: The survey page depends on MIG-019 (`/forms/[slug]` renderer). MIG-019 is currently "In Progress" per its FR status. If the survey page starts before MIG-019 is shipped, there will be integration risk.

2. **Design system compliance**: The v1 leads pages use inline styles. Migration to web-next requires Tailwind 4 + shadcn/ui per the architecture (ADR-0038). This is expected, not a conflict.

### Architectural Feasibility

**Overall: Feasible with clarifications.**

| Page | v1 Pattern | web-next Pattern | Status |
|------|-----------|------------------|--------|
| `/events/[id]/survey` | SSR, uses FormRenderer, `fetchEventSurvey` | SSR, use `<FormRenderer>` block | Needs `eventId` + `eventContext` props on FormRenderer; needs SSR helpers |
| `/feedback/csat` | SSR, CsatForm component | SSR, new CsatForm island | Needs new block component |
| `/leads/thank-you` | SSG (`prerender = true`), static | SSG | Feasible — no API calls |
| `/leads/verified` | SSG, static | SSG | Feasible — no API calls |
| `/leads/verify-failed` | SSG, static | SSG | Feasible — no API calls |

**Key patterns confirmed:**
- Astro SSR (`prerender = false`) for token validation: confirmed in v1 csat.astro
- Astro SSG (`prerender = true`) for static leads pages: confirmed in v1
- Layout.astro exists with Tailwind 4 + shadcn/ui structure
- `FormRenderer` block exists in `apps/web-next/src/blocks/customer/FormRenderer.tsx`
- CSAT API endpoint exists: `POST /v1/feedback/csat` in `csat.controller.ts`

---

## Formalized Requirement

### Scope (refined)

**Must implement:**
1. `apps/web-next/src/pages/events/[id]/survey.astro`
   - SSR page (`prerender = false`)
   - Fetches form schema via existing MIG-019 pattern (`fetchPublicForm`)
   - Renders `<FormRenderer>` with event context header
   - Does NOT require `?t=` token (uses event ID from path; form submission handles tokens internally per MIG-019)
   - 404 if no survey attached

2. `apps/web-next/src/pages/feedback/csat.astro`
   - SSR page (`prerender = false`)
   - Validates `?t=` token server-side; redirects to error state if invalid
   - New `<CsatForm>` block component with 1-5 rating + optional comment
   - POSTs to existing `/v1/feedback/csat` endpoint

3. `apps/web-next/src/pages/leads/thank-you.astro`
   - SSG page (`prerender = true`)
   - Static content, no auth required
   - Copy: "Check your inbox" with CTA to browse events

4. `apps/web-next/src/pages/leads/verified.astro`
   - SSG page (`prerender = true`)
   - Static content, no auth required
   - Copy: "You're on the list" confirmation

5. `apps/web-next/src/pages/leads/verify-failed.astro`
   - SSG page (`prerender = true`)
   - Static content, no auth required
   - Copy: "That link didn't work" with retry CTA

6. `apps/web-next/src/blocks/customer/CsatForm.tsx` (new)
   - React island component
   - 1-5 star/number rating buttons
   - Optional comment textarea
   - States: idle, submitting, success, already-submitted, error
   - POSTs to `/v1/feedback/csat`

**Requires new SSR helpers:**
- `fetchCsatTokenStatus(req, token)` → validates token without consuming it
- `fetchEventSurveyContext(req, eventId)` → event title, speakers for survey header

### Cross-references

| Related FR | Relationship |
|------------|--------------|
| FR-MIG-019 (`/forms/[slug]`) | Survey page reuses FormRenderer from MIG-019 |
| FR-EVT-006 (post-event survey) | v1 feature; MIG-022 replaces it |
| FR-REG-001 (registration leads) | Leads pages handle post-registration flow |
| FR-MIG-021 (`/checkin`) | Similar SSR pattern for tokenized pages |

---

## Acceptance Criteria (draft)

### GIVEN/WHEN/THEN for TestDesigner

---

**Feature: Post-event Survey Page**

- **GIVEN** a published event with an attached survey form
- **WHEN** a user visits `/events/{eventId}/survey`
- **THEN** the survey form renders with the event title header
- **AND** the form fields are editable and submittable
- **AND** no `?t=` token is required (token handled by form submission layer)

- **GIVEN** an event with no attached survey form
- **WHEN** a user visits `/events/{eventId}/survey`
- **THEN** a 404 page renders with "No survey attached to this event"

---

**Feature: CSAT Page**

- **GIVEN** a valid CSAT token in the URL
- **WHEN** a user visits `/feedback/csat?t={validToken}`
- **THEN** the CSAT form renders with 1-5 rating buttons and optional comment field
- **AND** submitting a rating saves the response via POST `/v1/feedback/csat`
- **AND** a success state displays after submission

- **GIVEN** an invalid or missing CSAT token
- **WHEN** a user visits `/feedback/csat` without `?t=` or with an expired token
- **THEN** the page displays "This link has expired" without a stack trace
- **AND** no form is rendered

- **GIVEN** a CSAT token that has already been used
- **WHEN** the user submits a rating
- **THEN** the page displays "Already responded" message
- **AND** re-submission is prevented

---

**Feature: Lead Confirmation Pages**

- **GIVEN** a lead has submitted the registration form
- **WHEN** the lead visits `/leads/thank-you`
- **THEN** the page displays "Check your inbox" with a CTA to browse events
- **AND** no authentication is required

- **GIVEN** a lead clicks a valid email verification link (redirected from API)
- **WHEN** the lead visits `/leads/verified`
- **THEN** the page displays "You're on the list" with event browse CTA
- **AND** no authentication is required

- **GIVEN** a lead clicks an invalid or expired verification link
- **WHEN** the lead visits `/leads/verify-failed`
- **THEN** the page displays "That link didn't work" with a retry CTA
- **AND** no authentication is required

---

**Feature: Build Validation**

- **GIVEN** all six pages are implemented
- **WHEN** `pnpm arch:check` runs
- **THEN** no architecture violations are reported
- **AND** `pnpm astro check` passes with no errors
- **AND** `pnpm build` completes successfully

---

## Gate Result

**Status:** passed
**Attempt:** 1
**Timestamp:** 2026-06-24T06:10:00Z

**Summary:** FR-MIG-022 is feasible as specified. Six pages to implement with clear v1 references. One clarification needed: the survey page does NOT require `?t=` token validation (per v1 implementation) — the FR text is ambiguous on this point but the v1 reference takes event ID from path, not token from query. The MIG-019 dependency is in-progress; survey page can proceed with the assumption MIG-019 will be shipped.

**Decision Rationale:**
1. All page patterns are architecturally feasible with Astro SSR/SSG per ADR-0038
2. CSAT API endpoint (`POST /v1/feedback/csat`) exists and is properly guarded
3. FormRenderer block exists and is reusable for the survey page
4. Lead pages are static SSG with no external dependencies
5. One clarification documented: survey page uses event ID from URL path, not `?t=` token (per v1 reference)
6. Additional work identified: `CsatForm` block component needs creation; SSR helpers for CSAT token validation and event context are needed in `api-ssr.ts`
7. MIG-019 dependency noted; survey page should be sequenced after MIG-019 ships or coordinate with that team
