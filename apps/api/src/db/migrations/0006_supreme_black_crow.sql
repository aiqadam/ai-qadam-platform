ALTER TABLE "registrations" ADD COLUMN "checkin_code" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "checked_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_checkin_code_unique" UNIQUE("checkin_code");