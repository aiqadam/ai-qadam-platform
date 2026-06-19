# F-OPS1 — Snapshot + Restore + UI for the operational layer

**Status:** Proposed
**Owner:** Viktor (PM) — TBD on engineering owner
**Triggered by:** 2026-05-24 web outage (~40 min) caused by a Coolify `custom_labels` PATCH that wiped Coolify's auto-generated Traefik labels with no rollback path other than manual reconstruction.

## Why this exists

Two prod outages on 2026-05-24 came from API writes to Coolify's application config (`fqdn` and `custom_labels`). Both were recovered by hand, ~40 min each. Coolify v4's REST API has no rollback endpoint. The platform needs a fast, off-the-shelf "snapshot before risky write → restore on regression" capability.

Related memories established the same day:
- feedback-coolify-fqdn-patch-blast-radius
- feedback-coolify-custom-labels-replaces-autogen

## Constraints (Viktor's explicit guidance, 2026-05-24)

- **Off-the-shelf only.** "Not to wire and test something homebrew."
- **Combine with existing monitoring.** We already run Loki (logs) + Gatus (uptime probes) + restic (volume backups to Cloudflare R2). Reuse, don't replace.
- **Tiny separate container with minimal UI.** Survives main-platform outages — operator should be able to roll back even when `aiqadam.org` is 503. (Hence: NOT a cabinet under `/workspace/admin/*`.)
- **Free-tier safe.** R2 (10 GB free) is the established backend. Adding Coolify + Directus DB snapshots stays well under quota.
- **UX target:** "Like Windows Backup and Restore" — a list of point-in-time snapshots with a "Restore" button per row.

## Chosen stack

