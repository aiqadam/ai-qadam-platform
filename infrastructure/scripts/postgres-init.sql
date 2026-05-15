-- infrastructure/scripts/postgres-init.sql
--
-- Local-dev Postgres init: create separate databases per service.
-- Production runs the same logical separation on Coolify; this only applies
-- to local-dev via the docker-compose entrypoint.
--
-- Database ownership matches ARCHITECTURE.md §"Data ownership":
--   platform   — owned by NestJS API (Drizzle migrations land here)
--   directus   — owned by Directus CMS (added when CMS work begins)
--   authentik  — owned by Authentik IdP (added when auth work begins)
--   listmonk   — owned by Listmonk email service (added when email-list work begins)

CREATE DATABASE platform;
CREATE DATABASE directus;
CREATE DATABASE authentik;
CREATE DATABASE listmonk;

-- pgvector lives on the platform DB (used for content embeddings later).
\c platform
CREATE EXTENSION IF NOT EXISTS vector;
\c postgres
