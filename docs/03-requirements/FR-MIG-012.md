---
code: FR-MIG-012
name: /workspace/admin/countries — list + provisioning wizard
status: Not Started
module: Migration (MIG)
phase: Rebuild M2
---

## Description
The countries list page is missing in web-next (only the provisioning sub-page exists). This FR adds the list and wires the existing provisioning wizard to full completion via `<Form>` + `<ActionBar>`.

## Users
Super-admins provisioning new country tenants.

## Functional scope
1. `pages/workspace/admin/countries/index.astro` — lists all countries with status (active/inactive), country lead count, last event date.
2. "Provision new country" button navigates to `[code]/provisioning`.
3. `pages/workspace/admin/countries/[code]/provisioning/index.astro` — wires `<CountryProvisioningWizard>` with `<Form>` + `<ActionBar>` for each step.
4. Wizard steps: (1) create Directus tenant, (2) provision Authentik group, (3) RBAC sync, (4) activate gate.
5. Each step shows status (pending / running / done / failed) with retry on failure.
6. SuperAdminGuard on both pages.

## Acceptance criteria
- [ ] Countries list renders at `/workspace/admin/countries` with correct data.
- [ ] Wizard step machine advances on success, shows error + retry on failure.
- [ ] Completed provisioning flips country to `is_active = true` in Directus.
- [ ] SuperAdmin-only: operator role redirect to `/workspace`.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/workspace/admin/countries.astro` + `CountryProvisioningWizard.tsx`.
- Depends on: FR-MIG-003 (`<Form>`), FR-MIG-005 (`<ActionBar>`).
- `<CountryProvisioningWizard>` exists in web-next but needs Form/ActionBar wiring.
- Related: FR-ADM-006 (country provisioning capability).
