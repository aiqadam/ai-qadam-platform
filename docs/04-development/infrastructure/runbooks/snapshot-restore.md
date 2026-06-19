# Runbook: snapshot + restore (F-OPS1)

**Audience:** any super-admin who needs to roll back Coolify, Directus, Authentik, or the platform DB after a bad write (manual SQL, broken Coolify API call, accidental config drop). Established after the 2026-05-24 web outage.

**Pre-reading:**
- [`docs/03-requirements/plans/f-ops1-snapshot-restore-ui.md`](../../../03-requirements/plans/f-ops1-snapshot-restore-ui.md) — the architecture decision
- [`docs/04-development/infrastructure/runbooks/restic-backups.md`](restic-backups.md) — the underlying restic setup
- [`.claude/projects/-home-drukker-aiqadam/memory/feedback_coolify_custom_labels_replaces_autogen.md`](../../.claude/projects/-home-drukker-aiqadam/memory/feedback_coolify_custom_labels_replaces_autogen.md) — the incident this exists to recover from faster

## When to use this runbook

Any of:
- A Coolify API write (`PATCH /applications/.../envs`, `domains`, `custom_labels`, etc.) just bricked a service and you can't easily reconstruct the prior state.
- A Directus collection migration dropped data.
- An Authentik policy or flow edit locked everyone out.
- A platform DB migration ran the wrong way and you need to revert.

The hourly DB-only snapshot (`aiqadam-db-hourly` tag) and the daily full-system snapshot (`aiqadam-baseline` tag) cover all four cases. Worst-case data loss = ~1 hour since the last hourly dump.

## Architecture in one paragraph

`aiqadam-db-dump.sh` runs hourly via systemd; `pg_dumpall` the shared Postgres cluster (containing `platform`, `authentik`, `directus`) + `pg_dump coolify` from the Coolify-managed Postgres. Both dumps land at `/var/backups/aiqadam/db-dumps/<utc-ts>/` and get pushed to the existing Cloudflare R2 restic repo with tag `aiqadam-db-hourly`. The daily filesystem backup (`aiqadam-baseline`) also re-dumps DBs as a pre-hook. Backrest at https://ops.aiqadam.org provides a web UI over the same repo — browse snapshots, click "Restore" — but the CLI on the prod host is the authoritative recovery path.

## The fast path: restore a specific DB to a previous snapshot

This is the routine "I broke Coolify config 20 minutes ago, give me the 12:00 snapshot of the coolify DB" flow.

### 1. Find the snapshot you want

Either:

