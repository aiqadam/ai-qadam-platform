# SECURITY.md — Security Baseline

This document is the **minimum security posture** for AI Qadam Platform. It applies to every line of code, every deploy, every operational action.

Inspired by OWASP Top 10, NIST guidance, and Google's Beyond Corp principles, adapted for a small team running self-hosted infrastructure.

---

## Threat model — who we worry about

In rough order of likelihood:

1. **Opportunistic bots** scanning for known vulnerabilities (SQL injection, common exploits, exposed admin panels).
2. **Spam and abuse** — fake registrations, scrapers harvesting user emails.
3. **Account takeover** — credential stuffing, phishing leading to compromised user accounts.
4. **Insider mistakes** — accidental data exposure, missed `WHERE` clause in admin queries.
5. **Supply chain** — compromised npm packages, malicious dependencies.
6. **Targeted attacks** — unlikely in Phase 1, but Authentik, Postgres, and admin endpoints must be hardened from day 1.

We are **not** building for nation-state adversaries. But we **are** building for a credible threat surface.

---

## Authentication

### User authentication

- **Authentik** is the only identity provider. No homegrown auth.
- **OAuth/OIDC for federation** — Google, Telegram Login Widget, optionally GitHub.
- **Password auth via Authentik** for users who prefer it — passwords stored hashed (argon2id, Authentik default).
- **Multi-factor authentication offered** to all users, required for admins.
- **Session lifetime:** 14 days, refresh token rotation.
- **Logout invalidates server-side session.**

### API authentication

- **JWT bearer tokens** issued by Authentik.
- **Tokens verified on every request** against Authentik's public key (cached, refreshed periodically).
- **No "trusted internal services"** — bot, workers, web all authenticate properly.
- **Service accounts** (bot, workers) have their own credentials with limited scopes.

### Forbidden

- **No basic auth in production** — even for admin panels.
- **No API keys in URLs** — query strings end up in logs.
- **No password reset via security questions** — email-link only.
- **No "remember me forever"** — explicit max session lifetime.

---

## Authorization

### Principle

**Default deny.** Permission must be explicitly granted; nothing is implicit.

### Implementation

