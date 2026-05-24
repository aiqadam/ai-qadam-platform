-- #277 — partial UNIQUE constraint on (event, user) for active rows.
-- Active = status in (registered, waitlisted, attended). 'cancelled'
-- rows are allowed to coexist (a user can register → cancel → register
-- again and we keep the audit trail).
--
-- The Nest API's TelegramRegistrationsService.register catches the
-- 'RECORD_NOT_UNIQUE' violation surfaced by Directus and re-queries
-- the existing row to return as 201 (idempotent replay) — but ONLY
-- with this index in place. Without it, the catch path is dead code.
--
-- Why partial: a full UNIQUE on (event, user) would block re-registration
-- after a legitimate cancel/refund. Per the issue thread (#277), the
-- bug we're stopping is silent duplication, not re-registration intent.
--
-- Apply on the shared Postgres cluster (container resolves dynamically
-- via `docker ps --filter ancestor=pgvector/pgvector:pg16`):
--
--   ssh aiqadam-admin@212.20.151.29
--   SHARED_PG=$(sudo docker ps --filter 'ancestor=pgvector/pgvector:pg16' \
--     --format '{{.Names}}' | head -1)
--   sudo docker exec -i "$SHARED_PG" psql -U postgres -d directus \
--     < infrastructure/postgres/migrations/2026-05-24-registrations-unique-event-user.sql
--
-- ROLLBACK (if a real bug surfaces):
--
--   sudo docker exec "$SHARED_PG" psql -U postgres -d directus \
--     -c 'DROP INDEX IF EXISTS registrations_event_user_active_unique;'

-- Belt-and-braces: pre-check that no current data violates the index.
-- This SELECT should return 0 rows on a clean cluster. If it returns
-- rows, those duplicates need cleanup BEFORE the index is created
-- (the CREATE INDEX itself will fail with a clear error if they exist).
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT event, "user", COUNT(*) AS n
    FROM registrations
    WHERE status IN ('registered', 'waitlisted', 'attended')
    GROUP BY event, "user"
    HAVING COUNT(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Found % (event, user) pairs with multiple active rows. Clean up dupes before creating the unique index (see #277 cleanup section).', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_user_active_unique
  ON registrations (event, "user")
  WHERE status IN ('registered', 'waitlisted', 'attended');

-- Verify
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'registrations' AND indexname = 'registrations_event_user_active_unique';
