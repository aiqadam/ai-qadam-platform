---
code: FR-MIG-028
name: /workspace/country-leads — country-lead onboarding cabinet
status: Not Started
module: Migration (MIG)
phase: Rebuild Phase 3
---

## Description
New cabinet. Wraps the country-lead activation runbook (currently manual) into a guided wizard. Operators can initiate and track onboarding for a new country lead from within the workspace.

## Users
Super-admins onboarding country leads.

## Functional scope
1. `pages/workspace/country-leads/index.astro` — list of country leads with status (candidate/active/inactive).
2. "Onboard new lead" → `pages/workspace/country-leads/new.astro` — `<Wizard>` with steps mirroring the runbook: (A) confirm prerequisites, (B) RBAC bind, (C) cabinet walkthrough checklist, (D) confirmation.
3. Each wizard step calls the relevant API (Authentik group add → RBAC sync → activate) and shows pass/fail.
4. Completed onboarding records the activation date in Directus.
5. SuperAdminGuard.

## Acceptance criteria
- [ ] Wizard step B successfully adds the candidate to `country_lead_<xx>` Authentik group.
- [ ] RBAC sync step polls `/v1/admin/rbac-sync/status` until complete.
- [ ] Completed onboarding appears in the country leads list with status `active`.
- [ ] SuperAdmin-only: operator redirect to `/workspace`.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- Automates `docs/02-business-processes/operations/country-lead-activation.md`.
- Depends on: existing `<Wizard>` kit atom (M1, already shipped per migration-status.md).
- Related: FR-ADM-005, FR-ADM-006, FR-ADM-007.
