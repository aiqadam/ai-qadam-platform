# AI Qadam

Multi-tenant community platform for AI engineers across Central Asia.

**Status:** Sprints 0–5 shipped. Auth, events, registrations, gamification, RBAC, Telegram bot, referrals, lead nurture, and member matching are live on `aiqadam.org`. Sprint 6 (content + community-to-community layer) is next.

## What this is

AI Qadam serves three jobs for a regional community of AI engineers, ML practitioners, and tech founders across Uzbekistan, Kazakhstan, Tajikistan (and growing):

1. **Event discovery and registration** — meetups, workshops, hackathons, online events
2. **Community identity** — public profiles, speakers, gamification (points, badges, streaks, leaderboards)
3. **Content and operations** — multi-tenant CMS per country, partner / sponsor management

See [`docs/01-business/project.md`](docs/01-business/project.md) for full product context.

## Quick start from tvolodi as of 2026-07-21

1. Clone the repo
1. Start Docker Desktop (or Docker Engine on Linux)
1. Say your agents to read this file and set up the development environment for you
1. Select Orchestrator agent and ask him to implement / resolve issue from local requirements / issue registry, or give him an URL to an issue in GitHub repo.
1. Check Orchestrator has finished his work: update local repo (pull), new branch, develop, commit, push, and create a PR for you.
1. On PR acceptance, the development has to go to QA instance: qa.aiqadam.org.
1. After QA approval, the development has to be deployed to production: aiqadam.org. Use GitHub Actions workflow for deployment. 

Note: how to manually develop this project I don't know.

## Operating context

**AI agent rules** live in two places:

- **[`AGENTS.md`](AGENTS.md)** — canonical rules for all AI tools; auto-loaded by Claude Code and OpenAI Codex. All other tool configs (`.cursorrules`, `.windsurfrules`, `.clinerules`, `.github/copilot-instructions.md`) are generated from it — run `pnpm ai:sync` after editing.
- **[`.claude/CLAUDE.md`](.claude/CLAUDE.md)** — Claude Code–specific additions only (session-start file list, shell restrictions). Hand-maintained; not generated.

**Read these in order at the start of any new working session:**

1. [`AGENTS.md`](AGENTS.md) — operating rules for all AI tools
2. [`PROJECT.md`](docs/01-business/project.md) — business context, who-uses-what, tone
3. [`ARCHITECTURE.md`](docs/04-development/architecture/architecture.md) — technical structure, module boundaries
4. [`STANDARDS.md`](docs/04-development/standards.md) — code standards, testing, formatting
5. [`WORKFLOW.md`](docs/04-development/workflow.md) — git workflow, PR process, releases
6. [`SECURITY.md`](docs/04-development/security/security.md) — security baseline (auth, validation, backups)
7. [`AI_COLLAB.md`](docs/05-other/ai-collab.md) — how Viktor and Claude Code work together
8. [`GLOSSARY.md`](docs/01-business/glossary.md) — domain terms (User, Event, Tenant, etc.)

Architecture decisions and operational procedures:

- **[`docs/adr/`](docs/adr/)** — Architecture Decision Records (ADR-0001 through ADR-0039). Read [`0002`](docs/adr/0002-deployment-target.md) for deployment topology, [`0016`](docs/adr/0016-web-auth-flow.md) for auth flow, [`0037`](docs/adr/0037-three-tier-architecture.md) for the current three-tier architecture reframe.
- **[`docs/04-development/infrastructure/runbooks/`](docs/04-development/infrastructure/runbooks/)** — operational procedures (Coolify bootstrap, restic backups, Docker iptables policy, Authentik OIDC bootstrap).
- **[`.copilot/`](.copilot/)** — agentic workflow system: Orchestrator + specialized subagents (BusinessAnalyst, UATRunner, CodeDeveloper, etc.), workflow definitions, and task artifacts.

## Tech stack (canonical)

See [`docs/04-development/architecture/architecture.md`](docs/04-development/architecture/architecture.md) for full detail.

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
| Email | Resend outbound + Mailpit for local dev |
| Off-site backups | restic → Cloudflare R2 ([ADR-0017](docs/adr/0017-backup-architecture.md)) |
| Monorepo | pnpm workspaces + Turborepo |

## Repository structure

```
AGENTS.md               Master AI agent rules (read by all AI tools)
.claude/                Claude Code–specific additions to AGENTS.md
.copilot/               Agentic workflow system (agents/, workflows/, tasks/, schemas/)
apps/
  ├── api/              NestJS 11 backend (20+ modules: auth, events, registrations, …)
  ├── web/              Astro 5 frontend
  ├── web-next/         Astro 5 rewrite in progress (ADR-0038)
  ├── bot/              Python aiogram 3 Telegram bot
  ├── workers/          BullMQ background job processors
  ├── e2e/              Playwright smoke + UAT test suites
  └── storybook/        Component stories
packages/
  ├── shared-types/     Zod schemas + TS types (source of truth)
  ├── ui/               Shared React components
  ├── biome-config/     Shared Biome lint rules
  └── tsconfig/         Shared TypeScript configs
infrastructure/         docker-compose for local dev + ops scripts
scripts/                Developer tooling (uat-env-setup.sh, sync-ai-rules.sh, gen/, …)
design-system/          Canonical static HTML/CSS visual reference (tokens + components)
docs/
  ├── 01-business/      Vision, strategy, glossary, roadmap, policies
  ├── 02-business-processes/  Operator runbooks + UAT scripts (BP-UAT-000 … 018)
  ├── 03-requirements/  Feature surfaces, plans, parity matrix
  ├── 04-development/   Standards, workflow, architecture, security, testing
  ├── 05-other/         Handover notes, reviews, AI collaboration
  └── adr/              Architecture Decision Records (ADR-0001 … 0039)
```

