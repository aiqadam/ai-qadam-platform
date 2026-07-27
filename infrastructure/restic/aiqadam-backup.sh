#!/usr/bin/env bash
# AI Qadam restic backup to Cloudflare R2 — daily full-system snapshot.
#
# This is the canonical source. Deploy to prod via:
#   sudo install -m 0755 -o root -g root \
#     infrastructure/restic/aiqadam-backup.sh /usr/local/sbin/aiqadam-backup.sh
#
# Runs daily at 03:00 UTC via aiqadam-backup.timer. Snapshots are tagged
# `aiqadam-baseline` so the hourly DB-dump-only run (a separate timer,
# tag `aiqadam-db-hourly`) doesn't get pruned by this script's forget.
#
# F-OPS1-a (2026-05-24): added a pg_dump pre-hook so DB state is part
# of every snapshot. Without this, a Coolify-DB corruption (e.g. our
# 2026-05-24 custom_labels incident) had no fast recovery — only the
# filesystem under /data/coolify was captured, which doesn't include
# the Postgres data dir.
#
# Manual: sudo /usr/local/sbin/aiqadam-backup.sh

set -euo pipefail

set -a
. /etc/restic/r2.env
set +a

# ──────────── F-OPS1-a: pg_dump pre-hook ──────────────────────────────
# Capture:
#   • shared Postgres cluster (platform + authentik + directus, via
#     pg_dumpall so roles + tablespaces are also captured)
#   • Coolify's own Postgres (coolify DB, hosted in a separate container)
#
# Container names are stable Coolify-managed deployments:
#   • rmh626agrz1uiv8cyny47rbb — shared Postgres (pgvector); resolve
#     dynamically in case Coolify recreates the container
#   • coolify-db — Coolify's own Postgres
#
# Dumps live at /var/backups/aiqadam/db-dumps/<ts>/ and are included
# in the restic backup paths below. We KEEP only the latest <ts>
# directory locally; restic dedup handles long-term retention.

DB_DUMP_ROOT="/var/backups/aiqadam/db-dumps"
DUMP_TS="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_DIR="${DB_DUMP_ROOT}/${DUMP_TS}"
mkdir -p "${DUMP_DIR}"
chmod 700 "${DB_DUMP_ROOT}" "${DUMP_DIR}"

# Container discovery, most-specific first:
#   1. PG_CONTAINER env override (set it in /etc/restic/r2.env to pin).
#   2. Any running container whose image is a Postgres image. Verified
#      2026-07-27 against the live hosts: prod runs `postgres:16` as
#      `aiqadam-prod-postgres-1`, but QA runs `pgvector/pgvector:pg16`
#      as `ai-qadam-test-db-1` — a name no `aiqadam-<env>-postgres-1`
#      pattern matches. Match on the image, not the name.
PG_CONTAINER="${PG_CONTAINER:-}"
if [ -z "${PG_CONTAINER}" ]; then
  PG_CONTAINER="$(docker ps --format '{{.Names}}	{{.Image}}'     | grep -Ei '(^|[/[:space:]])(postgres|pgvector)'     | awk '{print $1}' | head -1 || true)"
fi
if [ -z "${PG_CONTAINER}" ]; then
  echo "ERROR: no Postgres container found. Set PG_CONTAINER in /etc/restic/r2.env." >&2
  exit 1
fi

# The superuser is NOT always `postgres`. Read POSTGRES_USER from the
# container's own env (prod uses `aiqadam_prod`, QA uses `aiqadam`);
# `pg_dumpall -U postgres` fails with `role "postgres" does not exist`.
PG_SUPERUSER="${PG_SUPERUSER:-}"
if [ -z "${PG_SUPERUSER}" ]; then
  PG_SUPERUSER="$(docker inspect "${PG_CONTAINER}"     --format '{{range .Config.Env}}{{println .}}{{end}}'     | sed -n 's/^POSTGRES_USER=//p' | head -1 || true)"
