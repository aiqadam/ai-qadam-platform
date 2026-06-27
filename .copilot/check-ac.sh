#!/usr/bin/env bash
# .copilot/check-ac.sh — run BP-UAT-000 acceptance criteria checks for
# the parts that don't need apps started.
set -uo pipefail

ok()   { printf "  \033[0;32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[0;31m✗\033[0m %s\n" "$*"; }

echo "=== AC-2: OIDC discovery ==="
if [[ -f .copilot/discovery.json ]]; then
  ISS=$(jq -r '.issuer' .copilot/discovery.json)
  if [[ "$ISS" == "http://localhost:9000/application/o/aiqadam-platform-local/" ]]; then
    ok "issuer = $ISS"
  else
    fail "issuer mismatch: $ISS"
  fi
  AUTHZ=$(jq -r '.authorization_endpoint' .copilot/discovery.json)
  TOK=$(jq -r '.token_endpoint' .copilot/discovery.json)
  if [[ -n "$AUTHZ" && "$AUTHZ" != "null" ]]; then ok "authorization_endpoint = $AUTHZ"; else fail "no authorization_endpoint"; fi
  if [[ -n "$TOK" && "$TOK" != "null" ]]; then ok "token_endpoint = $TOK"; else fail "no token_endpoint"; fi
else
  fail ".copilot/discovery.json missing"
fi

echo ""
echo "=== AC-3: Directus health + admin token ==="
H=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:8200/server/health)
if [[ "$H" == "200" ]]; then ok "/server/health = 200"; else fail "/server/health = $H"; fi

TOK="uat-directus-static-admin-token-32c"
# /users/me is the definitive token check — always 200 for a valid admin token.
ME=$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOK" http://localhost:8200/users/me)
if [[ "$ME" == "200" ]]; then ok "/users/me = 200 (admin token valid)"; else fail "/users/me = $ME (admin token invalid)"; fi

# Directus 11 behaviour change: non-existent collections return 403, not 404,
# as a security measure to prevent collection enumeration. Accept 200/403/404.
# BP-UAT-000 Step 003 originally expected [200,404]; add 403 for Directus 11.
D=$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOK" http://localhost:8200/items/countries)
echo "  /items/countries = $D (D11: 200=exists 403=not-yet-created 404=legacy-not-found)"
if [[ "$D" == "200" || "$D" == "403" || "$D" == "404" ]]; then
  ok "AC-3 items endpoint in expected range"
else
  fail "AC-3 items endpoint unexpected: $D"
fi
if [[ "$H" == "200" && "$ME" == "200" ]]; then ok "AC-3 PASS"; else fail "AC-3 FAIL"; fi

echo ""
echo "=== AC-4: Mailpit ==="
M=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:8025/api/v1/messages)
if [[ "$M" == "200" ]]; then ok "/api/v1/messages = 200"; else fail "Mailpit = $M"; fi

echo ""
echo "=== AC-1 (Authentik healthcheck endpoint) ==="
A=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:9000/if/admin/)
if [[ "$A" == "200" ]]; then ok "Authentik /if/admin/ = 200"; else fail "Authentik = $A"; fi

echo ""
echo "=== Infra container states ==="
docker ps --format "  {{.Names}}\t{{.Status}}" 2>/dev/null | grep -E "aiqadam-(postgres|redis|minio|authentik-server|authentik-worker|directus|mailpit)" || echo "  (none)"