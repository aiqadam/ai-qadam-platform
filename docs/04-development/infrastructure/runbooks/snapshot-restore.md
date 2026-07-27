# Runbook: snapshot + restore (F-OPS1)

**Audience:** any super-admin who needs to roll back Directus, Authentik, or the
platform DB after a bad write (manual SQL, bad migration, accidental config
drop). Established after the 2026-05-24 web outage.

> **Updated 2026-07-27 (`wf-20260727-fix-134`).** This runbook — and the scripts
> behind it — assumed Coolify. Coolify was removed in PR #45 ([ADR-0007](../../../adr/0007-coolify-orchestration.md))
> and its host decommissioned ([ADR-0040](../../../adr/0040-deployment-target-pro-data-tech.md)),
> which had **broken the backups themselves**, not just this document:
> `aiqadam-db-dump.sh` and `aiqadam-backup.sh` both ran `docker exec coolify-db`
> under `set -euo pipefail`, so each aborted *before* `restic backup` and
> silently stopped producing snapshots. Both scripts are fixed; the Coolify
> recovery paths below are removed.
>
> **If you are recovering right now:** verify a recent snapshot actually exists
> before relying on it — `restic snapshots --tag aiqadam-db-hourly --last`. There
> may be a gap between the Coolify removal and this fix landing on the hosts.

**Pre-reading:**
- [`docs/03-requirements/plans/f-ops1-snapshot-restore-ui.md`](../../../03-requirements/plans/f-ops1-snapshot-restore-ui.md) — the architecture decision
- [`docs/04-development/infrastructure/runbooks/restic-backups.md`](restic-backups.md) — the underlying restic setup

## When to use this runbook

Any of:
- A Directus collection migration dropped data.
- An Authentik policy or flow edit locked everyone out.
- A platform DB migration ran the wrong way and you need to revert.
- A bad deploy left `$APP_DIR` (`/opt/apps/aiqadam-{prod,qa}`) in a state you
  cannot reconstruct from git.

The hourly DB-only snapshot (`aiqadam-db-hourly` tag) and the daily full-system
snapshot (`aiqadam-baseline` tag) cover all four cases. Worst-case data loss =
~1 hour since the last hourly dump.

## Architecture in one paragraph

`aiqadam-db-dump.sh` runs hourly via systemd and `pg_dumpall`s the Postgres
cluster (containing `platform`, `authentik`, `directus`). The dump lands at
`/var/backups/aiqadam/db-dumps/<utc-ts>/shared-pg-all.sql.gz` and is pushed to
the Cloudflare R2 restic repo with tag `aiqadam-db-hourly`. The daily filesystem
backup (`aiqadam-baseline`) re-dumps the DB as a pre-hook and additionally
captures `$APP_DIR`, `/etc/nginx/sites-available` (the live vhosts, which are
edited on the host and are *not* inside `$APP_DIR`), `/etc/letsencrypt`,
`/etc/iptables`, `/etc/ssh/sshd_config.d`, and `/etc/fail2ban`. Backrest at https://ops.aiqadam.org provides a web UI over
the same repo, but the CLI on the host is the authoritative recovery path.

The Postgres container is discovered at runtime (`aiqadam-<env>-postgres-1`, then
any `postgres:16` image); override with `PG_CONTAINER` in `/etc/restic/r2.env`
if that ever resolves wrong.

## The fast path: restore a specific DB to a previous snapshot

This is the routine "a migration ate the `platform` DB 20 minutes ago, give me
the 12:00 snapshot" flow.

### 1. Find the snapshot you want

Either:

