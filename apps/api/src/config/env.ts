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

  // Shared secret for /v1/internal/* endpoints. Directus flows pass this in
  // the X-Internal-Auth header when calling our API. Must be set in both
  // the API's env AND in Directus' env (allowed in FLOWS_ENV_ALLOW_LIST so
  // flow `request` ops can read it as {{ $env.INTERNAL_API_TOKEN }}).
  INTERNAL_API_TOKEN: z.string().min(32),

  // Outbound calls to Directus (Sprint 4.5: API proxies member-side
  // registration / check-in / leaderboard endpoints to Directus). Static
  // admin token from a `directus_users.token` row provisioned in Sprint 1.
  // Tenant scoping happens via `country` filter on each query, not via Host
  // header — Directus doesn't speak our tenant model.
  DIRECTUS_URL: z.string().url().default('https://cms.aiqadam.org'),
  DIRECTUS_TOKEN: z.string().min(16),

  // Plausible Events API host for server-side ops events (S0.4 / issue
  // #113). Empty string disables emission — set in prod (Coolify env).
  // The helper at apps/api/src/lib/ops-events.ts is fire-and-forget; bad
  // values never break the request path.
  PLAUSIBLE_HOST: z.string().default(''),

  // Shared bearer secret for `/v1/telegram/*` endpoints (ADR-0034). The
  // AI Qadam Telegram bot + notifier pass this in `Authorization: Bearer`
  // when calling our API. Must match `AIQADAM_SERVICE_TOKEN` in the
  // viktordrukker/aiqadam-telegram-bot repo's Coolify env.
  //
  // **Optional**: when unset, the telegram surface enters a degraded mode
  // — endpoints return 503 `telegram_not_configured` and the channel
  // adapter skips with the same reason. The platform doesn't crash; an
  // operator configures the token via the workspace cabinet later (see
  // /workspace/integrations/telegram, planned). When set, must be ≥32
  // chars so timing-safe compare in the guard is meaningful.
  TELEGRAM_BOT_SERVICE_TOKEN: z.string().min(32).optional(),

  // F-S2.7 (ADR-0035) Authentik admin API — creating operator users,
  // setting passwords on invite consumption, group assignment, status
  // changes. Distinct from the OIDC_* group which is for end-user
  // sign-in flows. The admin token comes from an Authentik User Token
  // for an admin-class user; never set this to a non-admin token.
  //
  // **Optional**: when unset, the AuthentikClient still constructs but
  // admin-only routes (PR-3+) return 503 `authentik_admin_not_configured`.
  // Same degraded-mode pattern as TELEGRAM_BOT_SERVICE_TOKEN.
  AUTHENTIK_ADMIN_URL: z.string().url().default('https://auth.aiqadam.org'),
  AUTHENTIK_ADMIN_TOKEN: z.string().min(20).optional(),

  // Feature flag (ADR-0035 Part 4 + G-1 deferral): country-lead invites
  // scaffold + ready but invisible while compensation is unresolved.
  // Flip to true only after G-1 is closed and an AUP §7 review.
  ENABLE_COUNTRY_LEAD_INVITES: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Base URL the invitee opens (e.g. https://workspace.aiqadam.org). The
  // /onboard route lives on the web app, so this typically equals
  // WEB_BASE_URL — kept separate so the link channel can be swapped
  // (workspace.aiqadam.org vs aiqadam.org) without touching auth.
  INVITE_URL_BASE: z.string().url().default('https://workspace.aiqadam.org'),
  INVITE_TTL_DAYS: z.coerce.number().int().positive().max(30).default(7),
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
