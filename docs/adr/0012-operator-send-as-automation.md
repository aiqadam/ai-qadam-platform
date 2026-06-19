# ADR-0012: Operator Send-as automation via Gmail API + Cloudflare Email Worker

## Status
Accepted (design), 2026-05-15. Implementation deferred to Phase 1 weeks 4–6.

## Context
Per [ADR-0009](0009-email-stack-saas-exception.md), each operator (board members, country leads, volunteers with personal `name@aiqadam.org` addresses) must manually configure Gmail "Send mail as" with their Resend SMTP credentials to send outbound mail branded as `name@aiqadam.org`.

The manual procedure (documented in [docs/02-business-processes/operations/operator-email-send-as.md](../02-business-processes/operations/operator-email-send-as.md)) takes ~10 minutes per operator and requires:

1. Operator opens Gmail Settings → Accounts → Send mail as
2. Adds the alias with SMTP details (server, port, username, password)
3. Receives a verification email at their `@aiqadam.org` address (forwarded by Cloudflare to their personal Gmail)
4. Clicks the verification link

For Phase 1's expected ~5 operators this is acceptable (~50 min one-time). As the team grows (board expansion, additional country leads in KZ/TJ, volunteer onboardings), manual setup scales poorly:

- Operators may not be technically comfortable with SMTP settings
- API key handling can leak (operators may screenshot, save in chat, etc.)
- No central audit of who has what alias configured
- Verification step relies on the operator finding the email and clicking the link
- New `name@aiqadam.org` addresses (renames, role changes) require redoing the setup

## Decision
Build an internal **Astro page + NestJS module + Cloudflare Email Worker** that automates Gmail Send-as provisioning end-to-end via OAuth + Gmail API + email-verification interception.

### Components

1. **Astro page** at `apps/web/src/pages/onboarding/email.astro`, gated to admin-invited users.
2. **Google OAuth client** (in a Google Cloud project we own) requesting the `gmail.settings.sharing` scope.
3. **NestJS endpoint** at `POST /v1/operators/:id/email-onboard/callback`:
   a. Exchanges OAuth code for refresh token (stored encrypted in Postgres)
   b. Calls Resend API to generate a per-operator API key (`Sending access` permission, named `aiqadam-operator-${operator-id}`)
   c. Calls Gmail `users.settings.sendAs.create` on the operator's account with:
      - `sendAsEmail` = `${operator.username}@aiqadam.org`
      - `displayName` = `${operator.full-name} • AI Qadam`
      - `smtpMsa.host` = `smtp.resend.com`, port 587, username `resend`, password = the per-operator Resend API key, securityMode `starttls`
      - `treatAsAlias` = `false`
4. **Cloudflare Email Worker** on `aiqadam.org`: when an email arrives, checks for the Gmail Send-as verification pattern (sender `noreply@google.com`, subject contains "Confirmation - Send Mail As"), extracts the verification URL via regex, performs an HTTPS GET to click it.
5. **Polling**: NestJS polls Gmail API `users.settings.sendAs.get` periodically; once the alias is verified, updates the operator record and notifies them.

### Total operator effort

~30 seconds: log in to the onboarding page, click "Connect your Gmail," accept Google's OAuth consent screen. Everything else is automatic.

### Caveats

- **Google OAuth app verification** required for production use with public users at >100 operators. Phase 1 stays in OAuth "Testing" mode with named operators added as test users (limit 100). Submission for verification is free, takes 1–4 weeks of Google review.
- **Per-operator API keys**: revoking one operator's access (offboarding, suspected leak) is one Resend API call, doesn't affect others or the platform service-account.
- **Workspace-managed Gmails**: if any operator is on a Google Workspace where the admin restricts third-party SMTP for Send-as, manual fallback or admin coordination required.
- **Non-Gmail operators** (Outlook, Yahoo, Yandex, etc.): the Gmail-specific automation doesn't help. Documented manual fallback in the runbook. Future ADR could add Outlook (Microsoft Graph API) and Yandex (their internal API) parallels.
- **OAuth refresh token storage**: stored in Postgres, encrypted at rest per [SECURITY.md §"Data protection"](../04-development/security/security.md) Confidential classification, never logged.

## Rationale

- Eliminates per-operator manual setup friction (10 min → 30 seconds).
- Centralized audit of who has what alias configured.
- Per-operator key isolation by default (the manual procedure could share keys; the automation enforces separation).
- Automated verification means operators don't have to hunt for a verification email.

## Consequences

- ✅ ~30s per operator onboarding vs ~10 min manual
- ✅ Centralized revocation
- ✅ Verification automation via Cloudflare Email Worker (small, focused, free)
- ⚠️ ~1–2 dev days to build (Astro page + NestJS module + Worker + polling logic)
- ⚠️ Adds Google Cloud Project as a project dependency (free for OAuth, just an account)
- ⚠️ Workspace + non-Gmail edge cases require fallback paths
- 📝 The manual runbook ([docs/02-business-processes/operations/operator-email-send-as.md](../02-business-processes/operations/operator-email-send-as.md)) stays as fallback documentation forever — automation can fail and humans need a path.

## References
- [ADR-0009](0009-email-stack-saas-exception.md) — email stack this automates a slice of
- [Operator Send-as runbook](../02-business-processes/operations/operator-email-send-as.md) — manual fallback (always valid)
- [Gmail API users.settings.sendAs reference](https://developers.google.com/gmail/api/reference/rest/v1/users.settings.sendAs)
- [Cloudflare Email Workers docs](https://developers.cloudflare.com/email-routing/email-workers/)
