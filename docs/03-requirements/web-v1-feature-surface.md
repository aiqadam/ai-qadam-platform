# apps/web (V1) Feature Surface — Coverage Checklist for apps/web-next (V2)

> **Purpose.** Production is currently served by `apps/web`. The frontend is being rebuilt as `apps/web-next` (mid-flight). This is the complete feature surface of the live app so the V2 rebuild covers everything — nothing silently dropped. Generated 2026-05-29 via parallel inventory (pages, components, CMS/API, cross-cutting, web-next gap). Authentik specifics intentionally out of scope.


---


## 1. Pages & Routes

## Live web app route inventory (`apps/web/src/pages/`)

**Framework:** Astro hybrid (SSR per-request when `prerender = false`; SSG/static when `true` or unset). 48 `.astro` pages total.

**Cross-cutting (must replicate in V2):**
- **`src/middleware.ts`** — runs on every SSR request. (1) Redirects `admin.aiqadam.org` host → `https://cms.aiqadam.org/admin`. (2) **SSR auth bootstrap**: one server-side `/auth/refresh` using `aiqadam-refresh` cookie (legacy `__Host-aiqadam-refresh`), stores `Astro.locals.auth` (`SsrAuth = { accessToken, me{id,email,authentikSubject,groups} }`), forwards rotated refresh cookie + access token to client via `window.__AIQADAM_AUTH__` injected by `Layout.astro`. Collapses N island refreshes → 1 (fixes single-use refresh-token replay / cross-user RBAC leak). Anon short-circuit when no cookie.
- **Auth model:** cookie presence = "signed-in hint" only. Real gating is (a) client islands reading `window.__AIQADAM_AUTH__` and (b) API guards (AuthGuard / SuperAdminGuard) returning 401/403. **No server-side page redirect for operator pages** — page HTML loads for anyone; island shows sign-in/forbidden.
- **i18n:** `lib/i18n` `getLocale(Astro)` (cookie + Accept-Language) + `makeT(locale)`; locales uz/kz/tj/ru/en. Reading Accept-Language forces `prerender=false`.
- **Geo:** `lib/geo` — apex `aiqadam.org` 302s to country sub via CF-IPCountry; country resolved from Host header.
- **Data libs:** `lib/cms` (Directus, internal `http://directus:8055` SSR alias), `lib/api` (Nest API `/v1/*`), `lib/forms-api` (forms via bot/API), `lib/auth-bootstrap` (client dedupe).
- **Layout.astro** wraps every page (nav, theme, OG/meta, JSON-LD slot).

### Public / Marketing
| Route | prerender | Purpose | Data | Auth | Islands |
|---|---|---|---|---|---|
| `/` (index) | false | Country homepage: mission band, hero (next event), 3-event grid, trust stats, partners row, recent recordings, lead capture, TG/partner CTAs. Apex→geo redirect | cms (upcoming events, partners, homepage stats, recent recordings, site settings), i18n | public (cookie-hinted nav) | `LeadCaptureForm`; HomeHero/UpcomingEventsGrid are .astro |
| `/press` | false | Press/media kit: boilerplate, contact, leadership+headshots, logos, palette, fact sheet, quarterly digests, coverage | cms (marketing_assets, press_page, team_members) + hardcoded Tier-1 logos/palette | public | none |
| `/marketing/url-builder` | unset (SSG) | UTM URL builder operator tool (currently public) | hardcoded | public (intended operator later) | `UtmUrlBuilder` |

### Events
| Route | prerender | Purpose | Data | Auth | Islands |
|---|---|---|---|---|---|
| `/events` | false | Events index: timeline/grid view toggle, tab upcoming/past, format filter, `?q` search (all server-side via Directus) | cms (upcoming/past events), i18n | public | `LeadCaptureForm`; EventsTimeline/EventsGrid .astro |
| `/events/[id]` | false | Event detail: 4 tabs (upcoming/live/finished/forum) via `?tab`, hero, venue+OSM map+Google/Yandex deep-links, agenda md, links, speakers, materials, livestream embed, recordings/photos/recap, sponsors sidebar, JSON-LD Event, OG card. members_only/invite_only gate via refresh-cookie hint | cms (event, speakers, materials, photos, questions, sponsors) | public + cookie-gated content for gated events | `EventForum`, `RegistrationSidebar`, `EventShareButtons` |
| `/events/[id]/survey` | false | Post-event survey (form attached via `events.post_event_survey_form`); 404 if none; event-context header | forms-api (`fetchEventSurvey`, `fetchSurveyEventContext`) | public (open survey) | `FormRenderer` |

### Account (`/me/*`)
All `prerender=false` (need cookie for nav). Gating client-side via islands.
| Route | Purpose | Data | Islands |
|---|---|---|---|
| `/me` | Member dashboard + suggested upcoming events (SSR-fetched, filters out registered) | cms (upcoming events) | `MeDashboard` |
| `/me/profile` | Self-service: profile core, 7 per-purpose consents, skills | island→API | `MeProfileForm` |
| `/me/preferences` | Notification/comms preferences | island→API | `PreferencesForm` |
| `/me/referrals` | Personal referral code + attributed signups | island→API | `MyReferrals` |
| `/me/access-log` | Member transparency: audit_events where actor/target = self | island→API | `MeAccessLog` |

### Leaderboard
| Route | prerender | Purpose | Data | Islands |
|---|---|---|---|---|
| `/leaderboard` | false | Top-3 podium + table, window scope `?window=all/year/quarter`, clickable handles, "You" row highlight | api (`fetchLeaderboard`) | none (inline `<script>` uses `auth-bootstrap` to highlight self) |

### Public profile
| Route | prerender | Purpose | Data | Auth | Islands |
|---|---|---|---|---|---|
| `/u/[handle]` | false | Public profile: bio, job/employer, 3 stats, 52-week activity heatmap, recent events. 404→/leaderboard | api (`fetchProfile`), i18n | public | none |

### Auth (`/auth/*`)
| Route | prerender | Purpose | Auth |
|---|---|---|---|
| `/auth/sign-in` | false | 302 → `/api/v1/auth/login?next=` (Authentik). Validates `next` is safe relative path. No UI | public redirect |
| `/auth/signed-out` | false | Post-logout confirmation page (RP-initiated logout target) | public |

### Operator (`/workspace/*`)
All thin Astro wrappers mounting a `components/workspace/*` React island; auth enforced inside island + API guard (operator/super-admin). Most have no explicit `prerender` (SSG shell) **except** dynamic/SSR-marked ones noted.
| Route | prerender | Purpose | Island | Auth tier |
|---|---|---|---|---|
| `/workspace` | false | Operator landing/router for all roles | `Workspace` | operator |
| `/workspace/dashboard` | unset | Country-scoped events/registrations/attendance/CSAT | `OperatorDashboard` | operator (country-scoped) |
| `/workspace/events` | unset | Event list + registration counts | `EventsListPanel` | operator |
| `/workspace/events/[id]` | false | Per-event control: edit metadata, followup checklist | `EventControlPanel` | operator |
| `/workspace/members` | unset | Member directory: search, cohorts, saved filters | `MemberDirectory` | operator |
| `/workspace/approvals` | unset | Approval queue (sponsors/speakers/interactions) | `ApprovalsQueue` | operator |
| `/workspace/announce` | unset | Compose targeted announcement to cohort | `AnnounceComposer` | operator |
| `/workspace/partners` | unset | Sponsors/employers/product partners list | `PartnersList` | operator |
| `/workspace/partners/[slug]` | false | Partner entitlements/audiences/kit downloads | `PartnerView` | operator |
| `/workspace/forms` | false | Forms library: list/create/archive templates | `FormsListPanel` | operator |
| `/workspace/forms/[id]` | false | Form builder: fields/preview/publish | `FormBuilderPanel` | operator |
| `/workspace/forms/[id]/responses` | false | Aggregated stats + raw responses inbox | `FormResponsesPanel` | operator |
| `/workspace/admin/users` | unset | Operator invites list | `AdminInvitesList` | super-admin |
| `/workspace/admin/users/new` | unset | Invite new operator form | `AdminUserCreateForm` | super-admin |
| `/workspace/admin/audit` | unset | All audit_events: severity/prefix/country filter, payload diff | `AuditEventsList` | super-admin |
| `/workspace/admin/countries` | unset | Per-country defaults (locale/currency/holidays/reminder); read all, edit super-admin | `CountriesAdmin` | operator read / super-admin write |
| `/workspace/admin/countries/[code]/provisioning` | false | Country provisioning wizard (Authentik→Directus→Plausible→Coolify) | `CountryProvisioningWizard` | super-admin |
| `/workspace/admin/cron` | false | Internal @Cron tick health (last fire/duration/outcome) | `InternalCronStatusTable` | operator |
| `/workspace/admin/rbac-sync` | unset | RBAC sync jobs: status filter, diff, retry | `RbacSyncList` | super-admin |
| `/workspace/integrations/telegram` | unset | TG bot cabinet: status/identity/recent deliveries | `TelegramCabinet` | operator/super-admin |
| `/workspace/integrations/telegram/broadcasts` | false | Broadcasts list | `TgBroadcastsList` | operator |
| `/workspace/integrations/telegram/broadcasts/new` | false | Compose broadcast | `TgBroadcastComposer` mode=new | operator |
| `/workspace/integrations/telegram/broadcasts/[id]` | false | Edit broadcast | `TgBroadcastComposer` mode=edit | operator |
| `/workspace/integrations/telegram/segments` | unset | Audience segments list + new (JSON edit) | `TgSegmentsList` | operator |

