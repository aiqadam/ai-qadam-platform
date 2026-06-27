#!/usr/bin/env bash
# Wait for Directus to be ready (up to ~5 minutes).
# Polls both /server/ping and container health.
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8200/server/ping)
  health=$(docker inspect aiqadam-directus --format '{{.State.Health.Status}}')
  echo "try $i: ping=$code health=$health"
  if [ "$code" = "200" ]; then
    exit 0
  fi
  sleep 5
done
exit 1
