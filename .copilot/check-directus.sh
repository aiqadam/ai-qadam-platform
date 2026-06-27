#!/usr/bin/env bash
# .copilot/check-directus.sh — diagnose Directus static admin token issue.
set -uo pipefail

echo "=== Directus env vars (filtered) ==="
docker exec aiqadam-directus env 2>/dev/null | grep -E "^(ADMIN_|SECRET|DB_CLIENT|DB_HOST|DATABASE)" | sort

echo ""
echo "=== Try /items/countries with each known credential ==="

echo "1. Static ADMIN_TOKEN env var (uat-directus-static-admin-token-32c):"
curl -sS -o /dev/null -w "   HTTP %{http_code}\n" \
  -H "Authorization: Bearer uat-directus-static-admin-token-32c" \
  http://localhost:8200/items/countries

echo ""
echo "2. Login flow with admin@aiqadam.test / SuperSecretPass:"
LOGIN=$(curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@aiqadam.test","password":"SuperSecretPass"}' \
  http://localhost:8200/auth/login)
echo "   Login response (first 300 chars):"
echo "   ${LOGIN:0:300}"

ACCESS=$(echo "$LOGIN" | jq -r '.data.access_token // empty')
if [[ -n "$ACCESS" ]]; then
  echo "   Got access_token, len=${#ACCESS}"
  echo ""
  echo "3. /items/countries with dynamically-issued access_token:"
  curl -sS -o /dev/null -w "   HTTP %{http_code}\n" \
    -H "Authorization: Bearer $ACCESS" \
    http://localhost:8200/items/countries
  echo ""
  echo "4. /collections (with dynamic token):"
  curl -sS -H "Authorization: Bearer $ACCESS" \
    http://localhost:8200/collections 2>/dev/null \
    | jq -r 'if type=="array" then .[].collection else .errors[0].message end' \
    | head -20
fi

echo ""
echo "=== Directus recent logs (errors only) ==="
docker logs --tail 50 aiqadam-directus 2>&1 | grep -iE "error|401|admin_token|invalid_token" | head -10 || echo "  (none)"