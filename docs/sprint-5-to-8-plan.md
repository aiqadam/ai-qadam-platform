# Phase 2 — Sprint 5 onwards: CRM, Telegram, multi-IdP, E2E flow mirroring

> **Status:** plan drafted 2026-05-18, awaiting user sign-off. Sprint 5 (CRM) ready to execute. Sprints 5.5 / 6 / 7 / 8 sketched here; the Sprint 5.5 topics/interests scope was added on user feedback ("if event is created in CMS, it should be propagated in telegram, and there also should be country filters, user interests and etc"). Refined after CRM lands + we review the E2E flows together.

## What the user asked for

1. **Build CRM** — Twenty, per ARCHITECTURE.md
2. **Review the flows together** between web ↔ Telegram bot ↔ CRM, after CRM lands
3. **Mirror states bidirectionally** — register on web → Telegram DM lands; register via bot → web `/me` shows it; same for cancellations, check-ins, points
4. **Lean Telegram registration** — sign up via the bot, not just email/password (also need Google + GitHub login on web)

## What this plan covers

- **Sprint 5 — Twenty CRM** (ready to execute, ~4 PRs)
- **Sprint 5.5 — Topics + interests + announcement fan-out** (sketched, ~3 PRs) **— added after user feedback**
- **Sprint 6 — Telegram bot + Telegram auth** (sketched, ~7 PRs)
- **Sprint 7 — Google + GitHub auth providers** (sketched, ~3 PRs)
- **Sprint 8 — E2E flow polish** (sketched, ~3 PRs)

Sprint 5 ships now. Sprints 5.5–8 land after we sit down with the flow diagram and confirm scope.

---

## Architectural principles (locked in 2026-05-18)

> **API-first system with flow redundancy.** Every action is an API call. Web, bot, CRM all hit the same NestJS API. Notifications fan out across enabled channels (email, telegram, CRM-as-channel); a single failing channel doesn't block the others. Bot service is thin — inbound commands only, no direct DB / Directus / Authentik access.

## Architectural decisions (D1–D10) — confirmed

| # | Question | Decision | Notes |
|---|---|---|---|
| **D1** | Telegram auth: Authentik or API-side? | **Single source = Authentik** | Telegram Login + bot deep-link both route through Authentik. Our API verifies the Telegram HMAC and then drives Authentik (via its admin API) to upsert the user + open a session, which redirects back to our normal OIDC callback. Authentik still issues the JWT. Implementation: API endpoint `/v1/auth/telegram/exchange` validates Telegram data → calls Authentik API to create/find user + generate a one-time login token → 302 to Authentik's session endpoint → our existing callback handler completes the OIDC dance. |
| **D2** | Lean signup: require email or allow Telegram-only? | **Telegram-only with "temporary" account, 2-step upgrade for full profile** | At bot `/start`: Authentik user provisioned with `telegram_id` only, no email. User CAN: browse events, register, attend. User CANNOT (until step 2): appear on leaderboard, edit profile, sign in on web. **Step 2 = verify email** — bot prompts at "earn-points" moment ("To collect 50 points and join the leaderboard, share your email — we'll send a verification link"). User adds email → magic-link verifies → temp flag flips off → gamification unlocks + web sign-in available. **Design open questions:** see "Open D2 questions" below. |
| **D3** | Magic-link auth for email-only / Telegram-only users to sign into web | **Authentik flow** | Use Authentik's built-in "Email" stage. One flow ("magic-link-login") handles both first-time email verification (D2 step 2) and recurring passwordless logins. |
| **D4** | Bot ↔ API contract + secret management | **All secrets on server; bot stores only essentials** | Bot's env: `TELEGRAM_BOT_TOKEN`, `INTERNAL_API_URL`, `INTERNAL_API_TOKEN`. **NOT in bot env:** `DIRECTUS_TOKEN`, `AUTHENTIK_API_TOKEN`, JWT secret, CRM token, etc. Bot calls our API for every read/write. |
| **D5** | Telegram WebApp views (Sprint 6 or Sprint 8)? | **Sprint 8 (approved as deferred)** | |
| **D6** | Outbound notification path (system → Telegram) | **API → Telegram Bot API directly** | API is the single fan-out point. Per channel: email via Resend, Telegram via Bot API, CRM via Twenty API. All from one notification dispatcher in the API. Bot service is inbound-only. |
| **D7** | Event-announcement model | Per-event DM (not digest) | |
| **D8** | Interest model | Opt-in | |
| **D9** | Public Telegram channel | Defer | |
| **D10** | Reminder cadence | New-event announcement + 24h-before reminder | No other touchpoints (no "how was it?", no check-in nudges) until usage demands. |

