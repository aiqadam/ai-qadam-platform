# ADR-0007: Coolify as the orchestration layer

## Status
Superseded, 2026-07-23

**Superseded by:** migration to plain Docker Compose + Nginx + GitHub Actions SSH deploy
(`ci-cd.yml` → `deploy.sh` forced-command pattern). Coolify removed from CI/CD and
infrastructure on 2026-07-23 after repeated CI interference and agent session drift.
The hyperapp.cloud VM (`212.20.151.29`) and its Coolify install remain on the host
but are no longer part of the active deployment pipeline.

Original status: Accepted, 2026-05-14

## Context
Per [ADR-0002](0002-deployment-target.md) we run a single host. We need to orchestrate ~10 Docker stacks on it: Postgres, Redis, MinIO, Authentik, NestJS API, Astro web, Directus CMS, BullMQ workers, Telegram bot, observability stack (later), plus Twenty CRM in Phase 1 week 9.

Operational requirements:

- One pane of glass for deploys, env vars, container logs
- Automatic HTTPS via Let's Encrypt
- GitHub deploy webhooks
- Backup integration
- Single-operator-friendly UX
- Self-hosted, open-source per [PROJECT.md](../01-business/project.md) constraints

Considered alternatives:

- **Plain `docker compose` + manual Traefik + manual certbot** — fully DIY, max flexibility, max operational burden
- **Portainer Community Edition** — UI for Docker management, but weaker on deploys + no built-in cert management
- **Coolify v4** — Docker-based PaaS, OSS (Apache 2.0), batteries-included
- **Dokku** — Heroku-style git-push deploys, simpler but less batteries
- **k3s / k0s** — single-node Kubernetes, more powerful but operationally heavy for a solo project
- **Full Kubernetes** — overkill for one VM

## Decision
**Coolify v4** as the orchestration layer.

## Rationale

- **Single pane of glass.** Coolify combines deploy management, env-var management, container logs, integrated Traefik, automatic Let's Encrypt, GitHub webhook deploys, basic monitoring, and one-click rollback. We'd otherwise stitch this together from 5+ tools.
- **Open source, self-hosted, MIT-license-compatible.** Aligns with [PROJECT.md §Constraints](../01-business/project.md).
- **Single-VM happy path.** Most Coolify users run a single host; the docs and community examples target this exact shape. Multi-host exists but is more advanced — fits our deferred scaling story.
- **Active development.** v4 ships regular releases through 2025–2026; community is active on GitHub and Discord.
- **Docker Compose as the primitive.** Each stack we deploy is a `docker-compose.yml` Coolify manages. We're not locked into a Coolify-specific format — if Coolify ever stagnates, the underlying Compose files remain portable.

## Consequences

- ✅ Most operational concerns (deploys, certs, logs, basic backups) are pre-solved.
- ✅ Onboarding a new stack = drop a Compose file in Coolify's UI, set env vars, hit Deploy.
- ✅ Let's Encrypt HTTP-01 happens automatically once a hostname is configured.
- ⚠️ **Docker port publishing bypasses UFW.** Coolify doesn't fix this; we layered our own defense per [ADR-0008](0008-docker-port-publishing-policy.md).
- ⚠️ **Coolify v4 evolves between minor versions.** Upgrades require care — read changelogs before pulling the latest.
- ⚠️ **`/data/coolify/source/.env` holds Coolify's encryption keys** for stored secrets. Backup rigorously (off-site, password manager) — losing it means losing access to all Coolify-stored env vars and deploy keys.
- ⚠️ **Coolify is run by a small team.** If it stagnated or pivoted, we'd migrate. The migration cost is bounded — the underlying Compose files transfer to plain `docker compose` or another orchestrator.
- 📝 **First-run admin port (8000) is initially world-reachable** if you don't lock down immediately — caught by us on 2026-05-14, fixed structurally per [ADR-0008](0008-docker-port-publishing-policy.md). Bootstrap procedure documented in [docs/04-development/infrastructure/runbooks/coolify-bootstrap.md](../04-development/infrastructure/runbooks/coolify-bootstrap.md).

## References
- [Coolify documentation](https://coolify.io/docs)
- [ADR-0002](0002-deployment-target.md) — single-host deployment target
- [ADR-0008](0008-docker-port-publishing-policy.md) — Docker port publishing policy
- [docs/04-development/infrastructure/runbooks/coolify-bootstrap.md](../04-development/infrastructure/runbooks/coolify-bootstrap.md) — bootstrap procedure
