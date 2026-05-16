ALTER TABLE "users" ADD COLUMN "handle" varchar(64);--> statement-breakpoint
-- Backfill from the email prefix, lowercased + non-handle chars replaced
-- with underscore. Collisions are vanishingly rare at Phase 1 scale
-- (single user). If any duplicate prefixes existed they would fail the
-- unique constraint below — fix by hand.
UPDATE "users" SET "handle" = lower(regexp_replace(split_part("email", '@', 1), '[^a-z0-9_]', '_', 'g')) WHERE "handle" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_handle_unique" UNIQUE("handle");