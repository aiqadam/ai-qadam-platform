# Migration to Directus-centric architecture

> **Status:** Sprint 1 through Sprint 4.5 shipped as of 2026-05-18. Sprint 5 (Twenty CRM) + Sprint 6 (Telegram bot) deferred — see below.
> Owner: Viktor + Claude.
> **Why:** the custom `/admin` pages + NestJS event/registration logic
> we built in PRs #41–#54 don't match the originally intended
> architecture, which is a single CMS-of-truth (Directus) wired to one
> auth (Authentik) and consumed by a configurable headless front +
> Telegram bot + CRM. This doc tracks the switch.

## Target architecture (one diagram)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Authentik   (auth.aiqadam.org)        — OIDC, sole identity provider   │
│  RBAC: super_admin | country_admin | organizer | member                 │
└──────────────┬──────────────────────────────────────────────────────────┘
               │ OIDC
               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Directus 11 (cms.aiqadam.org)                                           │
│  Single source of truth for:                                             │
│  - Content:  homepage_hero, partners, blog_posts, pages                  │
│  - Entities: event_types, events, registrations, point_awards            │
│  - Users:    synced from Authentik via OIDC SSO (Directus role = AK role)│
│  Flows + hooks: capacity / waitlist promotion / point award / triggers   │
└──┬───────────────────────────────┬──────────────────────────┬───────────┘
   │ REST + GraphQL                │ webhooks                 │ REST
   ▼                               ▼                          ▼
┌─────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│  Astro web          │  │  Thin NestJS API     │  │  Telegram bot      │
│  (uz/kz/tj/admin    │  │  (apps/api)          │  │  (apps/bot, py)    │
│   .aiqadam.org)     │  │  - auth callback     │  │  - reads events    │
│  - reads Directus   │  │  - jwt mint + deny   │  │  - posts notifs    │
│  - country-scoped   │  │  - email dispatch    │  │  - registers users │
│    queries          │  │  - webhook router    │  │                    │
└─────────────────────┘  └──────────┬───────────┘  └────────────────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │  Twenty CRM          │
                         │  (cms-crm.aiqadam.org)│
                         │  - members as contacts│
                         │  - engagement pipelines│
                         └──────────────────────┘
