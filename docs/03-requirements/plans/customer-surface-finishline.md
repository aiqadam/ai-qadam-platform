# Customer-Surface Finish Line

**Status:** Proposed (2026-05-24).
**Owner:** PM.
**Author:** Claude Code session (auto-audit).
**Goal:** Lock down every customer-facing surface — main page, leaderboard, account page, events, public profiles — and inventory the static-to-CMS work + counter/trigger gaps that need to be addressed before we pivot to the operator-UX rebuild.

This doc is the single source of truth for "what's left to ship for customer-facing v1." Operator-UX (the `/workspace/*` cabinet debt) is **out of scope** here and will be planned separately after this work lands.

---

## 1. Customer-Facing Page Status

Audit of every page under `apps/web/src/pages/` that a signed-out or signed-in member can land on. Operator (`/workspace/*`) and auth-flow (`/auth/*`) pages excluded.

| Status | Page | Issues | Action |
|---|---|---|---|
| ✅ DONE | `/me`, `/me/profile`, `/me/preferences`, `/me/referrals`, `/me/access-log` | U-Me1a/b/c shipped this session. Badges + Points deferred. | Polish PR (below) |
| ✅ DONE | `/events`, `/events/[id]`, `/events/[id]/survey` | Fully Directus-backed. | None |
| ✅ DONE | `/u/[handle]` (public profile) | F-WebU15. Heatmap, stats, recent events. | None |
| ✅ DONE | `/global` (country picker) | i18n'd, dynamic country counts. | None |
| ✅ DONE | `/welcome/[slug]` (campaign LPs) | F-WebU17. Directus-backed. | None |
| ✅ DONE | `/forms/[slug]`, `/feedback/csat` | Operator-built forms / token-gated CSAT. | None |
| ✅ DONE | `/leads/thank-you`, `/leads/verified`, `/leads/verify-failed` | Static confirmation pages. | None |
| ✅ DONE | `/checkin`, `/onboard`, `/marketing/url-builder` | Functional. `/checkin` uses out-of-brand Tailwind classes (cosmetic). | Optional cosmetic fix |
| 🟡 INCOMPLETE | `/` (homepage) | `countriesServed = 3` hardcoded; partner + recordings empty-states render but never populated until Directus fills. | C-1 (homepage CMS) |
| 🟡 INCOMPLETE | `/leaderboard` | Country, streak, rank-change columns hardcoded `—`. "Your row" highlight deferred. | C-2 (leaderboard fill-in) |
| 🟡 INCOMPLETE | `/press` | Headshots, fact sheet, quarterly digests, press coverage all gated on Directus uploads. Leadership names + bios still in JSX. | C-3 (press CMS) |
| 🟡 INCOMPLETE | `/me` (account page) | Badges deferred (no collection schema in place); Points stat shows `—`. Header has duplicate Sign-out. | C-4 (account polish + badges) |

**Net:** 20 pages, 4 incomplete. Everything else is production-ready.

---

## 2. Static → Dynamic (CMS) Migration Inventory

Customer-facing content currently hardcoded in JSX/Astro that should move to Directus so operators can edit without PRs. **i18n keys are NOT in scope** — those are the right tool for UI microcopy.

### High priority (operator changes monthly)

| Source | What | Suggested Directus home |
|---|---|---|
| `pages/index.astro:59` | `countriesServed = 3` hardcoded | New: `site_settings` singleton |

### Medium priority (operator changes quarterly)

| Source | What | Suggested Directus home |
|---|---|---|
| `pages/index.astro:195,216` | Telegram channel URL + `partners@aiqadam.org` mailto | `site_settings.social_links`, `site_settings.contact_emails` |
| `pages/press.astro:92,95,111,115` | Press hero headline + company boilerplate + `press@aiqadam.org` + SLA copy | New: `press_page` singleton |
| `pages/press.astro:157,164–168,197,202,204–208` | Founder + COO names, titles, bios | New: `team_members` collection |
| `pages/press.astro:225–228` | Logo usage guidelines copy | New: `brand_guidelines` singleton |
| `layouts/Layout.astro:17` | Default meta description ("Multi-tenant community platform…") | `site_settings.default_description` |
| `components/LeadCaptureForm.tsx:11–23` | Interest topics array (`'AI/ML', 'LLMs', 'fintech', …`) | New: `lead_form_config.interest_topics` |
| `components/LeadCaptureForm.tsx:186–191` | City presets (`Tashkent, Samarkand, Almaty, …`) | `lead_form_config.city_presets` |
| `components/LeadCaptureForm.tsx:265,268` | Form title + subtitle | `lead_form_config.title`, `lead_form_config.subtitle` |

