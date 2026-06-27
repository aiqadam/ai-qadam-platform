#!/usr/bin/env bash
# Check directus_users after restart
docker exec aiqadam-postgres psql -U postgres -d directus -tA -c "SELECT count(*) FROM directus_users;"
docker exec aiqadam-postgres psql -U postgres -d directus -tA -c "SELECT id, email, status FROM directus_users;"
docker exec aiqadam-postgres psql -U postgres -d directus -tA -c "SELECT key, value FROM directus_settings WHERE key LIKE '%admin%' OR key LIKE '%email%';"
