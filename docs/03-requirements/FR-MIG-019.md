---
code: FR-MIG-019
name: /forms/[slug] — public form renderer
status: In Progress
module: Migration (MIG)
phase: Rebuild M3
---

## Description
Public-facing form submission page. Renders any operator-authored form (from FR-MIG-013) as a fillable form for members and anonymous visitors.

## Users
Members and anonymous visitors submitting forms (surveys, applications, feedback).

## Functional scope
1. `pages/forms/[slug].astro` — SSR-fetches form schema by slug; renders fields using `<FormRenderer>`.
2. Respects `allow_anonymous` flag: if false, shows AuthGate.
3. Submits via POST `/v1/forms/:slug/responses`.
4. On success: shows confirmation message (customisable per form) + prevents re-submission.
5. Handles expired/closed forms gracefully (404-style message).

## Acceptance criteria
- [ ] All 7 field types render correctly for a member.
- [ ] Anonymous form with `allow_anonymous=true` is accessible without sign-in.
- [ ] Anonymous form with `allow_anonymous=false` redirects to sign-in.
- [ ] Successful submission shows confirmation and disables the submit button.
- [ ] Submitting a closed form shows "This form is no longer accepting responses."
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/forms/[slug].astro` + `FormRenderer.tsx`.
- Depends on: FR-MIG-006 (`<FormBuilder>` defines the `FieldDef[]` schema this renderer reads).
- Related: FR-CMS-003 (form builder application FR).