## Local development

Shared infrastructure services run in Docker Compose; the application apps run
on the host via `pnpm dev` for fast feedback and hot-reload.

### 1. Start shared services

```bash
cd infrastructure
cp .env.example .env
docker compose up -d
docker compose ps    # all services should show "healthy" within ~90s
```

Services started: **PostgreSQL 16 + pgvector**, **Redis 7**, **MinIO**,
**Authentik** (OIDC identity provider), **Directus 11** (CMS),
**Mailpit** (local SMTP catcher), **Twenty** (CRM).

Default host ports:

| Service | Port | URL |
|---|---|---|
| Postgres | 5432 | — |
| Redis | 6379 | — |
| MinIO API | 9100 | — |
| MinIO console | 9001 | http://localhost:9001 |
| Authentik | 9000 | http://localhost:9000/if/admin/ |
| Directus | 8200 | http://localhost:8200 |
| Mailpit web UI | 8025 | http://localhost:8025 |
| Mailpit SMTP | 1025 | — |
| Twenty CRM | 3010 | http://localhost:3010 |

Override any port via `*_HOST_PORT` vars in `infrastructure/.env`.

Postgres creates four databases on first boot: `platform`, `directus`,
`authentik`, `listmonk`. `pgvector` is installed on `platform`.

```bash
docker compose down      # stop, keep data volumes
docker compose down -v   # stop + delete all data (destructive!)
```

### 2. Configure env files and bootstrap Authentik

Required once per machine (generates secrets, wires OIDC, writes all `.env` files):

```bash
bash scripts/uat-env-setup.sh
```

To regenerate secrets from scratch: `FORCE_REGEN=1 bash scripts/uat-env-setup.sh`.

For manual Authentik OIDC setup, see
[`docs/04-development/infrastructure/runbooks/authentik-local-bootstrap.md`](docs/04-development/infrastructure/runbooks/authentik-local-bootstrap.md).

### 3. Start the application

```bash
pnpm install    # once, or after any dependency change
pnpm dev        # Turborepo starts api + web in parallel with hot-reload
```

API: `http://localhost:3000` · Web: `http://localhost:4321`

## Business process tests (UAT)

UAT scripts live in [`docs/02-business-processes/uat/`](docs/02-business-processes/uat/)
(BP-UAT-000 through BP-UAT-018). They are executed by two AI agents —
**BusinessAnalyst** (validates the script, triages results) and **UATRunner**
(executes in Playwright, takes a screenshot per step). The workflow is fully
autonomous once the environment is ready.

### 1. Bootstrap the UAT environment (one-time per machine)

Same as local dev setup above — `uat-env-setup.sh` handles everything including
Mailpit, Directus, and the Authentik OIDC application.

### 2. Start the application stack and seed fixtures

```bash
pnpm dev         # api + web running
pnpm uat:seed    # seed UAT test fixtures
```

### 3. Run a UAT script via agents

Always start with the environment health check:

```
Run BP-UAT-000 through the uat-verification workflow.
```

Then run any business process script by number:

```
Run BP-UAT-013 through the uat-verification workflow.
```

The Orchestrator agent handles everything autonomously:

| Step | Agent | What happens |
|---|---|---|
| 1 | BusinessAnalyst | Validates the UAT script against the 7-check contract |
| 2 | Orchestrator | Pre-flight: Docker stack + app reachability + seeds fixtures |
| 3 | UATRunner | Writes and runs a Playwright spec, screenshots every step |
| 4 | BusinessAnalyst | Classifies failures, registers issues in `.copilot/issues/` |
| 5 | Orchestrator | Commits artifacts, pushes, creates a PR |

### Recommended run order

BP-UAT-000 → 009 → 013 → 010 → 014 → 015 → 011 → 012 → 016.
Cron scripts (001, 007, 008, 017, 018) are independent.
Full registry with status and open issues: [`docs/02-business-processes/uat/registry.md`](docs/02-business-processes/uat/registry.md).

## Production deployment

Active on a single host at `aiqadam-web` (hyperapp.cloud, Frankfurt, 8 vCPU / 31 GiB / 2 TB SSD). Coolify v4 orchestrates every stack. See:

- [ADR-0002](docs/adr/0002-deployment-target.md) — host choice and topology
- [docs/04-development/infrastructure/runbooks/coolify-bootstrap.md](docs/04-development/infrastructure/runbooks/coolify-bootstrap.md) — exact bootstrap procedure used
- [docs/04-development/infrastructure/runbooks/docker-iptables-and-ufw.md](docs/04-development/infrastructure/runbooks/docker-iptables-and-ufw.md) — Docker / UFW lockdown lessons learned
- [docs/04-development/infrastructure/runbooks/restic-backups.md](docs/04-development/infrastructure/runbooks/restic-backups.md) — daily off-site backups to Cloudflare R2

Coolify admin: `https://coolify.aiqadam.org`.

## Domain

- Apex: `aiqadam.org` (Cloudflare DNS, Resend for outbound email)
- Wildcard `*.aiqadam.org` → platform host. Tenant subdomains: `uz.aiqadam.org`, `kz.aiqadam.org`, `tj.aiqadam.org`.

## Contributing

Public repository. Internal contributors follow [`docs/04-development/workflow.md`](docs/04-development/workflow.md) — short branches, conventional commits, ≤400-line PRs, every change reviewed.

## License

None yet. License decision deferred until Phase 1 closes — likely AGPLv3 or Apache 2.0.
