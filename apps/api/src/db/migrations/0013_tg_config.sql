CREATE TABLE IF NOT EXISTS "tg_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant" varchar(8),
	"encrypted_token" "bytea" NOT NULL,
	"bot_id" bigint NOT NULL,
	"bot_username" varchar(64) NOT NULL,
	"configured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"configured_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tg_config_tenant_unique_idx" ON "tg_config" USING btree (coalesce("tenant", '*'));