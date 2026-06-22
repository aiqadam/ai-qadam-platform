---
code: FR-PTN-002
name: Partner and sponsor onboarding (operator)
status: Not Started
module: Partners (PTN)
phase: Rebuild Phase 3 (V2)
---

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
