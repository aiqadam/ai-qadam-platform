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
  - block: EventDetail   # placeholder — PR 1.3
    page: /events/[id]
    operation: read

operator_blocks:
  - block: DataTable (EventsListCabinet)   # placeholder — Phase 2
    cabinet: /workspace/events
    operation: read
  - block: Form (EventControlPanel)   # placeholder — Phase 2
    cabinet: /workspace/events/[id]
    operation: both

ssr_fetcher: apps/web-next/src/lib/api-ssr.ts → fetchUpcomingEvents(req)
api_endpoint: GET /v1/events (host header forwards tenant → country filter)
fallback: empty array (page renders EmptyState block; API outage doesn't break page)

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

### `event_speakers`, `event_sponsors`, `event_materials`, `event_photos`, `event_questions`

> Placeholder — filled in PR 1.3 + 1.7.

### `registrations`

```yaml
data_source: registrations
description: Per-event registration row (status: registered | waitlisted | cancelled | attended).

customer_blocks:
  - block: RegistrationCTA
    page: /events/[id]
    operation: both

operator_blocks:
  - block: DataTable (RegistrationsList)
    cabinet: /workspace/events/[id]
    operation: read

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

### `directus_users` + member graph (`member_skills`, `member_interests`, `member_employments`, `member_consents`, `member_badges`)

> Placeholder — filled in PR 1.5 + 1.6.

### `point_awards`

> Placeholder — filled in PR 1.6.

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

### `partners`, `sponsors`, `marketing_assets`, `press_page`, `landing_pages`

> Placeholders — filled in PR 3.1, 3.2, 3.3.

### `badge_definitions`, `member_badges`, `point_awards`

> Placeholders — filled in PR 3.4.

### `operator_invites`, `countries`

> Placeholders — filled in PR 3.5.

### `audit_events`

```yaml
data_source: audit_events
description: Append-only log of operator actions (and selected member actions).

customer_blocks: []   # never surfaced to customers

operator_blocks:
  - block: AuditLogList
    cabinet: /workspace/admin/audit
    operation: read

aggregates: {}
```

### `tg_broadcasts`, `tg_segments`, `forms`, `form_submissions`

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
