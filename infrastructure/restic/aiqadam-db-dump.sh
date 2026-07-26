#!/usr/bin/env bash
# F-OPS1-a · hourly DB-only snapshots for fast rollback. Pairs with
# aiqadam-backup.sh (daily full-system); this script ONLY dumps the
# Postgres cluster and runs a focused restic backup of just the dump
# dir, tagged `aiqadam-db-hourly`.
#
# 2026-07-27 (wf-20260727-fix-134): de-Coolified. This script used to
# `docker exec coolify-db pg_dump …` unconditionally. After Coolify was
# removed (ADR-0007, PR #45) and the hyperapp.cloud host was
# decommissioned (ADR-0040), that container no longer exists — and
# because the script runs under `set -euo pipefail`, the failed
# `docker exec` aborted the run BEFORE `restic backup`, so the hourly
# DB snapshot silently stopped producing anything at all. The Coolify
# dump is now gone and the container discovery matches the hosts we
# actually run (see CONTAINER discovery below).
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

# Container discovery, most-specific first:
#   1. PG_CONTAINER env override (set it in /etc/restic/r2.env to pin).
#   2. The deploy/docker-compose.{qa,prod}.yml container_name convention
#      (`aiqadam-<env>-postgres-1`) on the pro-data.tech hosts.
#   3. Any running container built from a postgres image, as a fallback.
# The old `pgvector/pgvector:pg16` filter and its hard-coded Coolify
# container-ID fallback (`rmh626agrz1uiv8cyny47rbb`) are gone — neither
# exists on the hosts described by ADR-0040.
PG_CONTAINER="${PG_CONTAINER:-}"
if [ -z "${PG_CONTAINER}" ]; then
  PG_CONTAINER="$(docker ps --filter 'name=^/aiqadam-.*-postgres-1$' \
    --format '{{.Names}}' | head -1 || true)"
fi
if [ -z "${PG_CONTAINER}" ]; then
  PG_CONTAINER="$(docker ps --filter 'ancestor=postgres:16' \
    --format '{{.Names}}' | head -1 || true)"
fi
if [ -z "${PG_CONTAINER}" ]; then
  echo "ERROR: no Postgres container found. Set PG_CONTAINER in /etc/restic/r2.env." >&2
  exit 1
fi

echo "Dumping Postgres from container: ${PG_CONTAINER}"
docker exec "${PG_CONTAINER}" \
  pg_dumpall -U postgres --clean --if-exists \
  | gzip > "${DUMP_DIR}/shared-pg-all.sql.gz"

# Fail loudly on an empty/broken dump rather than shipping a useless
# snapshot to R2.
#
# NOTE: a plain `[ -s file ]` test is NOT sufficient here. gzip emits a
# ~20-byte header even when its stdin is empty, so a failed pg_dumpall
# still produces a "non-empty" file. `set -o pipefail` should already
# abort the run in that case; this is the defence-in-depth check behind
# it, so it must actually be able to fire. Decompress and look for a
# statement pg_dumpall always emits.
if ! gzip -t "${DUMP_DIR}/shared-pg-all.sql.gz" 2>/dev/null; then
  echo "ERROR: dump is not valid gzip (truncated or corrupt) — refusing to back up." >&2
  exit 1
fi
if ! zcat "${DUMP_DIR}/shared-pg-all.sql.gz" | head -100 | grep -q 'ROLE\|DATABASE\|CREATE'; then
  echo "ERROR: dump decompresses but contains no SQL — refusing to back up." >&2
  exit 1
fi

chmod 600 "${DUMP_DIR}"/*.sql.gz

# NOTE: `--host=aiqadam-web` is a restic *snapshot label*, not a
# hostname that gets resolved or connected to. It is deliberately kept
# at the old value even though the `aiqadam-web` VM is gone (ADR-0040):
# changing it would split the repo's snapshot history in two and break
# `restic forget`'s retention grouping for every pre-existing snapshot.
# Treat it as an opaque series identifier.
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
