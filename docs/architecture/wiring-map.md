# Cabinet ↔ customer aggregate wiring map

> Per-data-source registry of: which blocks read it (customer +
> operator surfaces), what aggregates derive from it, where those
> aggregates are surfaced. ADR-0038 mandates this doc be updated in
> the SAME PR as any data-wiring change. CI rule enforces it.
>
> Purpose: prevent two cabinets from independently fetching the same
> aggregate, prevent customer + operator surfaces from diverging on
> the same row, make it obvious WHAT changes when a Directus
> collection's schema moves.

## Schema

Each data source = one section. Format:

```yaml
data_source: <directus_collection_or_api_endpoint>
description: <one-line summary of the row's meaning>

customer_blocks:                # L3 blocks under blocks/customer/
  - block: <BlockName>
    page: <path/to/page.astro>
    operation: read | write | both

operator_blocks:                # L3 blocks under blocks/workspace/
  - block: <BlockName>
    cabinet: /workspace/<path>
    operation: read | write | both

aggregates:                     # derived values
  <aggregate_name>:
    formula: <SQL-ish or query expression>
    surfaces:
      - <BlockName at /path>
    query_key: <tanstack-query cache key>
    stale_time: <seconds>
```

## Population strategy

This file starts (mostly) empty. Each Phase-1 and Phase-2 PR that
touches a data source updates it. By Phase 3 done, every Directus
collection that backs UI has an entry. CI rule: if any
`apps/web-next/src/blocks/**` file is changed AND that block's data
source has no entry here, fail the build.

---

## Sources

### `events`

```yaml
data_source: events
description: Public event records (meetup, workshop, hackathon, conference, online).

customer_blocks:
  - block: EventCard
    page: apps/web-next/src/pages/events.astro (PR 1.2)
    operation: read
  - block: EventsGrid
    page: apps/web-next/src/pages/events.astro (PR 1.2)
    operation: read (list)
  - block: EventDetail
    page: apps/web-next/src/pages/events/[id].astro (PR 1.3)
    operation: read

operator_blocks:
  - block: DataTable (EventsListCabinet)   # placeholder — Phase 2
    cabinet: /workspace/events
    operation: read
  - block: Form (EventControlPanel)   # placeholder — Phase 2
    cabinet: /workspace/events/[id]
    operation: both

ssr_fetcher: apps/web-next/src/lib/api-ssr.ts → fetchUpcomingEvents(req) AND fetchEvent(req, id)
api_endpoint: GET /v1/events (host header → country filter) AND GET /v1/events/:id (single detail)
fallback: empty array / null (page renders EmptyState block OR 302 to /events; API outage doesn't break page)

aggregates:
  events_this_month:
    formula: count(events where starts_at in [now, now+30d])
    surfaces:
      - KpiTile at /workspace
    query_key: [events, count, this_month]
    stale_time: 60
  events_upcoming_count:
    formula: count(events where starts_at > now)
    surfaces:
      - KpiTile at /workspace
    query_key: [events, count, upcoming]
    stale_time: 60
```

### `event_speakers` — LIVE under apps/web-next/ as of PR 1.3

```yaml
data_source: event_speakers
description: Per-event speaker rows joined to speakers + directus_users.

customer_blocks:
  - block: SpeakerGrid
    page: apps/web-next/src/pages/events/[id].astro
    operation: read
    fields_read: [id, status, talk_title, order_index, speaker.bio_md, speaker.user.*]
    filter: event = X AND status IN (accepted, confirmed)

operator_blocks: []   # placeholder — Phase 2 speaker management

ssr_fetcher: apps/web-next/src/lib/cms.ts → fetchEventSpeakers(eventId)
fallback: [] (block renders nothing; rest of page unaffected)
```

### `event_materials` — LIVE under apps/web-next/ as of PR 1.3

```yaml
data_source: event_materials
description: Public files / links attached to an event (slides, recordings, code, etc.).

customer_blocks:
  - block: MaterialsList
    page: apps/web-next/src/pages/events/[id].astro
    operation: read
    fields_read: [id, title, kind, file, url, order_index]
    filter: event = X

operator_blocks: []   # placeholder — Phase 2 material management

ssr_fetcher: apps/web-next/src/lib/cms.ts → fetchEventMaterials(eventId)
fallback: [] (block renders nothing; rest of page unaffected)
```

