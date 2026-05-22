# Pending secret rotations

> Secrets that should be rotated before going live with R5 (bot deploy
> / sponsor onboarding / first public marketing). Tracked here so a
> single rotation pass at launch time covers them, instead of doing
> piecemeal rotations now.

## Why these need rotation

On 2026-05-22, during R2 PR validation, Coolify's deployment log
endpoint (`GET /api/v1/deployments/applications/<uuid>`) returned the
full build-time ARG dump as plaintext inside the `logs` JSON field.
That log was pasted into a Claude Code conversation, so the secrets
are now in:

- The conversation history (Claude's context window during the session)
- Any transcript / cache layer that recorded the user message
- The Coolify deployment record itself (retained per Coolify's log
  retention; until manually purged)

None of these vectors imply the secrets are PUBLISHED (no public log
viewer, no GitHub leak). But the trust-level dropped from "only
Coolify's internal store knows them" to "several systems have seen the
plaintext." For low-trust secrets (test envs) that's OK; for prod
admin tokens it isn't.

## Rotation order (do as a single pass)

Order matters — rotate the LEAST coupled secret first, so any
breakage during rotation is contained.

| # | Secret | Where stored | Rotation procedure | Coupled with |
|---|---|---|---|---|
| 1 | `RESEND_API_KEY` | Coolify env on `aiqadam-api` | Generate new key at https://resend.com/api-keys; PATCH Coolify env; redeploy | Email sends only — no auth flow impact |
| 2 | `INTERNAL_API_TOKEN` | Coolify env on `aiqadam-api` AND Directus env | `openssl rand -hex 32`; update BOTH simultaneously (Directus flows call /v1/internal/* with this) | Directus flows |
| 3 | `DIRECTUS_TOKEN` | Coolify env on `aiqadam-api` | Mint new static token in Directus admin (Users → Admin → Token); PATCH Coolify env; redeploy | All API → Directus reads |
| 4 | `TWENTY_API_TOKEN` | Coolify env on `aiqadam-api` | **Twenty CRM is DELETED** (per ADR-0033); this var is dead. Delete from Coolify env entirely instead of rotating. | Nothing (orphan from S5.0) |
| 5 | `AUTHENTIK_ADMIN_TOKEN` | Coolify env on `aiqadam-api` | Mint new token at https://auth.aiqadam.org/if/admin/ → Directory → Users → akadmin → Tokens; PATCH Coolify env; redeploy | F-S2.7 invite cabinet + future RBAC sync |
| 6 | `OIDC_CLIENT_SECRET` | Coolify env on `aiqadam-api` AND Authentik provider | Regenerate in Authentik (Applications → Providers → aiqadam-platform → Edit → Generate); PATCH Coolify env; redeploy | All user sign-ins — schedule for low-traffic window |
| 7 | `JWT_SIGNING_SECRET` | Coolify env on `aiqadam-api` | `openssl rand -base64 48 \| tr -d '\n=+/' \| head -c 48`; PATCH; redeploy | **All active sessions invalidated** (every signed-in user must re-auth) — schedule for low-traffic window |
| 8 | Postgres password (`DATABASE_URL`) | Coolify env on `aiqadam-api` AND on `aiqadam-directus` AND on `aiqadam-authentik` AND on Postgres bootstrap | `openssl rand -hex 24`; ALTER USER postgres WITH PASSWORD '<new>'; update all four Coolify env vars in lock-step; redeploy api + directus + authentik | Everything — highest blast radius |
| 9 | Redis password (`REDIS_URL`) | Coolify env on `aiqadam-api` AND `aiqadam-authentik` AND `aiqadam-plausible` (etc.) | Bump `requirepass` in Redis Coolify config; update all consumer env vars; redeploy in order | BullMQ + telegram outbox + Authentik cache + Plausible |

Skip the secrets that aren't in the leak (e.g. `AUTHENTIK_SECRET_KEY`
isn't exposed via API logs — that one stays).

## When to do the pass

**Trigger**: at R5 cutover (deploy of the Telegram bot to prod) OR
when going live with paid marketing (whichever comes first).

**Why bundle**: each rotation costs 5-15 min including verification.
Batching reduces operator burden + minimizes the number of times we
take the platform briefly degraded.

## What this file does NOT cover

- `TG_CONFIG_ENCRYPTION_KEY` — set fresh 2026-05-22 in the R2 session;
  not in the leak. No rotation needed.
- `TELEGRAM_BOT_SERVICE_TOKEN` — not yet set in Coolify (still local
  dev only at `/tmp/aiqadam-secrets-TELEGRAM_BOT_SERVICE_TOKEN`).
- `AUTHENTIK_SECRET_KEY` — Authentik's internal symmetric key, not
  exposed via Coolify build-time ARGs.
- Coolify's own admin token (`COOLIFY_TOKEN`) — not exposed via this
  vector; rotate independently if its local cache file
  (`/tmp/aiqadam-secrets-COOLIFY_TOKEN`) is suspected compromised.

## Post-rotation actions

1. Delete `TWENTY_API_TOKEN` from Coolify env entirely (Twenty is gone).
2. Verify sign-in works (catches `OIDC_CLIENT_SECRET` + `JWT_SIGNING_SECRET` issues).
3. Verify a Directus item read via the API proxy works (catches `DIRECTUS_TOKEN`).
4. Send a test email via the API (catches `RESEND_API_KEY`).
5. Trigger a test invite (catches `AUTHENTIK_ADMIN_TOKEN`).
6. Purge old Coolify deployment logs (retention setting — TODO documented separately) so the leaked plaintext stops being queryable via Coolify's API.

## Related

- [ADR-0034 addendum on encryption-at-rest](../adr/0034-telegram-bot-and-sender.md) — pattern for future credential storage so they don't end up in build ARGs.
- Coolify deployment log retention: see Coolify admin → Settings → Logs (TODO: file Coolify issue / configure shorter retention for prod resources).
