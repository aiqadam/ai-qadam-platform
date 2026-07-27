# ISS-INFRA-003 — Backups silently stopped after Coolify removal

**Severity:** blocker
**Module:** infrastructure / backups
**Status:** RESOLVED 2026-07-27 by `wf-20260727-fix-134` — but see the
correction below.

> ## ⚠️ Diagnosis corrected 2026-07-27 by [ISS-INFRA-004](ISS-INFRA-004.md)
>
> This issue concluded the backups "silently stopped" after the Coolify
> removal. That was inferred from reading the scripts, **not** from
> observing the hosts, and it is wrong.
>
> Direct inspection of both live hosts shows `restic` is **not installed**,
> `/etc/restic` **does not exist**, no scripts are installed, and **zero**
> `aiqadam-*` timers are configured. The backup system was never deployed
> to the pro-data.tech hosts at all — it lived only on the decommissioned
> Coolify host. Prod has had **no backups since it was provisioned**.
>
> The code fixes in this issue remain correct and necessary; they were
> just not sufficient, and the impact statement below understates the
> problem. See [ISS-INFRA-004](ISS-INFRA-004.md).
**Business-Process:** —

## Symptom

Both restic backup scripts abort before taking a snapshot on any host without
Coolify. No error surfaces to an operator — the systemd units simply fail, and
the R2 repo stops gaining snapshots.

## Root cause

`infrastructure/restic/aiqadam-db-dump.sh` (hourly) and
`infrastructure/restic/aiqadam-backup.sh` (daily) both ran:

```bash
docker exec coolify-db pg_dump -U coolify -d coolify --clean --if-exists \
  | gzip > "${DUMP_DIR}/coolify.sql.gz"
```

Both scripts set `set -euo pipefail` at the top. Coolify was removed from CI/CD
on 2026-07-23 (PR #45, [ADR-0007](../../docs/adr/0007-coolify-orchestration.md))
and the host it ran on was decommissioned
([ADR-0040](../../docs/adr/0040-deployment-target-pro-data-tech.md), commit
`ef50eba`), so the `coolify-db` container does not exist. The failed
`docker exec` therefore terminated each script **before** its `restic backup`
call.

Three compounding faults in the same code path:

1. **Dead container discovery.** Both scripts resolved Postgres with
   `--filter 'ancestor=pgvector/pgvector:pg16'` and fell back to a hard-coded
   Coolify container ID (`rmh626agrz1uiv8cyny47rbb`). The current hosts run
   `postgres:16` as `aiqadam-<env>-postgres-1`, so discovery would have failed
   even without the Coolify dump.
2. **Dead backup path.** `aiqadam-backup.sh`'s `PATHS` array led with
   `/data/coolify`, which does not exist on the new hosts. That one degraded
   gracefully (`WARN: skipping missing path`), but the effect was that the daily
   snapshot captured no application state at all.
3. **Drill asserted the dead path.** `aiqadam-restore-drill.sh` listed
   `data/coolify/source` in `REQUIRED_PATHS`, so the monthly drill hard-failed
   with "required path missing in restore" — reporting a broken backup, while
   the real defect was a stale assertion.

## Impact

**Data-loss risk.** Between the Coolify removal (2026-07-23) and this fix
reaching the hosts, it is likely that **no DB snapshots were taken at all**.
The stated Phase 1 RTO of 4 hours was not achievable in that window.

## Fix

- Runtime Postgres discovery: `PG_CONTAINER` env override →
  `aiqadam-<env>-postgres-1` → any `postgres:16`; hard error if none found.
- Removed the `pg_dump coolify` step from both scripts.
- Added an empty-dump guard so a broken `pg_dumpall` fails the run rather than
  shipping a useless snapshot to R2.
- `PATHS` now covers `/opt/apps/aiqadam-{prod,qa}` (`$APP_DIR`) and
  `/etc/letsencrypt`; Coolify-specific excludes replaced with
  `node_modules` / `.git` / `dist`.
- `REQUIRED_PATHS` asserts `var/backups/aiqadam` (proves the DB dump reached the
  snapshot) instead of `data/coolify/source`.
- `--host=aiqadam-web` deliberately retained as an opaque restic series label;
  changing it would split snapshot history and break `restic forget` grouping.

## Verification

- `shellcheck --severity=warning` clean on all three scripts (CI parity with
  `restic-drill-lint.yml`).
- `bash -n` clean on all three.
- No executable Coolify reference remains (`grep` for non-comment lines).

**Not verified live.** These scripts run on the QA/prod hosts, which this
workflow has no access to. Deploying them is a host-side action:

```bash
sudo install -m 0755 -o root -g root \
  infrastructure/restic/aiqadam-db-dump.sh /usr/local/sbin/aiqadam-db-dump.sh
sudo install -m 0755 -o root -g root \
  infrastructure/restic/aiqadam-backup.sh /usr/local/sbin/aiqadam-backup.sh
sudo /usr/local/sbin/aiqadam-db-dump.sh          # manual run
restic snapshots --tag aiqadam-db-hourly --last  # confirm a new snapshot
```

## Follow-up

`wf-20260727-fix-135-verify-backups-live` — deploy to both hosts, confirm a
fresh snapshot appears, and quantify the snapshot gap.
