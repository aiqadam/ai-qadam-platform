#!/usr/bin/env bash
# Full Directus reset: drop DB, force-recreate container with new ADMIN_EMAIL, wait.
set -e

echo "=== Step 1: Stop aiqadam-directus ==="
docker stop aiqadam-directus

echo "=== Step 2: Terminate active connections to directus DB ==="
docker exec aiqadam-postgres psql -U postgres -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='directus' AND pid <> pg_backend_pid();" 2>&1 | tail -3

echo "=== Step 3: Drop directus database ==="
docker exec aiqadam-postgres psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS directus;" 2>&1

echo "=== Step 4: Recreate empty directus database ==="
docker exec aiqadam-postgres psql -U postgres -d postgres -c "CREATE DATABASE directus OWNER postgres;" 2>&1

echo "=== Step 5: Force-recreate aiqadam-directus container (picks up new DIRECTUS_ADMIN_EMAIL) ==="
docker compose -f infrastructure/docker-compose.yml up -d --force-recreate directus 2>&1

echo "=== Step 6: Wait for Directus API ==="
# curl returns non-zero on connection refused; use || true so set -e doesn't fire.
for i in $(seq 1 72); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8200/server/ping || true)
  health=$(docker inspect aiqadam-directus --format '{{.State.Health.Status}}')
  echo "try $i: ping=$code health=$health"
  if [ "$code" = "200" ]; then
    echo "=== Directus is up ==="
    exit 0
  fi
  sleep 5
done
echo "=== Directus did not come up in time ==="
exit 1
