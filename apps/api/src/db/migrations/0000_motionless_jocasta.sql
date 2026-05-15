CREATE TABLE IF NOT EXISTS "countries" (
	"code" varchar(2) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"name_ru" varchar(100) NOT NULL,
	"tz" varchar(64) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
-- Seed Phase 1 tenants per PROJECT.md §"Multi-tenancy model".
-- Uzbekistan / Kazakhstan / Tajikistan; "global" is intentionally NOT a row
-- (handled as req.tenant=null in middleware, super_admin opt-in).
INSERT INTO "countries" (code, name, name_ru, tz) VALUES
  ('uz', 'Uzbekistan', 'Узбекистан', 'Asia/Tashkent'),
  ('kz', 'Kazakhstan', 'Казахстан', 'Asia/Almaty'),
  ('tj', 'Tajikistan', 'Таджикистан', 'Asia/Dushanbe')
ON CONFLICT (code) DO NOTHING;
