# ARCHITECTURE.md — AI Qadam Platform

## High-level shape

```
                              Internet
                                 │
                          [ Traefik / Coolify ]
                                 │
        ┌────────────────────────┼─────────────────────────┐
        │                        │                         │
   ┌────▼─────┐          ┌───────▼──────┐         ┌────────▼──────┐
   │ Astro 5  │          │  NestJS 11   │         │  Directus 11  │
   │   Web    │◄────────►│     API      │         │     CMS       │
   │ (SSG/    │          │              │         │               │
   │  ISR)    │          │              │         │               │
   └──────────┘          └──┬───────┬───┘         └───────┬───────┘
                            │       │                     │
                       ┌────▼─┐   ┌─▼─────────┐           │
                       │ Bot  │   │ Workers   │           │
                       │aiogr.│   │ (BullMQ)  │           │
                       └──────┘   └─┬─────────┘           │
                                    │                     │
   ══════════════════════════════════════════════════════════
                       SHARED PLATFORM LAYER
   ══════════════════════════════════════════════════════════
                       │                          │
   ┌─────────────┐   ┌─▼─────┐   ┌────────┐   ┌──▼─────┐
   │  Authentik  │   │ Redis │   │  MinIO │   │Postgres│
   │   (SSO)     │   │       │   │ (S3)   │   │   16   │
   └─────────────┘   └───────┘   └────────┘   └────────┘
   ══════════════════════════════════════════════════════════
                       SUPPORTING SERVICES
   ══════════════════════════════════════════════════════════
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ Listmonk │  │  Twenty  │  │ Grafana  │  │  Tolgee  │
   │ (email)  │  │  (CRM)   │  │ (metrics)│  │ (i18n)   │
   └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

## Stack — the canonical list

Any deviation requires user approval.

### Application layer
- **Frontend:** Astro 5 (SSG/ISR) + React 19 islands + Tailwind 4 + shadcn/ui
- **Backend API:** NestJS 11 + Drizzle 0.x + Zod (validation) — see [ADR-0013](../../adr/0013-orm-drizzle-over-prisma.md)
- **CMS:** Directus 11
- **Bot:** Python 3.12 + aiogram 3
- **Background jobs:** BullMQ on Redis
- **Email service:** Listmonk

### Data layer
- **Database:** PostgreSQL 16 with pgvector extension
- **Cache + queues:** Redis 7
- **Object storage:** MinIO (S3-compatible)
- **Search:** Postgres full-text on phase 1; consider Meilisearch later

### Identity and security
- **Auth:** Authentik (OIDC provider) — see [ADR-0016](../../adr/0016-web-auth-flow.md) for the web auth flow
- **Sessions:** HttpOnly refresh-token cookie + short-lived in-memory access token (web); bearer JWT (bot, CRM, server-to-server). See [ADR-0016](../../adr/0016-web-auth-flow.md).
- **Secrets:** environment variables, never in code

### Infrastructure
- **Orchestration:** Coolify (Docker-based PaaS)
- **Reverse proxy:** Traefik (managed by Coolify)
- **CI/CD:** GitHub Actions → Coolify webhooks
- **Monitoring:** Grafana + Loki + Prometheus + Uptime Kuma
- **Backups:** restic to Cloudflare R2 (free tier)

### Internationalization
- **i18n framework:** i18next + react-i18next on frontend
- **Translation management:** Tolgee (self-hosted)
- **Content translations:** Directus native translations

## Repository structure

Single monorepo using **pnpm workspaces** + **Turborepo** for caching.

```
aiqadam/
├── AGENTS.md                 # canonical AI rule file (read by all assistants; .github/copilot-instructions.md is generated from it)
├── .claude/
│   └── CLAUDE.md             # Claude Code–specific additions on top of AGENTS.md
├── apps/
│   ├── web/                  # Astro frontend (legacy, being replaced by web-next)
│   ├── web-next/             # Astro 5 + React 19 + Tailwind 4 rewrite (ADR-0038)
│   ├── api/                  # NestJS 11 backend
│   ├── bot/                  # Python aiogram 3 Telegram bot
│   ├── workers/              # BullMQ background job processors
│   ├── e2e/                  # Playwright end-to-end smoke suite
│   └── storybook/            # component stories
├── packages/
│   ├── shared-types/         # Zod schemas + TS types (source of truth)
│   ├── ui/                   # shared UI components
│   ├── biome-config/         # shared Biome rules (replaces eslint-config per ADR-0014)
│   └── tsconfig/             # shared TypeScript configs
├── design-system/            # canonical static HTML/CSS visual reference (tokens.css, components.css, portal.css)
├── infrastructure/
│   ├── docker-compose.yml    # local-dev shared services (PG, Redis, MinIO, Authentik, …)
│   └── scripts/              # local-dev scripts (seed, reset, backup-test)
├── docs/
│   ├── 01-business/          # business context, glossary, roadmap
│   ├── 03-requirements/      # functional requirements (FR-*)
│   ├── 04-development/       # ← architecture, standards, workflow, security, design-system (THIS FILE)
│   ├── 05-other/             # ai-collab, agent-prompts
│   └── adr/                  # architecture decision records
└── README.md                 # repo entry point: orientation + how to run locally
```

The canonical operating docs live in `docs/04-development/` (standards, workflow,
security, architecture) and `docs/01-business/` (project, glossary). `.claude/CLAUDE.md`
and `AGENTS.md` are the AI-facing entry points that reference these. See
[ADR-0001](../../adr/0001-docs-live-in-claude-folder.md) for the original docs-location
decision.

## Module boundaries (the most important section)

Modules communicate through **explicit interfaces only**. No reaching into another module's internals.

### NestJS API modules

```
apps/api/src/
├── core/                     # cross-cutting infrastructure
│   ├── auth/                 # Authentik integration, JWT verification
│   ├── tenant/               # tenant resolution middleware
│   ├── observability/        # logging, metrics, tracing
│   └── errors/               # error classes, exception filters
├── modules/
│   ├── users/                # User accounts (mirrors Authentik + extends)
│   ├── events/               # Event CRUD, agenda, materials
│   ├── registrations/        # Event registration, waitlist, check-in
│   ├── speakers/             # Speaker profiles, expertise
│   ├── partners/             # Partner profiles
│   ├── gamification/         # Points, badges, streaks, leaderboards
│   ├── activities/           # Activity feed, notifications
│   ├── content/              # Bridge to Directus for content reads
│   ├── notifications/        # Email + Telegram delivery
│   └── admin/                # Admin-only operations
└── main.ts
```

### Rules for module boundaries

1. **Modules expose a service interface, not entities directly.** `EventsService.getById(id)`, not `EventsModule.eventRepository`.

2. **Cross-module calls go through service interfaces.** `RegistrationsService` can call `EventsService.getById()` — it cannot directly query `Event` entities.

3. **Shared types live in `packages/shared-types`.** Both web and API import from there. Single source of truth for DTOs.

4. **Database schemas are co-located with modules.** Drizzle schema files are split per module under `apps/api/src/modules/<name>/schema.ts`, then re-exported from a central index for `drizzle-kit` to pick up:
   ```typescript
   // apps/api/src/modules/users/schema.ts
   export const users = pgTable('users', { /* ... */ });
   export const userSettings = pgTable('user_settings', { /* ... */ });

   // apps/api/src/modules/events/schema.ts
   export const events = pgTable('events', { /* ... */ });
   export const eventSpeakers = pgTable('event_speakers', { /* ... */ });
   ```
   See [ADR-0013](../../adr/0013-orm-drizzle-over-prisma.md).

5. **No module reaches into another module's database tables directly.** Always through the owning service.

6. **Circular dependencies are forbidden.** If A needs B and B needs A, extract the shared concern to a third module or to `core`.

## Data ownership

| Schema in Postgres | Owner | Who reads | Who writes |
|--------------------|-------|-----------|------------|
| `platform` | NestJS API | All apps via API | NestJS API only |
| `directus` | Directus CMS | NestJS reads via Directus API | Directus admin UI |
| `authentik` | Authentik | None | Authentik only |
| `twenty` | Twenty CRM | None directly | Twenty only |
| `listmonk` | Listmonk | None directly | Listmonk only |

**Cross-schema queries are forbidden.** If Twenty data is needed in API responses, fetch via Twenty's GraphQL API, not via SQL join.

## Multi-tenancy implementation

Tenant = country. Implementation:

1. **Tenant resolution middleware** in API extracts tenant from:
   - `Host` header (e.g., `uz.aiqadam.org` → `uz`)
   - For API calls from bot: explicit `X-Tenant` header
   - Falls back to user's primary country if authenticated

2. **All tenant-scoped tables have `country_code` column** (varchar(2), indexed).

3. **A tenant-aware repository layer** (Drizzle middleware-style) automatically filters by `country_code` for tenant-scoped queries. Global queries (super-admin) opt out explicitly via a `bypassTenant()` helper. Pattern documented in [ADR-0013](../../adr/0013-orm-drizzle-over-prisma.md).

4. **Frontend tenant resolution** in Astro middleware: parses subdomain, passes to API as header.

5. **Some data is global** (users, badges, languages, tags) — no `country_code`.

## API design conventions

- **REST for resource CRUD** following standard HTTP semantics
- **JSON bodies, JSON responses**
- **Versioning via URL prefix:** `/v1/...`
- **Pagination:** cursor-based, `?cursor=...&limit=...`
- **Sorting:** `?sort=field,-otherfield` (- for descending)
- **Filtering:** explicit query params, no generic query DSL
- **Errors:** RFC 7807 Problem Details (`application/problem+json`)
- **Date format:** ISO 8601 with timezone, always UTC in DB
- **OpenAPI spec auto-generated** from NestJS decorators + Zod schemas

## Frontend architecture

### Astro pages → React islands

- **Astro pages** for content-heavy, mostly-static surfaces (event pages, blog posts, speaker profiles)
- **React islands** for interactive sub-trees (registration form, leaderboard, profile editing)
- **Static generation** for content that doesn't depend on the user (event lists, speaker directory)
- **ISR (incremental static regeneration)** for content that changes occasionally
- **SSR/client-side** only for personalized surfaces (profile, dashboard)

### Folder structure

```
apps/web/src/
├── pages/                    # Astro pages (file-based routing)
│   ├── index.astro
│   ├── events/
│   │   ├── index.astro
│   │   └── [slug].astro
│   ├── u/[username].astro
│   └── admin/                # admin pages (auth-protected)
├── components/
│   ├── ui/                   # shadcn/ui primitives
│   ├── domain/               # AI Qadam-specific components
│   │   ├── EventCard.tsx
│   │   ├── SpeakerCard.tsx
│   │   ├── LeaderboardRow.tsx
│   │   └── ...
│   └── layouts/              # page-level layouts
├── lib/
│   ├── api.ts                # typed API client
│   ├── auth.ts               # auth helpers
│   ├── i18n.ts               # i18next setup
│   └── utils.ts
├── locales/
│   ├── ru/
│   └── en/
└── styles/
    └── globals.css           # design tokens
