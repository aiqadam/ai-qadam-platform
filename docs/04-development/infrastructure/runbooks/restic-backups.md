# Runbook: restic backups to Cloudflare R2

**Audience:** anyone responsible for backup operations on `aiqadam-web` — verifying schedules run, restoring files, rotating keys, recovering on a fresh host.
**Pre-reading:** [ADR-0017](../../../adr/0017-backup-architecture.md).
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

Run quarterly per [SECURITY.md §"Recovery testing"](../../security/security.md). Full data verification is `restic check --read-data` — slower (downloads all chunks for re-verification) but the gold-standard check; do annually.

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

## Monthly restore drill (automated, F-S0.5)

A monthly drill verifies the restore path itself works — not just that backups exist. The drill is **automated on the host** so it survives operator inattention; CI only catches script regressions before they're deployed.

### What runs on the host

| Path | Purpose |
|---|---|
| `/usr/local/sbin/aiqadam-restore-drill.sh` | The drill: restores latest snapshot to `/tmp/aiqadam-restore-drill-<timestamp>`, asserts canonical paths exist + non-empty, checks snapshot is ≤ `MAX_SNAPSHOT_AGE_DAYS` old (default 2), cleans up on exit. Emits a Plausible `backup_restore_drill` event with `result=pass`. |
| `/etc/systemd/system/aiqadam-restore-drill.service` | Oneshot service wrapping the script. Runs as root (needs `/etc/restic/r2.env`); `ProtectSystem=strict` so even a buggy run can't damage the live FS. |
| `/etc/systemd/system/aiqadam-restore-drill.timer` | Triggers `*-*-01 04:30:00` UTC (1st of each month, well after the 03:00 daily backup). `Persistent=true` so missed runs catch up after reboot. |

The canonical sources of these files live in [`infrastructure/restic/`](../../../../infrastructure/restic) — deploy from the repo to the host:

```bash
sudo install -m 750 infrastructure/restic/aiqadam-restore-drill.sh /usr/local/sbin/aiqadam-restore-drill.sh
sudo install -m 644 infrastructure/restic/aiqadam-restore-drill.service /etc/systemd/system/
sudo install -m 644 infrastructure/restic/aiqadam-restore-drill.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aiqadam-restore-drill.timer
sudo systemctl list-timers aiqadam-restore-drill.timer --no-pager   # confirm next-run schedule
```

### Running the drill on demand

When investigating an alert or doing an ad-hoc verification:

```bash
sudo /usr/local/sbin/aiqadam-restore-drill.sh
echo "exit=$?"   # 0 = pass, 1 = drill failed, 2 = config error
```

Inspect journal output for the timestamped FAIL line if exit != 0:

```bash
sudo journalctl -u aiqadam-restore-drill.service --since '7 days ago' --no-pager
```

### What CI does

[`.github/workflows/restic-drill-lint.yml`](../../../../.github/workflows/restic-drill-lint.yml) runs on every PR that touches `infrastructure/restic/**` + weekly cron. It:

1. **shellcheck** on the script (severity ≥ warning blocks)
2. **systemd-analyze verify** on the .service + .timer unit files
3. **dry-run-script** — runs the script with `restic` absent + with `RESTIC_ENV_FILE` missing, asserts each exits with code 2 (script's documented config-error code). This catches regressions in pre-flight handling before they break the monthly real drill.

CI does NOT perform a real restore — the passphrase never leaves the host. The drill itself is the verification.

### Alerting on drill failure

When the drill fails on the host, the `result=fail` Plausible event lets the F-S0.11 cron probe pick up the regression on its next run (the workflow at `.github/workflows/smoke.yml` queries Plausible for ops events). If a drill hasn't passed in > 35 days, that's a real alert — open an issue with label `restore-drill-failure` and follow this runbook's "Common failure modes" section to triage.

### Quarterly extension (per SECURITY.md)

The monthly automated drill covers the bulk of recovery-test discipline. Once per quarter, additionally perform a manual file-level diff:

1. Pick a non-trivial path that has changed recently (e.g., the `/data/coolify/source/.env` after Coolify settings have changed).
2. Restore from the latest snapshot to `/tmp/drill-q`.
3. Diff against current; if you need older state, inspect snapshot timestamps via `restic snapshots`.
4. Note in `docs/restore-drills/YYYY-Qn.md`: snapshot ID, file restored, time elapsed, any anomalies.

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
