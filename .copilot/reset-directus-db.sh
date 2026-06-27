#!/usr/bin/env bash
# Drop the directus database so createAdmin() runs from scratch on next boot.
# This is destructive ONLY to the directus database; other DBs (platform, authentik,
# twenty, etc.) on the same Postgres are untouched.
set -e
echo "Stopping aiqadam-directus..."
docker stop aiqadam-directus
echo "Terminating any active connections to 'directus' DB..."
docker exec aiqadam-postgres psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='directus' AND pid <> pg_backend_pid();" 2>&1 | tail -3
echo "Dropping directus database..."
docker exec aiqadam-postgres psql -U postgres -d postgres -c "DROP DATABASE directus;" 2>&1
echo "Recreating directus database (empty)..."
docker exec aiqadam-postgres psql -U postgres -d postgres -c "CREATE DATABASE directus OWNER postgres;" 2>&1
echo "Starting aiqadam-directus..."
docker start aiqadam-directus
echo "Done."
