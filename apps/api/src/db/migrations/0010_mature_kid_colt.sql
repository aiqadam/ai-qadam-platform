ALTER TABLE "users" ADD COLUMN "directus_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_directus_user_id_unique" UNIQUE("directus_user_id");