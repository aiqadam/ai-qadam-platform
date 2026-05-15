# ADR-0002: Deployment target — single host on hyperapp.cloud

## Status
Accepted, 2026-05-14

## Context
The original `ARCHITECTURE.md` draft labelled production deployment as "deferred — Viktor will pick a target VPS once the local product has enough surface to deploy." During the first infrastructure session (2026-05-14) Viktor provisioned and hardened a remote VM, and the deferral became inaccurate — a target host now exists.

Open sub-decisions resolved by this ADR:

1. **Single-host vs multi-host topology** for Phase 1.
2. **Hosting provider** for Phase 1.
3. **Sizing** for Phase 1.
4. **Initial role** of the host (web tier only vs full platform).

## Decision

**Production-equivalent host:** `aiqadam-web` at IPv4 `212.20.151.29`, hosted on hyperapp.cloud, virtualized on Nutanix AHV.

**Specs:**
- 8 vCPU
- 31 GiB RAM (4 GiB swap)
- 2 TB SSD on a single LVM-backed `ext4` filesystem
- Single public NIC `ens3`
- Ubuntu 24.04.2 LTS, kernel 6.8

**Topology:** single-host. Coolify v4.0.0 orchestrates every stack — Postgres, Redis, MinIO, Authentik, NestJS API, Astro web, Directus CMS, BullMQ workers, Telegram bot, observability (when added). The "web tier" naming in the hostname is historical; the host runs the full platform, not just the web app. The hostname will be renamed to `aiqadam-prod` (or similar) at a later date.

**Multi-host split is deferred** to Phase 2 / Phase 3 when traffic, compliance, or operator load justifies. Anticipated triggers:

- Postgres replication or read-replicas for performance.
- Mail server isolation onto a separate clean-IP host (if/when self-hosted email is reconsidered — see [ADR-0009](0009-email-stack-saas-exception.md)).
- Observability stack on its own box once metrics or log volume warrants.

## Consequences

- ✅ One Coolify, one UFW, one fail2ban, one TLS-cert pool, one restic schedule, one Docker daemon. Operationally minimal for a solo developer with AI assistance.
- ✅ All inter-service traffic stays on Docker bridge networks — no cross-VM TLS plumbing, no private-network bring-up.
- ✅ Sizing has comfortable headroom: Phase 1 trimmed stack ~16 GiB RAM, host has 31 GiB; disk has 1.9 TB free after baseline.
- ⚠️ **Single point of failure.** Phase 1 RTO is 4 hours per [SECURITY.md §"Recovery time objectives"](../../.claude/SECURITY.md), achievable via restic restore on a fresh box if this one dies — but only once restic is configured (currently a deferred todo).
- ⚠️ **PTR is upstream-controlled.** hyperapp.cloud's reverse DNS for this IP points at Cogent Communications infrastructure (`so1-2-0-0.core02.fra03.atlas.cogentco.com`). No operator control. This forces email out of self-hosting; resolved in [ADR-0009](0009-email-stack-saas-exception.md).
- ⚠️ **Region is Frankfurt-area** (per Cogent PTR). Latency to Central Asian users adds roughly 80–120 ms vs a regional host. Acceptable for Phase 1 community traffic; revisit if user feedback complains or analytics show LCP regressions.
- ⚠️ **Docker port-publishing bypasses UFW** by default. We learned this the hard way during Coolify install (admin port was world-reachable for ~4 minutes before lockdown). Resolved structurally by [ADR-0008](0008-docker-port-publishing-policy.md).
- 📝 Hostname `aiqadam-web` is misleading post-decision. Renaming via `hostnamectl set-hostname aiqadam-prod` is one command but not yet applied — minor cosmetic debt.

## Supersedes
The "Production deployment — deferred" section in `ARCHITECTURE.md`. That section is rewritten as "Production deployment — active" and points here.

## References
- [Runbook: Coolify bootstrap](../runbooks/coolify-bootstrap.md) — the actual setup steps performed on this host.
- [ADR-0007](0007-coolify-orchestration.md) — orchestration choice.
- [ADR-0008](0008-docker-port-publishing-policy.md) — Docker port-publishing policy.
- [ADR-0009](0009-email-stack-saas-exception.md) — email stack (rules out self-hosted on this PTR).
