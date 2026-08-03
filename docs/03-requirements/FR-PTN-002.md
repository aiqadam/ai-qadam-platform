---
code: FR-PTN-002
name: Partner and sponsor onboarding (operator)
status: Superseded
module: Partners (PTN)
phase: Rebuild Phase 3 (V2)
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/133
superseded_by: ADR-0033
---

## Superseded (2026-08-03)

**Do not implement this requirement as written.** [ADR-0033](../adr/0033-community-member-graph.md)
(Accepted, 2026-05-20) formally retired Twenty CRM and established the community
member graph architecture on Directus. The functional scope item #1 references
[FR-CRM-002](FR-CRM-002.md) (Twenty CRM contact sync), which was itself superseded
on 2026-08-02 for the same architectural reason.

The modern architecture already implements all three acceptance criteria via:

1. **Partner records** — `companies` collection with `is_sponsor`/`is_employer`/`is_product_partner`
   flags (shipped in ADR-0033 implementation). Operators create sponsor records in Directus
   with logo, tier, country, and status.

2. **Partner kit** — `/workspace/partners/[slug]` cabinet (M2.1, already live) serves
   partner-exclusive and shared marketing assets via the `marketing_assets` collection
   (F-S3.5-b). Kit downloads include co-marketing pieces, brand pack, fact sheet.

3. **Event linking** — `event_sponsors` junction (F-WebU11, already live) links sponsors
   to events with per-event tier and custom message. Sponsors appear on event detail
   pages and homepage partner rows.

4. **Operator playbook** — `docs/02-business-processes/operator-playbook/sponsor-onboarding.md`
   (already exists) documents the onboarding flow from lead tracking through cabinet
   provisioning. No CRM dependency — operators track outreach via the partner cabinet
   or external tools (email, shared docs) until Directus record creation.

This requirement is closed without additional implementation. The acceptance criteria
are already satisfied by existing infrastructure. If a genuine gap remains (e.g.,
structured lead pipeline tracking before agreement signature), it should be re-scoped
as a new requirement against the Directus member graph + partner_audiences model from
ADR-0033, not built against Twenty.

Original requirement text is preserved below for historical record.

## Description

Operators can initiate and track the onboarding of new partners and sponsors: from initial contact through agreement, logo/asset collection, and final activation on the platform. The onboarding workflow is supported by the CRM (Twenty) and the operator workspace.

## Users

Organizers, Country Admins.

## Functional scope

1. **CRM-based lead tracking** — New partner contacts are created in Twenty CRM as Companies/People (via FR-CRM-002). Organizers track outreach status using Twenty's pipeline.
2. **Sponsor onboarding playbook** — Internal process documented at `docs/02-business-processes/operator-playbook/sponsor-onboarding.md`. The platform supports this flow but does not replace it with a custom wizard.
3. **Directus partner creation** — After agreement is signed, the operator creates a partner record in Directus with logo, tier, and activation status. This is the final step; once active, the partner appears on the site.
4. **Partner kit** — Operator-facing download at `/workspace/partners/[slug]` — a kit of partner logos, guidelines, and event entitlement descriptions per tier.
5. **Assets management** — Partner logos uploaded to MinIO via Directus assets. Multiple variants (light/dark, SVG/PNG).

## Acceptance criteria

- [ ] An organizer can create a partner in Directus with logo, tier, country, and status, and the partner appears on the homepage after `status=active`.
- [ ] The partner kit download at `/workspace/partners/[slug]` includes all approved logo variants.
- [ ] Deactivating a partner (`status=inactive`) removes them from the homepage and event pages immediately.

## Notes

- This FR is relatively thin as a platform feature: most of the work is in Directus configuration and the operator playbook. The key acceptance criterion is that the workflow is supported end-to-end.
- Phase 3 of the V2 rebuild includes a Sponsors cabinet (listed in RB-P3 "Not started").
