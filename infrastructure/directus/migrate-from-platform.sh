#!/usr/bin/env bash
# One-shot copy of data from platform.events / .registrations /
# .point_awards into the corresponding Directus collections.
#
# Re-runnable: every insert is idempotent on the source UUID (PK),
# so running twice doesn't duplicate.
#
# Usage (from anywhere):
#   DIRECTUS_URL=https://cms.aiqadam.org \
#   DIRECTUS_TOKEN=$(cat /tmp/aiqadam-secrets-DIRECTUS_TOKEN) \
#   bash infrastructure/directus/migrate-from-platform.sh
#
# We talk to Postgres through `ssh aiqadam-admin@212.20.151.29 docker exec`
# because the DB only listens on the Coolify network. Adjust the SSH +
# container reference if either changes.

set -euo pipefail

: "${DIRECTUS_URL:?DIRECTUS_URL is required}"
: "${DIRECTUS_TOKEN:?DIRECTUS_TOKEN is required}"

SSH_HOST="${SSH_HOST:-aiqadam-admin@212.20.151.29}"
PG_CONTAINER="${PG_CONTAINER:-rmh626agrz1uiv8cyny47rbb}"

pg() {
  # JSON-aggregated rows of the query. Empty query = empty array.
  ssh "${SSH_HOST}" "sudo -n docker exec ${PG_CONTAINER} psql -U postgres -d platform -tA -c \"SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM ($1) t\""
}

post_item() {
  local collection="$1" body="$2"
  local code
  code=$(curl -s -o /tmp/m-resp -w "%{http_code}" \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    -H "content-type: application/json" \
    -X POST "${DIRECTUS_URL}/items/${collection}" --data "${body}")
  if [ "${code}" = "200" ] || [ "${code}" = "204" ]; then
    return 0
  fi
  # 400 + RECORD_NOT_UNIQUE = already migrated, that's fine
  if grep -q "RECORD_NOT_UNIQUE" /tmp/m-resp; then
    return 0
  fi
  echo "    ✗ ${collection} HTTP ${code} body: $(head -c 200 /tmp/m-resp)"
  return 1
}

# ──────────── events ────────────────────────────────────────────────────

echo "[events]"
EVENTS=$(pg "SELECT id, title, description, format, status, starts_at, ends_at, capacity, location, country_code FROM events")
COUNT=$(echo "$EVENTS" | jq 'length')
echo "  source rows: ${COUNT}"
echo "$EVENTS" | jq -c '.[]' | while read -r row; do
  TITLE=$(echo "$row" | jq -r '.title')
  BODY=$(echo "$row" | jq -c '{id, title, description, format, status, starts_at, ends_at, capacity, location, country: .country_code}')
  if post_item events "$BODY"; then
    echo "  + ${TITLE}"
  fi
done

# ──────────── registrations ─────────────────────────────────────────────
# Skipping for now: needs user FK mapping (platform.users.id -> directus_users.id),
# which only makes sense after SSO is wired and members start signing in.
# The point_awards story is the same. Both come in Sprint 3.

echo
echo "ℹ︎  registrations + point_awards migration deferred to Sprint 3"
echo "   (needs Authentik SSO -> directus_users mapping first)"

echo
echo "✅ Data migration done."
