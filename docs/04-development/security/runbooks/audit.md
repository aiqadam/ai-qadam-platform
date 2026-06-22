# Runbook: Audit-log inspection + retention compliance + member access-log queries

**Audience:** engineer responding to a member's "who saw my data?" request, an operator-conduct allegation, a compliance audit, or a regulatory inquiry. Also: routine quarterly retention sweep.

**Pre-reading:** [ADR-0033](../../../adr/0033-community-member-graph.md) (the data layer + the sponsor PII boundary), [`docs/04-development/architecture/auth-architecture.md`](../../architecture/auth-architecture.md) (who-is-who), [`docs/04-development/security/runbooks/security-incident.md`](security-incident.md) (when an audit query is also a security incident).

**Total time:** a single member-access query ~5 min; a full quarterly compliance sweep ~2 hours.

> **Scaffold** — full procedures land once F-S2.5 (audit log + `/me/access-log`) ships and we have an `audit_events` collection to query against. Until then, audit data lives in `directus_activity` (Directus's built-in activity log) + Loki for API-level access events. Track Sprint 0.13 + Sprint 2.5 in `docs/01-business/community-platform-roadmap.md` §7.

## Pre-conditions

- Engineer has Directus admin (token at `/tmp/aiqadam-secrets-DIRECTUS_TOKEN`)
- Engineer has Loki access (via `/workspace/observability` once that page lands, or direct container query)
- The request has a documented basis: a member self-service request, an operator allegation case ID, a compliance ticket, or a regulator subpoena. Audit queries without a documented basis are themselves a privacy breach — refuse and escalate.
- For sponsor-data-access questions: the partner's `partner_audiences` row(s) are pulled BEFORE the query (so we can compare requested-access vs entitled-access)

## Steps

### A. Member access-log query ("who saw my record?")

1. Get the member's `directus_users.id`.
2. Query `directus_activity` where `item = <member_id>` AND `collection IN (directus_users, member_skills, member_employments, member_consents, member_connections, registrations)`. Range = past 12 months by default.
3. Filter results to:
   - `action` ∈ (read, update, delete)
   - `user` is NOT the member themselves (those are self-actions, not third-party access)
4. For each access record, resolve `user` → name + role + country.
5. Cross-reference with `partner_audiences`: if a sponsor accessed an aggregated cohort the member was in, that's an entitled access; if a sponsor accessed the row directly, that's a violation.
6. Deliver the result via `/me/access-log` (F-S2.5; until that ships, deliver as a CSV manually).

### B. Operator-conduct query ("did operator X look at members they shouldn't have?")

1. Identify the operator's `directus_users.id` + their entitled scopes (country, role).
2. Query `directus_activity` where `user = <operator_id>` AND `action = read` over the investigation window.
3. For each row, resolve `collection + item` → was this in their entitled scope?
4. Out-of-scope reads are the audit finding. Document in `docs/incidents/<YYYY-MM-DD>-<short-slug>.md` (template TBD).

### C. Sponsor PII boundary audit (per ADR-0033)

Sponsors should NEVER appear in `directus_activity` as the actor on a `directus_users` row, OR on raw `member_*` rows. They should only appear as the actor on cohort-aggregated views (Metabase) — which means they will NOT appear in `directus_activity` because Metabase reads through a read-only PostgreSQL connection, not the Directus REST API. If a sponsor DOES appear in `directus_activity` accessing member data, that is a sponsor-PII-boundary violation per ADR-0033 — escalate to security-incident runbook.

### D. Quarterly retention compliance sweep

1. Members with `directus_users.status = inactive` for 180+ days → run GDPR-archive procedure (TBD — design lives in [`docs/01-business/community-platform-roadmap.md` §6.7](../../../01-business/community-platform-roadmap.md)).
2. `member_consents.revoked_at < (now - 180 days)` → confirm associated data was removed.
3. `directus_activity` rows older than the retention period (TBD; default 24 months) → archive to cold storage per [ADR-0017](../../../adr/0017-backup-architecture.md), then prune.
4. Generate a one-page compliance report; file in `docs/compliance/<YYYY-Q>-sweep.md` (template TBD).

## Verification

- The audit query result has been delivered to the requester (member, regulator, board)
- For violations found: an incident doc opened, a containment action taken, the affected member(s) notified per the comms procedure (TBD)
- For routine quarterly sweep: report filed in `docs/compliance/`, summary linked in the next board digest

## Rollback

Audit queries are read-only. No rollback. For corrective actions taken in response to findings (e.g., revoking a sponsor's `partner_audiences` entitlement), the rollback is the inverse — see the corresponding cabinet's procedure (F-S3.5 partner cabinet, TBD).

## Common failure modes

*(Grows from real audits.)*

## References

- [ADR-0033](../../../adr/0033-community-member-graph.md) — member graph + sponsor PII boundary
- [ADR-0017](../../../adr/0017-backup-architecture.md) — backup + retention strategy
- [`docs/01-business/community-platform-roadmap.md` §7 Sprint 2.5](../../../01-business/community-platform-roadmap.md) — F-S2.5 audit log feature
- [`security-incident.md`](security-incident.md) — when an audit finding becomes a security incident
- [`break-glass.md`](break-glass.md) — every break-glass event leaves an audit trail this runbook reads
