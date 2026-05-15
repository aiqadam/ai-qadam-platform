# ADR-0010: Programmatic inbound email via Cloudflare Email Workers on a dedicated subdomain

## Status
Accepted (design), 2026-05-15. Implementation deferred to Phase 1 weeks 3–4.

## Context
Per [ADR-0009](0009-email-stack-saas-exception.md) we use Cloudflare Email Routing for inbound mail to `*@aiqadam.org`. Routing forwards mail to operators' personal Gmail inboxes — fine for human-read addresses (`admin@`, `viktor@`, etc.).

For **programmatic addresses** — addresses where mail should trigger code (CRM lead capture from `partners@`, Telegram bot replies to `bot@`, event Q&A processing for `events@`, registration replies for `register@`) — pure forwarding doesn't help. The mail just lands in someone's inbox.

Considered options:

1. **IMAP polling** — operate a worker that polls a designated mailbox for new mail. Adds latency, requires a real mailbox provider (paid SaaS), needs polling-interval tuning.
2. **Cloudflare Email Workers** — serverless code triggered on email arrival. Free at our scale, low-latency, integrates with our existing Cloudflare DNS.
3. **Mailgun Routes / SendGrid Inbound Parse** — same shape as Cloudflare Workers but on different vendors. Mailgun's free tier expires after 3 months historically; SendGrid requires a full account.

## Decision
**Cloudflare Email Workers on a dedicated subdomain `bot.aiqadam.org`.**

### Why a subdomain (not the apex)?

The apex `aiqadam.org` MX is Email Routing for human mailboxes. Email Workers is a *type of routing rule* and could in principle handle some apex addresses, but the cleanest design is per-domain MX:

- `aiqadam.org` MX → Cloudflare Email Routing → forwarding to humans (`admin@`, `viktor@`, etc.)
- `bot.aiqadam.org` MX → Cloudflare Email Routing → Email Worker → POST to NestJS API

Separating concerns by subdomain makes the address scheme self-documenting: humans see `name@aiqadam.org`, programmatic addresses end in `@bot.aiqadam.org`.

### Implementation outline

1. **DNS**: add MX records on `bot.aiqadam.org` pointing to Cloudflare Routing (`route1/2/3.mx.cloudflare.net`).
2. **Cloudflare Routing**: enable on `bot.aiqadam.org`, create a single catch-all rule routing to a Worker.
3. **Worker code** (TypeScript, deployed via `wrangler`):
   - Parses raw RFC 5322 message
   - Extracts `to`, `from`, `subject`, `Message-Id`, `In-Reply-To`, body (text + html), attachments metadata
   - POSTs to NestJS API endpoint `https://api.aiqadam.org/v1/webhooks/email`
   - Auth: HMAC-SHA256 signature header using a shared secret (Cloudflare Worker secret + NestJS env var)
4. **NestJS endpoint**:
   - Validates HMAC, idempotency by `Message-Id`
   - Routes by `to` address: `register@bot.aiqadam.org` → registrations module; `cfp@bot.aiqadam.org` → speakers module; `partners@bot.aiqadam.org` → CRM module; `bot@bot.aiqadam.org` → bot service
   - Persists raw message + parsed metadata to Postgres for audit trail
   - Replies asynchronously if applicable (via Resend)

### Address scheme

| Address | Purpose |
|---|---|
| `register@bot.aiqadam.org` | Email-based event registration (back-compat path for non-web users) |
| `cfp@bot.aiqadam.org` | CFP submissions for speaker pipeline |
| `partners@bot.aiqadam.org` | Partner/sponsor inbound for CRM intake |
| `events@bot.aiqadam.org` | Replies to event notifications |
| `bot@bot.aiqadam.org` | Telegram bot integration channel (verification mails, etc.) |

## Status notes

- **Implementation starts when `apps/api` has HTTPS endpoints**, expected Phase 1 weeks 3–4.
- **Until then, `bot.aiqadam.org` MX is NOT configured** — no risk of mail bouncing because no one knows about these addresses.

## Consequences

- ✅ Free at our scale (Cloudflare Workers free tier: 100k req/day, far above any expected volume).
- ✅ Low-latency: incoming mail triggers code immediately, no polling.
- ✅ No IMAP / mailbox-provider needed.
- ✅ Address scheme self-documents (humans on apex, automation on subdomain).
- ⚠️ **Cloudflare-specific** for inbound. Migration would require reimplementing the Worker on another platform (Mailgun Routes, SendGrid Inbound, or self-hosted SMTP-receiver service).
- ⚠️ **Worker request size limits** apply (Email Workers cap message body at ~25 MB). Large attachments (recordings, slides) need a different path — Resend can be configured to forward to a presigned S3/MinIO URL instead.
- ⚠️ **HMAC shared secret** lives in two places (Cloudflare Worker secret + NestJS env var). Rotation requires synchronized updates.
- 📝 **Audit retention**: every parsed inbound mail is stored in Postgres with raw body for 90 days, then archived to MinIO with restic backup. Per [SECURITY.md §"Logging and audit"](../../.claude/SECURITY.md) retention policy.

## References
- [ADR-0009](0009-email-stack-saas-exception.md) — overall email architecture this slots into
- [Cloudflare Email Workers docs](https://developers.cloudflare.com/email-routing/email-workers/)
- [SECURITY.md §"Logging and audit"](../../.claude/SECURITY.md) — retention policy
