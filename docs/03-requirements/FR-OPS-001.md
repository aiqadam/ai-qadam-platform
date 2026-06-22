---
code: FR-OPS-001
name: Snapshot, restore, and backup UI (Backrest + restic)
status: Shipped
module: Ops / Infra (OPS)
phase: V1 ops (issues #298–#337)
---

## Description

The platform has a fast, self-hosted snapshot-and-restore capability so operators can recover from risky configuration changes (especially Coolify API writes) within minutes. Backrest provides a web UI over restic backups stored in Cloudflare R2. The system is independent of the main platform so it survives a full platform outage.

## Users

Super Admin (super-admin role only — access gated via Authentik SSO).

## Functional scope

1. **Hourly DB snapshots** — `infrastructure/restic/aiqadam-backup.sh` extended to add pre-backup hooks:
   ```bash
   pg_dump -h coolify-db -U coolify -d coolify | gzip > /backup/snapshots/coolify-<timestamp>.sql.gz
   pg_dump -h aiqadam-pg -U directus -d directus | gzip > /backup/snapshots/directus-<timestamp>.sql.gz
   ```
   The `/backup/snapshots/` directory is included in the restic backup path. Schedule changed from daily to **hourly** for DB dumps (full filesystem backup stays daily).

2. **Backrest container** — `garethgeorge/backrest` (MIT). Coolify service `aiqadam-backrest`:
   - Mounts: `/etc/restic/r2.env` (read-only) + `/var/lib/backrest` (state).
   - Env: `BACKREST_PORT=9898`.
   - FQDN: `https://ops.aiqadam.org` (new subdomain, covered by wildcard cert).
   - Pre-configured with one "repo" entry pointing at the existing R2 path (same snapshots restic already produces).
   - Backrest's own scheduler is **disabled** — the existing systemd timer is the sole scheduler to avoid concurrent writes.

3. **Authentik OIDC gate** — `ops.aiqadam.org` is behind the Authentik Proxy Outpost (per ADR-0032 no-auth-islands). Access restricted to the `aiqadam-super-admin` Authentik group.

4. **Gatus probe** — Two new Gatus endpoints:
   - `backrest-ui`: probes `https://ops.aiqadam.org/api/health` every 5 minutes.
   - `backup-freshness`: probes Backrest's snapshots API every hour; alerts if latest snapshot is older than 2 hours.

5. **Runbook** — `docs/04-development/infrastructure/runbooks/snapshot-restore.md` covering: manual snapshot before a risky op, restoring Coolify config, restoring Directus config, restoring filesystem state, and what restic snapshots do NOT capture.

6. **R2 usage** — Stays well under 10 GB free tier (restic dedup means size is bounded by the largest single snapshot × a small multiplier).

## Acceptance criteria

- [ ] `restic snapshots` lists hourly entries after the first scheduled run.
- [ ] `restic restore <id> --target /tmp/probe --include /backup/snapshots/coolify-*.sql.gz` produces a recoverable dump.
- [ ] `https://ops.aiqadam.org` renders the Backrest UI; anonymous access is blocked (redirects to Authentik).
- [ ] Only `aiqadam-super-admin` group members can sign in to `ops.aiqadam.org`.
- [ ] Backrest shows the existing restic snapshots (both daily filesystem and hourly DB dumps).
- [ ] Gatus shows `backup-freshness ✓` when restic ran in the last hour; if the timer is stopped for 3 hours, an alert fires.
- [ ] Total R2 usage after 30 days of hourly dumps is under 2 GB (verify with `wrangler r2 bucket info`).
- [ ] A manual restore of the Coolify DB from a snapshot succeeds via the runbook steps.

## Notes

- Triggered by the 2026-05-24 outage (two incidents from Coolify API writes with no rollback path).
- Backrest must NOT have its own scheduler enabled — two schedulers writing to the same restic repo risk race conditions and repo corruption.
- What snapshots do NOT capture: Postgres WAL (point-in-time only), Cloudflare DNS records, Authentik internal state. Document this clearly in the runbook.
- See `plans/f-ops1-snapshot-restore-ui.md` for full implementation details and PR breakdown.
