# Runbook: Security-incident triage

**Audience:** on-call engineer when something looks like an active security incident (credential leak, suspected breach, unusual access pattern, abuse report from a member, public CVE drop affecting a dep we ship). Not for routine vulnerability scanning — that lives in [`supply-chain.md`](./supply-chain.md).

**Pre-reading:** [`.claude/SECURITY.md`](../../.claude/SECURITY.md) (the baseline that defines what "secure" means here), [ADR-0017](../adr/0017-backup-architecture.md) (restore-from-backup if you need to roll back), [`reference-secrets-cache`](../../.claude/projects/-home-drukker-aiqadam/memory/reference_secrets_cache.md) (where local secret caches live so you know what to rotate).

**Total time:** triage 5–15 min; containment + rotation 30–120 min; postmortem same-day or next-day.

> **Scaffold** — full runbook lands when F-S0.5 backup-restore CI test is green and the first real incident gives us a tested rotation sequence. Track the gap in `docs/community-platform-roadmap.md` §7 Sprint 0.13. For now this captures the shape so an on-call engineer in an actual incident has a starting point.

## Pre-conditions

- Engineer has admin access to: Coolify (`coolify.aiqadam.org`), Authentik (`auth.aiqadam.org`), Directus (`cms.aiqadam.org`), the prod host via SSH alias `aiqadam-prod` (per [`reference-prod-host`](../../.claude/projects/-home-drukker-aiqadam/memory/reference_prod_host.md))
- Engineer has the team password manager open (rotation requires writing new secrets back to it)
- Engineer has GitHub admin or owner role (revoking compromised tokens may need org-level controls)
- Slack / Telegram channel for incident comms is open (separate from the affected channel if a comms channel itself is implicated)

If any of these is missing, get them before continuing — do not improvise during an incident.

## Steps

1. **Acknowledge + scope.** Open the incident channel; one engineer is on point, others read-only until called in. Capture: what looks wrong, what evidence, who reported it, when first observed. 5-minute timer.

2. **Contain blast radius.** Depending on incident class (TBD — fill in concrete sequences as we hit real incidents):
   - Credential leak → rotate per the affected service's section in this runbook (placeholder; see [`reference-secrets-cache`](../../.claude/projects/-home-drukker-aiqadam/memory/reference_secrets_cache.md) for what exists today)
   - Unauthorized access via Authentik → disable the user + revoke active sessions
   - Compromised API token → revoke at issuer (Directus / Coolify / Authentik / GitHub / Resend), search code+CI for any reference
   - Data exposure → snapshot affected tables BEFORE remediation so the postmortem can quantify

3. **Preserve evidence.** Before rotation: capture logs, screenshots, HTTP traces. Lossy mitigations (revoke + delete) AFTER the snapshot.

4. **Rotate.** Sequence depends on what leaked; the common shape is `disable old → mint new → deploy → verify → revoke old`. Specific sequences per secret type land here as we hit real incidents.

5. **Comms.** Internal status (incident channel) every 30 min minimum. External comms decision separately — most likely NO public statement until containment is complete, then a short factual note.

6. **Postmortem.** Within 5 business days. Output a doc in `docs/postmortems/<YYYY-MM-DD>-<short-slug>.md` (template TBD). Update this runbook's "Common failure modes" with what we learned.

## Verification

- All suspected-compromised credentials revoked at issuer
- All replacement credentials confirmed working in prod
- No abnormal access pattern in the 24h following rotation (Loki / Plausible / Authentik event log)
- Postmortem doc opened (even if empty pending input)

## Rollback

Most rotations are non-reversible by design — old tokens stay revoked. For schema or data changes done in containment (e.g., "we deleted all sessions"), the rollback is the corresponding restore-from-backup procedure in [`restic-backups.md`](./restic-backups.md). For Coolify-level changes (e.g., taking a service offline), the rollback is the inverse Coolify action (restart the service).

## Common failure modes

*(Grows from real incidents. Empty is correct on day one.)*

## References

- [`.claude/SECURITY.md`](../../.claude/SECURITY.md) — baseline security rules
- [ADR-0017 — Backup architecture](../adr/0017-backup-architecture.md) — what we can restore from
- [`restic-backups.md`](./restic-backups.md) — restore procedure
- [`supply-chain.md`](./supply-chain.md) — for CVE-driven (rather than active-incident) work
- [`reference-secrets-cache`](../../.claude/projects/-home-drukker-aiqadam/memory/reference_secrets_cache.md) — inventory of what could leak
