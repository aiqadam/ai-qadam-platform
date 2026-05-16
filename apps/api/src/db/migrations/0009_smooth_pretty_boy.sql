CREATE TYPE "public"."user_role" AS ENUM('member', 'organizer', 'country_admin', 'super_admin');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'member' NOT NULL;
-- BOOTSTRAP: promote the first super_admin by hand after this migration
-- applies. Run once per prod environment:
--   UPDATE "users" SET "role" = 'super_admin' WHERE "email" = 'admin@aiqadam.org';
-- Future role grants happen via /admin/users (B5) — never SQL.