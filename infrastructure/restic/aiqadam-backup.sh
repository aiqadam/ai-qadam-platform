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

# Resolve the shared Postgres container by image (pgvector-based).
SHARED_PG_CONTAINER="$(docker ps --filter 'ancestor=pgvector/pgvector:pg17' --format '{{.Names}}' | head -1 || true)"
if [ -z "${SHARED_PG_CONTAINER}" ]; then
  # Fallback to current well-known name; if Coolify renamed it,
  # operator updates the runbook.
  SHARED_PG_CONTAINER="rmh626agrz1uiv8cyny47rbb"
fi

# pg_dumpall captures every DB in the cluster + globals (roles,
# tablespaces). Compressed in-stream to avoid a temp file the size
# of the cluster.
echo "[pg_dumpall] shared cluster via ${SHARED_PG_CONTAINER}"
docker exec "${SHARED_PG_CONTAINER}" \
  pg_dumpall -U postgres --clean --if-exists \
  | gzip > "${DUMP_DIR}/shared-pg-all.sql.gz"

echo "[pg_dump] coolify DB via coolify-db"
docker exec coolify-db \
  pg_dump -U coolify -d coolify --clean --if-exists \
  | gzip > "${DUMP_DIR}/coolify.sql.gz"

# Mode 600 on every dump (creds were in pg_dumpall output for roles).
chmod 600 "${DUMP_DIR}"/*.sql.gz

# Prune older local dump dirs — keep last 3 (restic owns long-term).
ls -1dt "${DB_DUMP_ROOT}"/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf

# ──────────── filesystem snapshot ─────────────────────────────────────

PATHS=(
  /data/coolify             # Coolify state, configs, deploy keys, certs, .env
  /etc/iptables             # firewall rules incl. DOCKER-USER lockdown
  /etc/ssh/sshd_config.d    # sshd hardening drop-in
  /etc/fail2ban             # fail2ban config incl. Docker-bridge whitelist
  /var/backups/aiqadam      # F-OPS1-a: pg_dump output
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
  --exclude='/data/coolify/source/upgrade-*.log' \
  --exclude='/data/coolify/source/installation-*.log' \
  --exclude='/data/coolify/proxy/logs' \
  --exclude='/data/coolify/source/storage/logs' \
  "${ARGS[@]}"

restic forget \
  --tag=aiqadam-baseline \
  --keep-daily=30 \
  --keep-weekly=12 \
  --keep-monthly=12 \
  --prune