### `event_sponsors` — LIVE under apps/web-next/ as of PR 1.3

```yaml
data_source: event_sponsors
description: Per-event sponsor rows joined to sponsors with tier + custom message.

customer_blocks:
  - block: SponsorWall
    page: apps/web-next/src/pages/events/[id].astro
    operation: read
    fields_read: [id, tier, custom_message, sort_order, sponsor.id, sponsor.name, sponsor.slug, sponsor.logo, sponsor.website]
    filter: event = X

operator_blocks: []   # placeholder — Phase 3 sponsors cabinet (PR 3.1)

ssr_fetcher: apps/web-next/src/lib/cms.ts → fetchEventSponsors(eventId)
fallback: [] (block renders nothing; rest of page unaffected)
```

### `event_questions` — LIVE under apps/web-next/ as of PR 1.7

```yaml
data_source: event_questions
description: Per-event Q&A thread. Anon read via Directus Public policy; signed-in post via apps/api.

customer_blocks:
  - block: ForumThread
    page: apps/web-next/src/pages/events/[id].astro (PR 1.7)
    operation: both
    initial_data: SSR-fetched via fetchEventQuestions (Directus)
    hooks: lib/use-event-forum.ts → usePostQuestion

operator_blocks:
  - block: DataTable (QuestionsList + pin/answer moderation)  # placeholder — Phase 2
    cabinet: /workspace/events/[id]
    operation: read+write

api_endpoints:
  - POST /v1/events/:id/questions  (apps/api EventQuestionsController; body { questionText, parentQuestionId? })

ssr_fetcher: apps/web-next/src/lib/cms.ts → fetchEventQuestions(eventId)
fallback: [] (block still renders composer; existing list comes back empty)
```

### `event_photos`

> Placeholder — filled in a future finished-tab follow-up (photos).

### `registrations` — LIVE under apps/web-next/ as of PR 1.4

```yaml
data_source: registrations
description: Per-event registration row (status: registered | waitlisted | cancelled | attended).

customer_blocks:
  - block: RegistrationCTA
    page: apps/web-next/src/pages/events/[id].astro (PR 1.4)
    operation: both
    hooks: lib/use-registrations.ts → useMyRegistrationStatus, useRegisterForEvent, useCancelRegistration

operator_blocks:
  - block: DataTable (RegistrationsList)   # placeholder — Phase 2
    cabinet: /workspace/events/[id]
    operation: read

api_endpoints:
  - GET /v1/registrations (list current user's registrations)
  - POST /v1/events/:id/register (create — body optional, accepts referredBy + acquisitionSource)
  - DELETE /v1/events/:id/register (cancel)
mutation_invalidation: ['registrations', 'me'] (any sub-key — covers the by-event query too)

aggregates:
  per_event_registered_count:
    formula: count(registrations where event_id = X and status = 'registered')
    surfaces:
      - RegistrationCTA at /events/[id]
      - EventControlPanel header at /workspace/events/[id]
      - EventCard footer at /events
    query_key: [registrations, count, by_event, <eventId>]
    stale_time: 30
```

### `directus_users` — public profile READ live as of PR 1.5a

```yaml
data_source: directus_users
description: Member identity row. /v1/users/:handle/profile is the public read-only API.

customer_blocks:
  - block: ProfileCard
    page: apps/web-next/src/pages/u/[handle].astro (PR 1.5a)
    operation: read
    fields_read: [handle, display_name, bio_md, job_title, employer_name, total_points, attended/registered counts, recent_events[]]
  - block: ProfileCard      # planned mode='self'
    page: apps/web-next/src/pages/me/profile.astro (PR 1.5b)
    operation: read
  - block: ConsentList      # PR 1.5b — writes member_consents
    page: apps/web-next/src/pages/me/profile.astro
    operation: write
  - block: SkillTagger      # PR 1.5b — writes member_skills / _interests / _employments
    page: apps/web-next/src/pages/me/profile.astro
    operation: write

operator_blocks: []   # placeholder — Phase 3.6 (members directory uplift)

ssr_fetcher: apps/web-next/src/lib/api-ssr.ts → fetchPublicProfile(req, handle)
api_endpoint: GET /v1/users/:handle/profile (Host header → tenant filter; deep-reads registrations for recent_events)
fallback: null → page 302s to /leaderboard
```

