#!/usr/bin/env bash
set -euo pipefail
cd /mnt/c/Users/tvolo/dev/ai-dala/aiqadam
IAT=$(grep -E '^INTERNAL_API_TOKEN=' apps/api/.env | head -1 | sed 's/^[^=]*=//' | tr -d '"\r')
echo "IAT=$IAT"
echo ""
echo "=== Test 1: exactly the api_ensure_directus_user_link curl pattern ==="
resp=$(curl -s \
  -H "x-internal-auth: ${IAT}" \
  -H "Content-Type: application/json" \
  -X POST -w "\n%{http_code}" \
  "http://localhost:3001/v1/internal/users/ensure-linked" \
  -d '{"email":"uat-operator@aiqadam.test","displayName":"UAT Operator"}' 2>/dev/null)
rc=$?
echo "curl exit=$rc"
echo "resp=[$resp]"
http_code="${resp##*$'\n'}"
echo "http_code=[$http_code]"
echo ""
echo "=== Test 2: ensure_linked for uat-member-c ==="
resp=$(curl -s \
  -H "x-internal-auth: ${IAT}" \
  -H "Content-Type: application/json" \
  -X POST -w "\n%{http_code}" \
  "http://localhost:3001/v1/internal/users/ensure-linked" \
  -d '{"email":"uat-member-c@aiqadam.test","displayName":"UAT Member (consented)"}' 2>/dev/null)
rc=$?
echo "curl exit=$rc"
echo "resp=[$resp]"
