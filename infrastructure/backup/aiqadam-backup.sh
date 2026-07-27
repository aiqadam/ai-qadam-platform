#!/usr/bin/env bash
# aiqadam-backup — nightly DB dump + cross-host replication.
#
# Design (ISS-INFRA-004, 2026-07-27): each host dumps its own Postgres
# cluster to local disk, then pushes the dump directory to the OTHER
# host. prod's backups live on QA; QA's live on prod. No external
# storage provider is involved — see the ai-dala-infra "no off-site
# storage" rule, which supersedes ADR-0017's Cloudflare R2 premise.
#
# Why plain gzip + rsync rather than restic: the data is ~10 MB, both
# hosts are ours, and a restic passphrase stored on the hosts protects
# nothing while adding a way to lose the backups permanently.
#
# The push key is locked to a forced command on the peer
# (/usr/local/sbin/aiqadam-backup-receive.sh): rsync-push into
# /var/backups/aiqadam/peer only. No shell, no pull, no other path.
#
# Deploy:
#   sudo install -m 0755 -o root -g root \
#     infrastructure/backup/aiqadam-backup.sh /usr/local/sbin/aiqadam-backup.sh
#
# Config lives in /etc/default/aiqadam-backup (PEER_HOST, ENV_NAME).
set -euo pipefail

PEER_HOST="${PEER_HOST:?PEER_HOST must be set (peer IP) — see /etc/default/aiqadam-backup}"
ENV_NAME="${ENV_NAME:?ENV_NAME must be set (prod|qa)}"
PUSH_KEY="${PUSH_KEY:-/root/.ssh/backup-push}"
KEEP_LOCAL="${KEEP_LOCAL:-14}"

ROOT="/var/backups/aiqadam"
OUT="${ROOT}/db-dumps"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="${OUT}/${TS}"
mkdir -p "$DIR"
chmod 700 "$ROOT" "$OUT" "$DIR"

# Resolve the Postgres container by IMAGE, not name: prod runs
# postgres:16 as aiqadam-prod-postgres-1, QA runs pgvector/pgvector:pg16
# as ai-qadam-test-db-1. A name pattern would silently miss QA.
# Verified against both live hosts 2026-07-27.
PG_CONTAINER="${PG_CONTAINER:-}"
if [ -z "$PG_CONTAINER" ]; then
  PG_CONTAINER="$(docker ps --format '{{.Names}}\t{{.Image}}' \
    | grep -Ei '(^|[/[:space:]])(postgres|pgvector)' \
    | awk '{print $1}' | head -1 || true)"
fi
[ -n "$PG_CONTAINER" ] || { echo "ERROR: no Postgres container found" >&2; exit 1; }

# The superuser is not always `postgres` (prod: aiqadam_prod, qa: aiqadam).
PG_SUPERUSER="${PG_SUPERUSER:-}"
if [ -z "$PG_SUPERUSER" ]; then
  PG_SUPERUSER="$(docker inspect "$PG_CONTAINER" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | sed -n 's/^POSTGRES_USER=//p' | head -1 || true)"
fi
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"

echo "[dump] ${PG_CONTAINER} as ${PG_SUPERUSER}"
docker exec "$PG_CONTAINER" \
  pg_dumpall -U "$PG_SUPERUSER" --clean --if-exists \
  | gzip > "${DIR}/all.sql.gz"
chmod 600 "${DIR}/all.sql.gz"

# gzip writes a ~20-byte header even for empty input, so `[ -s ]` alone
# cannot detect a failed dump. Verify it decompresses AND holds SQL.
gzip -t "${DIR}/all.sql.gz" 2>/dev/null \
  || { echo "ERROR: dump is not valid gzip" >&2; exit 1; }

# NOTE: do NOT write this as `zcat … | head -N | grep -q …`. Under
# `set -o pipefail`, `head` and `grep -q` exit as soon as they are
# satisfied, which SIGPIPEs zcat and makes the whole pipeline report
# failure even for a perfectly good dump — observed on QA 2026-07-27,
# where the guard rejected a valid 1.1 MB dump whose first ROLE
# statement was on line 28. Scan the whole stream with awk instead and
# let awk decide, so there is no early pipe close.
if ! zcat "${DIR}/all.sql.gz" \
     | awk '/CREATE|COPY|ROLE/ { found=1 } END { exit !found }'; then
  echo "ERROR: dump contains no SQL" >&2
  exit 1
fi
echo "[dump] ok: $(stat -c%s "${DIR}/all.sql.gz") bytes"

# Local retention.
find "$OUT" -mindepth 1 -maxdepth 1 -type d | sort | head -n -"${KEEP_LOCAL}" \
  | xargs -r rm -rf

# Replicate to the peer. --delete keeps the peer's mirror in step with
# local retention so it cannot grow without bound.
echo "[push] -> ${PEER_HOST}:/var/backups/aiqadam/peer/${ENV_NAME}/"
rsync -az --delete \
  -e "ssh -i ${PUSH_KEY} -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15" \
  "${OUT}/" "root@${PEER_HOST}:${ENV_NAME}/"
echo "[push] ok"
