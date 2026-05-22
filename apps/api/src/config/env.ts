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
  // docs/runbooks/telegram-token-rotation.md (TODO, ships with R5).
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

  // F-S2.8 — Cloudflare Email Routing + Resend admin automation at
  // invite-creation time. When an admin invites someone at an
  // @aiqadam.org address AND supplies a destination Gmail, the API
  // provisions: (1) a CF Email Routing rule forwarding the alias to
  // the Gmail, (2) a per-operator Resend API key with sending_access.
  //
  // Both creds follow the same degraded-mode posture as the rest of
  // this file: optional in env; when unset the corresponding client's
  // isConfigured() returns false and createInvite() skips that step,
  // recording a partial_failures entry so the admin knows manual
  // setup is still required. Code boots fine without them — meaning
  // local dev + CI work, and the F-S2.7 invite flow is unaffected.
  //
  // **Cloudflare token scope (least-privilege):**
  //   - Zone → Email Routing Rules → Edit
  //   - Zone → Email Routing Settings → Read
  //   - Zone Resources: Include → Specific zone → aiqadam.org
  // Rotation runbook: docs/runbooks/secret-rotation-cloudflare-resend-admin.md.
  //
  // **Resend admin key scope:** Full Access (required to create
  // sub-keys via /v1/api-keys). Distinct from RESEND_API_KEY which is
  // the platform sending key. Same rotation runbook.
  // Empty-string-to-undefined preprocessor: Coolify often stores empty
  // strings for unset env vars; treat them as "not configured" rather
  // than failing schema validation on `.min(20)`. Keeps the degraded
  // mode predictable.
  CLOUDFLARE_API_TOKEN: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(20).optional(),
  ),
  CLOUDFLARE_ZONE_ID: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^[0-9a-f]{32}$/, 'must be 32 hex chars (Cloudflare zone id)')
      .optional(),
  ),
  RESEND_ADMIN_API_KEY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(20).optional(),
  ),
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