### Forms / Feedback / Surveys
| Route | prerender | Purpose | Data | Auth | Islands |
|---|---|---|---|---|---|
| `/forms/[slug]` | false | Public render of any operator-built form by slug; 404 if missing | forms-api (`fetchForm`) | public (anon submit) | `FormRenderer` |
| `/feedback/csat` | false | One-question CSAT via tokenized `?t=` link from post-event email | none server (token passed to island) | token-as-credential | `CsatForm` |
| `/events/[id]/survey` | false | (also under Events) post-event survey | forms-api | public | `FormRenderer` |

### Campaign / Landing
| Route | prerender | Purpose | Data | Auth | Islands |
|---|---|---|---|---|---|
| `/welcome/[slug]` | false | Per-campaign landing page; markdown body (img/link), radial hero, primary+secondary CTA; UTM/ref carried onto relative CTA via inline script; drafts/archived 404 | cms (`fetchLandingPage`), i18n | public | none (inline script) |

### Utility (checkin / onboard / global / leads)
| Route | prerender | Purpose | Data | Auth | Islands |
|---|---|---|---|---|---|
| `/checkin` | unset (SSG) | Event check-in form | island→API | likely token/operator (in island) | `CheckinForm` |
| `/onboard` | true (SSG) | Public invitee operator onboarding (password+AUP → Gmail+CF verify poll → Resend key reveal) | island→API | **token-as-credential** | `OnboardingForm` |
| `/global` | false | Country picker splash (uz/kz/tj tiles + per-country event counts) for unsupported geo / global.aiqadam.org | cms (`fetchEventCountForCountry`), i18n | public | none |
| `/leads/thank-you` | true | "Check your inbox" after lead submit | hardcoded | public | none |
| `/leads/verified` | true | Lead email verified (target of `/api/v1/leads/verify` success) | hardcoded | public (token verified upstream) | none |
| `/leads/verify-failed` | true | Lead verify link invalid/expired (failure target) | hardcoded | public | none |

### Notes for V2
- Static (`prerender=true`/unset) pages: `/onboard`, `/leads/*`, `/marketing/url-builder`, several `/workspace/*` shells. Everything reading cookies/Accept-Language/live Directus at request time is `prerender=false`.
- Event detail (`/events/[id]`) is by far the richest page (4 tabs, 6 Directus fetches, JSON-LD, OG card endpoint `/events/[id]/og-card.png`, OSM iframe, video embeds) — budget accordingly.
- `/events/[id]/og-card.png` is referenced as an image endpoint (not an `.astro` page in this dir — verify its handler exists, likely an API route).
- Workspace pages share a near-identical shell (breadcrumb `← Workspace` + h1 + intro + island) — candidate for a shared `WorkspaceCabinetLayout` in V2.


## 2. Components & Islands

## apps/web components inventory (live app, NOT web-next)

All paths under `/home/drukker/aiqadam/apps/web/src/components/`. Styling is **inline `style={}` objects + CSS custom props** (`--primary`, `--card`, `--border`, `--font-display/mono`), plus a few global classes (`.btn`, `.input`, `.empty-state`, `.badge`). No CSS framework. Islands hydrate via Astro `client:load`.

### Auth-bootstrap split (CRITICAL for V2)
Two distinct patterns coexist; V2 should unify on the shared helper.
- **Shared `getAuthState()`** (`src/lib/auth-bootstrap.ts`): reads SSR-injected `window.__AIQADAM_AUTH__` blob first (zero round-trips), falls back to a deduped module-level in-flight `POST /api/v1/auth/refresh` + `GET /api/v1/auth/me`, 60s TTL. Also exports `resetAuthState()` and `signOut()` (calls `POST /api/v1/auth/sign-out` → navigates to returned `logoutUrl` for SSO→SLO, fallback `/auth/signed-out`). **Used by:** NavAccountMenu, MeDashboard, MeProfileForm, PreferencesForm, MyReferrals, MeAccessLog, Workspace shell.
- **Direct `POST /api/v1/auth/refresh`** (own helper, no dedupe): **every `/workspace/*` cabinet**, plus RegistrationSidebar, EventForum, EventShareButtons. These race each other / the shared helper — the documented cross-user RBAC-leak bug. V2 must put ALL islands on one shared helper.

### Nav / chrome
| Component | Renders / does | Endpoints | Auth | Notable UX |
|---|---|---|---|---|
| **Nav.astro** | Sticky blurred top header. Brand mark, center links (Events, Leaderboard, Account-or-Sign-in), right cluster: country `<select>` + locale `<select>` + `<NavAccountMenu client:load>`. | none (SSR) | `Astro.locals.auth?.me` (server-verified, from SSR middleware) decides Account vs Sign-in CTA | Country switcher = inline script navigating to `<code>.aiqadam.org` sibling subdomain by hostname; locale switcher writes `LOCALE_COOKIE` + reloads. `astro-island{display:contents}`. i18n via `makeT`. |
| **NavAccountMenu.tsx** | Anon → renders null. Authed → 28px initials avatar button → popover: "Signed in as <email-local>", role-gated **Workspace** link (`isOperator`) + **Engineering Deck** link (`isEngineer`, opens `login.aiqadam.org/if/user/#/library`), Sign out. | via getAuthState | shared | Outside-click + Escape close; role gating by Authentik `groups` claim (super-admin/sponsor-rep/country-lead-*/organizer-* = operator; super-admin/authentik Admins = engineer). |

### Account (/me)
| Component | Renders / does | Endpoints | Notable UX |
|---|---|---|---|
| **MeDashboard.tsx** | The /me hero. Avatar+name+role chip; profile-completeness nudge (6 signals→%); NextEventHero (gradient card w/ QR); 3 StatCards (Upcoming/Attended/Waitlist); **ActivityHeatmap** (13-week / 90-day GitHub-style grid bucketed by checkedInAt); **BadgesStrip** (newest 6, category-tinted pills, hidden if 0); registrations list w/ per-row QR (`qrcode.react`); suggested events (SSR-passed, dedup vs registered); QuickActions. | `GET /registrations/mine`, `/me/profile`, `/me/badges` (parallel) | Anon CTA view; QR via `QRCodeSVG` linking `/checkin?code=`; empty-state for no regs; role chip ranks groups. **BadgesStrip + heatmap are inline sub-components, not separate files.** |
| **MeProfileForm.tsx** | /me/profile. 5 cards: Profile (job_title, seniority, industry_tags CSV, is_student, bio_md, 5 visibility toggles), Consents (7 ADR-0033 purposes, optimistic toggle), Skills (add/remove tag pills), Interests (topic+intent), Employments (employer/role/dates/current/share_with_sponsors). | `GET/PATCH /me/profile`, `PATCH /me/profile/consents`, `POST/DELETE /me/profile/skills`, `/interests`, `/employments` | Per-section optimistic updates; AnonView CTA; inline validation/error per form. |
| **PreferencesForm.tsx** | /me/preferences. 3 email-topic consent rows (newsletter, sponsor_offer, speaker_promo) w/ Granted/Revoked toggle buttons. | `GET/PATCH /me/preferences/consents` | Optimistic per-topic pending state; AnonView CTA. |
| **MyReferrals.tsx** | /me/referrals. Mint/show 6-char referral code + share URL (copy button); "friends attended" stats + "Brought a friend" badge; how-attribution-works `<details>`. | `GET /referrals/mine`, `/referrals/mine/stats`, `POST /referrals/issue` | Idempotent mint; anon auto-redirects to `/api/v1/auth/login`; stats panel hidden until ≥1 attended; clipboard copy. |
| **MeAccessLog.tsx** | /me/access-log. Security-event rows (severity color chip, event code, target_kind, timestamp). | `GET /me/access-log` | Anon auto-redirect; empty + probe-error states. |

