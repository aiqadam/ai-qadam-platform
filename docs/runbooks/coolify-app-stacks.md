# Runbook: First production deploy via Coolify

**Audience:** Viktor, deploying the AI Qadam stack to `aiqadam-web` (the production host bootstrapped via [coolify-bootstrap.md](./coolify-bootstrap.md)).
**Pre-reading:** [ADR-0007](../adr/0007-coolify-orchestration.md), [ADR-0009](../adr/0009-email-stack-saas-exception.md), [ADR-0016](../adr/0016-web-auth-flow.md).
**Total time:** ~60 minutes (setup) + ~15 minutes (verification).
**State after:** `https://aiqadam.org` serves the full MVP loop end-to-end.

## Topology

Same-origin per the PR #18 routing decision:

```
                         ┌───────────────────────────┐
                         │  Cloudflare DNS + proxy   │
                         │  *.aiqadam.org → host IP  │
                         └───────────┬───────────────┘
                                     │ HTTPS (TLS terminated by Coolify Traefik)
                  ┌──────────────────┼──────────────────────┐
                  │                  │                      │
        aiqadam.org              coolify.aiqadam.org   auth.aiqadam.org
                  │                  │                      │
            ┌─────┴─────┐      ┌─────┴─────┐         ┌──────┴──────┐
            │ Traefik   │      │ Coolify   │         │ Authentik   │
            │ /api/* →  │      │ admin UI  │         │ server      │
            │   api     │      └───────────┘         └──────┬──────┘
            │   :3000   │                                   │
            │ /* →      │                                   │
            │   web     │                                   │
            │   :80     │                                   │
            └─┬─────┬───┘                                   │
              │     │                                       │
        ┌─────▼─┐ ┌─▼─────┐                                 │
        │ web   │ │  api  │◄────────── shared internal ─────┘
        │ nginx │ │ Nest  │            Postgres + Redis
        └───────┘ └───┬───┘
                     │
              shared │ Postgres (databases: platform, authentik)
                     │ Redis
```

## Prerequisites

