ALTER TABLE "tg_config" ADD COLUMN "encrypted_service_token" "bytea";--> statement-breakpoint
ALTER TABLE "tg_config" ADD COLUMN "service_token_rotated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tg_config" ADD COLUMN "service_token_rotated_by" uuid;