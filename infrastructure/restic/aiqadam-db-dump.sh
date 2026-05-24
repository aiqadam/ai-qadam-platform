#!/usr/bin/env bash
# F-OPS1-a · hourly DB-only snapshots for fast Coolify/Directus
# rollback. Pairs with aiqadam-backup.sh (daily full-system); this
# script ONLY dumps the Postgres clusters and runs a focused restic
# backup of just the dump dir, tagged `aiqadam-db-hourly`.
#
# Why a separate script: dumping the cluster takes ~5s; the full
# filesystem backup takes minutes. Hourly cadence for DB only is
# essentially free; hourly full backup would be wasteful.
#
# Deploy:
#   sudo install -m 0755 -o root -g root \
#     infrastructure/restic/aiqadam-db-dump.sh /usr/local/sbin/aiqadam-db-dump.sh
#
# Triggered by aiqadam-db-dump.timer (hourly, on the hour).
# Manual: sudo /usr/local/sbin/aiqadam-db-dump.sh

set -euo pipefail

set -a
. /etc/restic/r2.env
set +a

DB_DUMP_ROOT="/var/backups/aiqadam/db-dumps"
DUMP_TS="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_DIR="${DB_DUMP_ROOT}/${DUMP_TS}"
mkdir -p "${DUMP_DIR}"
chmod 700 "${DB_DUMP_ROOT}" "${DUMP_DIR}"

SHARED_PG_CONTAINER="$(docker ps --filter 'ancestor=pgvector/pgvector:pg17' --format '{{.Names}}' | head -1 || true)"
if [ -z "${SHARED_PG_CONTAINER}" ]; then
  SHARED_PG_CONTAINER="rmh626agrz1uiv8cyny47rbb"
fi

docker exec "${SHARED_PG_CONTAINER}" \
  pg_dumpall -U postgres --clean --if-exists \
  | gzip > "${DUMP_DIR}/shared-pg-all.sql.gz"

docker exec coolify-db \
  pg_dump -U coolify -d coolify --clean --if-exists \
  | gzip > "${DUMP_DIR}/coolify.sql.gz"

chmod 600 "${DUMP_DIR}"/*.sql.gz

restic backup \
  --tag=aiqadam-db-hourly \
  --host=aiqadam-web \
  "${DUMP_DIR}"

# Keep hourly DB snapshots tight: 48h hourly, then 30 daily.
restic forget \
  --tag=aiqadam-db-hourly \
  --keep-hourly=48 \
  --keep-daily=30 \
  --prune

# Local: keep last 6 dump dirs (the rest are in R2 via restic).
ls -1dt "${DB_DUMP_ROOT}"/*/ 2>/dev/null | tail -n +7 | xargs -r rm -rf
