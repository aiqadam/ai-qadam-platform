CREATE TABLE IF NOT EXISTS "outbox" (
	"envelope_id" uuid PRIMARY KEY NOT NULL,
	"stream" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tg_link_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tg_user_id" bigint NOT NULL,
	"email" varchar(255) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tg_send_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_key" varchar(128) NOT NULL,
	"envelope_id" uuid NOT NULL,
	"outcome" varchar(32) NOT NULL,
	"detail" text,
	"message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tg_send_log_delivery_key_unique" UNIQUE("delivery_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_unpublished_idx" ON "outbox" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tg_link_challenges_tg_user_idx" ON "tg_link_challenges" USING btree ("tg_user_id","expires_at");