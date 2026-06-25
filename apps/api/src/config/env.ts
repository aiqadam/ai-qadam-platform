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
  // docs/04-development/infrastructure/runbooks/authentik-local-bootstrap.md for the values to use locally.
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

  // aiqadam#344 — recipient for the bot's user-feedback inbox. Single
  // address for v1 (typically a team alias); per-tenant routing can
  // come later when the cabinet view exists.
  FEEDBACK_RECIPIENT_EMAIL: z.string().email().default('hello@aiqadam.org'),

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

  // F-S4.1-d — Plausible admin API for country provisioning. Distinct
  // from PLAUSIBLE_HOST (events ingest) — admin lives under /api/v1/sites
  // on the same host but requires its own bearer token. Optional: when
  // unset, the plausible_site provisioning step fails with
  // `plausible_admin_not_configured`.
  PLAUSIBLE_ADMIN_URL: z.string().url().default('https://analytics.aiqadam.org'),
  PLAUSIBLE_ADMIN_TOKEN: z.string().min(20).optional(),

  // F-S4.1-d — Coolify admin API for country provisioning. Used to
  // append a new country's `https://<cc>.aiqadam.org:<port>` FQDN to
  // the aiqadam-web application's domains list (PATCH
  // /api/v1/applications/<uuid>). Optional: when any of these are
  // unset, the coolify_fqdn step fails with `coolify_admin_not_configured`.
  COOLIFY_API_URL: z.string().url().default('https://coolify.aiqadam.org'),
  COOLIFY_API_TOKEN: z.string().min(20).optional(),
  // UUID of the aiqadam-web application in Coolify (so we PATCH the
  // right app). The web fqdn list belongs to ONE application — adding
  // a new country = appending one entry.
  COOLIFY_WEB_APP_UUID: z.string().min(8).optional(),
  // Port suffix on the fqdn entries (existing prod uses :4321). Kept
  // configurable in case the Coolify port pattern changes.
  COOLIFY_WEB_FQDN_PORT: z.coerce.number().int().positive().default(4321),

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
  //
  // **R2 status (ADR-0034)**: this env var is now a *fallback* used only
  // when no row exists in `tg_config`. The DB is the source of truth;
  // env stays as a last-resort path for local dev where running
  // migrations + POSTing /admin/configure is more friction than setting
  // a string. Don't add a non-null assertion here — the Boolean(...)
  // coercion in /v1/telegram/health expects this to be optional.
  TELEGRAM_BOT_SERVICE_TOKEN: z.string().min(32).optional(),

  // R2 (ADR-0034 §"Encryption at rest"): symmetric key for AES-256-GCM
  // encryption of the BotFather token in tg_config.encrypted_token.
  // Hex-encoded 32 bytes (64 hex chars). Generated once per environment
  // via `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
  //
  // **Optional in dev**: when unset, the tg_config table is unusable
  // (configure/rotate/status endpoints return 503
  // `telegram_config_key_missing`). The /v1/telegram/* sync surface
  // still works via the legacy TELEGRAM_BOT_SERVICE_TOKEN env fallback,
  // so existing flows aren't blocked by this key being absent in CI.
  //
  // **Required in prod**: operators MUST set this before configuring a
  // bot token via the workspace cabinet. Rotation of THIS key is a
  // separate ops procedure that requires decrypting all rows with the
  // old key and re-encrypting with the new one — runbook lives at
  // docs/04-development/infrastructure/runbooks/telegram-token-rotation.md (TODO, ships with R5).
  TG_CONFIG_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex chars (32 bytes)')
    .optional(),

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

  // F-S4.1-b — name of the Authentik OAuth2/OIDC provider that handles
  // aiqadam.org sign-in. The country-provisioning state machine reads
  // this to append `https://<country>.aiqadam.org/api/v1/auth/callback`
  // to the provider's `redirect_uris` list when a new country is
  // provisioned.
  //
  // **Optional**: when unset, the authentik_oidc provisioning step fails
  // with `authentik_oidc_provider_not_configured` — operator addresses
  // the env then re-runs provisioning.
  AUTHENTIK_OIDC_PROVIDER_NAME: z.string().min(1).optional(),

  // Feature flag (ADR-0035 Part 4 + G-1 deferral): country-lead invites
  // scaffold + ready but invisible while compensation is unresolved.
  // Flip to true only after G-1 is closed and an AUP §7 review.
  ENABLE_COUNTRY_LEAD_INVITES: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Base URL the invitee opens. The /onboard route lives on the web app
  // and redirects to /workspace after success (see OnboardingForm). Kept
  // separate from WEB_BASE_URL so the link channel can be swapped without
  // touching auth.
  INVITE_URL_BASE: z.string().url().default('https://aiqadam.org'),
  INVITE_TTL_DAYS: z.coerce.number().int().positive().max(30).default(7),

  // F-S2.2 (ADR-0021) RBAC sync. Authentik notification transport signs
  // POSTs to /v1/internal/rbac/authentik-webhook with HMAC-SHA256 of the
  // raw body using this shared secret. ≥32 chars to make timing-safe
  // compare meaningful.
  //
  // **Optional**: when unset, the webhook endpoint returns 503
  // `rbac_webhook_not_configured`. Allows the API to boot cleanly in CI
  // and during the bootstrap window before the Authentik side is wired.
  AUTHENTIK_WEBHOOK_SECRET: z.string().min(32).optional(),

  // F-S2.2 dry-run safety flag. When false (default), the RBAC sync
  // worker computes the diff + writes rbac_sync_jobs rows + emits to
  // audit_events but DOES NOT touch Directus policies or Plausible
  // memberships. Flip to true only after replaying a few real Authentik
  // changes and verifying the diffs in the workspace UI.
  RBAC_SYNC_WRITE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Hardening C1 — global HTTP rate limiting (observe-before-enforce). When
  // false (default), ObserveThrottlerGuard LOGS "would-throttle" and allows
  // over-limit requests so we can size real limits against live traffic; when
  // true it returns HTTP 429 + Retry-After. Flip to true only after observing
  // the logs (esp. the /v1/auth/refresh volume) AND adding the Redis store +
  // `trust proxy` in phase 2. See apps/api/src/lib/observe-throttler.guard.ts.
  RATE_LIMIT_ENFORCE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // FR-AUTH-002 — Telegram Login Widget HMAC verification key. Distinct
  // from TELEGRAM_BOT_SERVICE_TOKEN (bearer auth for bot ↔ API calls).
  // The HMAC key is derived as SHA256(TELEGRAM_BOT_TOKEN) — the raw token
  // is never used directly and must never appear in logs.
  //
  // **Optional**: when unset, the telegram-auth endpoints (/v1/auth/telegram/*)
  // return 503 `telegram_not_configured`. Same degraded-mode pattern as other
  // optional integration tokens.
  TELEGRAM_BOT_TOKEN: z.string().min(20).optional(),

  // F-S2.8.x Cloudflare/Resend per-operator email-routing envs
  // (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, CLOUDFLARE_ACCOUNT_ID,
  // RESEND_ADMIN_API_KEY) were removed in F-S2.12 (2026-05-25):
  // operators now get @aiqadam.org mailboxes automatically via DMS+LDAP,
  // so the operator-driven CF forwarding + per-operator Resend sub-keys
  // are obsolete. The platform-wide RESEND_API_KEY above is unaffected.
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
