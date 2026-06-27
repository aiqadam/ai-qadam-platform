#!/usr/bin/env bash
# Inspect how Directus tracks "initialized" state.
docker exec aiqadam-postgres psql -U postgres -d directus -tA -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>&1
echo "---"
docker exec aiqadam-postgres psql -U postgres -d directus -tA -c "SELECT count(*) FROM directus_migrations;" 2>&1
echo "---"
docker exec aiqadam-postgres psql -U postgres -d directus -tA -c "SELECT count(*) FROM directus_roles;" 2>&1