### `member_consents` — LIVE as of PR 1.5b

```yaml
data_source: member_consents
description: Per-purpose marketing/research/etc. consent state per ADR-0033 Part 1.

customer_blocks:
  - block: ConsentList
    page: apps/web-next/src/pages/me/profile.astro (PR 1.5b)
    operation: both
    hooks: lib/use-me-profile → useMyFullProfile (read), useUpdateConsent (write)

operator_blocks: []   # placeholder — no operator surface; consent is member-controlled

api_endpoints:
  - GET /v1/me/profile (envelope returns consents[])
  - PATCH /v1/me/profile/consents {purpose, granted}

purposes (from lib/types CONSENT_PURPOSES):
  - events, marketing, research, recruiting, sponsor_share, content, paid_premium
```

### `member_skills` — LIVE as of PR 1.5b

```yaml
data_source: member_skills
description: Member-attached skill tags. Drives event-invite routing + member directory search.

customer_blocks:
  - block: SkillTagger
    page: apps/web-next/src/pages/me/profile.astro (PR 1.5b)
    operation: both
    hooks: lib/use-me-profile → useMyFullProfile (read), useAddSkill / useRemoveSkill (write)

operator_blocks: []   # placeholder — future Phase 3 segment-builder may filter by skill

api_endpoints:
  - GET /v1/me/profile (envelope returns skills[])
  - POST /v1/me/profile/skills {skill_tag}
  - DELETE /v1/me/profile/skills/:id
```

### `member_interests`, `member_employments`, `member_badges`

> Placeholders.
> - `member_interests` + `member_employments` — Phase 1.5c (interests + employments editors).
> - `member_badges` — Phase 3 cabinet for badge grant/audit.

### `point_awards` — LIVE as of PR 1.6

```yaml
data_source: point_awards
description: Append-only point grants per member. Aggregated by the API into the leaderboard view.

customer_blocks:
  - block: Leaderboard
    page: apps/web-next/src/pages/leaderboard.astro (PR 1.6)
    operation: read (aggregate)
    fields_read: [rank, userId, email, displayName, handle, totalPoints]

operator_blocks: []   # placeholder — Phase 3.4 "Points & badges cabinet"

ssr_fetcher: apps/web-next/src/lib/api-ssr.ts → fetchLeaderboard(req, limit, window)
api_endpoint: GET /v1/leaderboard?limit=N&window=all|year|quarter (Host header → tenant filter; aggregates point_awards.amount grouped by user)
fallback: [] (page renders EmptyState block; API outage doesn't break the page)

aggregates:
  top_N_per_country:
    formula: sum(amount) over point_awards filtered by tenant + window, grouped by user, sorted desc
    surfaces:
      - Leaderboard at /leaderboard (PR 1.6)
      - planned KpiTile.top_3 at /workspace dashboard (Phase 2)
    query_key: [leaderboard, <window>]
    stale_time: 60
```

### `site_settings` (singleton) — LIVE under apps/web-next/ as of PR 1.1

```yaml
data_source: site_settings
description: Singleton with homepage hero, footer, contact info, brand variants.

customer_blocks:
  - block: Hero
    page: apps/web-next/src/pages/index.astro
    operation: read
    fields_read: [default_description, telegram_url, countries_served]
  - block: AppFooter   # placeholder — PR 1.8
    page: <Layout-global>
    operation: read

operator_blocks:
  - block: Form (SiteSettingsCabinet)   # placeholder — PR 3.2
    cabinet: /workspace/site-settings
    operation: both

ssr_fetcher: apps/web-next/src/lib/cms.ts → fetchSiteSettings()
fallback: SITE_SETTINGS_DEFAULTS (page renders even when Directus is unreachable)

aggregates: {}
```

### `partners` — LIVE (list + detail) as of M2.1