### Open D2 questions (resolve in flow review)

1. **Can a temp (Telegram-only) user register for an event?** Recommendation: **yes** — registration is the primary value-add. Just no points/leaderboard.
2. **What happens to registrations made while temporary if the user never upgrades?** Recommendation: stay registered, stay on attendance list, just never earn points. If they upgrade later, do we retroactively award points for past attended events? Recommendation: **yes** (one-shot backfill on first upgrade).
3. **Identity row for temp users:** does Authentik really hold them, or do we store them in a separate `temp_telegram_users` collection until verified? Recommendation: **Authentik holds them from day 1**, with `email=<telegram_id>@telegram.local` (synthetic placeholder) so Authentik's email-unique constraint doesn't break. On upgrade, the real email replaces the placeholder. This keeps Authentik as the single user source per D1.
4. **CRM treatment of temp users:** sync to Twenty as a Person from day 1, or wait until they have a real email? Recommendation: **sync from day 1** (Twenty is a CRM — surfacing leads-without-emails IS valuable for the organizer team). Mark the Person with a tag `temp_telegram`.
5. **Telegram-only users on the leaderboard:** show as `@telegram_username` (no email exposed) or hide entirely until verified? Recommendation: **hide entirely** — leaderboard requires a real profile; that's the carrot for upgrading.
| **D7** | Event-announcement model: per-event DM the moment an event is published, or weekly digest? | **Per-event** | High-signal community platform — events are rare and high-stakes. Digest feels low-touch + easy to ignore. Throttle is one DM per (user, event) so re-publishing doesn't spam. |
| **D8** | Interest model: opt-in (user picks topics, only those events DM'd) or opt-out (everything by default, mute topics)? | **Opt-in** | Less noise out of the box. Discoverable: bot's `/interests` lists available topics, user toggles. Adds friction at signup but the bot can prompt once at `/start` ("Which areas interest you?"). |
| **D9** | Telegram channel per country (broadcast feed) in addition to DMs? | **Defer** | DMs are richer (CTA buttons, deep-links). Channel adds management overhead (post moderation, formatting). Revisit after we have real members asking for it. |
| **D10** | Reminder cadence: only new-event announcement, or also "event tomorrow" reminders? | **Both** | Trivial extra Directus scheduled flow once the fan-out plumbing exists. 24h-before reminder = high value, low spam. Avoid additional touchpoints ("how was it?", check-in nudges, etc.) until we see usage. |

---

## Sprint 5 — Twenty CRM (~4 PRs, ~2 days)

### C5.1 — Twenty deployed at `crm.aiqadam.org`
- New Coolify Docker Compose stack: `twenty/twenty` (web) + `twenty/twenty-worker` (background)
- Postgres database `twenty` on the existing pgvector PG container (matches Directus pattern from Sprint 1)
- FQDN `crm.aiqadam.org`, Traefik route, Let's Encrypt
- Bootstrap admin user via Twenty's first-run flow
- Document the stack in `docs/runbooks/coolify-app-stacks.md`
- **Verification:** sign in to `crm.aiqadam.org` with bootstrap admin; create a test Person manually

### C5.2 — Authentik OIDC SSO for Twenty
- New Authentik OAuth2 provider (3rd one, after Directus + platform), assign RS256 signing key from the start (lesson from Directus SSO)
- Twenty env vars: `OIDC_PROVIDER_AUTHENTIK_ISSUER_URL`, `OIDC_PROVIDER_AUTHENTIK_CLIENT_ID`, `OIDC_PROVIDER_AUTHENTIK_CLIENT_SECRET`
- Same `admin@aiqadam.org` user pre-linked as the Twenty Administrator
- **Verification:** "Sign in with AI Qadam" button on Twenty login → lands in Twenty admin

### C5.3 — Contact sync (`POST /v1/internal/crm/sync-contact`)
- New `apps/api/src/modules/internal/crm.controller.ts` + `crm-client.ts` (thin Twenty REST wrapper, admin token from `TWENTY_API_TOKEN` env)
- Endpoint: `POST /v1/internal/crm/sync-contact` body `{ directusUserId, email, firstName, lastName, country }`. Upserts a Twenty Person.
- New Directus flow `crm-contact-sync` on `directus_users.items.create` and `directus_users.items.update` → call endpoint
- Idempotent via Twenty's email-as-unique-key (or filter-and-update if not unique by default)
- **Verification:** sign a new user in via OIDC → Person appears in Twenty within ~5s

### C5.4 — Activity sync (`POST /v1/internal/crm/log-activity`)
- Same controller, new endpoint: `POST /v1/internal/crm/log-activity` body `{ directusUserId, eventTitle, eventId, kind, occurredAt }` where `kind` is one of `registered | waitlisted | cancelled | attended | promoted`
- Looks up the Twenty Person by directusUserId (cached locally? or queried each call — start simple, query each call)
- Creates a Twenty Activity (or Note, depending on Twenty's data model — confirm during impl)
- 3 new Directus flows wire this up:
  - `crm-activity-on-create` on `registrations.items.create` → kind=registered (with status check) or waitlisted
  - `crm-activity-on-update` on `registrations.items.update` → kind=cancelled / attended / promoted (based on status flip)
  - Already-wired email flows can chain into this; or separate flows (decide during impl — separate flows is simpler)
- **Verification:** register for an event from web → Person's activity timeline in Twenty shows the entry

### Sprint 5 risks

- **Twenty resource use:** Twenty + worker is ~300MB RAM combined. Confirm the Coolify host has headroom (currently runs ~6 containers; should be fine).
- **Twenty's data model:** Person / Activity / Note shapes need confirming during C5.4 — Twenty has been evolving. I'll script around whatever the actual schema is, but it might mean a small extra step.
- **First-run bootstrap:** Twenty might require visiting the UI for initial setup (workspace name, admin user). Manual step, runbook captures it.

---

## Sprint 5.5 — Topics + interests + announcement fan-out (~3 PRs, ~2 days)

> **Why this sprint exists:** the original Sprint 6 only DM'd users about their OWN registrations (capacity-decision, promotion, check-in). Per user feedback, the bot should ALSO announce newly-published events to interested users in the matching country. That requires a topic model, user opt-ins, and a fan-out flow. Email shares the same plumbing.

### Data model

New Directus collections + fields:

```
topics                          (country-scoped)
  id              uuid
  slug            string (ai-ml, mlops, python, frontend, data-eng, ...)
  name            string  (English label, e.g. "AI / Machine Learning")
  name_ru         string
  country         FK → countries
  sort            int

event_topics                    (M2M event ↔ topic)
  event           FK → events
  topic           FK → topics
  PRIMARY KEY (event, topic)

user_interests                  (M2M directus_users ↔ topic)
  user            FK → directus_users
  topic           FK → topics
  created_at      timestamp
  PRIMARY KEY (user, topic)

directus_users (add fields)
  notification_email_enabled      bool, default true
  notification_telegram_enabled   bool, default true  -- inert until Sprint 6
  country_preference              FK → countries  -- defaults from first tenant they signed in on
  telegram_id                     bigint  -- populated by Sprint 6
```

### PRs

| PR | Title | What lands |
|---|---|---|
| T5.5/1 | Topics schema + bootstrap | New collections via `infrastructure/directus/bootstrap.sh` extension. Seed 6–8 starter topics per country: AI/ML, MLOps, Python, Frontend, Backend, Data Engineering, Hardware/Robotics, Research. Add the 4 new fields to directus_users with safe defaults. |
| T5.5/2 | `/me/preferences` web page | New Astro page lists topics for the user's tenant as a checklist; toggle topic = upsert/delete `user_interests` row via Directus REST (proxied through API for auth). Same page surfaces the two notification-channel toggles. |
| T5.5/3 | Event-publish fan-out flow | New Directus flow `events-announce-on-publish` (action hook on `events.items.create` where `status=published`, plus on `items.update` where `status` flips draft→published). Chain: read event topics → query users matching `(country = event.country AND interests ∩ event.topics ≠ ∅ AND notification_email_enabled)` → POST `/v1/internal/announce-event` per user. The API endpoint dispatches email via the existing `EmailService` + Resend template `event-announced`. Telegram dispatch is a no-op until Sprint 6 adds the bot path. |

### Throttling / dedupe

- Add a `notifications_sent` collection (Directus): `(user, event, channel, kind, sent_at)` — natural unique key prevents re-sending the same announcement if a flow re-fires.
- For organizer edits to a published event we DON'T re-announce; only the draft→published flip triggers.

### Reminder flow (D10 — small follow-up after T5.5/3)

| PR | Title | What lands |
|---|---|---|
| T5.5/4 | 24h-before reminder | New Directus scheduled flow (cron-style trigger, hourly): find registrations on events starting in the next 24–25h, dispatch reminder via user's enabled channels. Skips if `notifications_sent.kind='reminder_24h'` for that (user, event) already exists. |

(T5.5/4 is small enough to fold into T5.5/3 if you prefer one PR.)

### Sprint 5.5 risks

- **Topic ontology drift:** seeding the wrong starter topics is reversible (just edit in Directus admin), but matching events to topics depends on operators tagging — if they forget, no fan-out fires for that event. Mitigation: T5.5/1 makes `event_topics` required (at least one topic per event) via Directus validation.
- **Spam risk:** users who opt into 5 topics get DM'd 5× per event in the worst case. Throttle: dedupe per (user, event), not per (user, event, topic).
- **Cross-tenant leak:** a user signed in on `uz.aiqadam.org` whose `country_preference=uz` should NOT see kz events. The flow's user-match query MUST filter by country.
- **Scheduled flow drift:** Directus scheduled flows run on the Directus process clock. If the container restarts the trigger may skip an interval. For 24h reminders this is fine (next hour catches them); for tighter timing we'd need a real scheduler.

---

## Sprint 6 — Telegram bot + Telegram auth (~7 PRs, ~5 days)

**Per D1:** Authentik issues all sessions. The API's role is to verify Telegram HMAC and drive Authentik's admin API. The bot service is thin — no Directus token, no Authentik token, just `INTERNAL_API_TOKEN` for calling our API.

**Per D4:** Bot stores only `TELEGRAM_BOT_TOKEN`, `INTERNAL_API_URL`, `INTERNAL_API_TOKEN`. Everything else is an API call.

### T6.0 — Notification dispatcher in the API (architectural prerequisite)

> Before Sprint 6 starts in earnest, refactor existing per-channel email code into a single dispatcher: `apps/api/src/modules/notifications/dispatcher.service.ts`. Inputs: `{ userId, template, data, channels?: ('email'|'telegram'|'crm')[] }`. Looks up user's enabled channels + linked accounts; dispatches to each in parallel; logs each result to `notifications_sent` collection in Directus (idempotency + audit trail). Each channel adapter handles its own failure (try/catch + log; never throws). **Flow redundancy** principle from your message: one channel failing doesn't block others. **Lands in Sprint 5.5's T5.5/3 as a refactor** — the announcement fan-out is the first dispatcher consumer.

### T6.1 — `apps/bot/` Python scaffold + Coolify stack
- Python 3.12, aiogram 3, ruff, pytest, uv
- Dockerfile, Coolify stack at internal hostname (no public FQDN). Long-polling, no Telegram webhook needed.
- Env (the only 3 secrets bot has): `TELEGRAM_BOT_TOKEN`, `INTERNAL_API_URL=https://uz.aiqadam.org/api`, `INTERNAL_API_TOKEN`
- Smoke: bot responds to `/start` with a static welcome

### T6.2 — Bot ↔ API + Telegram-via-Authentik exchange
- New `apps/api/src/modules/auth/telegram.controller.ts` (publicly accessible, NOT under /v1/internal — this is where Telegram Login Widget POSTs):
  - `POST /v1/auth/telegram/exchange` body = Telegram Login Widget fields `{ id, first_name, last_name, username, photo_url, auth_date, hash }`
  - Verifies HMAC: `secret = sha256(BOT_TOKEN)`; `expected_hash = hmac_sha256(secret, data_check_string)`
  - Maps Telegram id → Authentik user: query Authentik API for user with `attributes.telegram_id = <id>`; create if missing
  - Drives Authentik's user-login admin endpoint to mint an SSO token, 302s to Authentik's session callback → our existing `/v1/auth/callback` finishes the dance
- New `/v1/internal/telegram/*` endpoints (shared-secret, called by bot service):
  - `POST /upsert-temp-user` — for bot `/start` lean signup; creates Authentik user with `attributes.telegram_id` + `attributes.is_temporary=true` + synthetic email `tg<id>@telegram.local`
  - `POST /link-user` — for already-signed-in user attaching Telegram; takes a one-time link token
  - `POST /lookup` — bot calls this for every command to map `telegram_id → { directusUserId, isTemp, country }`
  - `POST /upgrade-temp` — initiates the email-verification flow (sends magic link via Authentik)

### T6.3 — Bot `/start` lean signup (temp account, per D2)
- User opens `t.me/aiqadam_bot`, taps Start
- Bot collects Telegram identity (always available from the update payload) + computes HMAC
- Bot POSTs `/v1/internal/telegram/upsert-temp-user` with `{ telegram_id, username, first_name, last_name, hash }`
- API verifies HMAC, creates Authentik user with synthetic email + `is_temporary=true`, creates Directus user via the bridge, returns `{ directusUserId, country }` (country inferred from Telegram's locale or asked next)
- Bot stores ONLY `(telegram_id → directusUserId)` in a tiny local SQLite (essentials per D4)
- Bot: "Welcome to AI Qadam. Set your country: [UZ] [KZ] [TJ]"
- Bot follow-up: "Pick what interests you: [AI/ML] [MLOps] [Python] ..." (8 inline buttons, multi-select)
- Bot finally: "Try /events. (When you're ready to earn points + join the leaderboard, share your email — type /upgrade.)"

### T6.4 — Web Telegram Login Widget
- Add the Telegram Login Widget (`<script async src="https://telegram.org/js/telegram-widget.js?22">`) to `apps/web/src/pages/auth/sign-in.astro`
- Widget callback POSTs to `/v1/auth/telegram/exchange` (T6.2)
- Existing users: if email match exists in Authentik, the exchange call finds and links the existing user (no duplicate). Otherwise creates a new account (will be `is_temporary=false` because Login Widget can provide email if user opts in).
- Flow ends at `/me` like every other sign-in

### T6.5 — Account-link command in bot for existing web users
- Web `/me` page shows "Link Telegram" button → API generates a one-time link token → web shows `t.me/aiqadam_bot?start=link_<token>`
- User opens the link; bot's `/start link_<token>` handler POSTs `/v1/internal/telegram/link-user` with the token + Telegram identity
- API verifies + sets `attributes.telegram_id` on the existing Authentik user
- Web `/me` updates next request to show "Linked: Telegram (@username)"

### T6.6 — Member bot commands (read-only first, write second)
- `/events` — bot calls `/v1/events` (currently unauth public read — needs to come back as a Directus-read proxy in C5.x cleanup; OR keep `/v1/events` as a thin read-only directus passthrough)
- `/event N` — same
- `/register N` — `/v1/internal/telegram/register` → API proxies to Directus → flows fire (capacity, email, telegram-notify)
- `/me` — lists user's registrations + temp/full account state
- `/leaderboard` — top 10 (temp users excluded per D2 open Q #5)
- `/interests` — list + toggle topics
- `/upgrade` — kicks off email-verification (POST `/v1/internal/telegram/upgrade-temp`)

### T6.7 — Telegram channel adapter for the notification dispatcher
- Adds `TelegramChannel.dispatch({ userId, template, data })` to the notification dispatcher (T6.0)
- Adapter: looks up user's `telegram_id` in Authentik attributes; if absent OR `notification_telegram_enabled=false`, skips (returns 'skipped' so dispatcher logs it)
- Otherwise calls Telegram Bot API directly (`sendMessage` with optional inline buttons for "Open in app" deep-links)
- Per D6: bot service is NOT involved in outbound DMs — API pushes directly. Bot service handles inbound only.
- Existing email side-effects (registration-confirmed, promoted, waitlisted, event-announced, reminder-24h) automatically gain a Telegram channel via the dispatcher

### Sprint 6 risks

- **Telegram WebApp `initData` HMAC verification** is fiddly — there are 2 different signing schemes (Login Widget vs WebApp), both HMAC-SHA256 but different hash bases. Need to be careful per [Telegram docs](https://core.telegram.org/widgets/login).
- **Bot at internal hostname only** (no public FQDN) — Telegram still reaches it via outbound from the bot polling Telegram's `getUpdates`, not via webhook. Or use webhooks with a public path. Simpler: long-polling (no public endpoint needed).
- **Spam:** Telegram users can flood `/start`. Rate-limit per Telegram ID in the bot itself, plus reuse the Phase 1 rate-limit middleware on the API endpoints.

---

## Sprint 7 — Google + GitHub auth providers (~3 PRs, ~1 day)

Pre-bot or parallel-with-bot, your call. Sketched:

| PR | Title | What lands |
|---|---|---|
| A7.1 | Authentik Google source | Add Google OAuth2 Source in Authentik, register OAuth app with Google Cloud, configure scopes (email, profile), test sign-in via standard flow |
| A7.2 | Authentik GitHub source | Same shape, GitHub OAuth app |
| A7.3 | Web sign-in UI | `apps/web/src/pages/auth/sign-in.astro` — render the 3 buttons (Sign in / Google / GitHub) + a "Sign in with Telegram" placeholder for T6.4 |

These are mostly configuration, not code — light week.

---

## Sprint 8 — E2E flow polish (~3 PRs, ~2 days)

After 5+6+7, refines the experience:

| PR | Title | What lands |
|---|---|---|
| E8.1 | Identity surface on /me | `/me` page shows linked accounts (Web/Email, Google, GitHub, Telegram) + actions to link/unlink. Bot `/me` shows the same. |
| E8.2 | Telegram WebApp views | Registration QR + check-in scanner as WebApp views inside Telegram (theme-matched HTML). Replaces the text-only `/me` and `/scan` commands with richer UI. |
| E8.3 | Magic-link email auth | Configure Authentik's Email stage so Telegram-only users (no password) can sign into web by clicking a magic link sent to their email. |

---

## Flow review — the conversation we need to have after Sprint 5

When CRM is live, sit down with these states + side-effects and confirm every cell of the matrix:

| Action | Web visible? | Bot DM fires? | CRM activity logged? | Directus row written? | Email sent? |
|---|---|---|---|---|---|
| User signs up (any channel) | ✓ /me | first-DM if Telegram | Person created | directus_users row | welcome (optional) |
| User registers for event | ✓ /me + /events | "you're in for X" | "Registered" | registrations row | confirmation |
| Capacity full → waitlisted | ✓ /me | "you're on waitlist" | "Waitlisted" | registrations.status=waitlisted | waitlist confirmation |
| Cancellation | ✓ /me | "cancelled" | "Cancelled" | registrations.status=cancelled | cancellation |
| Promotion from waitlist | ✓ /me | "you're promoted!" | "Promoted" | registrations.status=registered | promotion |
| Check-in (organizer scan) | ✓ /me + /leaderboard | "see you there" | "Attended" + points | registrations.status=attended + point_award | thank-you (optional) |
| Bot-initiated register | ✓ /me | confirmation DM | same as web | same | same |

Open Q for that review:
- Welcome email yes/no?
- Thank-you-after-attendance email yes/no?
- Telegram DM for capacity overflow — do we want this or only for promotions / cancellations?
- Bot-initiated cancellation flow — `/cancel N` command?

---

## Target shape after all sprints

```
                       ┌─────────────────┐
                       │  Authentik      │  ← single auth source (D1)
                       │  (sessions for  │     • email/password
                       │   every channel)│     • Google
                       └────────┬────────┘     • GitHub
                                │              • Telegram (HMAC-verified by our API,
                                │                 then handed to Authentik)
                                ▼              • magic-link (D3, for Telegram→web)
┌─────────────┐   ┌────────────────────────────────┐   ┌─────────────────┐
│  Astro web  │←──┤  NestJS API                    │──→│  Directus       │
└─────────────┘   │  • THE API for every channel   │   │  (source of     │
                  │  • notification dispatcher     │   │   events, regs, │
┌─────────────┐   │    (email, telegram, crm —     │   │   topics, users)│
│  apps/bot   │←──┤    flow redundancy: each       │   └─────────────────┘
│  (Python,   │   │    channel fails independently)│           │
│   inbound   │   │  • secrets: ALL OF THEM        │           │ flows fire
│   only)     │   │    (Directus token, Authentik  │           ▼
└─────────────┘   │     admin, Twenty token, ...)  │   ┌──────────────────┐
                  │  • bot only has its own bot    │   │  Directus flows  │
                  │    token + INTERNAL_API_TOKEN  │←──│  (events.publish,│
                  │    (D4)                        │   │   registrations  │
                  └────────┬───────────────────────┘   │   create/update, │
                           │                           │   reminder@24h)  │
                           ▼                           └──────────────────┘
                  ┌──────────────────┐
                  │  Twenty CRM      │
                  │  (Person, Activity, mirrored)
                  └──────────────────┘
```

## Recommended execution order

1. **Sprint 5 — Twenty CRM** (now, 4 PRs).
2. **Sprint 5.5 — Topics + interests + announcement fan-out, with notification dispatcher refactor** (3–4 PRs, includes T6.0 dispatcher). Sets up the channel-symmetric outbound pipe.
3. **Flow review session** — go through the state-mirroring matrix below + the D2 open questions + the dispatcher's channel routing rules. You mark up the matrix.
4. **Sprint 7 — Google + GitHub** (3 PRs, easy wins).
5. **Sprint 6 — Telegram bot + Telegram auth** (7 PRs).
6. **Sprint 8 — Polish: link surface + WebApp views + reminder polish** (3 PRs).

Total: ~20 PRs over ~12 working days at current cadence. **The dispatcher in T6.0 (folded into Sprint 5.5) is the load-bearing piece** — every later channel adapter (telegram, future push, future SMS) plugs into it.