### Events
| Component | Renders / does | Endpoints | Notable UX |
|---|---|---|---|
| **RegistrationSidebar.tsx** | Sticky event-detail aside: When/Where/Capacity meta + CTA (Register / Join waitlist / Cancel / Leave waitlist / Sign-in). | `POST /auth/refresh`, `GET /registrations/mine`, `POST/DELETE /events/:id/register` | **Optimistic local count + status** (readyAfterRegister/Cancel); reads referral+UTM attribution from cookies (`lib/attribution`) into register body; isFull logic. Direct-refresh auth. |
| **EventForum.tsx** | Q&A tab. SSR initial questions; signed-in textarea (max 2000, char counter) posts + prepends; pinned float top, else recency. | `POST /auth/refresh`, `POST /events/:id/questions` | Optimistic prepend; pinned/answered badges; anon sign-in panel; empty state; i18n via `t` prop. Direct-refresh auth. |
| **EventShareButtons.tsx** | Share row (channels from `lib/share-urls`); embeds member's `?ref=CODE` when signed in (+25 pts hint). | `POST /auth/refresh`, `GET /referrals/mine` | Best-effort — renders anon buttons immediately, swaps to member mode when code resolves. Direct-refresh auth. |
| **CheckinForm.tsx** | /checkin page. Reads `?code=`, "Check in" button → confirmation w/ event title/time. | `POST /checkin/:code` (no auth) | no-code / busy / done / error states; "Already checked in" idempotency. |
| **CsatForm.tsx** | Public CSAT (token-only, no auth). 1–5 rating + comment. | `POST /feedback/csat` | 202=success, 409=already; SR-only labels. |
| **FormRenderer.tsx** (+ `forms/*`) | Renders operator-built form (6 field types: short_text, long_text, scale, select_one, select_many, yes_no, speaker_rating) + submits. | submits to forms API (`lib/forms-api`) | Anonymous submit; locks w/ sign-in msg when `allow_anonymous=false`. Field components in `forms/`. |
| Astro display (SSR, no JS): **EventsGrid**, **UpcomingEventsGrid**, **EventsTimeline** (month-grouped), **HomeHero** (next-event countdown) | Render `ApiEvent[]` from `lib/api`; date plates, FORMAT_LABEL chips, i18n. | n/a | Pure SSR cards. |

### Lead / marketing
| Component | Renders / does | Endpoints | Notable UX |
|---|---|---|---|
| **LeadCaptureForm.tsx** | Anonymous newsletter capture: email + city (datalist presets Tashkent/Almaty/Dushanbe…) + interest topic chips (11 presets) + hidden honeypot. | `POST /leads` (no auth) | Reads UTM first-touch from query; inline success panel (no nav); honeypot anti-spam; 202 dedup = same confirmation UX. |
| **UtmUrlBuilder.tsx** | Operator UTM link builder (pure client, `lib/utm`). Live preview + copy. | none | Per-field validation, copy status. |
| **OnboardingForm.tsx** | /onboard invite acceptance: preview invite → set password + AUP → mailbox-ready terminal screen (webmail + IMAP/SMTP settings). | `GET /onboard/preview`, `POST /onboard/accept` | 410 Gone handling; DMS mailbox provisioned on password-set. |

### Operator cabinets (`workspace/`) — all direct-refresh auth, anon→`/api/v1/auth/login` redirect, surface 403 as "super-admin only"
Shell: **Workspace.tsx** (sidebar: Dashboard/Members/Announce/Events/Forms/Approvals/Integrations→Telegram; uses getAuthState) + **AppLauncher.tsx** (cards to Gatus/Plausible/Directus/Authentik, engineer-scope badge).

| Cabinet | Purpose | Key endpoints |
|---|---|---|
| OperatorDashboard | Country + cross-country metrics (events/regs/attended/CSAT), 7/30/90d range | `/workspace/dashboard/cross-country` |
| MemberDirectory | Member search + cohort builder, 7 Directus-native filters | `/workspace/members`, `/workspace/cohorts` |
| AnnounceComposer | Pick cohort → subject+body → preview → send | `/workspace/announce`, `/announce/preview`, `/cohorts`, `/auth/me` |
| ApprovalsQueue | Pending approvals (empty-shell + per-source roadmap) | `/workspace/approvals` |
| EventsListPanel | Events list (starts_at desc) → control panel | `/workspace/events`, `/auth/me` |
| EventControlPanel | Single-event: metadata edit, registration breakdown, followup checklist, CSAT | `/workspace/events/:id`, `/:id/csat`, `/forms` |
| FormsListPanel | Forms list, status pills, submission counts, +New | `/workspace/forms`, `/auth/me` |
| FormBuilderPanel | Per-form editor: metadata + add/reorder fields (up/down, no drag) | `/workspace/forms/:id` |
| FormResponsesPanel | Aggregate rollup (NPS histogram, yes/no, counts) + raw table (anon badged), client paginate 50/500 | `/workspace/forms/:id/aggregate`, `/submissions` |
| CountriesAdmin | Country profiles (locale/currency/channel/holidays); read-only for non-super-admin | `/workspace/countries`, `/admin/countries/:code` |
| CountryProvisioningWizard | F-S4.2 provisioning state machine, per-step status + retry | `/admin/countries/:code/provisioning`, `/activate` |
| AdminInvitesList | Invite list w/ revoke, token_prefix only | `/admin/invites` |
| AdminUserCreateForm | Create invite → one-time invite_url copy panel | `/admin/invites` |
| AuditEventsList | Audit-event log table | `/admin/audit/events` |
| RbacSyncList | RBAC sync jobs + retry | `/admin/rbac-sync/jobs`, `/:id/retry` |
| InternalCronStatusTable | In-process cron tick health | `/workspace/internal-cron/status` |
| PartnersList / PartnerView | Partner list + per-partner audiences/cohorts | `/workspace/partners`, `/:slug` |
| TelegramCabinet | TG integration: status, bot identity, recent deliveries, rotate token | `/telegram/admin/status`, `/recent-deliveries`, `/rotate-service-token` |
| TgSegmentsList + CriteriaBuilder | Segments cabinet; CriteriaBuilder = chip/dropdown builder over DSL w/ live preview + JSON escape hatch | `/workspace/tg-segments`, `/:id/preview`, `/preview`; `/telegram/event-topics`, `/workspace/events` |
| TgBroadcastsList | Broadcasts read-view | `/workspace/tg-broadcasts` |
| TgBroadcastComposer | Draft/schedule broadcast, ≤8 inline buttons, HTML safe-subset | `/workspace/tg-broadcasts/:id` |


## 3. CMS + API Integration

## apps/web data-integration layer — V2 handoff

Source of truth: `/home/drukker/aiqadam/apps/web/src/lib/{cms.ts,api.ts,auth-bootstrap.ts,forms-api.ts}`, `middleware.ts`, `astro.config.mjs`. Two distinct backends: **Directus (CMS, public collections)** and **the Nest API (`/v1/*`)**. The web NEVER talks to Directus from the browser — all Directus reads are SSR-only via `lib/cms.ts`.

### 1. Two BASE-URL patterns (V2 MUST preserve both)

| Layer | Env var | SSR value | Public/browser value | Why |
|---|---|---|---|---|
| Directus | `CMS_URL` | `https://cms.aiqadam.org` (also used as `BASE` for `/assets/<file-id>`) | same | Single DNS works from web container, local dev, and 3rd parties (bot). Asset binaries served at `${CMS_URL}/assets/<id>`. |
| Nest API (SSR) | `INTERNAL_API_URL` | `http://directus:8055`-style docker alias → in prod `http://<api>:3000`; dev default `http://localhost:3000` | n/a | SSR fetches hit the API directly on the docker network. **Paths are `/v1/...` (no `/api` prefix).** |
| Nest API (browser) | n/a — same-origin `/api/*` proxy | n/a | `/api/v1/...` | `astro.config.mjs` rewrites `/api/*` → API `*` (strips `/api`). Prod mirrors via Caddy/Coolify. Keeps the `__Host-` refresh cookie same-origin under SameSite=lax. **Browser calls `/api/v1/...`; SSR calls `${INTERNAL_API_URL}/v1/...`.** |

**Country-from-host scoping** (`countryFromHost`, cms.ts:197): takes `req.headers.get('host')`, strips port, takes first DNS label; returns `uz|kz|tj`, defaults `uz`. Mirrors API `tenant.middleware`. Every CMS event/partner/recording/stats query injects `filter[country][_eq]=<derived>`. SSR API helpers instead **forward the raw `host` header** so the API resolves the tenant itself.

**Graceful fallback is universal**: every CMS fetch wraps in try/catch and returns `[]` / `null` / hardcoded DEFAULTS on failure + `console.error('[cms] ...')`. Pages degrade to empty/"—"/"coming soon", never 500. Directus `get<T>()` uses `cache: 'no-store'`.

### 2. `lib/cms.ts` exported fetch helpers (Directus readers)