- Coolify v4 running on `aiqadam-web` (per [coolify-bootstrap.md](./coolify-bootstrap.md))
- `aiqadam.org` DNS managed in Cloudflare with wildcard `*.aiqadam.org` → host IP (per the project's existing email DNS)
- Repository pushed to GitHub with the `feature/production-deploy` branch (Dockerfiles + this runbook)
- Restic backups configured (per [restic-backups.md](./restic-backups.md)) — Coolify volumes are included
- Per-operator Gmail Send-as completed (per [operator-email-send-as.md](./operator-email-send-as.md))

## Step 1 — Provision shared Postgres + Redis stacks

These are infra dependencies that every app talks to. Stand them up FIRST so the app stacks have something to connect to.

### Postgres

In Coolify admin: **+ New Resource → Postgres**.

- **Name:** `aiqadam-postgres`
- **Image:** `pgvector/pgvector:pg16` (custom image — paste the image name in the Image field)
- **Internal port:** `5432`
- **Public access:** OFF (internal only)
- **Volume:** `pgdata` mounted at `/var/lib/postgresql/data`
- **Environment:**
  - `POSTGRES_USER=postgres`
  - `POSTGRES_PASSWORD=<generate via 1Password, save it>`
  - `POSTGRES_DB=postgres`
- **Init script** (paste under `/docker-entrypoint-initdb.d/`):
  ```sql
  CREATE DATABASE platform;
  CREATE DATABASE authentik;
  \c platform
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
  (or copy `infrastructure/scripts/postgres-init.sql` from the repo)

Click **Deploy**. Wait for healthy.

### Redis

- **Name:** `aiqadam-redis`
- **Image:** `redis:7-alpine`
- **Public access:** OFF
- **Volume:** `redis-data` mounted at `/data`
- **Command override:** `redis-server --save 60 1 --maxmemory 256mb --maxmemory-policy allkeys-lru`

Click **Deploy**.

Note the **internal hostnames** Coolify generates — they look like `aiqadam-postgres-fooid` and `aiqadam-redis-fooid`. You'll paste these into the API's `DATABASE_URL` and `REDIS_URL` below.

## Step 2 — Provision Authentik

In Coolify: **+ New Resource → Docker Compose** (or two separate Application resources for server + worker; compose is shorter).

Paste this `docker-compose.yml`:

```yaml
services:
  authentik-server:
    image: ghcr.io/goauthentik/server:2024.12.3
    command: server
    environment:
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY}
      AUTHENTIK_REDIS__HOST: ${REDIS_HOST}
      AUTHENTIK_POSTGRESQL__HOST: ${POSTGRES_HOST}
      AUTHENTIK_POSTGRESQL__USER: ${POSTGRES_USER}
      AUTHENTIK_POSTGRESQL__PASSWORD: ${POSTGRES_PASSWORD}
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_BOOTSTRAP_EMAIL: admin@aiqadam.org
      AUTHENTIK_BOOTSTRAP_PASSWORD: ${AUTHENTIK_BOOTSTRAP_PASSWORD}
      AUTHENTIK_ERROR_REPORTING__ENABLED: "false"
      AUTHENTIK_DISABLE_UPDATE_CHECK: "true"
    volumes:
      - authentik-media:/media
      - authentik-templates:/templates
  authentik-worker:
    image: ghcr.io/goauthentik/server:2024.12.3
    command: worker
    environment:
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY}
      AUTHENTIK_REDIS__HOST: ${REDIS_HOST}
      AUTHENTIK_POSTGRESQL__HOST: ${POSTGRES_HOST}
      AUTHENTIK_POSTGRESQL__USER: ${POSTGRES_USER}
      AUTHENTIK_POSTGRESQL__PASSWORD: ${POSTGRES_PASSWORD}
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_ERROR_REPORTING__ENABLED: "false"
    volumes:
      - authentik-media:/media
      - authentik-templates:/templates
volumes:
  authentik-media:
  authentik-templates:
```

Set env vars in the Coolify UI:
- `AUTHENTIK_SECRET_KEY` — generate fresh: `openssl rand -base64 60 | tr -d '\n=+/' | head -c 60`. Save in 1Password.
- `AUTHENTIK_BOOTSTRAP_PASSWORD` — generate fresh: `openssl rand -base64 32 | tr -d '\n=+/' | head -c 32`. Save in 1Password.
- `REDIS_HOST` — internal hostname from Step 1
- `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD` — from Step 1

Bind public domain: `auth.aiqadam.org` → port `9000`.

Deploy. Wait for healthy. The known akadmin-bootstrap-with-default-email pitfall from [authentik-local-bootstrap.md](./authentik-local-bootstrap.md) §"Forgot the akadmin password" applies — if the env var doesn't propagate, fix via `ak shell`.

Open `https://auth.aiqadam.org/if/admin/`, log in as `akadmin` with the bootstrap password.

**Create the OIDC application** (same procedure as [authentik-local-bootstrap.md](./authentik-local-bootstrap.md) Step 3, with prod URLs):
- Application slug: `aiqadam-platform`
- Provider: OAuth2/OpenID, Confidential
- Redirect URIs:
  ```
  https://aiqadam.org/api/v1/auth/callback
  https://aiqadam.org/
  ```
- Subject mode: Based on the User's hashed ID
- (Optional) Set provider's Invalidation flow to a custom flow that does silent logout (the polish item from PR #11's smoke).

Note the **Client ID** + **Client Secret** — paste into the API stack env in Step 4.

## Step 3 — Provision Web

In Coolify: **+ New Resource → Application**.

