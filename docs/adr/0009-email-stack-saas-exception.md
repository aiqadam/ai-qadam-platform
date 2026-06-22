# ADR-0009: Email stack SaaS exception (Cloudflare DNS + Email Routing + Resend)

## Status
Accepted, 2026-05-15

## Context
[PROJECT.md §Constraints](../01-business/project.md) states: *"Self-hosted, open-source only. No proprietary SaaS in critical path."*

For email transport, a strict reading of this constraint means running our own mail server (Postfix + Dovecot, or `docker-mailserver` / Mailcow) on the platform host or a dedicated mail box.

During Phase 1 setup, three blockers to self-hosted email surfaced:

1. **PTR (reverse DNS) is upstream-controlled.** The platform host (`212.20.151.29`) has PTR `so1-2-0-0.core02.fra03.atlas.cogentco.com`, owned by Cogent Communications upstream of hyperapp.cloud. No operator control. FCrDNS (forward-confirmed reverse DNS) check fails for any mail server on this IP — Gmail, Microsoft, Yandex, ProtonMail all reject or aggressively spam-filter mail without operator-controlled PTR matching the HELO.
2. **Operational maintenance burden** of running a real mail server (Postfix + Dovecot + spam filtering + DKIM rotation + ongoing IP-reputation monitoring) is disproportionate for one operator and one mailbox.
3. **Multi-operator branded mailboxes** (board members, country leads, volunteers each having their own `name@aiqadam.org`) requires either Zoho-style hosted mailbox (also SaaS, web-only on free) or a much more complex self-hosted setup with multiple users.

Considered approaches in detail:

| Approach | Cost | Self-hosted purity | Blocker |
|---|---|---|---|
| Self-host on `aiqadam-web` | $0 | full | PTR — can't fix |
| Move all of platform to Hetzner | ~€60/yr extra | full | Operationally expensive (re-do all setup) |
| Pair: `aiqadam-web` for platform + tiny Hetzner for mail | ~€60/yr | full | Two VMs to operate |
| Migadu Mini centralized | $19/yr | SaaS | Centralized, IMAP, normal UX, paid |
| **Cloudflare Routing + Resend free + Gmail Send-as** | **$0** | **SaaS x2** | **Free, multi-operator viable** |

## Decision
Accept a **bounded SaaS exception** for email transport and addressing. The stack:

- **Cloudflare DNS** (free) — replaces GoDaddy as authoritative DNS for `aiqadam.org`
- **Cloudflare Email Routing** (free) — MX → forward `*@aiqadam.org` rules to operators' personal Gmail inboxes
- **Cloudflare Email Workers** (free at our scale) — programmatic inbound for `bot.aiqadam.org` subdomain, see [ADR-0010](0010-inbound-email-cloudflare-workers.md)
- **Resend** (free tier: 3,000 emails/month, 100/day) — outbound transactional + per-operator Gmail "Send mail as" SMTP relay

Each operator manually configures Gmail "Send mail as" for their `name@aiqadam.org` address using a per-operator Resend API key. Automation deferred to Phase 1 weeks 4–6 — see [ADR-0012](0012-operator-send-as-automation.md). Manual procedure documented in [docs/02-business-processes/operations/archive/operator-email-send-as.md](../02-business-processes/operations/archive/operator-email-send-as.md).

The exception is **scoped strictly to email transport and addressing**. All other system components (application data, identity provider, content storage, queues, search, observability) remain self-hosted.

## Rationale

- **Self-hosting is blocked, not deprioritized.** Without PTR control we cannot deliver mail reliably from our IP to any major receiver.
- **Multi-VM mail-only setup is operationally more expensive** than the SaaS exception (~€60/yr in VMs + ongoing maintenance time). The exception saves operator hours that go to product instead.
- **Each component is replaceable individually.** If Cloudflare changes Email Routing terms, we move to ImprovMX or Mailgun forwarding. If Resend changes free-tier terms, we move to Brevo (300/day free) or AWS SES ($0.10/1000). No deep integration that would lock us in.
- **Free for Phase 1 volume.** A community platform with bursty event sends won't approach Resend's 3,000/month limit. Cloudflare Email Routing has no per-account caps relevant to us.
- **Per-operator API keys** isolate revocation surface — leak of one operator's Gmail Send-as setup doesn't compromise platform outbound or other operators' setups.

## Consequences

- ✅ Free, working email today.
- ✅ Replaceable per-component if any provider deteriorates.
- ✅ Both Cloudflare and Resend have strong reputations and reasonable pricing if/when we exceed free tiers.
- ✅ No mail-server attack surface on `aiqadam-web`.
- ⚠️ **Bounded SaaS dependency** in the critical email path. Captured here as the explicit exception to [PROJECT.md §Constraints](../01-business/project.md).
- ⚠️ **If Cloudflare or Resend free-tier terms change**, we adapt — likely cost is single-digit dollars/month, not project-killing.
- ⚠️ **Operator manual setup** of Gmail Send-as is friction (~10 min per operator). Mitigated by [ADR-0012](0012-operator-send-as-automation.md) once `apps/api` exists.
- 📝 **Cloudflare merges its own CAAs** into the zone (Comodo, DigiCert, Google Trust Services, SSL.com, plus our Let's Encrypt). Slightly looser CAA than strict Let's-Encrypt-only; harmless because Cloudflare DNS already controls the domain.
- 📝 **Resend uses `send.aiqadam.org` subdomain** for return-path/SPF, not the apex. Avoids SPF conflict with Cloudflare Email Routing's apex SPF — DKIM and DMARC alignment work via relaxed mode (both use `aiqadam.org` as organizational domain).

## Supersedes
The literal reading of [PROJECT.md §Constraints](../01-business/project.md) "no proprietary SaaS in critical path" — for email transport only.

## References
- [PROJECT.md §Constraints](../01-business/project.md) — the rule we're explicitly excepting from
- [ADR-0002](0002-deployment-target.md) — the PTR blocker context
- [ADR-0010](0010-inbound-email-cloudflare-workers.md) — programmatic inbound (the API-driven half)
- [ADR-0012](0012-operator-send-as-automation.md) — Send-as automation (the friction-mitigation half)
- [Operator Send-as runbook](../02-business-processes/operations/archive/operator-email-send-as.md) — the manual procedure (archived)