| Layer | Tool | Why |
|---|---|---|
| Backup engine | **restic** (already deployed) | OSS, free, dedup, encryption, R2-backed |
| Storage backend | **Cloudflare R2** (already configured at `/etc/restic/r2.env`) | Within free tier even with hourly Coolify DB snapshots; zero new infra |
| Backup UI | **Backrest** ([garethgeorge/backrest](https://github.com/garethgeorge/backrest), MIT) | OSS web UI for restic; scheduling, browse, restore, alerts; one container, ~50 MB |
| Auth | **Authentik OIDC** (per ADR-0032 no-auth-islands) | Backrest supports forward auth; we add a Proxy Outpost in front |
| Monitoring | **Gatus** (already deployed) | Probe Backrest's `/api/health` + a "last successful backup" endpoint; alerts to existing channel |
| Log aggregation | **Loki** (already deployed) | Backrest container logs ship via Promtail config |

**What we explicitly skip:** Coolify's UI rollback (only covers code, not config), Pulumi (heavy abstraction, kills direct-PATCH ergonomics for one-off ops), Velero (k8s-only), AWX (overkill for the small surface).

## PR breakdown

### PR-a · Extend restic backup to include Coolify + Directus DBs

**Scope.** Modify `infrastructure/restic/aiqadam-backup.sh` (or wherever the daily backup script lives — see `docs/04-development/infrastructure/runbooks/restic-backups.md`) to add a pre-backup hook:

```bash
pg_dump -h coolify-db -U coolify -d coolify | gzip > /backup/snapshots/coolify-$(date -u +%Y%m%dT%H%M%SZ).sql.gz
pg_dump -h aiqadam-pg -U directus -d directus | gzip > /backup/snapshots/directus-$(date -u +%Y%m%dT%H%M%SZ).sql.gz
```

Then add `/backup/snapshots/` to the restic backup path list. Switch the schedule from daily to **hourly** (per-app DB dumps; full FS backup stays daily).

**Acceptance.**
- `restic snapshots` lists hourly entries
- `restic restore <id> --target /tmp/probe --include /backup/snapshots/coolify-*.sql.gz` produces a recoverable dump
- Total R2 usage stays under 2 GB after 30 days (verify with `wrangler r2 bucket info`)

**Effort.** ~2 hours (script edit + systemd timer adjust + one manual drill).

**Risk.** Low. Restic dedup means cumulative size is dominated by the largest single snapshot, not the count.

---

### PR-b · Deploy Backrest container

**Scope.** New Coolify service `aiqadam-backrest`:

- Image: `garethgeorge/backrest:latest` (pin to a specific tag)
- Mounts: `/etc/restic/r2.env` (read-only — restic backend creds) + `/var/lib/backrest` (its own state)
- Env: `BACKREST_PORT=9898`
- FQDN: `https://ops.aiqadam.org` (new subdomain — wildcard cert covers it)
- Pre-config: a JSON config file with one "repo" entry pointing at the existing R2 path so Backrest sees the same snapshots restic already produces

**Acceptance.**
- `https://ops.aiqadam.org` renders Backrest UI
- Listing the repo shows the existing daily snapshots
- A manual restore-to-scratch via Backrest succeeds

**Effort.** ~3 hours.

**Risk.** Medium. Backrest must NOT introduce concurrent writes to the restic repo (its scheduler can be disabled — we keep the existing systemd timer as source of truth). Document this clearly.

---

### PR-c · Backrest behind Authentik OIDC

**Scope.** Per ADR-0032 (no auth islands), `ops.aiqadam.org` must SSO. Two options:

1. Add Backrest to the Authentik Proxy Outpost — the outpost terminates auth, forwards to Backrest with user headers.
2. Use Backrest's built-in `--auth oidc` mode (if it supports OIDC directly; check docs).

Preferred: Option 1, mirroring the pattern we use for other proxied services. Reuses the Proxy Outpost machinery from F-S2.12.

**Acceptance.**
- Anon visit to `https://ops.aiqadam.org` redirects to Authentik
- Only `aiqadam-super-admin` group members can access (Authentik policy on the application)
- Authentik logout cleanly invalidates Backrest session

**Effort.** ~2 hours.

**Risk.** Low. Outpost pattern is well-trodden.

---

### PR-d · Gatus probe on backup freshness

**Scope.** Two new Gatus endpoints:

```yaml
- name: backrest-ui
  url: https://ops.aiqadam.org/api/health
  interval: 5m
  conditions: ["[STATUS] == 200"]

- name: backup-freshness
  url: https://ops.aiqadam.org/api/v1/repos/main/snapshots?limit=1
  interval: 1h
  conditions:
    - "[STATUS] == 200"
    - "[BODY].[0].time > $(now-2h)"  # latest snapshot within 2 hours
  alerts:
    - type: email  # or whichever channel we route critical alerts through
```

**Acceptance.**
- Gatus shows `backup-freshness` ✓ when restic ran in the last hour
- Stop the restic timer for 3 hours → Gatus alerts within the SLA

**Effort.** ~1 hour.

**Risk.** Low.

---

## Runbook (to land alongside PR-d)

`docs/04-development/infrastructure/runbooks/snapshot-restore.md` — covering:

1. **Snapshot before a risky op.** Manual: SSH + `restic backup --tag pre-<change-name>`. Or via Backrest UI "Run now".
2. **Restoring Coolify config** (today's failure mode). Step-by-step `psql coolify < snapshot.sql` with the necessary `docker exec` invocations.
3. **Restoring Directus config.** Same shape.
4. **Restoring filesystem state.** Existing `restic-backups.md` covers this.
5. **What restic snapshots do NOT capture.** Postgres WAL (we capture point-in-time, not continuous). Cloudflare DNS records. Authentik internal state (covered separately under `data/coolify/source`).

## Triggers to revisit (i.e. when to drop tools or scale up)

- **More than 50 Coolify config writes per month** → we're using the API too often; consider Pulumi (config-as-code) on top of Backrest.
- **R2 usage approaches 8 GB** → tighten restic retention policy (`forget --keep-hourly 24 --keep-daily 14 --keep-weekly 8 --keep-monthly 6`).
- **Operators using the Backrest UI more than once a week** → the snapshot/restore loop is too slow; redesign with surgical per-app rollback (something like Coolify's "Previous Deployment" but configurable).
- **Backrest hits a CVE or maintenance gap** → fall back to plain restic CLI + a tiny `scripts/coolify-snapshot-list.sh` (no UI but functional).

## Open questions

1. **Hourly cadence vs more aggressive?** PR-a proposes hourly. A "snapshot-on-Coolify-config-change" hook (Coolify webhook → trigger restic) would be ideal but Coolify doesn't expose such a webhook. Hourly is the realistic floor.
2. **Backrest scheduler vs systemd timer.** Two schedulers writing to the same repo invite races. Keep systemd as primary; disable Backrest's scheduler; document this.
3. **Snapshot retention.** Default restic forget policy or something tighter? Defer to operator preference.
4. **Coolify DB dump auth.** The script needs Postgres creds for `coolify` and `directus` DBs. These already exist in `/tmp/aiqadam-secrets-*` on dev but the prod backup script needs them in `/etc/restic/db-creds.env` mode 600.