```

### State management

- **Server state:** TanStack Query (formerly React Query)
- **Client state:** React state + `useReducer` for complex local state
- **No Redux, no Zustand**, no Jotai unless explicitly justified

## Bot architecture (Python)

```
apps/bot/
├── src/
│   ├── handlers/             # command and callback handlers
│   ├── services/             # API client, business logic
│   ├── middlewares/          # auth, tenant resolution, logging
│   ├── keyboards/            # inline keyboard builders
│   ├── states/               # FSM states (aiogram)
│   ├── locales/              # i18n
│   └── main.py
├── pyproject.toml
└── tests/
```

The bot is a **thin client** — it calls the NestJS API for all business logic. No domain logic lives in the bot.

**Scope per [ADR-0015](../../adr/0015-bot-scope-and-web-authoring-split.md):** bot is first-class for member-facing flows (browse, register, cancel, my-events, check-in, leaderboard view, basic profile, event Q&A) and organizer-runtime operations (live attendance monitoring, on-the-fly registration approval, push announcements to attendees, QR scan flows). Authoring (event creation, long-form description editing, agenda building, materials upload, settings) is **web-only** by design — Telegram inline UI does not suit long-form authoring.

## Local development

Day-to-day Phase 1 work happens **on localhost via Docker Compose**. The deployed target is `aiqadam-web` at `212.20.151.29` (see [ADR-0002](../../adr/0002-deployment-target.md) and §"Production deployment — active" below) — code lands there via Coolify deploy webhooks on merge to `main`, but the developer-feedback loop stays local. Local dev is faster (HMR, debugger), safer (no risk to deployed state), and offline-friendly.

### What runs in Docker

`infrastructure/docker-compose.yml` brings up the shared services:

- `postgres` — PostgreSQL 16 with the `pgvector` extension; one server hosting separate databases for `platform`, `directus`, `authentik`, `listmonk`
- `redis` — Redis 7
- `minio` — S3-compatible object storage with an init container that creates required buckets
- `authentik` — identity provider (server + worker)
- `directus` — CMS
- `listmonk` — email service (transactional + newsletter)

### What runs on the host

Apps run **on the host** during development for fast feedback (HMR, debugger attachment, native logs). They connect to the dockerised services on `localhost:<port>`:

- `apps/web` — Astro
- `apps/api` — NestJS
- `apps/bot` — Python aiogram
- `apps/workers` — BullMQ workers

A single `pnpm dev` at the repo root starts all apps in parallel via Turborepo.

### Local URLs

| Service        | URL                       |
|----------------|---------------------------|
| Web            | `http://localhost:4321`   |
| API            | `http://localhost:3000`   |
| Directus       | `http://localhost:8055`   |
| Authentik      | `http://localhost:9000`   |
| MinIO console  | `http://localhost:9001`   |
| Listmonk       | `http://localhost:9090`   |

