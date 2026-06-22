---
type: engineering-runbook
---

# Runbook: Country-lead activation

**Audience:** engineer (you) running the onboarding sequence for a newly-identified country lead. Triggers: a country lead candidate has been interviewed + accepted by Founder + COO; their Authentik account exists; the country's tenant in Directus is provisioned.

**Pre-reading:** [`docs/04-development/architecture/auth-architecture.md`](../../04-development/architecture/auth-architecture.md), [ADR-0021](../../adr/0021-rbac-manifest.md) (Accepted 2026-05-21 — the role manifest), [ADR-0033](../../adr/0033-community-member-graph.md) (the data layer they'll operate inside cabinets), [`docs/operator-playbook/`](../operator-playbook/) (where the operator-facing how-tos live; this runbook is the engineer-side counterpart).

**Total time:** ~45 min if F-S2.2 RBAC sync + F-S4.1 country provisioning + F-S4.3 onboarding wizard have shipped; longer if any of those is still placeholder.

> **Scaffold** — full procedure lands with F-S4.3 (Sprint 4.3 country-lead onboarding) per `docs/01-business/community-platform-roadmap.md` §7. Until then, country-lead activation is a manual sequence we run for each lead; this scaffold codifies the steps so we don't forget one. **Track Sprint 4 gating on ADR-0022 (country-lead compensation, Deferred — see G-1)** — a country lead cannot be onboarded without the compensation model accepted.

## Pre-conditions

- The candidate has signed the AUP (acceptable-use policy for member data) — see the operator-playbook onboarding pack
- The trust-transfer ceremony with the existing in-country community has been completed (or scheduled)
- ADR-0022 (country-lead compensation) is **Accepted** — without it, the compensation conversation hasn't happened and onboarding is premature
- The country (`countries.code = <xx>`) exists in Directus and is `is_active = true`
- The candidate's Authentik account exists at `auth.aiqadam.org/-/admin/identity/users/`
- The candidate has been added to the per-country Telegram group / equivalent comms channel

## Steps

### A. RBAC bind (per F-S2.2 once shipped)

1. In Authentik: add the candidate's user to the `country_lead_<xx>` group.
2. Wait for the F-S2.2 RBAC sync service to propagate (SLO: 60 seconds). Watch in `/workspace/observability` → "RBAC sync events".
3. Verify in Directus: the candidate's permission set now includes their country's policy. Confirm via `cms.aiqadam.org/policies` filtered by the candidate's user.
4. Verify in Plausible: the candidate has read access to their country's site.

Until F-S2.2 ships: manually add the candidate to the Directus permission policy for their country, manually grant Plausible site access; record both as audit entries.

### B. Cabinet walkthrough (per F-S4.3 once shipped)

The candidate logs into `/workspace`; the F-S4.3 wizard walks them through:
1. First event creation in `/workspace/events/[id]` (Cabinet #3, F-S3.4)
2. Sponsor pipeline tour in `/workspace/partners/[id]` (Cabinet #4, F-S3.5) — read-only on first pass
3. CSAT setup confirmation (the operator surface from F-S1.2/1.3 once shipped)
4. Country dashboard introduction (F-S2.4 Metabase deploy)
5. Member-directory tour in `/workspace/members` (Cabinet #1, F-S3.2)

Until F-S4.3 ships: walk through manually in a 30-minute video call.

### C. Permissions to verify ON the candidate

- ✅ Can read members where `country = <xx>`
- ✅ Can create + edit `events` where `country = <xx>`
- ✅ Can create + edit `interactions` where target audience is in their country
- ❌ Cannot read members where `country != <xx>` (other countries' members)
- ❌ Cannot read `directus_users.bio_md` for members where `appear_in_directory = false`
- ❌ Cannot edit Directus admin (engineer-only per ADR-0032 §Exceptions)
- ❌ Cannot grant or read `partner_audiences` rows (only board can — see ADR-0033)

Run each check live in the candidate's session (screen-share, candidate clicks). Document the result in the candidate's activation record.

### D. Confirmation + handoff

- Operator-playbook acknowledgement signed (the operator playbook from F-S0.7, once shipped — until then, a one-page text acknowledgement)
- First-event date scheduled
- Country lead added to the `countries[<xx>].leads` reference set (TBD location once Sprint 4 ships its profile data model)

## Verification

- Candidate logs into `/workspace` from their own device and sees their country's data + only their country's data
- Candidate can complete the F-S4.3 wizard end-to-end (or, until F-S4.3 ships, follows the manual walkthrough with the engineer-facilitator)
- At least one CSAT response from the candidate's network confirms they're now operating real flows

## Rollback

Country-lead deactivation: remove from `country_lead_<xx>` Authentik group → F-S2.2 RBAC sync revokes within 60s → confirm via the F-S2.4 country dashboard that the candidate's user no longer appears in "active operators". Until F-S2.2 ships: manual permission revoke + Plausible site access revoke + Telegram group remove. Document in audit log.

## Common failure modes

*(Grows from real activations.)*

## References

- [`docs/01-business/community-platform-roadmap.md` §7 Sprint 4](../../01-business/community-platform-roadmap.md) — Sprint 4 country provisioning + 4.3 onboarding
- [ADR-0021](../../adr/0021-rbac-manifest.md) — RBAC manifest (Accepted 2026-05-21)
- [ADR-0022 — Country-lead compensation](../../adr/0022-country-lead-compensation.md) — Deferred; **gates this runbook** (see [G-1 in business-process-gaps.md](../business-process-gaps.md))
- [ADR-0032](../../adr/0032-operator-tools-must-sso-or-embed.md) — cabinet routing rule
- [ADR-0033](../../adr/0033-community-member-graph.md) — sponsor PII boundary the country lead is responsible for honoring
- [`audit.md`](../../04-development/security/runbooks/audit.md) — for the periodic check that the country lead is operating within scope
- [`auth.

## System requirements

| FR | Capability | Status |
|---|---|---|
| [FR-ADM-005](../../03-requirements/FR-ADM-005.md) | Operator invites | Shipped |
| [FR-ADM-006](../../03-requirements/FR-ADM-006.md) | Country provisioning | Shipped |
| [FR-ADM-007](../../03-requirements/FR-ADM-007.md) | RBAC sync | Shipped |
| [FR-ADM-008](../../03-requirements/FR-ADM-008.md) | Audit log | Shipped |