### Low priority (operator changes annually or never)

| Source | What | Suggested Directus home |
|---|---|---|
| `pages/press.astro:59–70` | Brand color palette names + values | `brand_guidelines.color_palette` (or keep — design token) |
| `pages/leads/thank-you.astro:10–25` | Confirmation page title/headline/body/CTA | Move to i18n, NOT Directus |
| `layouts/Layout.astro:60,86` | OG site name "AI Qadam"; Plausible domain | Both stay in env/layout; brand-name change is rare enough |

### Net new Directus collections required

For "everything customer-facing → CMS" we need to create:

1. **`site_settings`** singleton — `countries_served`, `default_description`, `social_links` (JSON), `contact_emails` (JSON keyed by purpose: partners/press/legal/support).
2. **`press_page`** singleton — hero_title, company_boilerplate, contact_sla, contact_guidance, seo_description.
3. **`team_members`** collection — name, title, bio (markdown), headshot (→ `marketing_assets` FK), `display_order`, `appear_on_press_page` (bool).
4. **`brand_guidelines`** singleton — color_palette (array), logo_usage_copy (markdown).
5. **`lead_form_config`** singleton — title, subtitle, success_headline, success_message, interest_topics (array), city_presets (array).

**Out of scope for this phase** (capture for future):
- `legal_pages` (ToS, Privacy, Community Guidelines) — not yet drafted.
- `faq` — no FAQ page exists yet.
- `help_articles` — Sprint-X concern.
- `testimonials` — none exist yet.
- `announcements` (site banners) — no current need.
- `ui_strings` (move locale JSON into Directus) — premature; keep in JSON until ops actually edit.

---

## 3. Counters & Triggers — What's Wired, What's Missing

### Counters (state that increments on user action)

| Counter | Storage | Maintenance | Status |
|---|---|---|---|
| Event registered count | `registrations.status='registered'` aggregate | Computed-on-read | ✅ |
| Event waitlist count | `registrations.status='waitlisted'` aggregate | Computed-on-read | ✅ |
| Leaderboard points (per user) | `point_awards` rows | Eagerly written (rows on check-in + referral), aggregated on read | ✅ |
| Check-in count (user × event) | `registrations.status='attended'` + `checked_in_at` | Eagerly maintained, idempotent | ✅ |
| Cohort member count | `cohorts.member_count_cached` | Cached + delta-on-read | ✅ |

### Triggers (side effects)

| Trigger | Source | Receiver | Reliability |
|---|---|---|---|
| Registration-confirmed email | flows-bootstrap.sh:288–314 | Resend via `/v1/internal/interactions/dispatch` | Fire-and-forget |
| Registration-waitlisted email | flows-bootstrap.sh:266–286 | Resend | Fire-and-forget |
| Waitlist-promotion email | flows-bootstrap.sh:442–463 | Resend | Fire-and-forget |
| Check-in → +10 points | flows-bootstrap.sh:663–686 | `point_awards` row | Idempotent via dedupe guard |
| Referee-attended → +25 points + `brought_a_friend` badge | registrations-directus.service.ts:291–376 | `point_awards` + `member_badges` | Best-effort, never blocks check-in |
| Lead-verify email | leads.service.ts:55–72 | Resend | Awaited but fire-and-forget |
| Lead-converted-to-member email | leads.service.ts:110–130 | Resend | Fire-and-forget |
| Audit-event log | audit-events.service.ts:57–78 | Directus `audit_events` | Fire-and-forget with warn-on-failure |
| Telegram outbox dispatch | telegram/outbox-relay.service.ts | Redis Streams `tg.dispatch.v1` | At-least-once (outbox pattern) |
| EULA acceptance | registrations-directus.service.ts:127–134 | `eula_acceptances` + `consent_records` | Synchronous, transaction-backed |

### Missing counters / triggers (gaps)