**Via Backrest UI** (sign in at https://ops.aiqadam.org as a super-admin):
- Repos → aiqadam-r2 → Snapshots
- Filter by tag `aiqadam-db-hourly`
- Note the snapshot ID for the timestamp you want

**Via CLI** on the prod host:
```bash
ssh aiqadam-admin@212.20.151.29
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; \
  restic snapshots --tag=aiqadam-db-hourly --compact'
```

### 2. Restore the dump file (non-destructive — to /tmp first)

```bash
SCRATCH=/tmp/aiqadam-restore-$(date -u +%Y%m%dT%H%M%S)
sudo mkdir -p "$SCRATCH"
sudo bash -c "set -a; . /etc/restic/r2.env; set +a; \
  restic restore <snapshot-id> --target $SCRATCH"
sudo find $SCRATCH -name '*.sql.gz'
```

You'll get something like:
```
/tmp/aiqadam-restore-.../var/backups/aiqadam/db-dumps/20260524T120000Z/coolify.sql.gz
/tmp/aiqadam-restore-.../var/backups/aiqadam/db-dumps/20260524T120000Z/shared-pg-all.sql.gz
```

### 3. Inspect the dump (always do this before applying)

```bash
sudo zcat $SCRATCH/.../coolify.sql.gz | head -50      # check it's not corrupt
sudo zcat $SCRATCH/.../coolify.sql.gz | grep -c CREATE  # rough table count
```

### 4. Apply ONE table at a time, NOT the full dump

⚠️ The `pg_dump --clean --if-exists` dumps include `DROP TABLE ... CASCADE` for every table. Applying the full dump nukes everything in the target DB. **Never `psql < full-dump.sql` against a live DB unless you're rebuilding from zero.**

For the Coolify config-rollback case (the 2026-05-24 incident), you almost always want to restore ONE row in ONE table:

```bash
# Example: restore Coolify's `applications` table from snapshot
sudo zcat $SCRATCH/.../coolify.sql.gz \
  | grep -A 9999 'COPY public.applications' \
  | grep -B 9999 -m 1 '\\\.' \
  > /tmp/applications-rows.sql

# Then apply in a transaction so you can rollback if it looks wrong
sudo docker exec -i coolify-db psql -U coolify -d coolify <<'SQL'
BEGIN;
TRUNCATE public.applications CASCADE;
\i /tmp/applications-rows.sql
-- inspect a few rows + commit if OK
SELECT uuid, name, custom_labels FROM applications;
COMMIT;
SQL
```

### 5. Restart affected containers

If you restored Coolify's `applications` table, redeploy the affected apps so Traefik labels regenerate:

```bash
# Via Coolify API (preferred — atomic + idempotent)
CFY=$(cat /tmp/aiqadam-secrets-COOLIFY_TOKEN)
curl -X POST -H "Authorization: Bearer $CFY" \
  "https://coolify.aiqadam.org/api/v1/deploy?uuid=<app-uuid>&force=true"
```

### 6. Verify + clean up scratch

```bash
# Smoke the recovered service via the public URL
curl -sS -o /dev/null -w "%{http_code}\n" https://<recovered-host>/

# Drop the scratch dir
sudo rm -rf $SCRATCH
```

## The slow path: full Coolify rebuild

If Coolify's whole DB is corrupt (not just one table), restore the entire `coolify` DB:

```bash
# 1. Restore dump (as above)
# 2. Drop + recreate the coolify DB
sudo docker exec coolify-db psql -U postgres <<'SQL'
DROP DATABASE coolify;
CREATE DATABASE coolify OWNER coolify;
SQL

# 3. Apply the full dump
sudo zcat $SCRATCH/.../coolify.sql.gz \
  | sudo docker exec -i coolify-db psql -U coolify -d coolify

# 4. Restart Coolify entirely
sudo docker compose -f /data/coolify/source/docker-compose.yml restart coolify coolify-realtime coolify-redis
```

Total downtime: ~5 min. All Coolify-managed services keep running during this (Coolify's control plane is offline but Traefik + the apps stay up).

## Restoring Authentik or Directus

The `shared-pg-all.sql.gz` from any hourly snapshot includes the `authentik`, `directus`, AND `platform` databases (it's a full `pg_dumpall` from the shared cluster).

```bash
# Extract just one DB from the cluster dump
sudo zcat $SCRATCH/.../shared-pg-all.sql.gz \
  | sed -n '/^\\connect authentik/,/^\\connect /p' \
  > /tmp/authentik-only.sql

# Apply (TRUNCATE + reload is safer than DROP DB on a shared cluster)
sudo docker exec -i <shared-pg-container> psql -U postgres -d authentik \
  -c 'TRUNCATE authentik_core_user CASCADE'  # adjust target tables
sudo docker exec -i <shared-pg-container> psql -U postgres -d authentik < /tmp/authentik-only.sql

# Restart Authentik
sudo docker restart authentik-server authentik-worker
```

Use the same pattern for `directus` or `platform`.

## What NOT to do

- ❌ Don't apply a full `pg_dumpall` against the live shared cluster — you'll TRUNCATE every DB at once.
- ❌ Don't run `restic restore` to `/`. It overwrites in place. Always restore to a scratch dir first.
- ❌ Don't write to the restic repo from Backrest (it has scheduling disabled for a reason — the systemd timer is the single writer).
- ❌ Don't rotate the restic repo password without first verifying a fresh restore works with the new password on a scratch host.

## Verification cron

The existing `aiqadam-restore-drill.timer` (see [`restic-backups.md`](restic-backups.md)) runs a non-destructive drill monthly. After F-OPS1-a landed, the drill also surfaces the latest `aiqadam-db-hourly` snapshot and decompresses one DB dump to verify integrity. If it fails, you'll get a Gatus alert via Telegram.

## Related

- [F-OPS1 plan](../../../03-requirements/plans/f-ops1-snapshot-restore-ui.md) — design rationale
- [restic-backups.md](restic-backups.md) — the underlying backup architecture
- [break-glass.md](../../security/runbooks/break-glass.md) — when SSO is also broken
- [coolify-bootstrap.md](coolify-bootstrap.md) — full Coolify rebuild from zero (different scenario; this runbook covers data-level recovery)
