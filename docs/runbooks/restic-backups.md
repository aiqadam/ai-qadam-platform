# Runbook: restic backups to Cloudflare R2

**Audience:** anyone responsible for backup operations on `aiqadam-web` — verifying schedules run, restoring files, rotating keys, recovering on a fresh host.
**Pre-reading:** [ADR-0017](../adr/0017-backup-architecture.md).
**Procedure source:** the actual setup performed on 2026-05-15.

## Architecture in one paragraph

`restic` runs daily at 03:00 UTC via systemd timer on the platform host, encrypts everything client-side with a passphrase only we know, and pushes incremental snapshots to a Cloudflare R2 bucket (`aiqadam-backups`) over the S3-compatible API. R2 stores the encrypted blobs but cannot decrypt them. Retention is `30 daily / 12 weekly / 12 monthly`. First backup: ~440 KiB; growth is dominated by new container state, not log volume (excluded).

```
   /data/coolify, /etc/iptables, /etc/ssh/sshd_config.d, /etc/fail2ban
                                │
                                ▼
                          [ aiqadam-backup.sh ]
                                │
                                ▼     reads /etc/restic/r2.env
                            [ restic ]   reads /etc/restic/repo-password
                                │
                          (encrypts client-side)
                                │
                                ▼
              s3://<account>.r2.cloudflarestorage.com/aiqadam-backups
```

## File inventory

| Path | Mode / owner | Purpose |
|---|---|---|
| `/etc/restic/r2.env` | `600 root:root` | R2 credentials + repo URL + pointer to password file |
| `/etc/restic/repo-password` | `600 root:root` | The repository encryption passphrase, raw single-line text |
| `/usr/local/sbin/aiqadam-backup.sh` | `755 root:root` | The backup script (loads env, runs `restic backup`, applies retention) |
| `/etc/systemd/system/aiqadam-backup.service` | `644 root:root` | systemd oneshot wrapping the script |
| `/etc/systemd/system/aiqadam-backup.timer` | `644 root:root` | Daily 03:00 UTC trigger |

## Operational commands (the cheat-sheet you actually need)

All run on the platform host as `aiqadam-admin`. The `set -a; . /etc/restic/r2.env; set +a` prefix loads credentials into environment for the `restic` invocation.

### Run a backup right now

```bash
sudo /usr/local/sbin/aiqadam-backup.sh
```

### List existing snapshots

```bash
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; restic snapshots'
```

### Verify repository integrity

```bash
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; restic check'
```

Run quarterly per [SECURITY.md §"Recovery testing"](../../.claude/SECURITY.md). Full data verification is `restic check --read-data` — slower (downloads all chunks for re-verification) but the gold-standard check; do annually.

### See the timer state

```bash
sudo systemctl list-timers aiqadam-backup.timer --no-pager
sudo systemctl status aiqadam-backup.service --no-pager
sudo journalctl -u aiqadam-backup.service --since '7 days ago' --no-pager
```

### Restore a single file

```bash
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; \
  restic restore latest \
    --target /tmp/restore \
    --include /etc/iptables/rules.v4'
# File appears at /tmp/restore/etc/iptables/rules.v4 — same path under target
```

### Restore an entire snapshot to original locations (DESTRUCTIVE)

⚠️ **Only do this in a recovery scenario.** Restic overwrites files in place if you target `/`.

```bash
# Staging restore first (safe), then move into place after diff'ing
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; \
  restic restore latest --target /tmp/restore-full'

# Inspect /tmp/restore-full, then move pieces back where needed (rsync, cp, etc.)
```

For full host disaster recovery (lost the VM), use the procedure in [coolify-bootstrap.md](coolify-bootstrap.md) to bring up a fresh box, then restore `/data/coolify`, `/etc/iptables`, `/etc/ssh/sshd_config.d`, `/etc/fail2ban` from latest snapshot.

### Mount the repo as a filesystem (browse like any directory)

```bash
sudo mkdir -p /mnt/restic
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; restic mount /mnt/restic'
# In a SEPARATE terminal:
ls /mnt/restic/snapshots/latest/
# Ctrl-C in the first terminal to unmount
```

Useful for ad-hoc inspection without restoring.

## Adding new paths to the backup