**Via Backrest UI** (sign in at https://ops.aiqadam.org as a super-admin):
- Repos → aiqadam-r2 → Snapshots
- Filter by tag `aiqadam-db-hourly`
- Note the snapshot ID for the timestamp you want

**Via CLI** on the target host (prod `95.46.211.224`, QA `95.46.211.230` —
see [ADR-0040](../../../adr/0040-deployment-target-pro-data-tech.md)):
```bash
ssh <admin>@95.46.211.224
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; \
  restic snapshots --tag=aiqadam-db-hourly --compact'
```

⚠️ **Check the newest snapshot's date first.** If the latest is older than a
couple of hours, the hourly timer is not running — fix that before planning a
restore around a snapshot that does not exist.

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
/tmp/aiqadam-restore-.../var/backups/aiqadam/db-dumps/20260727T120000Z/shared-pg-all.sql.gz
```

### 3. Inspect the dump (always do this before applying)

```bash
DUMP=$(sudo find $SCRATCH -name 'shared-pg-all.sql.gz' | head -1)
sudo zcat "$DUMP" | head -50          # check it's not corrupt
sudo zcat "$DUMP" | grep -c CREATE    # rough object count
```

### 4. Apply ONE table at a time, NOT the full dump

⚠️ The `pg_dumpall --clean --if-exists` dump includes `DROP` statements for
every object in **every** database in the cluster. Applying it wholesale nukes
`platform`, `authentik`, and `directus` at once. **Never
`psql < full-dump.sql` against a live cluster unless you are rebuilding from
zero.**

Extract just the table you need, then apply it in a transaction so you can roll
back if it looks wrong:

```bash
# Resolve the running Postgres container (same discovery the backup uses)
PG=$(sudo docker ps --filter 'name=^/aiqadam-.*-postgres-1$' --format '{{.Names}}' | head -1)

# Example: pull one table's COPY block out of the cluster dump
sudo zcat "$DUMP" \
  | sed -n '/^\\connect platform/,/^\\connect /p' \
  | grep -A 9999 'COPY public.<table>' \
  | grep -B 9999 -m 1 '^\\\.' \
  > /tmp/rows.sql

sudo docker exec -i "$PG" psql -U postgres -d platform <<'SQL'
BEGIN;
TRUNCATE public.<table> CASCADE;
\i /tmp/rows.sql
SELECT count(*) FROM public.<table>;   -- sanity-check before commit
COMMIT;
SQL
```

### 5. Restart affected containers

```bash
# $APP_DIR is /opt/apps/aiqadam-prod (or -qa)
cd /opt/apps/aiqadam-prod
sudo docker compose -f deploy/docker-compose.prod.yml restart api web-next
```

### 6. Verify + clean up scratch

```bash
# Smoke the recovered service via the public URL
curl -sS -o /dev/null -w "%{http_code}\n" https://<recovered-host>/

# Drop the scratch dir
sudo rm -rf $SCRATCH
```

## The slow path: rebuild a host from zero

If a host is lost entirely, the deployment is reconstructed from git plus one
restic snapshot — there is no control-plane database to recover (that was the
Coolify model; see [ADR-0040](../../../adr/0040-deployment-target-pro-data-tech.md)).

1. **Provision** a fresh Ubuntu host and install Docker + restic.
2. **Restore host config** from the latest `aiqadam-baseline` snapshot to a
   scratch dir, then copy back `/etc/iptables`, `/etc/ssh/sshd_config.d`,
   `/etc/fail2ban`, and `/etc/letsencrypt`.
3. **Re-create `$APP_DIR`** (`/opt/apps/aiqadam-prod` or `-qa`) — either from the
   snapshot or by cloning the repo at the SHA you want to run.
4. **Restore the DB**: bring up only Postgres
   (`docker compose -f deploy/docker-compose.prod.yml up -d postgres`), then
   apply `shared-pg-all.sql.gz` to the empty cluster. This is the one case where
   applying the *full* dump is correct.
5. **Bring the stack up**: `docker compose -f deploy/docker-compose.prod.yml up -d --build`.
6. **Re-point DNS** if the IP changed, and re-add the host key + deploy key so
   `ci-cd.yml` can reach it (`PROD_SSH_HOST_KEY` / `PROD_SSH_DEPLOY_KEY`).

Expect hours, not minutes. Phase 1 RTO is 4 hours per
[security.md](../../security/security.md).

## Restoring Authentik or Directus

The `shared-pg-all.sql.gz` from any hourly snapshot includes the `authentik`, `directus`, AND `platform` databases (it's a full `pg_dumpall` from the shared cluster).

```bash
# Extract just one DB from the cluster dump
sudo zcat $SCRATCH/.../shared-pg-all.sql.gz \
  | sed -n '/^\\connect authentik/,/^\\connect /p' \
  > /tmp/authentik-only.sql

# Apply (TRUNCATE + reload is safer than DROP DB on a shared cluster)
sudo docker exec -i $PG psql -U postgres -d authentik \
  -c 'TRUNCATE authentik_core_user CASCADE'  # adjust target tables
sudo docker exec -i $PG psql -U postgres -d authentik < /tmp/authentik-only.sql

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
- [ADR-0040](../../../adr/0040-deployment-target-pro-data-tech.md) — the hosts, the compose stacks, and the deploy pipeline this runbook recovers