### Tenant resolution in local dev

Subdomain-based tenant resolution doesn't work cleanly on `localhost` (no wildcard subdomains by default). Locally we use the `X-Tenant` header (default `uz`). When we need to test the subdomain path itself, we wire `*.aiqadam.localhost` via a hosts-file entry — documented in `docs/runbooks/local-dev-setup.md` (to be written in Week 1).

## Production deployment — active

Production-equivalent host is **`aiqadam-web`** at IPv4 `212.20.151.29`, hosted on hyperapp.cloud (Nutanix AHV virtualization). Specs: 8 vCPU / 31 GiB RAM / 2 TB SSD on a single LVM-backed `ext4` filesystem. Single-host topology — Coolify v4.0.0 orchestrates every stack. See [ADR-0002](../../adr/0002-deployment-target.md).

### CI/CD posture

- GitHub Actions runs lint (Biome — see [ADR-0014](../../adr/0014-lint-format-biome.md)), type-check, test, and build on every PR.
- Deploy to the production host happens via Coolify webhook on merge to `main` (wiring lands during Phase 1 Week 1 PR-CI).
- All stacks run as Docker Compose services under Coolify.
- TLS via Let's Encrypt HTTP-01 through Coolify's Traefik.
- Backups: restic to a free off-site target (Cloudflare R2 free tier or Backblaze B2 10 GB free) — to be wired during Phase 1 Week 2.

