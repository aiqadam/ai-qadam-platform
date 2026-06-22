---
code: FR-ADM-006
name: Country settings and provisioning wizard
status: Shipped
module: Admin / Operator (ADM)
phase: Phase 1 (V1) / Rebuild M2.5 (V2, Shipped)
---

## Description

Super Admins can configure per-country platform defaults (locale, currency, reminder cadence, holidays) and run a step-by-step provisioning wizard to activate a new country instance. Country admins can view but not edit these settings.

## Users

Super Admin (edit); Country Admins (read).

## Functional scope

1. **Countries admin** — `/workspace/admin/countries` (`CountriesAdmin` island): table of all countries with editable defaults (locale, currency_code, channel preference, holiday_calendar, default_reminder_hours). Super-admin can edit; others read-only.
2. **Provisioning wizard** — `/workspace/admin/countries/[code]/provisioning` (`CountryProvisioningWizard` island): idempotent state machine for activating a new country. Steps (each with status + retry):
   - **Authentik** — Create country-scoped group + Authentik Application.
   - **Directus** — Create country record in `countries` collection; seed starter topics.
   - **Plausible** — Provision a Plausible site for `<code>.aiqadam.org`.
   - **Coolify** — Configure domain routing for the new subdomain.
   - **Activate** — Set `countries.is_active=true` and flip the DNS record (manual step prompting the operator).
3. **API** — `GET/PATCH /v1/admin/countries/:code` (country settings). `GET /v1/admin/countries/:code/provisioning` (step states). `POST /v1/admin/countries/:code/provisioning/retry` (retry a failed step). `POST /v1/admin/countries/:code/activate` (final activation).
4. **Idempotency** — Each provisioning step checks if the resource already exists before creating it. Re-running a completed step is safe.

## Acceptance criteria

- [ ] A super-admin can update the `default_reminder_hours` for a country; notifications use the new value.
- [ ] Running the provisioning wizard for a new country code completes all steps and marks the country as provisioned.
- [ ] A failed provisioning step shows a clear error message and a "Retry" button.
- [ ] Re-running a completed provisioning step does not create duplicate resources.
- [ ] A country admin visiting `/workspace/admin/countries` sees their country's settings but cannot edit them.
- [ ] The "Activate" step requires a manual DNS confirmation before proceeding.

## Notes

- V2 (web-next): M2.5 (`CountryProvisioningWizard`) shipped.
- The Coolify provisioning step uses the Coolify REST API. Risk: `custom_labels` PATCH behavior (see ADR-0008 and feedback memories). The step should snapshot Coolify config before and after (FR-OPS-001).
