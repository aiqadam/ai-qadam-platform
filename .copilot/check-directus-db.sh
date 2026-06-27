#!/usr/bin/env bash
# .copilot/check-directus-db.sh — query the directus DB for admin users/tokens.
set -uo pipefail

echo "=== directus_users in aiqadam-postgres ==="
docker exec aiqadam-postgres psql -U postgres -d directus -tAc \
  "SELECT id, email, status, token IS NOT NULL AS has_static_token, substring(token, 1, 16) AS token_prefix FROM directus_users ORDER BY id;" \
  2>&1 | head -20

echo ""
echo "=== directus_users.email validators in directus DB (last 30 rows) ==="
docker exec aiqadam-postgres psql -U postgres -d directus -tAc \
  "SELECT email FROM directus_users;" 2>&1