fi
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"

# pg_dumpall captures every DB in the cluster + globals (roles,
# tablespaces). Compressed in-stream to avoid a temp file the size
# of the cluster.
echo "[pg_dumpall] cluster via ${PG_CONTAINER}"
docker exec "${PG_CONTAINER}" \
  pg_dumpall -U "${PG_SUPERUSER}" --clean --if-exists \
  | gzip > "${DUMP_DIR}/shared-pg-all.sql.gz"

# A plain `[ -s file ]` test is NOT sufficient: gzip emits a ~20-byte
# header even for empty stdin, so a failed pg_dumpall still yields a
# "non-empty" file. Verify the dump decompresses and contains SQL.
# Keep in sync with the identical guard in aiqadam-db-dump.sh.
if ! gzip -t "${DUMP_DIR}/shared-pg-all.sql.gz" 2>/dev/null; then
  echo "ERROR: dump is not valid gzip (truncated or corrupt) — refusing to back up." >&2
  exit 1
fi
if ! zcat "${DUMP_DIR}/shared-pg-all.sql.gz" | head -100 | grep -q 'ROLE\|DATABASE\|CREATE'; then
  echo "ERROR: dump decompresses but contains no SQL — refusing to back up." >&2
  exit 1
fi

# The `pg_dump coolify` step that lived here is gone (2026-07-27,
# wf-20260727-fix-134). Coolify was removed in PR #45 (ADR-0007) and its
# host decommissioned (ADR-0040); `docker exec coolify-db` failed under
# `set -euo pipefail` and aborted this script before `restic backup`
# ever ran — so the daily snapshot silently stopped being taken.

# Mode 600 on every dump (creds were in pg_dumpall output for roles).
chmod 600 "${DUMP_DIR}"/*.sql.gz

# Prune older local dump dirs — keep last 3 (restic owns long-term).
ls -1dt "${DB_DUMP_ROOT}"/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf

# ──────────── filesystem snapshot ─────────────────────────────────────

# 2026-07-27 (wf-20260727-fix-134): `/data/coolify` removed — the
# directory does not exist on the ADR-0040 hosts, so every run logged
# "WARN: skipping missing path" and captured no application state at
# all. Replaced with the compose/nginx state that actually defines the
# deployment now. Keep in sync with REQUIRED_PATHS in
# aiqadam-restore-drill.sh.
# $APP_DIR per deploy/docker-compose.{qa,prod}.yml headers. Both are
# listed so one script works on either host; the missing-path loop below
# skips whichever is absent.
PATHS=(
  /opt/apps/aiqadam-prod   # $APP_DIR on prod: repo checkout, .env, compose
  /opt/apps/aiqadam-qa     # $APP_DIR on QA
  /etc/nginx/sites-available # live vhosts — edited in place on the host,
                             # NOT served from $APP_DIR (see
                             # pro-data-tech-frontend-rollout.md); without
                             # this the reverse-proxy config is unrecoverable
  /etc/letsencrypt         # TLS certs + renewal state
  /etc/iptables            # firewall rules incl. DOCKER-USER lockdown
  /etc/ssh/sshd_config.d   # sshd hardening drop-in
  /etc/fail2ban            # fail2ban config incl. Docker-bridge whitelist
  /var/backups/aiqadam     # F-OPS1-a: pg_dump output
)

ARGS=()
for p in "${PATHS[@]}"; do
  if [ -e "$p" ]; then
    ARGS+=("$p")
  else
    echo "WARN: skipping missing path $p" >&2
  fi
done

restic backup \
  --tag=aiqadam-baseline \
  --host=aiqadam-web \
  --exclude-caches \
  --exclude='**/node_modules' \
  --exclude='**/.git' \
  --exclude='**/dist' \
  "${ARGS[@]}"

restic forget \
  --tag=aiqadam-baseline \
  --keep-daily=30 \
  --keep-weekly=12 \
  --keep-monthly=12 \
  --prune
