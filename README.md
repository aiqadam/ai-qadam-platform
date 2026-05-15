# AI Qadam

Multi-tenant community platform for AI engineers across Central Asia.

**Status:** Phase 1 (infrastructure foundation complete; product code starting now).

## What this is

AI Qadam serves three jobs for a regional community of AI engineers, ML practitioners, and tech founders across Uzbekistan, Kazakhstan, Tajikistan (and growing):

1. **Event discovery and registration** — meetups, workshops, hackathons, online events
2. **Community identity** — public profiles, speakers, gamification (points, badges, streaks, leaderboards)
3. **Content and operations** — multi-tenant CMS per country, partner / sponsor management

Self-hosted, open-source-first, free for the community. Built primarily by one person ([@viktordrukker](https://github.com/viktordrukker)) with Claude Code as implementation partner.

See [`.claude/PROJECT.md`](.claude/PROJECT.md) for full product context.

## Operating context

This repository's operating context — for both humans and AI assistants — lives in [`.claude/`](.claude/). **Read these in this order at the start of any new working session:**

1. [`CLAUDE.md`](.claude/CLAUDE.md) — operating rules (always-on for Claude Code)
2. [`PROJECT.md`](.claude/PROJECT.md) — business context, who-uses-what, tone
3. [`ARCHITECTURE.md`](.claude/ARCHITECTURE.md) — technical structure, module boundaries
4. [`STANDARDS.md`](.claude/STANDARDS.md) — code standards, testing, formatting
5. [`WORKFLOW.md`](.claude/WORKFLOW.md) — git workflow, PR process, releases
6. [`SECURITY.md`](.claude/SECURITY.md) — security baseline (auth, validation, backups)
7. [`AI_COLLAB.md`](.claude/AI_COLLAB.md) — how Viktor and Claude Code work together
8. [`GLOSSARY.md`](.claude/GLOSSARY.md) — domain terms (User, Event, Tenant, etc.)

Architecture decisions and operational procedures:

- **[`docs/adr/`](docs/adr/)** — Architecture Decision Records. Read [`0001`](docs/adr/0001-docs-live-in-claude-folder.md) for the docs-folder rationale, [`0002`](docs/adr/0002-deployment-target.md) for the deployment topology, and the rest in number order.
- **[`docs/runbooks/`](docs/runbooks/)** — operational procedures (Coolify bootstrap, restic backups, Docker iptables policy, operator email Send-as).

## Tech stack (canonical)

See [`.claude/ARCHITECTURE.md`](.claude/ARCHITECTURE.md) for full detail.

| Layer | Choice |
|---|---|
| Frontend | Astro 5 + React 19 islands + Tailwind 4 + shadcn/ui |
| Backend API | NestJS 11 + Drizzle 0.x + Zod ([ADR-0013](docs/adr/0013-orm-drizzle-over-prisma.md)) |
| CMS | Directus 11 |
| Bot | Python 3.12 + aiogram 3 |
| Background jobs | BullMQ on Redis |
| Database | PostgreSQL 16 + pgvector |
| Cache + queues | Redis 7 |
| Object storage | MinIO (S3-compatible) |
| Identity | Authentik (OIDC) |
| Web auth flow | HttpOnly refresh + in-memory access token ([ADR-0016](docs/adr/0016-web-auth-flow.md)) |
| Lint + format | Biome ([ADR-0014](docs/adr/0014-lint-format-biome.md)) |
| Orchestration | Coolify v4 ([ADR-0007](docs/adr/0007-coolify-orchestration.md)) |
| Email | Cloudflare Routing inbound + Resend outbound ([ADR-0009](docs/adr/0009-email-stack-saas-exception.md)) |
| Off-site backups | restic → Cloudflare R2 ([ADR-0017](docs/adr/0017-backup-architecture.md)) |
| Monorepo | pnpm workspaces + Turborepo |

## Repository structure

```
.claude/                Operating docs (read first)
apps/                   Application code: web, api, bot, workers
packages/               Shared packages: shared-types, ui, biome-config, tsconfig
infrastructure/         docker-compose for local dev, ops scripts
docs/
  ├── adr/              Architecture Decision Records
  ├── runbooks/         Operational procedures
  └── api/              Generated OpenAPI docs (when API exists)
design-system/          Canonical static HTML/CSS visual reference (tokens + components)
```

## Local development

`apps/` and `packages/` are scaffolded but empty — the first product PRs (Phase 1 Week 1) populate them. The intended local-dev pattern:

- `infrastructure/docker-compose.yml` brings up state-bearing shared services on `localhost`
- Apps run directly on the host for fast feedback (HMR, native debuggers)
- A single `pnpm dev` at the repo root starts everything via Turborepo (once apps land)

### Bring up shared services

Currently included: **PostgreSQL 16 + pgvector**, **Redis 7**, **MinIO**. Authentik, Directus, Listmonk join as those features land.

```bash
cd infrastructure
cp .env.example .env       # edit if you have local services on the same ports
docker compose up -d
docker compose ps
```

Default host ports: Postgres `5432`, Redis `6379`, MinIO API `9000`, MinIO console `http://localhost:9001`. Override any of these via `*_HOST_PORT` env vars in your `.env` if you have a conflicting local service.

The Postgres container creates four databases on first boot (`platform`, `directus`, `authentik`, `listmonk`) per [ARCHITECTURE.md §"Data ownership"](.claude/ARCHITECTURE.md), and installs `pgvector` on `platform`.

```bash
docker compose down        # stop, keep data volumes
docker compose down -v     # stop + delete all data (destructive!)
```

## Production deployment

Active on a single host at `aiqadam-web` (hyperapp.cloud, Frankfurt, 8 vCPU / 31 GiB / 2 TB SSD). Coolify v4.0.0 orchestrates every stack. See:

- [ADR-0002](docs/adr/0002-deployment-target.md) — host choice and topology
- [docs/runbooks/coolify-bootstrap.md](docs/runbooks/coolify-bootstrap.md) — exact bootstrap procedure used
- [docs/runbooks/docker-iptables-and-ufw.md](docs/runbooks/docker-iptables-and-ufw.md) — the Docker / UFW lockdown lessons learned
- [docs/runbooks/restic-backups.md](docs/runbooks/restic-backups.md) — daily off-site backups to Cloudflare R2

Coolify admin: `https://coolify.aiqadam.org`.

## Domain

- Apex: `aiqadam.org` (Cloudflare DNS, Cloudflare Email Routing for inbound, Resend for outbound)
- Wildcard `*.aiqadam.org` → platform host. Tenant subdomains: `uz.aiqadam.org`, `kz.aiqadam.org`, `tj.aiqadam.org`.

## Contributing

Private repository in Phase 1. Not yet open to external contributions. Internal contributors follow [`.claude/WORKFLOW.md`](.claude/WORKFLOW.md) — short branches, conventional commits, ≤400-line PRs, every change reviewed.

## License

None yet. License decision deferred until Phase 1 closes — likely AGPLv3 or Apache 2.0 to match self-hosted-OSS spirit.
