#!/usr/bin/env bash
# infrastructure/restic/aiqadam-restore-drill.sh — F-S0.5 monthly
# backup-restore drill per ADR-0017 + docs/runbooks/restic-backups.md.
#
# Runs on the platform host. Pulls the latest restic snapshot from R2
# into a scratch directory, asserts that a set of canonical paths
# restored non-empty, computes total restored bytes + duration, and
# emits a result line to the journal + an optional Plausible ops-event
# so the F-S0.11 alerting layer can see the result without scraping
# logs.
#
# Deploy:
#   sudo cp aiqadam-restore-drill.sh /usr/local/sbin/aiqadam-restore-drill.sh
#   sudo chmod 750 /usr/local/sbin/aiqadam-restore-drill.sh
#   sudo cp aiqadam-restore-drill.service aiqadam-restore-drill.timer \
#       /etc/systemd/system/
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now aiqadam-restore-drill.timer
#
# Manual run (when investigating an alert or doing an ad-hoc drill):
#   sudo /usr/local/sbin/aiqadam-restore-drill.sh
#
# Exit codes:
#   0 — drill passed (all assertions held)
#   1 — drill failed (missing path, empty file, stale snapshot, restic error)
#   2 — usage / config error (missing env file, missing required CLI)
#
# The drill is non-destructive: it restores into a scratch dir under
# /tmp and removes the dir on exit (success OR failure). It does NOT
# touch the live filesystem.

set -euo pipefail

# ──────────── config ───────────────────────────────────────────────────

# Same env file the daily backup uses (per docs/runbooks/restic-backups.md).
RESTIC_ENV_FILE="${RESTIC_ENV_FILE:-/etc/restic/r2.env}"

# Scratch root for the restore. Hex-suffixed so concurrent runs (e.g.
# manual ad-hoc + scheduled) don't clobber each other.
SCRATCH_DIR="${SCRATCH_DIR:-/tmp/aiqadam-restore-drill-$(date +%Y%m%d-%H%M%S)-$$}"

# Canonical paths the daily backup is configured to back up. If a
# restore-from-latest doesn't surface any of these, that's a real
# failure — either the backup is broken or the backup config drifted.
# Keep in sync with the PATHS array in /usr/local/sbin/aiqadam-backup.sh.
REQUIRED_PATHS=(
  "etc/iptables/rules.v4"
  "etc/ssh/sshd_config.d"
  "etc/fail2ban"
  "data/coolify/source"
)

# Maximum age of the latest snapshot in days. If the latest snapshot is
# older than this, the daily backup has stopped firing — alert.
MAX_SNAPSHOT_AGE_DAYS="${MAX_SNAPSHOT_AGE_DAYS:-2}"

# Plausible ops-event emission. Same pattern as F-S0.11 prod-probe
# alerting in .github/workflows/smoke.yml — POST to /api/event with a
# domain-of-record + event name. Empty PLAUSIBLE_HOST disables emit.
PLAUSIBLE_HOST="${PLAUSIBLE_HOST:-https://analytics.aiqadam.org}"
PLAUSIBLE_DOMAIN="${PLAUSIBLE_DOMAIN:-aiqadam.org}"
PLAUSIBLE_EVENT="${PLAUSIBLE_EVENT:-backup_restore_drill}"

# ──────────── pre-flight ───────────────────────────────────────────────

log() {
  printf '%s aiqadam-restore-drill: %s\n' "$(date -u --iso-8601=seconds)" "$*"
}

cleanup() {
  # Always remove the scratch dir; non-fatal if it's already gone.
  rm -rf -- "${SCRATCH_DIR}" 2>/dev/null || true
}

die() {
  log "FAIL $*"
  cleanup
  exit "${2:-1}"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1" 2
}

require_cmd restic
require_cmd jq
require_cmd curl
require_cmd find

if [ ! -r "${RESTIC_ENV_FILE}" ]; then
  die "RESTIC_ENV_FILE not readable: ${RESTIC_ENV_FILE} (run as root?)" 2
fi

# Load the restic env in a subshell-safe way (set -a exports every var
# defined below until set +a turns it off). The shellcheck directive
# must sit directly above the . (source) command; one-line `set -a; .`
# tucks the source mid-statement which defeats the directive lookup.
set -a
# shellcheck source=/dev/null
. "${RESTIC_ENV_FILE}"
set +a

