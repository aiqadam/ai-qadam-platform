CREATE TABLE "upgrade_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"authentik_user_pk" integer NOT NULL,
	"telegram_id" varchar(32) NOT NULL,
	"target_email" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "upgrade_intents_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "upgrade_intents_token_idx" ON "upgrade_intents" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "upgrade_intents_authentik_user_pk_idx" ON "upgrade_intents" USING btree ("authentik_user_pk");