# Layer 4 - Development

How we build and run the platform. Code standards and workflow, architecture, and per-discipline guides: backend, frontend, design-system, testing, infrastructure, and security.

## Documents

- [STANDARDS.md — Code Standards](standards.md)
- [WORKFLOW.md — How we work](workflow.md)

## Architecture

- [ARCHITECTURE.md — AI Qadam Platform](architecture/architecture.md)
- [AI Qadam — Authentication Architecture](architecture/auth-architecture.md)
- [Block catalogue (L3)](architecture/blocks.md)
- [AI Qadam — interaction & platform architecture](architecture/interaction-architecture.md)
- [Migration to Directus-centric architecture](architecture/migration-to-directus-centric.md)
- [Telegram outbox → notifier delivery contract](architecture/telegram-outbox-delivery-contract.md)
- [Cabinet ↔ customer aggregate wiring map](architecture/wiring-map.md)

## Backend

- [Telegram bot + outbound sender](backend/integrations/telegram-bot.md)

## Frontend

- [Web migration plan — `apps/web-next/` build-aside + cutover](frontend/web-migration-plan.md)
- [Migration status — live cutover tracker](frontend/migration-status.md)
- [Kickoff prompt — `apps/web-next/` greenfield build](frontend/web-next-kickoff.md)
- [Web-next workplan — from current state to cutover](frontend/web-next-workplan.md)

## Design system

- [AI Qadam — UX research, design rulesets, and content guidelines](design-system/ux-and-content-guidelines.md)

## Infrastructure

- [Runbook: Auth-system day-2 operations](infrastructure/runbooks/auth.md)
- [Runbook: Bootstrapping Authentik locally + creating the OIDC application](infrastructure/runbooks/authentik-local-bootstrap.md)
- [Authentik ROPC (Resource Owner Password Credentials)](infrastructure/runbooks/authentik-ropc.md)
- [Runbook: First production deploy via Coolify](infrastructure/runbooks/coolify-app-stacks.md)
- [Runbook: Bootstrapping Coolify on a fresh VM](infrastructure/runbooks/coolify-bootstrap.md)
- [Runbook — migrate DMS config from docker volume to host bind-mount](infrastructure/runbooks/dms-config-bind-mount-migration.md)
- [Runbook: Docker iptables, UFW, and the DOCKER-USER chain](infrastructure/runbooks/docker-iptables-and-ufw.md)
- [Internal cron scheduler — runbook](infrastructure/runbooks/internal-cron.md)
- [Runbook: Observability v0 — Loki + Promtail + Gatus](infrastructure/runbooks/observability.md)
- [Runbook: restic backups to Cloudflare R2](infrastructure/runbooks/restic-backups.md)
- [Runbook: snapshot + restore (F-OPS1)](infrastructure/runbooks/snapshot-restore.md)
- [Telegram token rotation runbook](infrastructure/runbooks/telegram-token-rotation.md)
- [Design spec — one-command token-rotation tool](infrastructure/token-rotation-tool-design.md)

## Security

- [Runbook: Audit-log inspection + retention compliance + member access-log queries](security/runbooks/audit.md)
- [Runbook: Break-glass admin path](security/runbooks/break-glass.md)
- [Runbook: RBAC drift investigation + remediation](security/runbooks/rbac-drift.md)
- [Pending secret rotations](security/runbooks/secret-rotation-pending.md)
- [Runbook: Security-incident triage](security/runbooks/security-incident.md)
- [Runbook: Supply-chain CI gates + CVE triage](security/runbooks/supply-chain.md)
- [SECURITY.md — Security Baseline](security/security.md)

## Related decisions (ADRs)

ADRs live in the chronological log at [`docs/adr/`](../adr/). Those most relevant here:

- [0002-deployment-target](../adr/0002-deployment-target.md) - Deployment target
- [0007-coolify-orchestration](../adr/0007-coolify-orchestration.md) - Coolify orchestration
- [0013-orm-drizzle-over-prisma](../adr/0013-orm-drizzle-over-prisma.md) - ORM: Drizzle over Prisma
- [0014-lint-format-biome](../adr/0014-lint-format-biome.md) - Lint/format via Biome
- [0016-web-auth-flow](../adr/0016-web-auth-flow.md) - Web auth flow
- [0017-backup-architecture](../adr/0017-backup-architecture.md) - Backup architecture
- [0021-rbac-manifest](../adr/0021-rbac-manifest.md) - RBAC manifest
- [0037-three-tier-architecture](../adr/0037-three-tier-architecture.md) - Three-tier architecture
- [0038-web-4-layer-architecture](../adr/0038-web-4-layer-architecture.md) - Web 4-layer block composition