mkdir -p "${SCRATCH_DIR}"
chmod 700 "${SCRATCH_DIR}"

# Now that SCRATCH_DIR exists, install the cleanup trap so any
# subsequent failure removes the scratch dir on exit.
trap cleanup EXIT

# ──────────── drill ────────────────────────────────────────────────────

start_epoch=$(date +%s)

log "START scratch=${SCRATCH_DIR} env=${RESTIC_ENV_FILE}"

# 1. Locate the latest snapshot + check it's recent enough.
latest_json=$(restic snapshots --latest 1 --json) || die "restic snapshots failed"
snapshot_id=$(printf '%s' "${latest_json}" | jq -r '.[0].id // empty')
snapshot_time=$(printf '%s' "${latest_json}" | jq -r '.[0].time // empty')
if [ -z "${snapshot_id}" ] || [ -z "${snapshot_time}" ]; then
  die "no snapshots found in repo (backup never ran?)"
fi

snapshot_age_seconds=$(( $(date +%s) - $(date --date="${snapshot_time}" +%s) ))
max_age_seconds=$(( MAX_SNAPSHOT_AGE_DAYS * 24 * 3600 ))
if [ "${snapshot_age_seconds}" -gt "${max_age_seconds}" ]; then
  die "latest snapshot is ${snapshot_age_seconds}s old (> ${max_age_seconds}s limit); daily backup may be stuck"
fi

log "latest snapshot ${snapshot_id} from ${snapshot_time} (age $((snapshot_age_seconds / 60))m)"

# 2. Restore the snapshot into the scratch dir.
restic restore "${snapshot_id}" --target "${SCRATCH_DIR}" >/dev/null \
  || die "restic restore failed for ${snapshot_id}"

# 3. Assert each canonical path exists + is non-empty in the restore.
for path in "${REQUIRED_PATHS[@]}"; do
  full="${SCRATCH_DIR}/${path}"
  if [ ! -e "${full}" ]; then
    die "required path missing in restore: ${path}"
  fi
  if [ -d "${full}" ]; then
    # Directory: assert it has at least one entry.
    if [ -z "$(ls -A -- "${full}" 2>/dev/null)" ]; then
      die "required directory restored empty: ${path}"
    fi
  elif [ ! -s "${full}" ]; then
    # File: assert non-zero size.
    die "required file restored empty: ${path}"
  fi
done

# 4. Compute restored size (sanity-check the snapshot wasn't a 1-byte
# stub) + total drill duration.
restored_bytes=$(du -sb "${SCRATCH_DIR}" 2>/dev/null | awk '{print $1}')
if [ -z "${restored_bytes}" ] || [ "${restored_bytes}" -lt 1024 ]; then
  die "restore total is too small to be real: ${restored_bytes:-0}B (< 1024B)"
fi

end_epoch=$(date +%s)
duration_seconds=$(( end_epoch - start_epoch ))

log "PASS snapshot=${snapshot_id} restored_bytes=${restored_bytes} duration_seconds=${duration_seconds}"

# 5. Emit a Plausible ops-event so the F-S0.11 alerting layer can see
# the result without log-scraping. Non-fatal on emit failure (the
# journal log is the durable record).
if [ -n "${PLAUSIBLE_HOST}" ]; then
  payload=$(jq -nc \
    --arg event "${PLAUSIBLE_EVENT}" \
    --arg domain "${PLAUSIBLE_DOMAIN}" \
    --arg snapshot "${snapshot_id}" \
    --arg bytes "${restored_bytes}" \
    --arg duration "${duration_seconds}" \
    --arg url "host://aiqadam-prod/restore-drill" \
    '{name:$event, domain:$domain, url:$url, props:{result:"pass", snapshot:$snapshot, bytes:$bytes, duration_seconds:$duration}}')
  curl --silent --show-error --max-time 10 \
    -X POST "${PLAUSIBLE_HOST}/api/event" \
    -H 'Content-Type: application/json' \
    -H 'User-Agent: aiqadam-restore-drill/1.0' \
    -d "${payload}" \
    >/dev/null || log "WARN plausible POST failed (non-fatal)"
fi

# Trap handles cleanup; explicit exit 0 to make the success path
# unambiguous.
exit 0