```yaml
data_source: partners  (Directus partners collection — sponsors + employers + product partners share one row)
description: Operator directory of all three partner roles. List with role chips (PR 2.5b) + read-only per-partner detail with audiences + co-marketing kit assets (M2.1). Read-only end-to-end — the API exposes no partner PATCH (onboarding stays in Directus).

customer_blocks: []   # never surfaced raw to customers (sponsor logos surface via separate <SponsorWall> block)

operator_blocks:
  - block: PartnersList (composes <DataTable>)
    cabinet: /workspace/partners
    operation: read
    hooks: lib/use-partners.ts → usePartners
  - block: PartnerDetail
    cabinet: /workspace/partners/[slug]
    operation: read
    hooks: lib/use-partners.ts → usePartnerDetail

api_endpoints:
  - GET /v1/workspace/partners       (AuthGuard — any signed-in operator)
  - GET /v1/workspace/partners/:slug (PartnerDetail: + audiences + kit_assets)

ssr_fetcher: none — island fetches client-side
fallback: error surface in DataTable / detail card
```

### `sponsors`, `marketing_assets`, `press_page`, `landing_pages`

> Placeholders — filled in PR 3.1, 3.2, 3.3.

### `badge_definitions`, `member_badges`, `point_awards`

> Placeholders — filled in PR 3.4.

### `operator_invites` — LIVE as of PR 2.3a

```yaml
data_source: operator_invites  (ADR-0035 invite-link flow over admin_invites Directus table)
description: Super-admin operator-onboarding surface. Lists pending/consumed/revoked invites; creates new ones; revokes pending. Replaces the deprecated CLI user-create path.

customer_blocks: []   # never surfaced to customers

operator_blocks:
  - block: InvitesList (composes <DataTable>)
    cabinet: /workspace/admin/users
    operation: read+write+revoke
    hooks: lib/use-invites.ts → useInvites, useCreateInvite, useRevokeInvite

api_endpoints:
  - GET    /v1/admin/invites?status=   (AuthGuard + SuperAdminGuard)
  - POST   /v1/admin/invites           (AuthGuard + SuperAdminGuard; returns plaintext invite_url ONCE)
  - DELETE /v1/admin/invites/:id       (revoke pending; AuthGuard + SuperAdminGuard)

ssr_fetcher: none — island fetches client-side (page is super-admin only, no SEO requirement)
fallback: error surface in DataTable + create-form
```

### `countries`

> Placeholder — filled in PR 3.5.

### `workspace_dashboard` — LIVE as of PR 2.4

```yaml
data_source: workspace_dashboard  (aggregate over events + registrations + event_ratings)
description: Operator KPI grid. Country-scoped events / registrations / attendance / CSAT for a 7/30/90/365-day window, plus a cross-country comparison strip.

customer_blocks: []   # never surfaced to customers

operator_blocks:
  - block: DashboardKpis (composes <KpiTile>)
    cabinet: /workspace/dashboard
    operation: read
    hooks: lib/use-dashboard.ts → useCountryMetrics, useCrossCountryMetrics

api_endpoints:
  - GET /v1/workspace/dashboard/country?c=<cc>&days=<n>   (AuthGuard)
  - GET /v1/workspace/dashboard/cross-country?days=<n>    (AuthGuard)

ssr_fetcher: none — island fetches client-side (page is operator-only, no SEO requirement)
fallback: error surface in tile grid / cross-country strip
```

### `workspace_members` — LIVE as of PR 2.2

```yaml
data_source: workspace_members  (synthetic — server-side view over directus_users + member_employments + member_consents)
description: Operator-facing paginated member directory. Per ADR-0033 operators NEVER touch Directus admin; this cabinet replaces it for search/filter/cohort workflows.

customer_blocks: []   # never surfaced to customers

operator_blocks:
  - block: MembersList (composes <DataTable>)
    cabinet: /workspace/members
    operation: read
    hooks: lib/use-members.ts → useMembersSearch

api_endpoints:
  - GET /v1/workspace/members?q=&page=&limit=  (MembersController; AuthGuard + page-level <AuthGate role="aiqadam-operators">)

ssr_fetcher: none — React island fetches client-side via apiClient (page is operator-only, no SEO requirement)
fallback: error surface in DataTable; pagination defaults to page 1
```

### `audit_events` — LIVE as of PR 2.5a

```yaml
data_source: audit_events
description: Append-only log of operator actions + selected member actions. Per ADR-0033 super-admin only; redacted slice surfaces on /me/access-log for self-view (PR 2.5a ships /workspace/admin/audit; /me/access-log lands as a customer-side surface in a later PR).

customer_blocks: []   # never surfaced to customers

operator_blocks:
  - block: AuditLogList (composes <DataTable>)
    cabinet: /workspace/admin/audit
    operation: read
    hooks: lib/use-audit.ts → useAuditEvents

api_endpoints:
  - GET /v1/admin/audit/events?severity=&event_prefix=&country=&limit=  (AuthGuard + SuperAdminGuard)

ssr_fetcher: none — island fetches client-side (super-admin only)
fallback: error surface in DataTable
```

