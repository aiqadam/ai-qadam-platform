# Runbook: Bootstrapping Authentik locally + creating the OIDC application

**Audience:** anyone bringing up the local-dev stack and needing the API/web apps to authenticate against Authentik.
**Pre-reading:** [ADR-0016](../adr/0016-web-auth-flow.md) — web auth flow (HttpOnly refresh + in-memory access token).
**Total time:** ~10 minutes the first time, ~1 minute on a clean rebuild after the env values are saved.

## What this gets you

- Authentik running at `http://localhost:9000` against the shared local Postgres (`authentik` DB) and Redis
- An admin user (`akadmin`) you can log into the Authentik admin UI with
- An **OIDC Application + Provider** named `aiqadam-platform-local` with the redirect URIs the API and web apps expect
- A **client ID** + **client secret** you paste into `apps/api/.env` (when PR #7 lands) and `apps/web/.env`

## Prerequisites

1. `infrastructure/docker-compose.yml` includes `authentik-server` + `authentik-worker` (this is true on `main` from PR #6 onwards).
2. `infrastructure/.env` has both required vars set:
   ```bash
   # Generate locally — never reuse, never commit:
   AUTHENTIK_SECRET_KEY=$(openssl rand -base64 60 | tr -d '\n')
   AUTHENTIK_BOOTSTRAP_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
   ```
   Save both in your password manager. The secret key encrypts every Authentik secret in the DB — losing it = unable to decrypt anything in the `authentik` schema.
3. The shared Postgres is healthy and the `authentik` database exists. Verify:
   ```bash
   docker compose -f infrastructure/docker-compose.yml exec postgres \
     psql -U postgres -d authentik -c '\dt'
   ```
   Expect "Did not find any relations" on a fresh boot — that's fine; Authentik will create them on first start.

## Steps

### Step 1 — Bring up Authentik

```bash
cd infrastructure
docker compose up -d authentik-server authentik-worker
docker compose logs -f authentik-server
```

Wait for `Booting worker` and the line `Listening on http://0.0.0.0:9000`. First boot takes ~60–90 seconds because Authentik runs all migrations from scratch.

If you see `relation "authentik_core_user" does not exist` repeatedly — the migrations haven't finished. Keep waiting; don't restart.

### Step 2 — First admin login

1. Open `http://localhost:9000/if/flow/initial-setup/` in a browser.
2. If Authentik prompts you to **create the admin password**, that means `AUTHENTIK_BOOTSTRAP_PASSWORD` was empty or already consumed. Set it via the form and continue.
3. Otherwise log in directly at `http://localhost:9000/if/admin/`:
   - Username: `akadmin`
   - Password: the value of `AUTHENTIK_BOOTSTRAP_PASSWORD`
4. **Change the password immediately** via the user menu → "Change password". Authentik only reads the env var until an admin exists; from now on the password lives in the DB.

### Step 3 — Create the OIDC application

In the admin UI:

1. **Applications → Applications → Create with Provider**.
2. Fill in:
   - Name: `AI Qadam Platform (local)`
   - Slug: `aiqadam-platform-local`
   - Provider type: **OAuth2/OpenID Provider**
   - Authorization flow: `default-provider-authorization-explicit-consent` (the explicit-consent variant is fine for local dev; production will use the implicit-consent flow against the trusted first-party clients)
3. On the provider step:
   - Name: `aiqadam-platform-local-provider`
   - Client type: **Confidential**
   - Client ID: leave the auto-generated value
   - Client Secret: leave the auto-generated value (you'll copy both in a moment)
   - Redirect URIs / Origins (one per line):
     ```
     http://localhost:4321/auth/callback
     http://localhost:3000/v1/auth/callback
     ```
     — `4321` is the Astro dev server (web), `3000` is the NestJS dev server (api).
   - Signing Key: `authentik Self-signed Certificate` (default).
   - Subject mode: `Based on the User's hashed ID` — stable, opaque per-user identifier for our `User.authentikSubject` column (see PR #7).
4. Click **Finish**.

### Step 4 — Copy credentials into the app envs

In the admin UI, **Applications → Providers → aiqadam-platform-local-provider → Edit** to reveal:

- **Client ID** — paste into `apps/api/.env` as `OIDC_CLIENT_ID=…` and `apps/web/.env` as `PUBLIC_OIDC_CLIENT_ID=…`
- **Client Secret** — paste into `apps/api/.env` as `OIDC_CLIENT_SECRET=…` (web does not need this — the secret stays server-side only, see ADR-0016)

Also note these well-known endpoints (Authentik exposes them at the provider's discovery URL):

```
Issuer:        http://localhost:9000/application/o/aiqadam-platform-local/
Discovery:     http://localhost:9000/application/o/aiqadam-platform-local/.well-known/openid-configuration
JWKS:          http://localhost:9000/application/o/aiqadam-platform-local/jwks/
Authorize:     http://localhost:9000/application/o/authorize/
Token:         http://localhost:9000/application/o/token/
UserInfo:      http://localhost:9000/application/o/userinfo/
```

The API only needs `OIDC_ISSUER_URL` (the discovery URL); it derives the rest from `.well-known/openid-configuration`.

### Step 5 — Verify

1. From a terminal, hit the discovery URL — it must return JSON with `authorization_endpoint`, `token_endpoint`, `jwks_uri`:
   ```bash
   curl -s http://localhost:9000/application/o/aiqadam-platform-local/.well-known/openid-configuration | jq .issuer
   # → "http://localhost:9000/application/o/aiqadam-platform-local/"
   ```
2. Once PR #8 lands, hit `http://localhost:4321/login` in a browser. The flow should redirect → Authentik login → consent → back to `/auth/callback` → `/me` page showing your email.

## Troubleshooting

### `authentik-server` keeps restarting

Check `docker compose logs authentik-server`. Common causes:

- **`AUTHENTIK_SECRET_KEY` missing or changed after first boot.** Authentik refuses to decrypt existing data with a different key. If you genuinely lost the key, the only path is `docker compose down -v` (wipes Authentik data — local dev only, never in prod).
- **Postgres unreachable.** The shared Postgres container must be healthy. `docker compose ps postgres` should show `(healthy)`.

### "Permission denied" connecting to Postgres

The `authentik` DB is owned by the same `postgres` user the init script created. If you changed `POSTGRES_USER` after first boot, the existing role doesn't match. Easiest fix on local-dev: `docker compose down -v` and start over with a consistent user.

### Forgot the `akadmin` password

```bash
docker compose exec authentik-server ak shell -c \
  "from authentik.core.models import User; u=User.objects.get(username='akadmin'); u.set_password('NEW_PASSWORD_HERE'); u.save()"
```

This is **local-dev only**. The production password lives in 1Password and is rotated via the admin UI.

## What's next

PR #7 wires the API against this OIDC application. PR #8 wires the web. After both land, this runbook becomes a true end-to-end smoke test for the auth stack.
