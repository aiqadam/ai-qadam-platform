# Architecture Decision Records

This is a single chronological, append-only log. Records are **immutable**: once
accepted, an ADR is never edited to change its decision — it is *superseded* by a
newer ADR, which links back to it. See [ADR-0039](0039-five-layer-doc-architecture.md)
for why ADRs stay here rather than being distributed across the doc layers.

## Status legend

- **Accepted** — decided and in force.
- **Proposed** — drafted, not yet ratified.
- **Deferred** — deliberately parked; see the linked business-process gap.
- **Superseded** — replaced by a later ADR (linked).

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-docs-live-in-claude-folder.md) | Operating documentation lives in `.claude/` | Superseded by [0039](0039-five-layer-doc-architecture.md) |
| [0002](0002-deployment-target.md) | Deployment target — single host on hyperapp.cloud | Accepted |
| [0007](0007-coolify-orchestration.md) | Coolify as the orchestration layer | Superseded 2026-07-23 |
| [0008](0008-docker-port-publishing-policy.md) | Docker port publishing must bind 127.0.0.1 | Accepted |
| [0009](0009-email-stack-saas-exception.md) | Email stack SaaS exception (Cloudflare + Resend) | Accepted |
| [0010](0010-inbound-email-cloudflare-workers.md) | Inbound email via Cloudflare Email Workers | Accepted (design) |
| [0012](0012-operator-send-as-automation.md) | Operator Send-as automation (Gmail API + Worker) | Accepted (design) |
| [0013](0013-orm-drizzle-over-prisma.md) | ORM choice — Drizzle over Prisma | Accepted |
| [0014](0014-lint-format-biome.md) | Lint and format via Biome | Accepted |
| [0015](0015-bot-scope-and-web-authoring-split.md) | Bot scope — member flows; web for authoring | Accepted |
| [0016](0016-web-auth-flow.md) | Web auth flow — HttpOnly refresh + in-memory access token | Accepted |
| [0017](0017-backup-architecture.md) | Backup architecture — restic to Cloudflare R2 | Accepted |
| [0021](0021-rbac-manifest.md) | RBAC manifest — single source of truth for roles | Accepted |
| [0022](0022-country-lead-compensation.md) | Country-lead compensation model | Deferred |
| [0023](0023-sponsor-invoicing.md) | Sponsor invoicing — billing, currency, tax | Accepted (Phase 1) |
| [0024](0024-future-revenue-phasing.md) | Future revenue phasing | Accepted |
| [0025](0025-brand-asset-tooling.md) | Brand-asset tooling — where assets live | Accepted |
| [0026](0026-telegram-channel.md) | Telegram channel (presence beyond the group) | Accepted |
| [0027](0027-x-twitter-presence.md) | X (Twitter) presence — scope | Accepted |
| [0028](0028-first-paid-spend.md) | First paid spend — when, on what | Deferred |
| [0029](0029-russian-voice-owner.md) | Russian-language voice + translation owner | Accepted |
| [0030](0030-photo-consent.md) | Photo consent at events | Accepted |
| [0031](0031-single-origin-cabinet-routing.md) | Single-origin role-routed cabinets | Accepted |
| [0032](0032-operator-tools-must-sso-or-embed.md) | Operator tools must SSO via Authentik or embed | Accepted |
| [0033](0033-community-member-graph.md) | Community member graph on Directus | Accepted |
| [0034](0034-telegram-bot-and-sender.md) | Telegram bot + outbound sender — separate repo | Proposed |
| [0035](0035-admin-cabinet-and-invite-link-onboarding.md) | Admin UI + invite-link operator onboarding | Accepted |
| [0036](0036-sponsor-digest-rollups.md) | Sponsor quarterly-digest rollups query Directus | Proposed |
| [0037](0037-three-tier-architecture.md) | Three-tier architecture (eng / ops / customer) | Proposed |
| [0038](0038-web-4-layer-architecture.md) | Web architecture — 4-layer block composition (LOCKED) | Proposed |
| [0039](0039-five-layer-doc-architecture.md) | Five-layer documentation architecture | Accepted |

## Reserved / unused numbers

The sequence has gaps. They are recorded here so a reader can tell a missing number
from a lost record — **none of these were ever written**; they were skipped during
early drafting and are intentionally left free rather than renumbered (renumbering
would break the immutability guarantee).

- **0003–0006** — never written.
- **0011** — never written.
- **0018–0020** — never written.

Do not reuse these numbers for new decisions; always take the next number above the
current maximum.