- **Role-based access control (RBAC)** via Authentik groups, propagated as JWT claims.
- **Authorization checks at controller level**, not buried in services.
- **Tenant isolation enforced by middleware** — country_code injected automatically, manual override requires super-admin role.
- **Resource ownership checks** for user-owned resources (you can edit your own profile, not someone else's).

### Roles in AI Qadam

| Role | Scope |
|------|-------|
| `member` | Read public content, manage own profile, register for events |
| `speaker` | + Edit own speaker profile |
| `organizer` | + Manage events in assigned country |
| `country_admin` | + All operations within their country |
| `super_admin` | All operations everywhere |
| `bot_service` | Bot-specific API access |
| `worker_service` | Background worker access |

Roles are additive — a country_admin is also a member.

---

## Input validation

### Universal rule

**Every input from outside the system is validated, at the system boundary.**

Boundaries:
- HTTP request bodies, params, query strings, headers
- Telegram bot messages
- Webhook payloads (from Listmonk, Twenty, etc.)
- File uploads
- Background job payloads (deserialized from Redis)

### How

- **Zod schemas** for TypeScript code.
- **class-validator + class-transformer** alternative inside NestJS (Zod preferred for consistency with shared types).
- **Pydantic** for Python (bot).
- **Reject with `400 Bad Request`** on validation failure, never silently coerce.

### Specific validations

- **String lengths** — every string field has a max length.
- **Email addresses** — RFC 5322 validation + DNS check optional.
- **URLs** — explicit allowed schemes (https, mailto, tg); no `javascript:`, no `file:`.
- **UUIDs** — validated as v4 UUIDs, not "any UUID-shaped string."
- **Enums** — strict whitelist, never accept "other."
- **Numeric ranges** — min and max declared.
- **Dates** — ISO 8601 with timezone; reject ambiguous formats.
- **Tenant codes** — must match `^[a-z]{2}$` and exist in `countries` table.

---

## Output encoding

### Universal rule

**Never output raw user content without encoding for its destination.**

- **HTML output:** React escapes by default. Never use `dangerouslySetInnerHTML`. If markdown rendering is needed, use a sanitizing renderer (e.g., `marked` + `DOMPurify`).
- **JSON output:** standard serialization is safe.
- **URLs:** `encodeURIComponent` for path segments and query values.
- **SQL:** parameterized queries via Drizzle's query builder. **Never** string-concatenate SQL.
- **Shell commands:** never execute user input as shell. If a command must run, use `execFile` with array args, never `exec` with concatenation.
- **Log output:** structured JSON; sanitize PII; never log raw bodies.

---

## SQL injection

### Defenses

- **Drizzle ORM** is the standard data access layer (see [ADR-0013](../../adr/0013-orm-drizzle-over-prisma.md)).
- **Raw SQL** only via Drizzle's `sql\`...\`` template tag (auto-parameterized) — and only with explicit justification in code review.
- **No string concatenation** that ends up in a query, ever.
- **Test for injection** — automated tests with `' OR 1=1--` and similar payloads on every input field.

---

## Cross-site scripting (XSS)

### Defenses

- **React escapes by default** in JSX. We rely on this.
- **`dangerouslySetInnerHTML` is forbidden** without an explicit code comment justifying it and a `DOMPurify.sanitize()` call.
- **User-generated Markdown** rendered via sanitizing renderer with strict allowlist of HTML elements.
- **Content Security Policy (CSP)** strict, no `unsafe-inline`, no `unsafe-eval`.
- **httpOnly, secure, sameSite=lax** for all cookies.
- **X-Content-Type-Options: nosniff** header.
- **X-Frame-Options: DENY** header.

---

## Cross-site request forgery (CSRF)

- **State-changing endpoints require either:**
  - Bearer token in Authorization header (modern API auth — naturally CSRF-resistant), OR
  - CSRF token in cookie + custom header (double-submit pattern) if using session cookies.
- **GET endpoints have no side effects.**
- **CORS configured strictly** — origin allowlist, not `*`.

---

## Rate limiting

### Public endpoints

- **All public API endpoints** are rate-limited.
- **Default limit:** 60 requests per minute per IP, per endpoint.
- **Auth endpoints:** stricter — 5 attempts per 15 minutes per IP.
- **Registration:** 1 per minute per user.
- **Implemented via** `@nestjs/throttler` or custom Redis-backed limiter.

### Bot

- **Telegram users have implicit rate limit** via Telegram's own throttling.
- **API calls from bot to NestJS** use a service account with its own (higher) rate limit.

### What rate limits return

- HTTP `429 Too Many Requests` with `Retry-After` header.
- Clear error message in user's language.

---

## Secrets management

### Storage

- **Production secrets in environment variables**, set on the host in `deploy/.env` (never committed).
- **Never in code.** Never in git. `.env` is gitignored.
- **`.env.example` checked in** with placeholder values to show structure.

### Rotation

- **Database passwords:** rotated quarterly or on suspicion of compromise.
- **API keys:** rotated quarterly.
- **JWT signing keys:** rotated annually (Authentik manages).
- **Compromise → rotate immediately**, invalidate sessions.

### Access

- **Only Viktor has access** to production secrets in Phase 1.
- **When a second admin joins:** secret access is logged and audited.
- **Secret scanning** in CI via `gitleaks` or similar.

---

## Data protection

### At rest

- **Database disk encrypted** at the OS level (full-disk encryption on Hetzner server).
- **MinIO bucket encryption** enabled (server-side encryption).
- **Backups encrypted** before upload to Cloudflare R2 (restic does this).

### In transit

- **TLS everywhere.** No HTTP, no plain SMTP, no unencrypted Redis.
- **TLS 1.3 preferred**, 1.2 minimum.
- **HSTS header** on all responses (`max-age=31536000; includeSubDomains; preload`).
- **Certificate pinning** not required for Phase 1.

### Sensitive data classification

- **Public:** event info, speaker bios, partner names. No protection beyond integrity.
- **Internal:** registration lists, partner contracts. Authenticated access only.
- **Confidential:** user emails, Telegram IDs, password hashes. Access logged.
- **Secret:** session tokens, API keys, database credentials. Strict access control.

### What we never store

- Passwords (only hashes via Authentik)
- Credit card numbers (we have no payment system in Phase 1)
- Government ID numbers
- Health information

---

## PII and privacy

### Data minimization

We collect only what we need:
- Email (for login and notifications)
- Name (display)
- Optional: city, expertise tags, bio, social links

We **don't** collect:
- Date of birth
- Phone number (unless user explicitly provides for event SMS reminders later)
- Address
- Government ID

### User rights

Users can:
- **View** all data we have on them.
- **Edit** their profile.
- **Delete** their account — soft delete first (30 days), then hard delete.
- **Export** their data as JSON.

### Privacy policy

Required before launch. Drafted with help from a lawyer or template (open-source templates from EFF, Mozilla).

### Cookies

- **Essential cookies only by default** (session, CSRF, theme).
- **Analytics cookies disabled** until consent (we don't run analytics in Phase 1).
- **Consent banner** complies with GDPR-style consent.

---

## File uploads

### Validation

- **Allowed types declared per endpoint** — e.g., event photo uploads accept only `image/jpeg`, `image/png`, `image/heic`, `image/webp`.
- **MIME type checked by content, not just header.** Use `file-type` library.
- **File size limited.** Photos: 20 MB. Documents: 5 MB.
- **Filename sanitized.** Never trust user-provided filenames.
- **Random server-side filename** assigned. Original filename stored as metadata if needed.

### Storage

- **MinIO buckets** with per-service credentials.
- **Direct uploads to MinIO** via presigned URLs (browser uploads, doesn't transit API).
- **Scanned for malware** with `clamav` for documents (Phase 2; photos lower-risk).
- **EXIF data stripped** from images before publishing (privacy: GPS coordinates).

### Serving

- **Photos served via CDN-fronted URL** (Cloudflare in front of MinIO).
- **`Content-Disposition` headers** correctly set.
- **No direct access to private buckets.**

---

## Dependency security

The canonical dependency policy (download thresholds, license rules, commercial-package ban, PR-description requirements) lives in [`AGENTS.md` §8](../../../AGENTS.md). This section adds the **security-specific** checks on top of it.

### Before adding a dependency (security checks)

1. Check `npm audit` / `pnpm audit` — no known critical CVEs.
2. Verify package legitimacy: weekly downloads > 10k, last update < 6 months, maintainer reputation (matches AGENTS.md §8).
3. Pin version in `package.json` (no `^` for security-critical packages like auth, crypto).
4. Check license compatibility.

### Ongoing

- **Renovate or Dependabot** opens PRs for updates weekly.
- **Security advisories monitored** via GitHub.
- **Critical CVEs:** patch within 48 hours.
- **High CVEs:** patch within 7 days.

### Forbidden

- **No packages not updated in > 24 months** without explicit risk acceptance.
- **No `postinstall` scripts** from untrusted packages — review before install.

---

## Logging and audit

### What we log

- **Authentication events:** login, logout, MFA, password reset.
- **Authorization failures:** access denied, with context.
- **Admin actions:** any role/permission change, any super-admin action.
- **Significant business events:** event creation/deletion, user role changes, financial transactions.

### What we don't log

- Passwords, tokens, full session IDs.
- Full request bodies (sanitize first).
- Full PII in error messages.

### Log retention

- **Application logs:** 30 days in Loki, then archive.
- **Audit logs:** 1 year, separated from application logs.
- **Postgres logs:** 7 days.

### Access to logs

- **Viktor only** in Phase 1.
- **Read-only access** when others added.

---

## Backup and recovery

### Backup strategy

- **Postgres:** daily `pg_dump`, encrypted, uploaded to Cloudflare R2 via restic.
- **MinIO:** daily restic snapshot of critical buckets (`cms-media`, `event-photos`), incremental.
- **Retention:** 30 daily, 12 weekly, 12 monthly.
- **Off-site:** Cloudflare R2 (different geographic region than Hetzner).

### Recovery testing

- **Monthly:** restore Postgres dump to a test database, verify integrity.
- **Quarterly:** full disaster recovery drill — provision new server, restore everything, validate.
- **Documented** in `docs/runbooks/disaster-recovery.md`.

### Recovery time objectives

- **RTO (Recovery Time Objective):** 4 hours for critical services.
- **RPO (Recovery Point Objective):** 24 hours of data loss tolerable in worst case.

---

## Infrastructure hardening

### Server

- **SSH:** key-based auth only, no password login, no root login.
- **Firewall:** only required ports open (22 SSH, 80/443 HTTP/S).
- **Automatic security updates** for OS packages.
- **fail2ban** for brute-force protection on SSH.
- **Docker network internal** — services communicate within Docker network, not over public internet.
- **Database not exposed publicly.** Postgres listens on loopback only.

### TLS

- **Let's Encrypt / certbot** for HTTPS.
- **Auto-renewal** via systemd timer or cron.
- **Wildcard certificate** for `*.aiqadam.org` to support tenant subdomains.

---

## Incident response

### Detection

- **Uptime monitoring** (Uptime Kuma) — pages Viktor on outage.
- **Error rate alerts** via Grafana — alert if 5xx rate > 1% over 5 min.
- **Failed login spikes** trigger investigation.

### Response (security-specific)

If we suspect a breach:

1. **Contain.** Isolate affected systems. Rotate compromised credentials.
2. **Investigate.** Logs, audit trail. Understand scope.
3. **Notify.** Affected users within 72 hours of confirmed breach (GDPR alignment).
4. **Recover.** Restore from clean backups if needed.
5. **Post-mortem.** Per WORKFLOW.md template, additionally with a "what changed in our security posture" section.

---

## What's out of scope for Phase 1

These are real concerns, but accepted risks until later phases:

- **WAF (Web Application Firewall)** — Cloudflare in front later, if traffic grows.
- **DDoS protection** — same.
- **Penetration testing** — when we have something worth testing (post-launch).
- **SOC 2 / ISO 27001** — not relevant for a community platform.
- **Bug bounty** — when traffic justifies it.

We **accept these risks** explicitly. Document in `docs/adr/0XX-security-phase-1-risks.md`.

---

## Compliance posture

### What we comply with

- **GDPR principles** (relevant when EU members participate or if we expand): data minimization, user rights, lawful basis, breach notification.
- **Uzbekistan personal data law** (Law on Personal Data 547-XX, 2019): data processed locally where possible, consent recorded.

### What we don't

- **HIPAA** — no health data.
- **PCI DSS** — no payment data.
- **FERPA** — no education records.

---

**End of SECURITY.md.** When in doubt: assume the input is malicious, the network is hostile, and the secret has already leaked.