### `workspace_approvals` — LIVE as of PR 2.5c

```yaml
data_source: workspace_approvals  (queue framework over sponsor_onboarding + speaker_proposal + operator_assisted_interaction sources; v1 ships framework, source loaders flip ready as F-S3.7 follow-ups land)
description: Operator approval queue. PR 2.5c surfaces the framework + source-readiness panel; pending-items DataTable populates as each source loader lands.

customer_blocks: []   # never surfaced to customers

operator_blocks:
  - block: ApprovalsList (composes <DataTable>)
    cabinet: /workspace/approvals
    operation: read
    hooks: lib/use-approvals.ts → useApprovals

api_endpoints:
  - GET /v1/workspace/approvals  (AuthGuard — any signed-in operator)

ssr_fetcher: none — island fetches client-side
fallback: error surface in DataTable
```

### `workspace_events` — LIVE (list cabinet) as of PR 2.7a

```yaml
data_source: workspace_events  (Directus events collection joined with RegistrationCounts aggregate)
description: Operator event control panel. PR 2.7a ships the list view (status + country filters + registration counts). Detail page (PATCH metadata, followups, OG card regen) lands in follow-ups.

customer_blocks: []   # customer-facing event list is the separate <EventsGrid> block over /v1/events (PR 1.2)

operator_blocks:
  - block: EventsList (composes <DataTable>)
    cabinet: /workspace/events
    operation: read
    hooks: lib/use-workspace-events.ts → useWorkspaceEvents

api_endpoints:
  - GET /v1/workspace/events       (AuthGuard — country scoping rides ADR-0021 RBAC server-side)
  - GET /v1/workspace/events/:id   (detail; cabinet consumer pending)
  - PATCH /v1/workspace/events/:id (operator-edit; cabinet consumer pending)

ssr_fetcher: none — island fetches client-side
fallback: error surface in DataTable
```

### `workspace_forms` — LIVE (list cabinet) as of PR 2.7b

```yaml
data_source: workspace_forms  (Directus forms collection — reusable form templates: post-event surveys, sponsor onboarding, etc.)
description: Operator forms-library list. PR 2.7b ships the list view with status + country filters + submission counts. Per-form detail (builder + submissions inbox + per-field aggregate) lands in PR 2.10 follow-ups.

customer_blocks: []   # form submissions ride on dedicated /forms/<slug> public surfaces, not this cabinet

operator_blocks:
  - block: FormsList (composes <DataTable>)
    cabinet: /workspace/forms
    operation: read
    hooks: lib/use-workspace-forms.ts → useWorkspaceForms

api_endpoints:
  - GET    /v1/workspace/forms       (AuthGuard)
  - GET    /v1/workspace/forms/:id   (detail; cabinet consumer pending)
  - POST   /v1/workspace/forms       (create; pending — needs FormBuilder block)
  - PATCH  /v1/workspace/forms/:id   (update; pending)
  - POST   /v1/workspace/forms/:id/archive (archive; pending)
  - GET    /v1/workspace/forms/:id/submissions (inbox; pending)
  - GET    /v1/workspace/forms/:id/aggregate   (per-field aggregate; pending)

ssr_fetcher: none — island fetches client-side
fallback: error surface in DataTable
```

### `tg_broadcasts`, `tg_segments`, `form_submissions`

> Placeholders — filled in PR 2.9, 2.10.

---

## Anti-patterns (do not do)

1. **Two cabinets fetching the same aggregate independently.** If you
   need `events_this_month` in a new cabinet, declare it here once
   and consume via the shared TanStack Query key. The `query_key`
   field is the contract.

2. **Customer block divergence from operator block.** If you change
   the shape of `EventCard` data, every operator cabinet rendering
   the same row must continue working. The wiring-map row reveals
   the dependency.

3. **Surprise aggregates.** A KPI on the cabinet dashboard that
   nobody knows where it comes from. Every aggregate has a `formula`
   and `surfaces` here. If you can't fill those, you don't have a
   well-defined aggregate yet.
