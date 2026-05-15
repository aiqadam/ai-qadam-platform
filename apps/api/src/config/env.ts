import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load .env files before reading process.env. NestJS doesn't auto-load .env
// (we deliberately don't use @nestjs/config) — this single dotenv call gives
// us .env-file support in dev without pulling in NestJS's heavier ConfigModule.
// In CI / Coolify the env is set by the runtime, so .env is absent and dotenv
// silently no-ops.
loadDotenv();

// Boundary validation per CLAUDE.md §6 + STANDARDS.md Part III: every
// input from outside the system gets a Zod schema. Process env counts.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Postgres connection — points at the 'platform' database in
  // infrastructure/docker-compose.yml. See apps/api/.env.example.
  DATABASE_URL: z.string().url(),
  // Redis used by BullMQ workers and (eventually) cache. See same .env.example.
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  // Symmetric key for signing the API's access tokens (ADR-0016). Must be
  // generated locally and never reused across environments. The 32-char
  // minimum keeps brute-force impractical for HS256 over the 10-min TTL.
  JWT_SIGNING_SECRET: z.string().min(32),

  // Authentik OIDC application discovery URL — see
  // docs/runbooks/authentik-local-bootstrap.md for the values to use locally.
  OIDC_ISSUER_URL: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  // Where Authentik should send the user back after login. Must EXACTLY match
  // a redirect URI registered on the Authentik application.
  OIDC_REDIRECT_URI: z.string().url(),
  // Where the API redirects the browser after a successful callback. Usually
  // the web app's root.
  WEB_BASE_URL: z.string().url(),

  // Email (Resend, ADR-0009). When SEND_EMAILS=false the EmailService logs
  // and returns — no API call. RESEND_API_KEY may be empty in dev; the
  // service degrades gracefully (warns + skips). EMAIL_FROM must be a verified
  // sender on the Resend account.
  SEND_EMAILS: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('AI Qadam <admin@aiqadam.org>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Boot-time fatal — refuse to start with bad env. Log to stderr and exit
  // so the process supervisor / Coolify sees a clean failure. NestJS Logger
  // isn't available yet at this stage, so console.error is correct here.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
