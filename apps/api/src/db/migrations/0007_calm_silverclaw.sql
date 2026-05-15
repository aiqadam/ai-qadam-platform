CREATE TYPE "public"."point_source" AS ENUM('event_attended');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "point_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"source" "point_source" NOT NULL,
	"source_ref" uuid NOT NULL,
	"points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_awards_source_unique" UNIQUE("user_id","source","source_ref")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "point_awards_country_user_idx" ON "point_awards" USING btree ("country_code","user_id");