When a new state-bearing service lands (Postgres data dir, MinIO buckets, etc.), edit the `PATHS` array in `/usr/local/sbin/aiqadam-backup.sh`. For databases, add a pre-backup hook that writes a fresh dump:

```bash
# Pseudo-pattern for adding Postgres dumps to the backup
PG_DUMP_DIR=/var/backups/postgres
mkdir -p "$PG_DUMP_DIR"
sudo docker exec coolify-db pg_dumpall -U coolify | gzip > "$PG_DUMP_DIR/$(date +%F).sql.gz"
PATHS+=("$PG_DUMP_DIR")
```

Then run a manual backup to verify (`sudo /usr/local/sbin/aiqadam-backup.sh`) and check with `restic snapshots` that the new path is included.

For MinIO buckets, restic can back up the underlying `/data/coolify/applications/<minio>/data` directly, OR use `mc mirror` to a pre-backup staging dir first. The trade-off: backing up the data dir is faster but skips MinIO's metadata sanity (object listings). Decide when MinIO actually lands.

## Quarterly restore drill (per SECURITY.md)

Once a quarter, perform a documented restore drill:

1. Pick a non-trivial path (e.g., the `/data/coolify/source/.env` after Coolify settings have changed).
2. Restore from the latest snapshot to `/tmp/drill`.
3. Verify file integrity (diff against current; if you need older state, inspect snapshot timestamps).
4. Note in `docs/restore-drills/YYYY-Qn.md`: snapshot ID, file restored, time elapsed, any anomalies.
5. If the drill exposes any failure (corrupted file, missing path, slow restore), fix BEFORE resuming normal backup operation.

Annually, run a full disaster-recovery drill: provision a fresh VM, follow [coolify-bootstrap.md](coolify-bootstrap.md), restore `/data/coolify` from R2, verify Coolify boots and admin login works.

## Key rotation

### Rotate R2 credentials (annually or on suspected compromise)

1. Cloudflare R2 → **Manage R2 API Tokens** → **Create API Token** with same scope (`Object Read & Write`, bucket `aiqadam-backups`).
2. Edit `/etc/restic/r2.env`: replace `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` with the new values.
3. `sudo /usr/local/sbin/aiqadam-backup.sh` — verify backup completes with new key.
4. Cloudflare R2 → revoke the old token.

### Rotate restic repo password (annually)

restic supports atomic password change without re-encrypting the repository:

```bash
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; restic key add'
# Restic prompts for the NEW password. Save to password manager BEFORE typing.
# Then edit /etc/restic/repo-password to replace with the new password.
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; restic key list'
# Note the old key ID. Test the new password works:
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; restic snapshots'
# Once confirmed, remove the old key:
sudo bash -c 'set -a; . /etc/restic/r2.env; set +a; restic key remove <OLD_KEY_ID>'
```

## Monitoring & alerts (Phase 1)

For Phase 1, monitoring is **manual**: glance at `journalctl -u aiqadam-backup.service` weekly to ensure the daily run is succeeding. Once observability stack lands (Phase 1 weeks 8–10), add:

- A Grafana panel reading the journal for the most recent run's exit code / duration / files-changed
- Alert if no successful backup in 48 hours
- Alert if backup duration exceeds 30 minutes (would indicate something pathological)

Until then, set a personal calendar reminder for weekly check.

## Cost monitoring (R2 free tier)

Cloudflare R2 free tier monthly allowance: 10 GB storage, 1M Class A operations, 10M Class B operations. Our usage is roughly 0.5% of Class A and <0.1% of storage. Check periodically:

- Cloudflare dashboard → **R2** → bucket `aiqadam-backups` → **Metrics** tab
- If approaching any limit, check `aiqadam-backup.sh` for accidentally added large paths

## What this runbook does NOT cover

- Backing up production application data — Postgres, MinIO, etc. — those land as those stacks come online (extension procedure documented above)
- Off-host secondary backup target — current setup has one off-site target (R2). Adding a second copy elsewhere (e.g., to Backblaze B2 as a tertiary) is a Phase 2+ consideration once stakes are higher
- Cross-region disaster scenarios — R2's "Automatic" location replicates across Cloudflare's edge, but if R2 itself goes down regionally, we wait for recovery (acceptable for Phase 1 RTO of 4 hours)