| Helper | Collection | Country-scoped | Fallback | Notes |
|---|---|---|---|---|
| `fetchUpcomingEvents(req, opts?)` | `events` | yes | `[]` | status=published, ends_at>now, sort starts_at, limit 50. `opts`={format,q} → `applyEventFilters` (format enum + title `_icontains`, q≤80). Then `fetchRegisteredCounts`. |
| `fetchPastEvents(req, opts?)` | `events` | yes | `[]` | ends_at<now, sort -ends_at. |
| `fetchEvent(req, id)` | `events` | yes | `null` | single by id; returns null if status≠published OR country mismatch. |
| `fetchRegisteredCounts(ids)` (internal) | `registrations` | no | empty Map | aggregate count groupBy event, status≠cancelled. |
| `fetchPartners(req)` | `partners` | yes | `[]` | sort `sort`, limit 24. |
| `fetchHomepageStats(req)` | `events`+`partners` | yes | counts 0 | aggregate counts, `Promise.all`. |
| `fetchEventCountForCountry(country)` | `events` | arg | 0 | `/global` apex tiles; validates `^[a-z]{2}$`. |
| `fetchRecentRecordings(req, limit=3)` | `event_materials` | via `event.country` | `[]` | kind=recording, event published; deep-filter on parent event. |
| `fetchMarketingAssets({category,country?,limit?})` | `marketing_assets` | optional `_or` country/null | `[]` | **always** status=approved+visibility=public; `assetUrl`=`${BASE}/assets/<file>`. |
| `fetchSiteSettings()` | `site_settings` (singleton) | no | `SITE_SETTINGS_DEFAULTS` | handles bare-object OR array shape. |
| `fetchPressPage()` | `press_page` (singleton) | no | `PRESS_PAGE_DEFAULTS` | same singleton dual-shape guard. |
| `fetchTeamMembers({pressPageOnly?,limit?})` | `team_members` | no | `[]` | active=true, sort display_order; optional appear_on_press_page. |
| `fetchBadgeDefinitions()` | `badge_definitions` | no | `[]` | active=true, sort display_order. |
| `fetchEventSpeakers(eventId)` | `event_speakers`→speakers→directus_users | no | `[]` | status in accepted/confirmed; **handles resolved via `${INTERNAL_API_URL}/v1/users/handles?directusIds=` API round-trip** (handle lives on Postgres `users`, not directus_users). |
| `fetchEventMaterials(eventId)` | `event_materials` | no | `[]` | file→`/assets/<id>` OR external url; drops rows with neither. |
| `fetchEventPhotos(eventId)` | `event_photos` | no | `[]` | Finished-tab gallery. |
| `fetchEventSponsors(eventId)` | `event_sponsors`→sponsors | no | `[]` | deep-join, tier override, logo `/assets/<id>`. |
| `fetchEventQuestions(eventId)` | `event_questions`→directus_users | no | `[]` | Directus perm filters status=published; sort -is_pinned,date_created. |
| `fetchLandingPage(slug)` | `landing_pages` | no | `null` | `/welcome/{slug}`; status=published; slug regex `^[a-z0-9][a-z0-9-]{0,63}$`. |

Mapping helper `toApiEvent` does snake_case→camelCase + `country`→`countryCode`, normalizes external_links (http(s)+kind allowlist), coerces lat/lng decimals (string|number), builds `heroImageUrl`/asset URLs.

### 3. `lib/api.ts` — SSR API helpers + types
`ApiEvent` is the canonical event shape both `api.ts` and `cms.ts` emit (cms is now the primary reader; api.ts version of `fetchUpcomingEvents`/`fetchEvent` is the legacy path hitting `/v1/events`). Also exports `EventSpeaker`, `EventMaterial`, `EventPhoto`, `EventQuestion`, `EventSponsor`, `LeaderboardEntry`, `PublicProfile`. SSR helpers: `fetchUpcomingEvents`, `fetchEvent`, `fetchLeaderboard(req,limit,window=all|year|quarter)`, `fetchProfile(req,handle)` → all forward `host` header to `${INTERNAL_API_URL}/v1/...`, catch+log, return `[]`/`null`. `forms-api.ts`: `fetchForm`, `fetchSurveyEventContext`, `fetchEventSurvey` (uses bot endpoints `/v1/telegram/forms/{slug}`, `/v1/telegram/events/{id}`, `.../survey` because speaker joins need authed API, not public Directus).

