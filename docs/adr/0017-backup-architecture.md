# ADR-0017: Backup architecture — restic to Cloudflare R2

## Status
Accepted, 2026-05-15

## Context
[SECURITY.md §"Backup strategy"](../../.claude/SECURITY.md) requires:

- Daily Postgres dumps, encrypted, off-site
- Daily restic snapshots of MinIO buckets
- Retention 30 daily / 12 weekly / 12 monthly
- Off-site (different geography from the platform host)
- Quarterly restore tests; annual full disaster-recovery drill
- RTO 4 hours, RPO 24 hours

Two open sub-decisions to make concrete:

1. **Backup tool** — what does the encryption + dedup + scheduling
2. **Off-site target** — where do encrypted blobs live

## Decision

**Tool:** `restic` (Apache 2.0, Go binary, single-file install via apt). Client-side encryption with a passphrase only we hold; deduplication; incremental snapshots; supports S3-compatible backends natively.

**Off-site target:** **Cloudflare R2** in the same Cloudflare account that holds DNS, Email Routing, Email Workers (per [ADR-0009](0009-email-stack-saas-exception.md)). Bucket `aiqadam-backups`, S3 API endpoint `https://<account-id>.r2.cloudflarestorage.com/aiqadam-backups`.

**Schedule:** systemd timer at 03:00 UTC daily with 0–5 min jitter. `restic forget --prune` applied each run with retention `30 daily / 12 weekly / 12 monthly`.

**Encryption:** restic's default — XChaCha20-Poly1305 with key derived from the repo passphrase via scrypt. The passphrase lives at `/etc/restic/repo-password` (mode `600 root:root`) on the host AND in the operator's password manager. Lose both copies = lose the backups, irreversibly.

**Initial scope:** `/data/coolify`, `/etc/iptables`, `/etc/ssh/sshd_config.d`, `/etc/fail2ban` — the configuration and orchestration state needed to rebuild the platform on a fresh host. Application data (Postgres dumps, MinIO buckets) joins as those stacks come online (procedure documented in [docs/runbooks/restic-backups.md](../runbooks/restic-backups.md)).

## Rationale

### restic over alternatives

- **Borg / borgbackup** — also OSS, also encryption + dedup, but uses its own protocol (no S3 backend natively). Requires a borg-aware target host (rsync.net offers this). Not free for off-site at our scale.
- **Duplicity** — older, GnuPG-based, slower, less dedup. Not the modern choice.
- **rclone alone** — copies files but no incremental dedup, no client-side encryption (you'd layer it).
- **Native pg_dump → S3** — works for Postgres but doesn't cover MinIO or Coolify state. We'd need separate tooling per data type.

restic gives us **one tool for everything** with strong defaults.

### Cloudflare R2 over alternatives

- **Backblaze B2** — strong restic-friendly host, 10 GB free, but smaller daily op limits (2,500 Class A/day vs R2's monthly 1M). Adds a second vendor account to manage.
- **AWS S3** — 5 GB free for 12 months only, then paid. Not truly free.
- **Hetzner Storage Box** — paid (~€3.81/mo), but cheap and well-regarded.
- **Self-hosted secondary VM** — complete control, recurring VM cost.

Cloudflare R2 is the natural fit because:
- Same account as DNS + Email Routing + Workers (one vendor relationship to manage)
- 10 GB free + 1M Class A ops free is comfortably above our actual usage (~440 KiB initial, ~10s of ops/day)
- **Zero egress fees** — restoration won't cost anything
- S3-compatible API works directly with restic

### Single off-site target accepted for Phase 1

Best practice is two off-site copies in different vendors (3-2-1 rule: 3 copies, 2 media, 1 off-site). Phase 1 has only one off-site (R2). Acceptable risk because:

- Cloudflare R2 has commercial-grade durability (11 nines stated)
- Phase 1 stakes are low (community platform, no financial data, no PII beyond email + name + city)
- Adding a tertiary copy is straightforward later (rclone copy R2 → B2 nightly)

Revisit when Phase 1 ends (or sooner if data sensitivity grows).

## Consequences

- ✅ Free, working backups today
- ✅ Single tool, single command (`/usr/local/sbin/aiqadam-backup.sh`) for the entire host's backup
- ✅ Client-side encryption — even if R2 is compromised, attacker gets useless ciphertext
- ✅ Deduplication — daily snapshots are incremental in storage cost
- ✅ Restic supports point-in-time restore, file-level restore, full-host disaster recovery
- ⚠️ **Lose `/etc/restic/repo-password` AND its password-manager copy = backups irrecoverable.** Most critical secret in the system.
- ⚠️ **Single off-site target.** If Cloudflare R2 has a regional outage during a recovery scenario, RTO extends to "until they're back." Accepted for Phase 1.
- ⚠️ **No automated backup-success alerting** in Phase 1. Manual journalctl check weekly. Alerts come with the observability stack.
- 📝 Backup scope **excludes** application data right now (Postgres, MinIO) because those stacks aren't deployed yet. Extension procedure in the runbook.

## Updates / amendments

- 2026-05-15: Initial decision. R2 free tier ample. Backup script + timer live on `aiqadam-web`. First snapshot `c215a840` verified end-to-end (backup → integrity check → restore-test PERFECT MATCH).

## References
- [SECURITY.md §"Backup strategy"](../../.claude/SECURITY.md) — the requirement this implements
- [ADR-0009](0009-email-stack-saas-exception.md) — the broader Cloudflare-services exception (R2 joins the existing DNS + Email Routing + Workers)
- [docs/runbooks/restic-backups.md](../runbooks/restic-backups.md) — operational procedures
- [restic docs](https://restic.readthedocs.io)
