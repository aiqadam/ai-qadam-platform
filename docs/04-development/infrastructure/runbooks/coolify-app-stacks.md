# Runbook: First production deploy via Coolify

**Audience:** Viktor, deploying the AI Qadam stack to `aiqadam-web` (the production host bootstrapped via [coolify-bootstrap.md](coolify-bootstrap.md)).
**Pre-reading:** [ADR-0007](../../../adr/0007-coolify-orchestration.md), [ADR-0009](../../../adr/0009-email-stack-saas-exception.md), [ADR-0016](../../../adr/0016-web-auth-flow.md).
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

- Coolify v4 running on `aiqadam-web` (per [coolify-bootstrap.md](coolify-bootstrap.md))
- `aiqadam.org` DNS managed in Cloudflare with wildcard `*.aiqadam.org` → host IP (per the project's existing email DNS)
- Repository pushed to GitHub with the `feature/production-deploy` branch (Dockerfiles + this runbook)
- Restic backups configured (per [restic-backups.md](restic-backups.md)) — Coolify volumes are included
- Per-operator Gmail Send-as completed (per [operator-email-send-as.md](../../../02-business-processes/operations/archive/operator-email-send-as.md))

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

Deploy. Wait for healthy. The known akadmin-bootstrap-with-default-email pitfall from [authentik-local-bootstrap.md](authentik-local-bootstrap.md) §"Forgot the akadmin password" applies — if the env var doesn't propagate, fix via `ak shell`.

Open `https://auth.aiqadam.org/if/admin/`, log in as `akadmin` with the bootstrap password.

**Create the OIDC application** (same procedure as [authentik-local-bootstrap.md](authentik-local-bootstrap.md) Step 3, with prod URLs):
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

## Git source — choose SSH deploy key over GitHub App for private repos

> Added 2026-05-23 after the `aiqadam-telegram-bot` GitHub-App source
> went stale and silently broke deploys for ~9 days. Symptom in the
> deploy log: `remote: Repository not found. fatal: repository
> 'https://github.com/<REDACTED>:viktordrukker/...'`. No Coolify-side
> error chip; just the cryptic "not found".

For **private repos** prefer the SSH-deploy-key source:

1. Generate a dedicated key per repo:
   `ssh-keygen -t ed25519 -C "coolify-deploy-<repo>" -f /tmp/<repo>_deploy -N ""`
2. Register the public side on the repo as a GitHub **Deploy Key**
   (Settings → Deploy keys → Add key; read-only is enough).
3. Upload the private side to Coolify as a private key
   (`Coolify admin → Security → Keys`, OR
   `POST /api/v1/security/keys` with `{name, description, private_key}`).
4. When creating the application, choose **Private Key** as the source
   and pick that key. URL must be the raw SSH form:
   `git@github.com:owner/repo.git`.

For **public repos** the HTTPS form via the Coolify GitHub App is also
fine — token expiry is harmless because public clones don't need auth.

**Why not the GitHub App for private repos**: the App's installation
token can be revoked or expire (Coolify-side or GitHub-side) without
notice. The Coolify v4 REST API does NOT let you swap source type on
an existing application — `PATCH /applications/<uuid>` rejects
`private_key_uuid`, `source_id`, `source_type` with `"This field is
not allowed."` (verified 2026-05-23). Recovery is either:

- **Coolify UI flip**: Configuration → General → Source → switch to
  "Private Key" → select key → save. ~1 min.
- **Delete + recreate via API**: `DELETE /applications/<uuid>` then
  `POST /applications/dockercompose` (or `private-deploy-key`) with
  `private_key_uuid`. Loses env vars + deploy history; the bot repo's
  `scripts/r5_deploy.py` does this for unattended setup.

Reference: `aiqadam-api` (uuid `h5m7cpzfamualvdblupy3yy3`) was created
SSH-style from day one and has been deploying cleanly. The
`aiqadam-telegram-bot` resource was originally App-style; required a
recreate on 2026-05-23 to fix.

## Step 3 — Provision Web

In Coolify: **+ New Resource → Application**.

- **Name:** `aiqadam-web`
- **Source:** GitHub → connect the `viktordrukker/aiqadam` repo, branch `main` (SSH deploy key per the section above)
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

Restic snapshots include `/var/lib/docker/volumes` (per [restic-backups.md](restic-backups.md)), which covers Coolify-managed volumes. Postgres + Redis + Authentik state restore by reverse-applying the snapshot, then re-deploying the stacks pointing at the restored volumes.

---

## Twenty CRM (`aiqadam-twenty`) — added Sprint 5 C5.1

Compose-based Coolify service at `crm.aiqadam.org`. Four containers (server + worker + dedicated Postgres + dedicated Redis). Source-of-truth compose: `infrastructure/twenty/docker-compose.yml`.

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

**Auth methods**:
- **Authentik OIDC SSO (primary)** — added in C5.2. Click "Continue with AI Qadam" on the Twenty login page. Behind the scenes: the Twenty `EnterpriseFeaturesEnabledGuard` is a literal `if (!env.ENTERPRISE_KEY) throw` — setting `ENTERPRISE_KEY=<any random>` in the Coolify env unblocks the `createOIDCIdentityProvider` mutation. Twenty's BSL 1.1 permits non-competing self-hosted use; this satisfies the env presence check without bypassing any actual license validation.
- **Local email/password (fallback)** — `admin@aiqadam.org` + cached password at `/tmp/aiqadam-secrets-TWENTY_ADMIN_PW`. Kept as a rescue path if SSO ever breaks.

**Twenty SSO env set on the Coolify service**:
- `ENTERPRISE_KEY=<32-byte hex>` (any value — cached at `/tmp/aiqadam-secrets-TWENTY_ENTERPRISE_KEY`)
- `IS_MULTIWORKSPACE_ENABLED=false`
- `FRONTEND_URL=https://crm.aiqadam.org`
- `DEFAULT_SUBDOMAIN=app`

**Authentik OAuth2 provider for Twenty** (pk=4):
- name `aiqadam-twenty-provider`, signing key = self-signed cert (RS256 from day 1)
- `sub_mode=user_email` so Twenty's IDP matching is stable on email
- redirect URI `https://crm.aiqadam.org/auth/oidc/callback`
- application slug `aiqadam-twenty`, issuer `https://auth.aiqadam.org/application/o/aiqadam-twenty/`

**Twenty IDP id** (used in URLs as `/auth/oidc/login/<id>`): `24cdcb99-9e68-479d-a955-b8dc3f9855c8`.

**Smoke (real GET, not HEAD)**: HEAD on the login URL trips openid-client's strict method check and redirects to `/verify?errorMessage=Unknown+error` — harmless red herring. Real browser GET produces the expected 302 to Authentik.

**Healthcheck**: `https://crm.aiqadam.org/healthz` should return `{"status":"ok",...}`. Server container also runs an internal curl healthcheck every 5s.

---

## Plausible Analytics (`aiqadam-plausible`) — added Sprint M5.0

Compose-based Coolify service at `analytics.aiqadam.org`. Three containers (Plausible + dedicated Postgres + ClickHouse). Source-of-truth compose: [`infrastructure/plausible/docker-compose.yml`](../../../../infrastructure/plausible/docker-compose.yml).

**Coolify identifiers**
- Service uuid: `yhl7tx5ckc9j4quilq2y8f61`
- Image tag: `ghcr.io/plausible/community-edition:v3.0.1` (pinned via `PLAUSIBLE_TAG`; bump deliberately)

**Required service envs** (all set at Coolify service level):
- `BASE_URL` — `https://analytics.aiqadam.org`.
- `SECRET_KEY_BASE` — `openssl rand -hex 64` (must be ≥ 64 bytes; Phoenix rejects shorter). Cached at `/tmp/aiqadam-secrets-PLAUSIBLE_SKB`.
- `TOTP_VAULT_KEY` — `openssl rand -base64 32`. Cached at `/tmp/aiqadam-secrets-PLAUSIBLE_TOTP`.
- `PLAUSIBLE_PG_PW` — `openssl rand -hex 24`. Cached at `/tmp/aiqadam-secrets-PLAUSIBLE_PG_PW`.
- `MAILER_EMAIL` — `admin@aiqadam.org` (must be verified on Resend).
- `RESEND_API_KEY` — same Resend key used by the main API (`/tmp/aiqadam-secrets-RESEND_KEY`).

**Routing**: same pattern as Twenty — PATCH `/api/v1/services/<uuid>` with `{"urls":[{"name":"plausible","url":"https://analytics.aiqadam.org"}]}`. Wildcard DNS already covers the subdomain.

**Gotchas encountered during the initial deploy** (all fixed in the compose):
1. `MAILER_ADAPTER` must be `Bamboo.SMTPAdapter` (not `Bamboo.Mua.SMTPAdapter` — that name is invented; Plausible v3 just uses plain Bamboo). Wrong value crashes the container during boot config eval with `ArgumentError: Unknown mailer_adapter`.
2. `SECRET_KEY_BASE` < 64 bytes crashes Phoenix on boot. `openssl rand -hex 32` produces 32 bytes (64 hex chars) which is BELOW the minimum — must use `openssl rand -hex 64` for 64 bytes (128 hex chars).
3. ClickHouse 25.x default users.d configuration silently fails to bind a listener on our host (no error in logs, container sits at `health: starting` forever). Pin to `clickhouse/clickhouse-server:24.12-alpine` (the version the upstream Plausible v3.0.1 compose ships with) + `CLICKHOUSE_SKIP_USER_SETUP=1`.
4. Docker's default bridge network has IPv6 disabled; ClickHouse's `listen_host=[::]` default fails with `Address family for hostname not supported`. Inline an `ipv4-only.xml` config via compose `configs:` that sets `<listen_host>0.0.0.0</listen_host>` + `<listen_host>::</listen_host>` + `<listen_try>1</listen_try>`.
5. ClickHouse low-RAM tuning recommended (`query_log`/`trace_log` etc. writes pad ~50MB/day). Inlined via the same `configs:` mechanism, no host filesystem bind mount needed.
6. The `plausible` container needs a `plausible-data` named volume mounted at `/var/lib/plausible` + `TMPDIR=/var/lib/plausible/tmp`. Without it, the entrypoint's `db migrate` step crashes trying to write tmp files.

**Resend SMTP relay**: `smtp.resend.com:587` with STARTTLS (`SMTP_HOST_SSL_ENABLED=false`), username `resend`, password = Resend API key. Sender (`MAILER_EMAIL`) must be on a Resend-verified domain; `admin@aiqadam.org` already is.

**First-time bootstrap** (one-shot, manual):

Plausible v3 has no `user_create` CLI; first admin is created via the UI with public registration temporarily open.

1. Confirm `DISABLE_REGISTRATION=false` is set in the Coolify service env. (M5.0 compose references `${DISABLE_REGISTRATION:-true}`, so the deploy boots locked-down; only the human bootstrap step flips this temporarily.) If you need to flip it, PATCH the env via the Coolify API:
   ```
   curl -X PATCH -H "Authorization: Bearer $COOLIFY_TOKEN" -H "content-type: application/json" \
     https://coolify.aiqadam.org/api/v1/services/yhl7tx5ckc9j4quilq2y8f61/envs \
     -d '{"key":"DISABLE_REGISTRATION","value":"false","is_preview":false,"is_build_time":false,"is_literal":true}'
   curl -X GET -H "Authorization: Bearer $COOLIFY_TOKEN" \
     https://coolify.aiqadam.org/api/v1/services/yhl7tx5ckc9j4quilq2y8f61/restart
   ```
2. Open `https://analytics.aiqadam.org/register`, sign up with `admin@aiqadam.org` + a strong password. **Cache the password at `/tmp/aiqadam-secrets-PLAUSIBLE_ADMIN_PW`.**
3. **Immediately flip `DISABLE_REGISTRATION` back to `true`** and restart (same PATCH as above with `"value":"true"`) so the world can't register accounts on our dashboard.
4. Log in, create a site with domain `aiqadam.org`. Plausible will issue the snippet `<script defer data-domain="aiqadam.org" src="https://analytics.aiqadam.org/js/script.js"></script>` — this matches what M5.0 already added to `apps/web/src/layouts/Layout.astro`.
5. Confirm on first prod visit that the dashboard receives a pageview.

**Healthcheck**: `https://analytics.aiqadam.org/api/health` returns 200 with `{"clickhouse":"ok","postgres":"ok"}` (approx). Container also has an internal `wget --spider` healthcheck every 10s.