### 4. `lib/auth-bootstrap.ts` — V2 MUST replicate verbatim
Solves: single-use refresh tokens + N parallel React islands racing `POST /auth/refresh` → `RefreshTokenReplayError` → server revokes whole family → cross-user RBAC leak + lost session on first load.
- **Two-layer cache.** (1) `window.__AIQADAM_AUTH__` SSR-injected blob (from `middleware.ts` doing ONE server-side `/auth/refresh`+`/auth/me`, injected by Layout.astro). `consumeSsrBlob()` reads it once then nulls the pointer; distinguishes `undefined` (no SSR/prerendered) vs `null` (SSR confirmed anon). (2) Module-level in-flight `Promise` single-flight + 60s TTL (`TTL_MS=60_000`) cache.
- `getAuthState(): Promise<AuthState|null>` — cached-if-fresh → SSR blob → shared in-flight promise. `performBootstrap()` = `POST /api/v1/auth/refresh` (credentials:include) → `{accessToken}` → `GET /api/v1/auth/me` with Bearer.
- `AuthMe = {id,email,authentikSubject,groups[]}`; `AuthState = {accessToken,me}`.
- `resetAuthState()` clears cache + marks SSR consumed (so post-signout doesn't resurrect identity).
- `signOut()` — resolves bearer, resets cache, `POST /api/v1/auth/sign-out` → `{logoutUrl}`, then `window.location = logoutUrl ?? '/auth/signed-out'` (SSO⇒SLO to IdP end_session).
- **middleware.ts** propagates the rotated `set-cookie` from the SSR `/auth/refresh` forward to the browser (else next page sends consumed cookie → replay). Cookies: `aiqadam-refresh` + legacy `__Host-aiqadam-refresh`. Also: `admin.aiqadam.org`/`/admin*` → 302 to `cms.aiqadam.org/admin`; auth skipped for `/api/`,`/_astro/`,`/brand/`,favicon.

### 5. `/api/v1/*` endpoints consumed by the browser (grouped)
- **auth**: `/auth/login`, `/auth/callback`, `/auth/refresh`, `/auth/me`, `/auth/sign-out`
- **events (public)**: `/events`, `/events/:id/register`, `/events/:id/questions` (POST)
- **registrations**: `/registrations/mine`
- **checkin**: `/checkin/:code`
- **me/profile**: `/me/profile`, `/me/profile/consents`, `/me/profile/employments(/:id)`, `/me/profile/interests(/:id)`, `/me/profile/skills(/:id)`
- **me (other)**: `/me/badges`, `/me/access-log`, `/me/preferences/consents`
- **referrals**: `/referrals/issue`, `/referrals/mine`, `/referrals/mine/stats`, `/referrals/resolve`
- **leads**: `/leads`, `/leads/verify`
- **onboard**: `/onboard/preview`, `/onboard/accept`
- **feedback**: `/feedback/csat`
- **telegram (admin+public)**: `/telegram/admin/{status,configure,recent-deliveries,rotate-token,rotate-service-token}`, `/telegram/event-topics`, `/telegram/forms/:slug`
- **admin**: `/admin/invites(/:id)`, `/admin/countries/:id`, `/admin/audit/events`, `/admin/rbac-sync/jobs(/:id)`
- **workspace (operator cabinets)**: `/workspace/{announce,announce/preview,approvals,cohorts,countries,members,partners(/:id),events(/:id),forms(/:id),tg-broadcasts(/:id),tg-segments(/:id),tg-segments/preview,dashboard/cross-country,internal-cron/status}`

### 6. Directus collections consumed (SSR-only, Public policy / null role read)
`events`, `registrations`, `partners`, `event_materials`, `event_photos`, `event_speakers`(+speakers,directus_users), `event_sponsors`(+sponsors), `event_questions`(+directus_users), `marketing_assets`, `landing_pages`. **Singletons (`meta.singleton:true`, recently added, public-read):** `site_settings`, `press_page`. **CRUD-managed, public-read filtered:** `team_members` (active/appear_on_press_page), `badge_definitions` (active). Assets binary at `${CMS_URL}/assets/<file-id>` (public for approved+public marketing_assets; event hero/logos likewise). Public read is bound to the Public policy on the null role per `docs/04-development/architecture/migration-to-directus-centric.md`.


## 4. Cross-cutting (Layout/SEO, i18n, Design Tokens, Geo/Tenancy, Attribution, Analytics)

## Cross-cutting concerns — `/home/drukker/aiqadam/apps/web`

These are the easy-to-forget, app-wide wirings. All paths absolute.

### 1. Layout (`src/layouts/Layout.astro`)
Single root layout. `<html lang="en" data-theme="dark">` — **dark is the hardcoded default theme** (no theme toggle exists).

Props: `title` (default `'AI Qadam'`), `description` (default `'Multi-tenant community platform for AI engineers across Central Asia.'`), `ogType` (`'website'|'article'|'event'`, default `website`), `ogImage`, `canonical`.

`<head>` wiring:
- `<meta name="description">`, `<title>`, `<link rel="canonical">`.
- **Canonical logic**: explicit `canonical` prop wins → else `Astro.url` if host ends with `aiqadam.org` (SSR) → else `Astro.site` (apex, from astro.config). Prerendered pages canonicalize to apex; subdomains treated as locale variants.
- Favicon: `<link rel="icon" type="image/png" href="/brand/aiqadam-mark.png">`.
- **Open Graph**: `og:site_name=AI Qadam`, `og:type`, `og:title`, `og:description`, `og:url` (=canonical), `og:image`, `og:locale=en_US`.
- **Twitter Card**: `summary_large_image`, title/description/image.
- Default OG image = `${origin}/brand/aiqadam-mark.png`; per-page override via `ogImage` (absolute or origin-rooted). Per-event cards generated dynamically at `src/pages/events/[id]/og-card.png.ts` (uses `lib/og-template.tsx` + `lib/og-fonts.ts`, cache-busted by event `date_updated`).
- **Fonts**: Google Fonts preconnect + one stylesheet — `Geist` (400/500/600), `Inter` (400/500/600), `JetBrains Mono` (400/500/600), `display=swap`.
- **Plausible analytics** (self-hosted): `<script is:inline defer data-domain="aiqadam.org" src="https://analytics.aiqadam.org/js/script.js">`. Cookieless. **`data-domain` is hardcoded to `aiqadam.org` for ALL tenants** — not per-subdomain.
- `<slot name="head" />` for per-page head extras.
- **SSR auth handoff**: when middleware ran (`Astro.locals.auth !== undefined`), injects `window.__AIQADAM_AUTH__ = <json>` (with `<` escaped) so React islands render authed UI on first paint without each firing `/auth/refresh` (prevents the island refresh-race). Omitted on prerendered pages.

`<body class="min-h-screen antialiased">`: `<Nav />` → `<slot />` → **attribution capture script** (`import { captureLandingAttribution } from '../lib/attribution'; void captureLandingAttribution();`), runs after paint, idempotent.

### 2. i18n (`src/lib/i18n.ts` + `src/locales/{en,ru}.json`)
- Engine: **i18next**, init-once at module load with bundled JSON.
- Locales: **`en` (default) + `ru` only**. `SUPPORTED_LOCALES = ['en','ru']`, `DEFAULT_LOCALE='en'`.
- **`LOCALE_COOKIE = 'aiqadam-locale'`**.
- `getLocale(astro)`: cookie wins → `Accept-Language` header (first 2 chars) → `en`. On prerendered pages cookie is undefined → always `en`.
- `makeT(locale)` → `t('nav.events')`, supports interpolation/plural; **missing keys return the key itself**.
- Locale files: **~176 leaf keys** each (en 188 / ru 192 raw lines), top-level sections: `nav, country, actions, states, locale, global, profile, leaderboard, event_detail, events_index, home, welcome`.
- **Server-side only**: `.astro` pages + `Nav.astro`. **React islands are locale-blind** — Nav passes individual translated strings as props (`NavAccountMenu`). Data (event titles/dates) is not translated.
- **Locale switcher** lives in `Nav.astro` (`#locale-switcher` `<select>`): on change writes `aiqadam-locale` cookie (`max-age=31536000`, samesite=lax) + `window.location.reload()`.

### 3. Design system (`src/styles/globals.css` → `/home/drukker/aiqadam/design-system/{tokens,components,portal}.css`)
`globals.css` imports Tailwind 4 + three design-system layers, then forces body bg/color/font from tokens. **V2 must keep this token-driven visual language.**
- `tokens.css`: **OKLCH** palette with `:root`/`[data-theme="light"]` and `[data-theme="dark"]` blocks. Key vars: `--background --foreground --card --muted --border --input --primary (brand teal: light oklch(0.58 0.10 192), dark oklch(0.70 0.105 192)) --secondary --accent --success --warning --destructive --ring`. Special: `--live-indicator --badge-{bronze,silver,gold,special} --streak`.
- Fonts: `--font-display:"Geist"`, `--font-sans:"Inter"`, `--font-mono:"JetBrains Mono"`. Radii `--radius-sm..xl`. Shadows `--shadow-sm..lg`. Motion `--ease-out`, `--ease-spring`.
- `components.css` primitives consumed app-wide: **`.btn`** (+ `.btn-sm/-lg/-icon`, `.btn-primary/-secondary/-ghost/-outline/-destructive`), `.input/.textarea/.label/.helper`, `.badge`(+variants)/`.tag`, **`.avatar`** (`-xs..-2xl`, `.avatar-group`, `.status-dot`), `.checkbox/.radio/.switch`, `.tooltip`, `.skeleton`, `.card`, `.container`, `.divider`, `.codechip`, `.sr` (visually-hidden), `.section-*` docs helpers.
- `portal.css`: domain compositions (event-card, podium, scanner, timeline, hero, doc-shell).
- **`.app-nav-link`** is defined locally in `Nav.astro` `<style is:global>` (not in design-system), plus `astro-island { display: contents; }`.

### 4. Geo / tenancy (`src/lib/geo.ts`, used in `src/pages/index.astro`)
Per-country subdomain model: **uz / kz / tj** (real tenants) + **global** (picker) + apex `aiqadam.org`/`www`.
- `APEX_HOSTS = {aiqadam.org, www.aiqadam.org}`; `COUNTRY_BY_CF = {UZ→uz, KZ→kz, TJ→tj}`.
- `hostnameFromHeaders(headers)` reads the **`Host` header** (not `Astro.request.url.hostname` — under node-standalone that's the listen socket).
- `isApexHost`, `geoTargetSubdomain(headers)` (reads **`cf-ipcountry`**, returns mapped code or `'global'`).
- **Apex redirect** fires in `index.astro` (`prerender=false`): if `isApexHost`, `Astro.redirect('https://${geoTargetSubdomain}.aiqadam.org${path}${search}', 302)`. Requires CF orange-cloud proxy to set `cf-ipcountry`; no header → `global`.
- `lib/cms.ts → countryFromHost(host)`: first DNS label if `uz|kz|tj` else **`uz`**. Used by every SSR Directus fetch to scope to tenant. `global.astro` is the apex picker page (per-country event counts via `fetchEventCountForCountry`).
- **Country switcher** in `Nav.astro` (`#country-switcher`): client-side, detects current from `window.location.hostname`, on change navigates to sibling `https://<code>.aiqadam.org<path><search>`; no-op on localhost.

### 5. Attribution / UTM
- `src/lib/attribution.ts` (client): `captureLandingAttribution()` runs once per page (from Layout). Two **90-day, samesite=lax cookies**:
  - **`aiqadam-ref-owner`** ← owner user id resolved by `POST /api/v1/referrals/resolve` from `?ref=` param.
  - **`aiqadam-attribution`** ← JSON `{first_touch, last_touch}` of UTM params (`utm_source/medium/campaign/term/content` + `ts`). **First-touch set once, never overwritten; last-touch overwritten every visit.**
  - `readAttribution()` (pure read) consumed by `src/components/RegistrationSidebar.tsx` (sends `referredBy` + `acquisitionSource` on register) and `src/components/LeadCaptureForm.tsx` (sends `acquisitionSource.first_touch` + reads raw URL utm).
- `src/lib/utm.ts`: canonical **UTM scheme** — `UTM_MEDIUMS` (13 fixed values), source/campaign suggestion lists, strict validation rules (lowercase, `a-z0-9_-`, max 64, no leading/trailing/double hyphen, no `{placeholder}`), and `buildUtmUrl()`. Powers the operator URL-builder UI; medium must be a canonical literal.

### 6. Analytics
- Only client analytics = the Plausible script in Layout (cookieless, `data-domain="aiqadam.org"`, dashboard at `analytics.aiqadam.org`). **There is NO custom-event helper, no `lib/ops-events`, and no `is_test` tagging in apps/web** — Plausible refs in `components/workspace/{RbacSyncList,CountryProvisioningWizard}.tsx` are about *provisioning per-country Plausible sites*, unrelated to client tracking.

### 7. astro.config (`astro.config.mjs`)
- `site: 'https://aiqadam.org'` (apex — feeds Layout canonical/OG defaults).
- **`output: 'static'`** (default) — most pages prerendered; SSR is opt-in per page via `export const prerender = false` (used by index, events, sitemap, robots, me, workspace, etc.). Served by **`@astrojs/node` adapter, `mode:'standalone'`**.
- Integrations: **`@astrojs/react`** (React 19 islands) + **`@tailwindcss/vite`** (Tailwind 4).
- **No `redirects` config** — apex redirect is in-page; `/admin*` + `admin.aiqadam.org` 302→`cms.aiqadam.org/admin` in `src/middleware.ts`.
- Dev proxy `/api/* → http://localhost:3000/*` (strips `/api`); prod mirrors via Traefik per-country `PathPrefix(/api)`.
- `server.port: 4321`.

### Related must-not-forget
- `src/middleware.ts`: runs on every SSR request — admin redirect + SSR auth bootstrap (refresh cookies `aiqadam-refresh` / legacy `__Host-aiqadam-refresh`, calls `/v1/auth/refresh`+`/v1/auth/me`, sets `locals.auth`, propagates rotated set-cookie). Skips `/api/`, `/_astro/`, `/brand/`, `/favicon.ico`.
- `src/pages/robots.txt.ts` (SSR, per-host): disallows `/me /admin/ /api/ /auth/ /workspace/`, emits `Sitemap: https://<host>/sitemap.xml`.
- `src/pages/sitemap.xml.ts` (SSR, per-tenant): static pages + that tenant's events.


## 5. web-next Coverage Matrix + Gap Callouts

## web-next (V2) coverage vs web (V1)

**V2 plan** (`docs/04-development/frontend/web-next-workplan.md`, kickoff in `web-next-kickoff.md`): a greenfield 4-layer rewrite under ADR-0038 (L1 lib hooks → L2 `kit/` atoms → L3 `blocks/` → L4 `pages/`), enforced by `tools/architecture-check.ts`. Blocks/pages may NOT import `lib/api-*` or call raw `fetch` or use inline `style=`; new pages must be generated (`@generated-from` marker). Build-aside is deployed at `next.aiqadam.org` with `noindex`; cutover (M4) is a HUMAN Coolify-UI step.

**Milestones**: M0 sitewide shell (CountrySwitcher/LocaleSwitcher #454, AppNav+AccountChip #455 — DONE), M1 foundational blocks (Form, Drawer, AsyncSelect, ActionBar, Wizard, FormBuilder, Tooltip — NOT STARTED), M2 operator cabinet completion (write tiers — NOT STARTED), M3 customer cutover pages (NOT STARTED), M4 cutover. Shipped so far: Phase-1 customer read surfaces + Phase-2 operator **list/read** cabinets (#442–#449). The plan is full-parity (no drop list).

### Coverage matrix

| Area | Status | Evidence |
|------|--------|----------|
| Sitewide shell (nav/header/account chip, country+locale switch) | DONE | `blocks/common/AppNav.astro`, `AccountChip.tsx`, `CountrySwitcher.astro`, `LocaleSwitcher.astro` |
| Home `/` | DONE (lean) | `pages/index.astro`, `blocks/customer/Hero.astro` |
| Events list `/events` | DONE | `pages/events.astro`, `blocks/customer/EventsGrid.astro` |
| Event detail `/events/[id]` | IN-PROGRESS | `pages/events/[id].astro` — fetches speakers/materials/sponsors/questions+forum, BUT **no photos, no recap/livestream/map/finished-vs-live tabs** (V1 fetches `fetchEventPhotos` + 6 fetchers; tabs deferred per block header) |
| Leaderboard `/leaderboard` | DONE | `pages/leaderboard.astro`, `blocks/customer/Leaderboard.astro` |
| Public profile `/u/[handle]` | DONE | `pages/u/[handle].astro`, `ProfileCard.astro` (404→/leaderboard parity) |
| `/me` hub + dashboard richness | IN-PROGRESS | only `pages/me/profile.astro` (Consent + Skills editors). **No `/me` hub, badges strip, attendance heatmap, stat cards, registrations/QR, access-log, referrals, preferences** |
| `/me/preferences`, `/me/access-log`, `/me/referrals` | NOT STARTED | V1: `pages/me/{preferences,access-log,referrals}.astro` + `MeAccessLog/MyReferrals/PreferencesForm` |
| Auth pages `/auth/sign-in`, `/auth/signed-out` | NOT STARTED | M3.1; V1 `pages/auth/*` (signed-out is SLO-landing-critical) |
| Public forms `/forms/[slug]` | NOT STARTED | M3.3; V1 `FormRenderer.tsx` + 7 field types in `components/forms/` |
| Onboarding `/onboard`, `/welcome/[slug]`, `/checkin` | NOT STARTED | M3.4/3.5 (Telegram acquisition funnel + check-in) |
| Leads funnel + CSAT + survey | NOT STARTED | M3.6; V1 `pages/leads/*`, `feedback/csat.astro`, `events/[id]/survey.astro` |
| Press `/press`, `/global`, `/marketing/url-builder` | NOT STARTED | M3.7; **no `pages/press.astro` in web-next** |
| Operator cabinets — list/read | DONE | `members`, `admin/users` (invites), `dashboard`, `admin/audit`, `partners`, `approvals`, `events`, `forms` index pages + matching `blocks/workspace/*List.tsx` |
| Operator cabinets — write/detail | NOT STARTED | M2: no `events/[id]` control panel, `partners/[slug]`, announce, country provisioning, forms builder+responses, **all Telegram** (segments/broadcasts), cron, rbac-sync, countries admin |
| CMS integration (Directus SSR) | IN-PROGRESS | `lib/cms.ts` ports site_settings + event speakers/materials/sponsors/questions only. **Missing: partners, past events, photos, badge_definitions, team_members, press_page, marketing_assets, landing_pages, homepage stats, recent recordings, per-country event counts** |
| Auth bootstrap / race dedup | IN-PROGRESS | `lib/use-auth.ts` + `RuntimeProvider.tsx` (TanStack) — verify it preserves V1's SSR-blob + in-flight-Promise dedup |
| i18n (en/ru) | NOT STARTED | **no `locales/`, no `lib/i18n.ts`** in web-next |
| Geo gating | NOT STARTED | **no `lib/geo.ts`** (visibility-scope event gating not ported) |
| Attribution / UTM | NOT STARTED | **no `lib/attribution.ts`, `utm.ts`** (deferred to M4 step 2) |
| OG card / fonts | NOT STARTED | **no `lib/og-template.tsx`, `og-fonts.ts`, events/[id]/og-card.png.ts** |
| robots.txt / sitemap.xml | NOT STARTED | V1 `pages/robots.txt.ts`, `sitemap.xml.ts`; web-next ships static noindex `robots.txt` |
| Design tokens | DONE | `styles/globals.css`, `kit/` atoms, `components.json` (shadcn) |

### Easy-to-miss in a rebuild (recent V1 customer-surface work)

1. **Badges system** — `badge_definitions` Directus taxonomy (`fetchBadgeDefinitions` in V1 cms.ts), `/api/v1/me/badges`, recent-badges strip + per-category tints in `MeDashboard.tsx`, and badge strips on `/u/[handle]`. None ported.
2. **`/me` dashboard richness** — `MeDashboard.tsx` is 1180 lines: registrations w/ status badges + QR, 90-day attendance heatmap, stat cards, badges strip, SSR-suggested events. web-next has only consent+skills editors.
3. **Plus-addressing email ban** — `apps/api/src/lib/email-schema.ts` `emailField()` rejects `+` in local part at every creation boundary (lead capture, invites, onboarding). Any new V2 form posting email must reuse it.
4. **CMS singletons + fallback pattern** — `site_settings` + `press_page` are Directus singletons returned as bare object OR array; both guard both shapes and fall back to hardcoded defaults so the page never 500s on Directus outage. V2 ported only site_settings; press_page/team_members/marketing_assets/badge_definitions/landing_pages not yet.
5. **Auth-race dedup** — `lib/auth-bootstrap.ts`: SSR-injected `window.__AIQADAM_AUTH__` blob (one-shot consume) + module-level in-flight Promise; eliminated the parallel-island /refresh race that revoked refresh families and leaked cross-user RBAC. V2's `use-auth.ts` must preserve this exact dedup + the reset-on-sign-out semantics.
6. **`/press` SSR requirement** — `prerender=false` is load-bearing: build-time prerender can't reach internal `directus:8055`, so fetches returned empty and silently served fallback prose. Same trap applies to any V2 page reading live Directus.
7. **Event-detail visibility gating** — V1 gates speakers/materials/photos/sponsors/questions behind `isGated` (visibility_scope); V2 fetches unconditionally — port the gate. V1 also renders photos + recap/livestream tabs that V2 omits.
8. **prerender=false on every dynamic/auth-aware route** (per memory: typecheck/biome miss it; only `pnpm build` catches).


---

## MUST-COVER CHECKLIST (consolidated)


_Every discrete behavior the live app has. V2 is not done until each is covered or explicitly descoped._

- [ ] Country homepage `/` with apex→geo 302 redirect, hero/grid/stats/partners/recordings/lead-capture (SSR, Directus + API)
- [ ] Events index `/events` with timeline|grid toggle, upcoming|past tab, format filter, `?q` search — all server-side
- [ ] Event detail `/events/[id]` with 4 tabs (upcoming/live/finished/forum), OSM map + maps deep-links, speakers/materials/photos/recordings/sponsors, members_only gate, JSON-LD + OG card
- [ ] Post-event survey `/events/[id]/survey` rendering attached form with event-context header (404 if none)
- [ ] Account dashboard `/me` with SSR suggested-events filtering out registered
- [ ] Account `/me/profile` (profile core, 7 consents, skills)
- [ ] Account `/me/preferences` (comms preferences)
- [ ] Account `/me/referrals` (referral code + attributed signups)
- [ ] Account `/me/access-log` (member-facing audit transparency)
- [ ] Leaderboard `/leaderboard` with podium, `?window` scope, clickable handles, self-row highlight via auth-bootstrap
- [ ] Public profile `/u/[handle]` with bio, stats, 52-week heatmap, recent events (404→leaderboard)
- [ ] Auth `/auth/sign-in` 302 to Authentik login with safe `next` validation
- [ ] Auth `/auth/signed-out` post-logout confirmation (RP-initiated logout target)
- [ ] Press kit `/press` (boilerplate, leadership+headshots, logos, palette, fact-sheet, digests, coverage from Directus marketing_assets)
- [ ] Marketing `/marketing/url-builder` UTM builder operator tool
- [ ] Operator landing `/workspace` role router
- [ ] Operator `/workspace/dashboard` country-scoped events/registrations/attendance/CSAT
- [ ] Operator `/workspace/events` list + `/workspace/events/[id]` control panel
- [ ] Operator `/workspace/members` directory with cohorts/saved filters
- [ ] Operator `/workspace/approvals` queue
- [ ] Operator `/workspace/announce` composer
- [ ] Operator `/workspace/partners` list + `/workspace/partners/[slug]` detail
- [ ] Operator forms `/workspace/forms`, `/workspace/forms/[id]` builder, `/workspace/forms/[id]/responses`
- [ ] Super-admin `/workspace/admin/users` + `/workspace/admin/users/new` operator invites
- [ ] Super-admin `/workspace/admin/audit` full audit log
- [ ] Admin `/workspace/admin/countries` defaults + `/workspace/admin/countries/[code]/provisioning` wizard
- [ ] Operator `/workspace/admin/cron` internal cron health
- [ ] Super-admin `/workspace/admin/rbac-sync` jobs + retry
- [ ] Telegram cabinet `/workspace/integrations/telegram` + broadcasts list/new/[id] + segments
- [ ] Public form render `/forms/[slug]` (anon submit, 404 if missing)
- [ ] CSAT `/feedback/csat` via tokenized `?t=` link (token-as-credential)
- [ ] Campaign landing `/welcome/[slug]` markdown body + UTM/ref CTA carry-through (drafts 404)
- [ ] Event check-in `/checkin`
- [ ] Operator onboarding `/onboard` (token-as-credential: password/AUP → Gmail+CF verify → Resend key)
- [ ] Country picker `/global` splash with per-country event counts
- [ ] Lead funnel `/leads/thank-you`, `/leads/verified`, `/leads/verify-failed`
- [ ] SSR auth-bootstrap middleware (single `/auth/refresh`, `window.__AIQADAM_AUTH__`, refresh-cookie rotation) + admin-host→Directus redirect
- [ ] OG card image endpoint `/events/[id]/og-card.png` (verify handler)
- [ ] i18n locale resolution (cookie+Accept-Language) and geo redirect helpers shared across pages
- [ ] Sticky top Nav with brand mark, Events/Leaderboard/Account-or-Sign-in links, country subdomain switcher, and locale-cookie switcher, gated on server-verified Astro.locals.auth
- [ ] NavAccountMenu: initials-avatar popover with role-gated Workspace + Engineering Deck links (Authentik groups) and SSO sign-out
- [ ] Unify ALL islands onto one shared getAuthState() helper (SSR __AIQADAM_AUTH__ blob + deduped refresh) — eliminate the direct-refresh races in event + workspace islands
- [ ] MeDashboard hero: avatar, role chip, 6-signal profile-completeness nudge, next-event gradient hero with QR, 3 stat cards, 13-week activity heatmap, badges strip, suggested events (dedup), quick actions
- [ ] BadgesStrip: newest-6 category-tinted badge pills from /me/badges, hidden when zero
- [ ] MeProfileForm: profile core + 5 visibility toggles, 7-purpose consents, skills/interests/employments add-remove with optimistic per-section updates
- [ ] PreferencesForm: 3 email-topic consent toggles with optimistic pending state
- [ ] MyReferrals: idempotent 6-char code mint, share-URL copy, friends-attended stats + Brought-a-friend badge, attribution explainer
- [ ] MeAccessLog: severity-colored security event log with empty/error states
- [ ] RegistrationSidebar: Register/waitlist/cancel CTA with optimistic local count+status and referral/UTM attribution from cookies
- [ ] EventForum: SSR-seeded Q&A with signed-in post (pinned/answered badges, char counter, optimistic prepend, empty state)
- [ ] EventShareButtons: channel share links embedding member ?ref=CODE when signed in (+25pts hint), best-effort
- [ ] CheckinForm: ?code= scan → check-in with no-code/busy/done/error + already-checked-in states
- [ ] CsatForm: token-only 1-5 rating + comment (202 success / 409 already)
- [ ] FormRenderer + 6+ field types (short_text/long_text/scale/select_one/select_many/yes_no/speaker_rating), anon submit, sign-in lock when allow_anonymous=false
- [ ] LeadCaptureForm: anonymous email+city(datalist)+interest-topic chips+honeypot, UTM first-touch capture, inline success
- [ ] UtmUrlBuilder: pure client UTM link builder with live preview + copy
- [ ] OnboardingForm: invite preview → password+AUP accept → mailbox-ready screen (410 Gone handling)
- [ ] Astro SSR event displays: EventsGrid, UpcomingEventsGrid, EventsTimeline (month-grouped), HomeHero countdown
- [ ] Workspace shell + AppLauncher: sidebar nav, app-launcher cards (Gatus/Plausible/Directus/Authentik) with engineer-scope badge, anon auto-redirect
- [ ] OperatorDashboard cabinet: per-country + cross-country metrics with 7/30/90d range
- [ ] MemberDirectory cabinet: member search + cohort builder with 7 Directus-native filters
- [ ] AnnounceComposer cabinet: cohort-pick → compose → preview → send
- [ ] ApprovalsQueue cabinet: pending-approvals queue with per-source roadmap empty state
- [ ] EventsListPanel + EventControlPanel cabinets: list and single-event metadata edit, registration breakdown, followup checklist, CSAT
- [ ] FormsListPanel + FormBuilderPanel + FormResponsesPanel cabinets: list, field editor (reorder), aggregate rollup (NPS histogram) + paginated raw table with anonymous badging
- [ ] CountriesAdmin + CountryProvisioningWizard cabinets: country profile edit (super-admin) + provisioning state machine with per-step retry
- [ ] Admin cabinets: AdminInvitesList (revoke, token_prefix), AdminUserCreateForm (one-time invite URL), AuditEventsList, RbacSyncList (retry), InternalCronStatusTable
- [ ] Partner cabinets: PartnersList + PartnerView (audiences/cohorts)
- [ ] Telegram cabinets: TelegramCabinet (status/identity/deliveries/rotate-token), TgSegmentsList+CriteriaBuilder (DSL chip builder + JSON escape hatch + live preview), TgBroadcastsList + TgBroadcastComposer (draft/schedule, <=8 buttons, HTML safe subset)
- [ ] All operator cabinets: anon auto-redirect to /api/v1/auth/login and clean 403 super-admin-only messaging
- [ ] Preserve dual BASE-URL pattern: Directus via CMS_URL (https://cms.aiqadam.org, same for SSR/dev/3rd-party) including /assets/<file-id> binaries
- [ ] Preserve SSR API base INTERNAL_API_URL hitting /v1/* on docker network (no /api prefix); dev default http://localhost:3000
- [ ] Preserve same-origin /api/* → API proxy (strip /api) so browser calls /api/v1/* and refresh cookie stays same-origin SameSite=lax
- [ ] Implement countryFromHost(host): strip port, first DNS label, return uz|kz|tj else uz; inject filter[country][_eq] on every CMS events/partners/recordings/stats query
- [ ] SSR API helpers forward raw incoming host header so API tenant.middleware resolves country
- [ ] Every CMS reader try/catch → return []/null/hardcoded DEFAULTS + console.error; never 500 the page; use cache:'no-store'
- [ ] Reimplement fetchUpcomingEvents/fetchPastEvents with status=published, ends_at vs now, format+q (icontains, q≤80) filters, registered-count aggregation
- [ ] Reimplement fetchEvent with country+status guard returning null on mismatch
- [ ] Reimplement fetchPartners, fetchHomepageStats (aggregate counts), fetchEventCountForCountry (^[a-z]{2}$), fetchRecentRecordings (kind=recording, event.country/status deep filter)
- [ ] Reimplement fetchMarketingAssets always forcing status=approved+visibility=public with optional _or country/null and assetUrl builder
- [ ] Reimplement fetchSiteSettings + fetchPressPage as singletons handling bare-object OR array shape with full DEFAULTS fallback
- [ ] Reimplement fetchTeamMembers (active, display_order, pressPageOnly) and fetchBadgeDefinitions (active, display_order)
- [ ] Reimplement fetchEventSpeakers with accepted/confirmed filter AND the /v1/users/handles directusIds API round-trip to resolve handles
- [ ] Reimplement fetchEventMaterials/fetchEventPhotos/fetchEventSponsors/fetchEventQuestions with deep-joins, asset-url building, and drop-invalid-row normalization
- [ ] Reimplement fetchLandingPage with status=published + slug regex ^[a-z0-9][a-z0-9-]{0,63}$
- [ ] Keep ApiEvent as the canonical event shape (snake→camel, country→countryCode) shared across cms and api layers
- [ ] Replicate auth-bootstrap two-layer cache: window.__AIQADAM_AUTH__ SSR blob (consume-once, undefined vs null semantics) + module-level single-flight Promise + 60s TTL
- [ ] Replicate getAuthState single-flight so only ONE /auth/refresh runs across all parallel islands (prevents single-use refresh token replay + cross-user RBAC leak)
- [ ] Replicate performBootstrap: POST /api/v1/auth/refresh (credentials include) then GET /api/v1/auth/me with Bearer; AuthMe={id,email,authentikSubject,groups[]}
- [ ] Replicate resetAuthState (mark SSR consumed) and signOut (sign-out → logoutUrl, SSO⇒SLO, fallback /auth/signed-out)
- [ ] Replicate middleware SSR auth bootstrap: server-side /auth/refresh+/auth/me once per page, propagate rotated set-cookie forward, support aiqadam-refresh + legacy __Host- cookie, skip /api//_astro//brand/
- [ ] Wire the full /api/v1 endpoint surface: auth, events, registrations, checkin, me/profile(+sub-resources), me/badges, me/access-log, me/preferences, referrals, leads, onboard, feedback/csat, telegram admin+forms+topics, admin invites/countries/audit/rbac-sync, workspace cabinet endpoints
- [ ] Configure Directus Public-policy read for all consumed collections incl. new singletons site_settings + press_page and CRUD collections team_members + badge_definitions
- [ ] Provide a single root Layout with title/description/ogType/ogImage/canonical props and sensible defaults (title 'AI Qadam', the Central-Asia description)
- [ ] Render <html lang data-theme="dark"> with dark as the hardcoded default theme
- [ ] Implement canonical-URL logic: explicit prop > SSR request URL when host ends with aiqadam.org > apex Astro.site
- [ ] Emit full SEO head: description meta, canonical link, png favicon (/brand/aiqadam-mark.png)
- [ ] Emit Open Graph tags (og:site_name, og:type, og:title, og:description, og:url=canonical, og:image, og:locale=en_US) with brand-mark default OG image and per-page override
- [ ] Emit Twitter summary_large_image card (title/description/image)
- [ ] Generate per-event dynamic OG cards at events/[id]/og-card.png, cache-busted by event date_updated
- [ ] Load Geist + Inter + JetBrains Mono via Google Fonts with preconnect and display=swap
- [ ] Inject the self-hosted Plausible script (defer, data-domain=aiqadam.org, analytics.aiqadam.org) on every page, cookieless
- [ ] Implement SSR auth handoff: inject window.__AIQADAM_AUTH__ from middleware Astro.locals.auth (escape <), omit on prerendered pages, so islands skip per-island /auth/refresh
- [ ] Mount Nav globally and run captureLandingAttribution() once per page after paint
- [ ] Support exactly en (default) + ru locales via i18next with bundled JSON, missing keys returning the key
- [ ] Honor the LOCALE_COOKIE 'aiqadam-locale': cookie > Accept-Language > en; provide makeT with interpolation
- [ ] Keep ~176 i18n keys across the sections nav/country/actions/states/locale/global/profile/leaderboard/event_detail/events_index/home/welcome
- [ ] Do i18n server-side in .astro; pass translated strings as props to React islands (islands stay locale-blind)
- [ ] Provide a locale switcher that writes the aiqadam-locale cookie and reloads
- [ ] Consume the design-system token layers (tokens/components/portal.css) and force body bg/color/font from tokens
- [ ] Preserve OKLCH token palette incl. brand-teal --primary and light/dark [data-theme] variants
- [ ] Preserve design tokens for fonts (--font-display/sans/mono), radii, shadows, motion easings, and badge/streak specials
- [ ] Preserve utility classes: .btn (+ size/variant modifiers), .input/.textarea/.label, .badge/.tag, .avatar (sizes/group/status-dot), .card, .container, .sr, .skeleton, .app-nav-link
- [ ] Model tenancy as uz/kz/tj subdomains + global picker + apex; derive country from Host header first-label (default uz)
- [ ] Read hostname from the Host header, never from Astro.request.url.hostname
- [ ] Redirect apex (aiqadam.org/www) to <country>.aiqadam.org using cf-ipcountry (302), falling back to global when header absent
- [ ] Provide a client country switcher that navigates to the sibling country subdomain
- [ ] Scope every SSR Directus fetch to the Host-derived country via countryFromHost
- [ ] Capture ?ref= into aiqadam-ref-owner cookie via POST /api/v1/referrals/resolve (90-day, samesite=lax)
- [ ] Capture UTM params into aiqadam-attribution cookie as first_touch (set once) + last_touch (overwrite each visit)
- [ ] Read attribution cookies at registration (RegistrationSidebar sends referredBy + acquisitionSource) and lead capture (first_touch)
- [ ] Provide the canonical UTM scheme + validation + buildUtmUrl (13 fixed mediums, strict char/length rules) for the operator URL builder
- [ ] Do NOT add a custom analytics-event helper or is_test tagging in the web app (Plausible client is fire-and-forget only)
- [ ] Configure Astro: site=https://aiqadam.org, output static with per-page prerender=false opt-in, @astrojs/node standalone adapter
- [ ] Configure Astro integrations: @astrojs/react (React 19 islands) + @tailwindcss/vite (Tailwind 4)
- [ ] Keep apex redirect in-page and /admin + admin.aiqadam.org 302 to cms.aiqadam.org/admin in middleware (no astro redirects block)
- [ ] Run SSR middleware for admin redirect + auth bootstrap (refresh/me, propagate rotated cookie), skipping /api,/ _astro,/brand,/favicon
- [ ] Serve per-host robots.txt (disallow /me /admin/ /api/ /auth/ /workspace/, Sitemap link) and per-tenant sitemap.xml
- [ ] Port full /me hub + MeDashboard richness: registrations with status badges + check-in QR, 90-day attendance heatmap, stat cards, recent-badges strip, SSR-suggested events
- [ ] Add /me/preferences (wires ConsentList, GDPR-load-bearing), /me/access-log, /me/referrals pages
- [ ] Build badges system end-to-end: fetchBadgeDefinitions Directus reader, /api/v1/me/badges consumption, badge strips on /me and /u/[handle]
- [ ] Complete event-detail: fetch event_photos, add finished/live/forum tabs, recap_md, livestream_url, and the map embed (lat/lng); apply the isGated visibility-scope gate to all sub-fetches
- [ ] Port CMS readers missing from web-next cms.ts: partners, past events, event_photos, badge_definitions, team_members, press_page, marketing_assets, landing_pages, homepage stats, recent recordings, per-country event counts
- [ ] Preserve the singleton-or-array + hardcoded-default fallback pattern for every Directus singleton/collection reader
- [ ] Add /auth/sign-in and /auth/signed-out (SLO RP-logout landing is required by the sign-out flow)
- [ ] Add /press (SSR, prerender=false), /global apex page, and /marketing/url-builder UTM builder
- [ ] Add /forms/[slug] public submission rendering the FormBuilder schema with all 7 field types and allow_anonymous handling
- [ ] Add /onboard, /welcome/[slug], /checkin, leads funnel pages, /feedback/csat, /events/[id]/survey
- [ ] Build all M1 foundational blocks (Form, Drawer, AsyncSelect, ActionBar, Wizard, FormBuilder, Tooltip) before their dependent write-cabinets
- [ ] Build operator write/detail cabinets: events/[id] control panel, partners/[slug], announce composer, country provisioning wizard, forms builder + responses inbox, admin/cron, admin/rbac-sync, countries admin
- [ ] Build all Telegram operator cabinets: integrations index, segments builder, broadcasts composer + actions
- [ ] Port i18n: locales/en.json + ru.json and lib/i18n.ts (locale cookie wiring exists via LocaleSwitcher but no translation layer)
- [ ] Port lib/geo.ts visibility/geo gating
- [ ] Reuse the API emailField() plus-addressing ban on every V2 form that submits an email
- [ ] Preserve auth-bootstrap dedup in use-auth.ts: SSR-injected window blob one-shot consume + in-flight Promise dedup + reset-on-sign-out
- [ ] M4 cutover re-enable: remove noindex + robots Disallow, re-add canonical + full OG/Twitter block + Plausible script + Google-Fonts preconnect + captureLandingAttribution; add lib/attribution.ts + utm.ts
- [ ] Port OG card generation: lib/og-template.tsx, og-fonts.ts, events/[id]/og-card.png.ts (with date_updated cache buster)
- [ ] Replace static robots.txt with dynamic robots.txt.ts + add sitemap.xml.ts
- [ ] Set prerender=false on every dynamic/auth-aware/live-Directus page (only pnpm build catches a miss)