- **Name:** `aiqadam-web`
- **Source:** GitHub → connect the `viktordrukker/aiqadam` repo, branch `main`
- **Build pack:** Dockerfile
- **Dockerfile location:** `apps/web/Dockerfile`
- **Build context:** `.` (repo root, NOT `apps/web` — the Dockerfile copies from the workspace root)
- **Internal port:** `80`
- **Public domain:** `aiqadam.org`
- **HTTPS:** ON (Coolify uses Let's Encrypt automatically)

No env vars needed — the web is fully static and only talks to `/api/*` on its own origin.

Click **Deploy**. Wait for the build (~3 minutes first time, ~30 s on subsequent rebuilds when the pnpm cache hits).

## Step 4 — Provision API

- **Name:** `aiqadam-api`
- **Source:** same GitHub repo, branch `main`
- **Build pack:** Dockerfile
- **Dockerfile location:** `apps/api/Dockerfile`
- **Build context:** `.`
- **Internal port:** `3000`
- **Public domain:** `aiqadam.org` with **path prefix** `/api` (Traefik will strip the prefix before forwarding)
- **Env vars:**
  ```
  NODE_ENV=production
  PORT=3000
  DATABASE_URL=postgresql://postgres:<password>@<POSTGRES_HOST>:5432/platform
  REDIS_URL=redis://<REDIS_HOST>:6379
  JWT_SIGNING_SECRET=<openssl rand -base64 48 | tr -d '\n=+/' | head -c 48 — save in 1Password>
  OIDC_ISSUER_URL=https://auth.aiqadam.org/application/o/aiqadam-platform/
  OIDC_CLIENT_ID=<from Authentik provider>
  OIDC_CLIENT_SECRET=<from Authentik provider>
  OIDC_REDIRECT_URI=https://aiqadam.org/api/v1/auth/callback
  WEB_BASE_URL=https://aiqadam.org
  SEND_EMAILS=true
  RESEND_API_KEY=<from resend.com/api-keys, save in 1Password>
  EMAIL_FROM=AI Qadam <admin@aiqadam.org>
  ```

Click **Deploy**.

### Run migrations on first boot

The API container ships with `src/db/migrations/`. Open a shell in the running container (Coolify → Application → Terminal):

```sh
DATABASE_URL=$DATABASE_URL npx drizzle-kit migrate
```

(Or use Coolify's "Pre-deployment command" feature to run this automatically on every deploy — recommended.)

## Step 5 — Verify Traefik routing

Coolify uses Traefik internally. The two domains-on-the-same-host trick is set up via:
- Web app: domain `aiqadam.org`, no path prefix, default route
- API app: domain `aiqadam.org`, path prefix `/api`

Verify:
```
curl -I https://aiqadam.org/                  # 200, served by nginx (web)
curl -I https://aiqadam.org/api/health        # 200 JSON, served by api
curl -I https://aiqadam.org/events            # 200, served by nginx (web)
```

If `/api/*` returns the web instead, check Coolify's Traefik label config — sometimes the path-prefix middleware needs to be explicitly enabled, and the order of priorities matters (path-prefix > catch-all).

## Step 6 — Manual smoke

1. Open `https://aiqadam.org/` — landing page.
2. Click **Events** → empty list (expected, no seed data yet).
3. Click **Account** → **Sign in with Authentik**.
4. Authenticate as a real user (or akadmin for the smoke).
5. Land back on `/me` → should show your email.
6. Insert a sample event in Postgres:
   ```sql
   INSERT INTO events (country_code, title, description, format, status, starts_at, ends_at, capacity)
   VALUES ('uz', 'Smoke Test Event', 'First production event', 'meetup', 'published',
           now() + interval '1 day', now() + interval '1 day' + interval '2 hours', 10);
   ```
7. Refresh `/events` → see the event. Click **Register**. Receive an email at admin@aiqadam.org.
8. Open `/me` → see the registration with QR.
9. Open the QR URL on a phone or via curl: `POST /api/v1/checkin/<code>` → status flips to `attended`.
10. Open `/leaderboard` → see your name with 10 points.

Loop verified end-to-end.

## Auto-deploy on push to main

Coolify supports GitHub webhooks. In the repo: **Settings → Webhooks → Add webhook**, paste the Coolify-provided URL. Each push to `main` triggers a rebuild + redeploy of both apps.

## Rollback

Coolify keeps the last N image builds. **Application → Deployments → previous version → Redeploy**. For a code-side rollback, `git revert` the offending commit on `main` — the webhook re-triggers.

## Backups

Restic snapshots include `/var/lib/docker/volumes` (per [restic-backups.md](./restic-backups.md)), which covers Coolify-managed volumes. Postgres + Redis + Authentik state restore by reverse-applying the snapshot, then re-deploying the stacks pointing at the restored volumes.

---

## Twenty CRM (`aiqadam-twenty`) — added Sprint 5 C5.1

Compose-based Coolify service at `crm.aiqadam.org`. Four containers (server + worker + dedicated Postgres + dedicated Redis). Source-of-truth compose: [`infrastructure/twenty/docker-compose.yml`](../../infrastructure/twenty/docker-compose.yml).

**Coolify identifiers**
- Service uuid: `x12tbwbkpmy4ump0kgf15mrc`
- Sub-application uuid (`server`, the one the FQDN routes to): `ssemgpv3jvi44xj71bnrs956`
- Image tag: `twentycrm/twenty:v0.50.0` (pinned via `TAG` env; bump deliberately, don't ride `latest`)

**Required service envs** (set at Coolify service level):
- `APP_SECRET` — `openssl rand -base64 32`. Cached locally at `/tmp/aiqadam-secrets-TWENTY_APP_SECRET`.
- `PG_DATABASE_PASSWORD` — `openssl rand -hex 24`. Cached at `/tmp/aiqadam-secrets-TWENTY_PG_PW`.
- `PG_DATABASE_USER` — `postgres`.
- `SERVER_URL` — `https://crm.aiqadam.org`.
- `TAG` — `v0.50.0`.

**Routing**: do NOT use the magic `SERVICE_FQDN_*` env approach — for compose-based services Coolify doesn't auto-generate Traefik labels from those. Instead, register the FQDN via:

```
PATCH /api/v1/services/<svc>  body: {"urls":[{"name":"server","url":"https://crm.aiqadam.org"}]}
```

After that PATCH + force-redeploy, Traefik labels are generated against the `server` container automatically (gzip middleware, redirect-to-https, Let's Encrypt cert).

**Two gotchas from the initial deploy** (both documented in the compose):
1. The v0.50.0 entrypoint runs `touch /app/docker-data/db_status` with `set -e`. The directory is part of the image but a named-volume mount masks it (root-owned, container user can't write → crashloop). Fix: mount `/app/docker-data` as world-writable tmpfs (`mode=1777`). Migrations re-run on every container start, which is fine (~10s, idempotent).
2. Need `expose: ["3000"]` on the `server` service so Coolify knows what port Traefik should target.

**First-time bootstrap** (one-shot, manual):
1. Open `https://crm.aiqadam.org/` → Twenty's "Welcome" wizard.
2. Create workspace named `AI Qadam`.
3. Create admin user with email `admin@aiqadam.org` + a strong password (cache at `/tmp/aiqadam-secrets-TWENTY_ADMIN_PW`).

**Auth method**: local email/password (cached above). OIDC SSO via Authentik was attempted (C5.2) but **Twenty 0.50 gates `createOIDCIdentityProvider` behind their Enterprise tier** — the mutation exists in the free image but `EnterpriseFeaturesEnabledGuard` rejects every call. Sprint 7 wires Google SSO instead via `AUTH_GOOGLE_*` envs (free in Twenty), reusing the same Google OAuth credentials we'll create for the web app.

**Healthcheck**: `https://crm.aiqadam.org/healthz` should return `{"status":"ok",...}`. Server container also runs an internal curl healthcheck every 5s.
