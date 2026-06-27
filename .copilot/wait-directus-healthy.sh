#!/usr/bin/env bash
# Poll until aiqadam-directus Docker health flips to 'healthy'.
for i in $(seq 1 20); do
  health=$(docker inspect aiqadam-directus --format '{{.State.Health.Status}}')
  echo "try $i: health=$health"
  if [ "$health" = "healthy" ]; then
    exit 0
  fi
  sleep 5
done
exit 1
