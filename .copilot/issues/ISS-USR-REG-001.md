# ISS-USR-REG-001 — There is no possibility for user to self-register

| Field | Value |
|---|---|
| ID | ISS-USR-REG-001 |
| Severity | enhancement |
| Module | web-next/auth (registration) |
| Status | **resolved** |
| Reported | 2026-07-18 |
| Resolved | 2026-07-18 |
| Workflow | wf-20260718-fix-122 |
| Reporter | GitHub issue [#28](https://github.com/aiqadam/ai-qadam-platform/issues/28) |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/28 |

## Symptom

Reported by a chapter member (verbatim):

> I am some AI-Qadam chapter member and want to register on the AI-Qadam site
> to have advantages like a subscribed user. So, I am going to register
> myself as a new user and set the chapter in which I am the member.

Today the platform has no AI-Qadam-branded self-registration surface. Auth is
fully delegated to Authentik (`docs/04-development/architecture/architecture.md`
§Auth, ADR-0016) — a technically-generic Authentik-hosted sign-up form exists,
but there is no product-facing "Sign up" page on the AI-Qadam site itself, and
no way for a new user to select their country/chapter as part of registration
(the only place `country_preference` is currently collected is the Telegram
bot's `/start` flow, per FR-AUTH-002).

## Scope clarification (posted to the GitHub issue before implementation)

The issue as filed has no acceptance criteria. The following was clarified
with the reporter (`tvolodi`) in
[this comment](https://github.com/aiqadam/ai-qadam-platform/issues/28#issuecomment-5010918242)
before any code was written, to prevent the agentic workflow from inventing
scope:

1. **"Chapter" = country.** The platform's existing grouping mechanism is
   country-based tenancy (`uz.aiqadam.org`, `country_code` on every
   tenant-scoped table — `architecture.md:187-189`). There is no separate
   city/chapter entity in the codebase (`chapter` appears only twice, both as
   design-system glossary prose, never as schema/code). This issue does
   **not** introduce a new chapter entity — registration reuses the existing
   country selector (same list already used by the Telegram bot's
   `country_preference` prompt, FR-AUTH-002.md:24).
2. **"Advantages like a subscribed user" = full member role.** There is no
   subscription/paid-tier concept anywhere in the platform
   (`apps/api/src/modules/users/schema.ts:26-41` — `role` enum is
   `member`/`organizer`/`country_admin`/`super_admin`; zero matches for
   "subscri" across the codebase). Self-registration creates a normal full
   account: `role: member`, `is_temporary: false`. The "advantage" is being a
   full member rather than a lead (homepage `LeadCaptureForm`, email-only,
   `state: 'lead'`) or a temporary Telegram-only account
   (`is_temporary: true`) — both lesser tiers that already exist.
3. **UI:** a custom AI-Qadam-branded sign-up page (not a bare redirect to
   Authentik's generic hosted form), collecting email/password + country,
   provisioning the account via Authentik and setting `country_preference`.
   Similar shape to the existing `LeadCaptureForm`
   (`apps/api/src/modules/leads/leads.service.ts`) but for real account
   creation, not lead capture.

## Why this is not a duplicate

Checked `.copilot/issues/registry.md` for prior art — no existing issue
covers self-registration. Related-but-distinct FRs in
`docs/03-requirements/`:

- **FR-AUTH-001** (Shipped) — email/password sign-in via Authentik's own
  generic form. Explicitly states *"Platform does not host a custom
  registration form."* This issue supersedes that constraint for the
  self-registration case specifically.
- **FR-AUTH-002** (In Progress) — Telegram bot auto-provisions temporary
  accounts; unrelated surface (bot, not web).
- **FR-AUTH-005/006/007** (Planned) — all about linking additional
  identities to an *existing* account or upgrading a temp account. None of
  these are new-user self-registration.
- **FR-USR-001** — `LeadCaptureForm` (homepage email-capture funnel,
  auto-converts to member on later Authentik sign-in). Adjacent (same design
  language, same team) but is an email-nurture funnel, not a registration
  form — a lead never gets a password or a country at capture time.

## Resolution

- **Workflow:** wf-20260718-fix-122
- **PR:** [#31](https://github.com/aiqadam/ai-qadam-platform/pull/31)
- **Root cause:** No self-registration surface existed — the platform relied
  entirely on Authentik's generic hosted sign-up form (no AI-Qadam branding,
  no country/chapter selection, no explicit member-role provisioning path)
  or operator-issued invites; there was no way for a chapter member to
  create a full member account on their own.
- **Fix:** Added `POST /v1/auth/register` (public, rate-limited 5/15min) on
  the existing `AuthController`/`AuthModule`, backed by a new
  `RegistrationService` that: creates an Authentik user, sets the submitted
  password, assigns the `aiqadam-member` group, links/creates the Directus
  member row, writes the submitted country (`directus_users.country`), and
  emails the one-time Authentik login link via `InteractionsService` (never
  returned in the HTTP response — see security fix below). Added a new
  AI-Qadam-branded `apps/web-next/src/pages/auth/sign-up.astro` page with a
  `SignUpForm.tsx` React island (native `<form method="POST">`, mirroring
  `LeadCaptureForm.tsx`'s structure). A security-review retry pass (see
  `.copilot/tasks/completed/wf-20260718-fix-122/04-security-review.md`)
  fixed 3 MAJOR findings before merge: (1) the initial design returned the
  real Authentik recovery URL directly in the HTTP redirect for a genuine
  registration while duplicate-email/honeypot redirected to a literal
  `/v1/auth/login` string — a deterministic email-enumeration oracle via
  the `Location` header; fixed by emailing the recovery link out-of-band
  instead, so all three outcomes now return the byte-identical
  `/v1/auth/login` redirect; (2) the anti-spam honeypot field was named
  literally `honeypot` (trivially bot-detectable) — renamed to `company`,
  matching `LeadCaptureForm.tsx`'s convention; (3) the password policy was
  length-only (`min(12)`) on a public endpoint — added
  `apps/api/src/lib/password-schema.ts` rejecting all-one-character and a
  ~38-entry common-password blocklist, scoped only to the public
  registration endpoint.
- **Regression test:** `apps/api/test/registration-service.spec.ts`'s
  `register — happy path (regression test for ISS-USR-REG-001 / guards
  SecurityReviewer MAJOR-1)` test — before this PR, `POST /v1/auth/register`
  did not exist (404 on any request), so this test (and the whole file, 8
  tests) is the practical "would have failed before the fix, passes after"
  case required by Step 6. It also directly pins the fixed Location-header
  behavior: asserts the resolved result is the literal `/v1/auth/login`
  string, never the real Authentik recovery URL. `apps/api/test/password-schema.spec.ts`
  (9 tests) covers the MAJOR-3 password-policy fix.
- **Merged:** squash commit `dd5ceef` on `main` (PR #31, 2026-07-18).