### Active topology

```
[212.20.151.29] aiqadam-web — 8 vCPU / 31 GiB / 2 TB SSD
└── Coolify v4.0.0
    ├── Project: infrastructure
    │   ├── postgres 16 + pgvector
    │   ├── redis 7
    │   ├── minio
    │   ├── authentik (server + worker)
    │   └── traefik (managed by Coolify)
    ├── Project: platform
    │   ├── api (NestJS + Drizzle)
    │   ├── web (Astro + React islands)
    │   ├── cms (Directus 11)
    │   ├── bot (Python aiogram)
    │   └── workers (BullMQ on Redis)
    └── Project: observability (added during Phase 1 weeks 8–10)
        ├── grafana
        ├── loki
        ├── prometheus
        └── uptime-kuma
```

Twenty CRM integration (Phase 1 week 9) deploys under its own Coolify project at that point.

### Hardening posture (live state, applied 2026-05-14)

Full procedure in [docs/04-development/infrastructure/runbooks/coolify-bootstrap.md](../infrastructure/runbooks/coolify-bootstrap.md):

- **UFW:** default deny incoming, allow 22/80/443.
- **iptables `DOCKER-USER` chain:** explicit `DROP` on Coolify admin ports (8000, 6001, 6002) bound to public NIC `ens3`, using `-m conntrack --ctorigdstport <port>` matchers because Docker port publishing bypasses UFW. See [ADR-0008](../../adr/0008-docker-port-publishing-policy.md).
- **iptables-persistent** saves rules across reboots (`/etc/iptables/rules.v4`).
- **fail2ban** with default `sshd` jail.
- **sshd hardening drop-in** at `/etc/ssh/sshd_config.d/90-aiqadam-hardening.conf`: `PasswordAuthentication no`, `PermitRootLogin prohibit-password` (key-only root SSH allowed for Coolify's localhost-server pattern; password root SSH always blocked), `KbdInteractiveAuthentication no`, `PubkeyAuthentication yes`.
- **`unattended-upgrades`** enabled for security patches.
- **NOPASSWD sudo** for the `aiqadam-admin` user — captured as a Phase 1 accepted risk; revisit when a second operator joins.

## Architecture Decision Records

Every significant decision is documented as an ADR in `docs/adr/`. Format:

```markdown
# ADR-0001: Use Directus for CMS

## Status
Accepted, 2026-05-14

## Context
Need multi-tenant CMS with admin UI...

## Decision
Use Directus 11...

## Consequences
- Pro: ...
- Con: ...
- Risk: ...
```

ADRs are append-only. Superseded ADRs are marked as such, not deleted.

## What we're NOT using and why

- **No GraphQL on our own API** — REST is sufficient, GraphQL adds complexity. (Directus GraphQL is fine, that's internal.)
- **No microservices in Phase 1** — modular monolith is easier to operate solo.
- **No Kubernetes** — Coolify covers our needs for one machine.
- **No SSR frameworks like Next.js** — Astro is better for content-heavy sites with islands of interactivity.
- **No Mongo/NoSQL** — Postgres covers all our needs including JSON and vectors.
- **No serverless** — we have a server, this isn't free, but it's predictable.