| Gap | Why it matters | Recommendation |
|---|---|---|
| **Lifetime attended count** per user (no eager counter) | `/me` heatmap recomputes on every render; `/u/[handle]` does the same | Defer — current load is fine; add only if perf becomes an issue |
| **No-show tracking** (registered but didn't check in) | Operators need this for capacity planning + comms | Add `status='no_show'` to registrations, flip via post-event cron |
| **Check-in streaks** (consecutive attended events) | Heatmap shows it but no streak field; gamification opportunity | Defer — heatmap is enough for v1 |
| **First-event-registered trigger** | New members get no welcome moment | Add a one-shot email on first `registered` row |
| **General badge-award flow** (only `brought_a_friend` exists today) | Account page has no badges to render | Define 4–6 starter badges + awarder; biggest single missing piece |
| **Profile-edit audit** | Compliance gap — admin actions are audited but user self-edits aren't | Add audit emit on `/me/profile` PATCH paths |
| **Consent-withdrawal trigger** | State change happens, no confirmation email | Add a confirmation email when a consent flips to `revoked` |
| **Referral-link click tracking** | We track conversions but not clicks; can't compute CTR | Add a redirect endpoint that logs clicks before forwarding |

---

## 4. Proposed Execution Sequence

Ordered list of PRs to close out customer-facing v1. Each item is a separate PR sized to the 400-line guideline.

### Phase C-1: Customer-page completion (4 PRs)

| # | PR | What | Est. lines |
|---|---|---|---|
| C-1 | Homepage CMS — `site_settings` singleton + `countriesServed` etc. | Create `site_settings` collection. Move countries_served, social URLs, contact emails. | ~250 (schema + web) |
| C-2 | Leaderboard fill-in | Wire country / streak / rank-change columns; highlight "your row" when signed in. Backend likely needs minor work to expose these. | ~300 (api + web) |
| C-3 | Press kit CMS — `press_page` + `team_members` + `brand_guidelines` | Three new singletons / collection. Move all hardcoded press prose. Headshots already use marketing_assets. | ~400 (schema + web) |
| C-4 | Account polish + badges schema | Define 4–6 starter badges; member_badges renderer on `/me`; delete duplicate header Sign-out; hide Points until backed. | ~350 (schema + awarder + UI) |

### Phase C-2: Trigger gaps (3 PRs)

| # | PR | What | Est. lines |
|---|---|---|---|
| T-1 | First-event welcome email | Resend template + flow trigger on first `registered` row. | ~150 |
| T-2 | Badge awarder service | Generic awarder firing on attended count milestones (1st event, 5th event, etc.); plus the `brought_a_friend` already wired. | ~250 |
| T-3 | Profile-edit audit emit | One-line emit on each PATCH path under `/me/profile`. | ~80 |

### Phase C-3: Static→dynamic finish-line (2 PRs)

| # | PR | What | Est. lines |
|---|---|---|---|
| S-1 | `lead_form_config` singleton | Interest topics + city presets + copy moved out of `LeadCaptureForm.tsx`. | ~200 |
| S-2 | Layout default description | Move meta description to `site_settings.default_description`. Trivial. | ~30 |

### Phase C-4: Operator-UX cabinets for new Directus collections

After C-1 through C-3 land, the new Directus collections (`site_settings`, `press_page`, `team_members`, `brand_guidelines`, `lead_form_config`) will be editable **only via Directus admin UI**, which violates the "operators never touch Directus admin" rule (per memory `feedback_operators_never_touch_directus_admin`).

This phase rebuilds the operator workflow:

| # | PR | What | Est. lines |
|---|---|---|---|
| O-1 | `/workspace/site-settings` cabinet | Single form, all `site_settings` fields. | ~250 |
| O-2 | `/workspace/press-page` cabinet | Press content editor (markdown body). | ~250 |
| O-3 | `/workspace/team-members` cabinet | CRUD list, headshot picker from marketing_assets. | ~350 |
| O-4 | `/workspace/lead-form` cabinet | Form config editor. | ~200 |

This phase is the proper bridge into the larger **operator-UX rebuild** (which is the F-S3.10-c-extended event-detail debt + other operator cabinets the user has flagged).

---

## 5. Total Footprint

- **Phase C-1**: 4 PRs, ~1300 lines, finishes the 4 incomplete customer pages.
- **Phase C-2**: 3 PRs, ~480 lines, closes the trigger gaps that affect customer experience.
- **Phase C-3**: 2 PRs, ~230 lines, last leftover static prose.
- **Phase C-4**: 4 PRs, ~1050 lines, makes the new collections operable without Directus admin.

**Net: 13 PRs.** Customer surface fully landed + new content surfaces operable. After that → larger operator-UX rebuild.

---

## 6. Badge System Design (PM-approved 2026-05-25)

Per PM direction: a richer, multi-category badge taxonomy — not just a starter set. Three categories of award trigger:

### A) Role badges (sourced from Authentik group claims)

Awarded once when the member's `groups` claim contains the matching group, revoked when removed. Source-of-truth = Authentik; `member_badges` mirrors for fast read.

| Badge | Authentik group | Display |
|---|---|---|
| `speaker` | `aiqadam-speaker` | Speaker |
| `organizer` | `aiqadam-organizer-<country>` | Organizer · <CC> |
| `country_lead` | `aiqadam-country-lead-<country>` | Country Lead · <CC> |
| `sponsor_rep` | `aiqadam-sponsor-rep` (or `-<org>`) | Sponsor |
| `advisor` | `aiqadam-advisor` *(new group, needs creation)* | Advisor |
| `staff` | `aiqadam-staff` | Staff |
| `admin` | `aiqadam-super-admin` / `authentik Admins` | Admin |

### B) Achievement badges (sourced from action counters)

Awarded once when the corresponding counter crosses a threshold. Idempotent: never re-awarded after first grant.

| Badge | Trigger |
|---|---|
| `first_event_attended` | First `registrations.status='attended'` row for the user |
| `event_attendee_5` | 5 attended events |
| `event_attendee_10` | 10 attended events |
| `event_attendee_25` | 25 attended events |
| `event_attendee_50` | 50 attended events |
| `event_streak_3` | 3 consecutive months with ≥1 attended event |
| `profile_complete` | All 6 completeness signals true (matches U-Me1a card) |
| `early_member` | Joined within the country's launch month (configurable per country) |

### C) Special / referral badges

| Badge | Trigger |
|---|---|
| `brought_a_friend` (existing) | Referee attends an event |
| `community_connector` | 3 distinct referees have attended |

### Schema impact

`member_badges` already exists. Confirm columns: `id`, `user` (FK directus_users), `badge_type` (text), `source_ref` (text, deduplication key), `awarded_at`, `metadata` (JSON, e.g. `{country: 'uz'}` for region-scoped badges). Add a `badge_definitions` collection so the taxonomy itself is operator-editable:

- `key` (e.g. `event_attendee_5`)
- `category` (`role` | `achievement` | `special`)
- `display_label` (i18n via translations sibling)
- `icon` (FK marketing_assets or emoji)
- `description_md`
- `display_order`
- `active` (bool — turn off without deleting history)

### Awarder service (new — Phase C-4)

Single Nest service `BadgeAwarderService` with three entrypoints:

1. `onAttendanceRecorded(userId, eventId)` — checked-in attendance. Awards `first_event_attended`, the `event_attendee_*` tier if crossed, and triggers `event_streak_3` recalc.
2. `onGroupsClaimRefreshed(userId, groups)` — fires on each successful `/auth/refresh` (cheap dedup) to sync role badges.
3. `onReferralAttended(referrerId, refereeId, eventId)` — awards `brought_a_friend` (already exists) and `community_connector` when threshold hit.

Awards always go through `BadgeAwarderService.award(userId, key, sourceRef)` which is idempotent on `(user, badge_type, source_ref)`.

### UI impact on `/me`

The "Recent badges" strip on the account page (deferred from U-Me1c) now has real content. Renders newest 6, links to `/me/badges` (new) for the full grid grouped by category.

---

## 7. Other PM Questions (still pending)

1. **`team_members`** — only Founder + COO for now, or include the future country leads slate? *(Affects C-3 only.)*
2. **"Countries served" counter** — fixed at 3 (UZ/KZ/TJ) or include `xx` global as a 4th? *(Resolved by making it CMS-editable — defaults to 3, change anytime via `/workspace/site-settings`.)*
3. **No-show tracking** — included in scope or deferred? It changes capacity-planning numbers. *(Affects C-2/T-* phases.)*
4. **Operator cabinet ordering (Phase C-4)** — which collection's cabinet should land first if we have to stage? *(Affects C-4 sequencing; not blocking.)*

---

**Next action:** Start **C-1 (homepage CMS via `site_settings` singleton)** — confirmed in scope; validates the cabinet pattern. Badge work (Phase C-4) grows with the richer taxonomy and lands after C-1–3.