```

## Why this beats the current half-and-half

| Today (mixed) | Target |
|---|---|
| Events in `platform.events` (Postgres via Drizzle). `/admin/events` page in our Astro app. | Events in Directus `events` collection. Admin UI = branded Directus, accessed via `cms.aiqadam.org` (later wrapped in `/admin/content`). |
| Capacity + waitlist + check-in logic in NestJS `events.service` + `registrations.service`. | Same logic as Directus **flows** (declarative, GUI-editable, versionable). |
| Partner logos hard-coded array in `index.astro`. | `partners` collection in Directus, queried per country. |
| User profile fields (handle, role) in our `users` table + `/admin/users`. | Users in Directus, synced from Authentik via OIDC. Directus admin manages roles. |
| Custom `/v1/admin/*` controllers + Drizzle schemas + tests. | Replaced by Directus permissions + auto-generated API. |
| Bot would need to call both `/v1/events` (ours) + Directus (content). | Bot reads everything from Directus. |
| CRM later would need to sync from our DB + Directus. | CRM listens to Directus webhooks (single source). |

## Sprints

### Sprint 1 — Directus deployed + auth + collections (~5 days)

| PR | Title | What lands |
|---|---|---|
| C1.1 | Directus app in Coolify | New `aiqadam-directus` app, image `directus/directus:11`, FQDN `cms.aiqadam.org`, bootstrap admin user + key. |
| C1.2 | Authentik OAuth source in Directus | Create OAuth2 provider in Authentik for Directus. Configure Directus `AUTH_PROVIDERS=authentik` env vars. Sign-in to Directus via AI Qadam SSO works. Role mapping: super_admin → `Administrator` Directus role. |
| C1.3 | Brand Directus | Custom CSS file overriding logo, color, page title to AI Qadam. Loaded via `EXTENSIONS_AUTO_RELOAD` + a small `display.css`. |
| C1.4 | Core collections | `countries`, `event_types`, `events`, `registrations`, `point_awards`, `homepage_hero`, `partners`. Permissions matching our roles. Idempotent via `directus schema apply` from a snapshot in `infrastructure/directus/`. |
| C1.5 | Data migration script | One-shot Node script reading from our `platform.events` + `registrations` + `point_awards` → Directus collections. Pushed to git for reproducibility; run once in prod. |

### Sprint 2 — Web rewrite to consume Directus (~3 days)

| PR | Title | What lands |
|---|---|---|
| C2.1 | `@directus/sdk` server-side client | New `lib/cms.ts` wrapping Directus REST. Server-only access token, same Domain-scoped session as users. |
| C2.2 | `/`, `/events`, `/events/[id]` SSR via Directus | Replace `fetchUpcomingEvents`, `fetchEvent` to read from Directus. Tenant scoping = `country_code` filter. |
| C2.3 | `/me` registrations | `/v1/registrations/mine` proxies to Directus filtered by current user. |
| C2.4 | Homepage hero + partners from Directus | Replace hardcoded PARTNERS array + the hero "first upcoming event" defaults to `homepage_hero` if set. |

### Sprint 3 — Business logic in Directus (~3 days)

| PR | Title | What lands |
|---|---|---|
| C3.1 | Registration flow | Directus flow: on `registrations` insert, count registered for the event → if `< capacity`, status=registered; else waitlisted. Send confirmation email. |
| C3.2 | Cancel + waitlist promotion | Directus flow: on `registrations.status` update to `cancelled`, query oldest `waitlisted` for that event → promote to `registered`. Send promotion email. |
| C3.3 | Check-in + point award | Webhook from our `/api/v1/checkin/<code>` → Directus updates registration status='attended', inserts point_award. (Or do it entirely in Directus if scanner can hit Directus directly.) |
| C3.4 | Email dispatch endpoint | Directus webhook → thin NestJS endpoint `/v1/internal/email` → Resend. Keeps email templates in our repo for review. |

### Sprint 4 — Decommission our custom admin (~2 days) ✅ shipped

| PR | Title | What landed |
|---|---|---|
| C4.1 (#64) | `/admin/*` 302 to `cms.aiqadam.org` | Middleware in `apps/web/src/middleware.ts` redirects `admin.aiqadam.org/*` **and** `<country>.aiqadam.org/admin/*` to `cms.aiqadam.org/admin`. |
| C4.2 + C4.3 (#65) | Delete dead admin UI + API admin module | -2687 LOC: 6 Astro pages, AdminShell layout, 5 admin React islands, CheckinScanner, the entire `apps/api/src/modules/admin/*`, `AdminGuard`, `@Roles()` decorator, `admin-guard.spec.ts`. |

C4.4 ("trim Drizzle schemas") was originally listed here but turned out to be premature — member-side endpoints still backed by `platform.events / registrations / point_awards`. Folded into Sprint 4.5 below.

### Sprint 4.5 — Member-side proxy to Directus (~1 day) ✅ shipped

Surfaced after Sprint 4 reviews: `POST /v1/registrations`, `POST /v1/checkin`, `GET /v1/leaderboard`, `GET /v1/users/:handle/profile` were still Drizzle-backed. Sprint 4.5 cuts them over so C4.4 can finally drop the tables.

| PR | Title | What landed |
|---|---|---|
| S4.5/1 (#66) | Directus user bridge | Migration 0010 adds `platform.users.directus_user_id`. New `DirectusUsersBridgeService` syncs a `directus_users` row at OIDC sign-in (lookup by email → link or create with `provider=authentik, external_identifier=email`). Sign-in never blocks on Directus availability. New env vars: `DIRECTUS_URL`, `DIRECTUS_TOKEN`. |
| S4.5/2 (#67) | Proxy registrations + check-in | Rewrote `POST /v1/events/:id/register`, `DELETE /v1/events/:id/register`, `GET /v1/registrations/mine`, `POST /v1/checkin/:code` to call Directus via `DirectusClient`. Capacity / waitlist / email / point-award side-effects already shipped as Directus flows in Sprint 3 — the controllers shrank to thin orchestration. Deleted `registrations.service` (Drizzle). |
| S4.5/3 (#68) | Proxy leaderboard | `GET /v1/leaderboard` reads `point_awards` aggregate from Directus, joins with `platform.users` via `directus_user_id` for display fields. Deleted `points.service` (Drizzle). |
| S4.5/4 (#69) | Drop Drizzle schemas (= C4.4) | Migration 0011 `DROP TABLE events, registrations, point_awards CASCADE` + matching enum drops. Deleted `apps/api/src/modules/events/*`, `registrations/schema.ts`, `points/schema.ts`, `events.spec.ts`. Refactored `users.service.getPublicProfile` to fetch the 3 aggregates from Directus (degraded mode = zero counts when bridge not yet populated). |

**Net retired across Sprint 4 + 4.5: ~4400 LOC.** End-state: `platform.*` keeps only `countries`, `users`, `refresh_tokens` (auth + tenant). Directus owns everything event-shaped.

### Sprint 5 — Twenty CRM (optional, post-launch) (~3 days)

| PR | Title | What lands |
|---|---|---|
| C5.1 | Twenty container in Coolify | At `crm.aiqadam.org`. SSO via Authentik. |
| C5.2 | Directus → Twenty sync | Directus webhook on user create → Twenty contact create. Registration insert → Twenty activity. |
| C5.3 | Email campaign automations | Twenty workflows: 7d before event → reminder; 1d after → thank-you. |

### Sprint 6 — Telegram bot (post-launch) (~5 days)

| PR | Title | What lands |
|---|---|---|
| C6.1 | `apps/bot/` Python scaffold | aiogram 3, Coolify Python build, env wired. |
| C6.2 | Account-link command | `/start <token>` deep-links from our web to attach Telegram user_id to Directus user. |
| C6.3 | Member commands | `/events`, `/event N`, `/register N`, `/me`, `/leaderboard`. Reads Directus. |
| C6.4 | Organizer commands | `/scan` opens WebApp camera, posts to Directus. `/attendance N`, `/announce N "text"`. |
| C6.5 | Notification fan-out | Directus webhook → bot service → sends DM (event reminder, registration confirmation). |

## What survives the migration

- Authentik (unchanged; just gains Directus as another OIDC client)
- `apps/web` Astro shell, country routing, admin subdomain redirect, sign-in/out pages — all of this stays. Just the data source for events shifts.
- `apps/api` Auth controller + AuthGuard + JtiRevocationService — stays. Thin email dispatcher + webhook router survives. Everything else trimmed.
- `apps/web/src/middleware.ts` (admin subdomain redirect) — repurposed to redirect to `cms.aiqadam.org` instead of `/admin`.
- All design system, locales, country routing, F-series infrastructure.
- Auth architecture doc at `docs/04-development/architecture/auth-architecture.md`.

## What went away (final, after Sprint 4 + 4.5)

- `apps/api/src/modules/admin/` (whole module)
- `apps/api/src/modules/events/` (whole module)
- `apps/api/src/modules/registrations/{schema,registrations.service}` — `registrations.controller` + `checkin.controller` retained as thin proxies to Directus
- `apps/api/src/modules/points/{schema,points.service}` — `points.controller` retained as thin proxy to Directus
- `apps/api/src/modules/auth/{admin.guard,roles.decorator}.ts`
- `apps/web/src/pages/admin/*` (all replaced by 302 to cms.aiqadam.org/admin)
- `apps/web/src/components/Admin*` + `CheckinScanner.tsx`
- `apps/web/src/layouts/AdminShell.astro`
- DB tables `events`, `registrations`, `point_awards` (migration 0011) plus their enums

**~4400 LOC retired** across Sprint 4 + 4.5. Net code reduction.

## New things that were NOT in the original plan

- **`DirectusClient` + `DirectusUsersBridgeService`** (Sprint 4.5/1). Identity bridge wasn't anticipated because the original plan assumed Directus would own users from the start. Reality: Authentik OIDC issues OUR JWT (`sub = platform.users.id`), so member-side proxy needed a mapping column + sync on sign-in.
- **`POST /v1/internal/email`** + `INTERNAL_API_TOKEN` shared-secret guard (Sprint 3 C3.4). Sprint 3 spec said "Directus webhook → Resend"; in practice we kept templates server-side in the repo (code-review path, escapes, dedupe) and Directus flow `request` ops call the endpoint with the shared secret.
- **Authentik RS256 signing key** (during SSO setup). Directus's openid-client expects RS256; Authentik's OAuth2 provider was created without a signing key, defaulted to HS256 (symmetric using the client secret). Fix was assigning the self-signed cert to the provider's `signing_key`.
- **`AUTH_AUTHENTIK_IDENTIFIER_KEY=email`** + pre-linking `admin@aiqadam.org` (during SSO setup). Default `sub` mode doesn't match users who were created locally before SSO existed.

## Rollback strategy

Each sprint lands behind a feature flag where possible. If Sprint 2 (web reads Directus) goes sideways, point INTERNAL_API_URL back to our NestJS — the underlying data still lives in Postgres until Sprint 4's drop. Hard cut happens only at Sprint 4.

## What the user (operator) sees through this

- Today: signs in on `auth.aiqadam.org`, lands at `/me` or `/admin` (our pages).
- After Sprint 1: same. Directus exists at `cms.aiqadam.org` but only engineers visit it.
- After Sprint 2: members see content from Directus; admins still use our `/admin`.
- After Sprint 4: admins clicking `/admin` are redirected to `cms.aiqadam.org` (branded Directus).
- After Sprint 5+6: CRM + bot start appearing in member workflows (emails, Telegram notifications).
