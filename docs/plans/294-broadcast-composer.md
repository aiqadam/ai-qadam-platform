# #294 — Broadcast composer + scheduling + segments

**Status:** Proposed (planning artifact for next stretch).
**Tracking issue:** [#294](https://github.com/viktordrukker/aiqadam/issues/294).
**Unblocks:** Multiple cron-fired pushes that today have no producer — post-event survey (#322), waitlist auto-promotion (#325-b), event-reminders pattern extensions.

## Goal

Operator can compose, segment, and schedule push broadcasts from the workspace cabinet. Bot-side delivery already works (notifier consumes `tg.dispatch.v1` with retry + rate-limit + audit per ADR-0034); this is the producer side.

## Scope — 5 sub-PRs

### PR-a · Broadcast collection + cabinet read view

**Schema** (Directus):
- `tg_broadcasts` collection: id, title, status (draft/scheduled/sending/sent/failed), html_body, image_asset (m2o files), inline_buttons jsonb, scheduled_at, sent_at, sent_count, segment_id (FK), created_by, country.
- Workspace cabinet route: `/workspace/integrations/telegram/broadcasts` — table view, search, status filter.

**API:**
- `GET /v1/admin/tg-broadcasts` — list scoped to operator's countries.
- `GET /v1/admin/tg-broadcasts/:id` — detail.

**Effort:** ~4h.

---

### PR-b · Broadcast composer UI (Astro island)

Form for creating + editing draft broadcasts.

- Rich-text editor outputting the Telegram-safe HTML subset (b/i/u/s/a/code/pre).
- Image upload via Directus assets API.
- Inline buttons builder (text + URL pairs, max 8).
- Preview pane that renders what the user will see (best-effort; renders via the same HTML subset).
- Save-as-draft + schedule-for-future + send-now CTAs.

**Effort:** ~6h.

---

### PR-c · Audience segments

**Schema** (Directus):
- `tg_segments` collection: id, name, criteria_jsonb, created_by, country.
- `criteria_jsonb` shape:
  ```json
  {
    "_and": [
      { "country": { "_in": ["uz", "kz"] } },
      { "registered_for_event": "<event-id>" },
      { "preferred_topics": { "_contains": "llm" } },
      { "linked_within_days": 30 }
    ]
  }
  ```
- Reuses Directus filter syntax so the JSON is directly translatable to API queries.

**Service:**
- `SegmentResolverService.resolve(segmentId): Promise<string[]>` → member ids (Directus user IDs) matching criteria.
- Per-criterion translators (country_in, registered_for_event, preferred_topics_contains, etc.).
- Respects `telegram_opted_out_at` (always excluded) + per-topic opt-ins from #289 preferences.

**Cabinet:**
- `/workspace/integrations/telegram/segments` — create, name, preview match count + sample members (anonymized to "Viktor D., 247 others").

**Effort:** ~6h.

---

### PR-d · Send-now + scheduler

**Now path:**
- POST `/v1/admin/tg-broadcasts/:id/send-now` (super-admin only)
- Status transitions: draft → sending → sent (or → failed)
- For each member in resolved segment: build a `tg.dispatch.v1` envelope, enqueue via OutboxPublisher (existing primitive)
- Records `sent_count` for analytics

**Scheduled path:**
- `aiqadam-tg-broadcast-cron.sh` (systemd timer, runs every minute)
- Picks broadcasts with `status='scheduled' AND scheduled_at <= now`
- Runs the same send logic; flips status to 'sent'
- One-shot for one-time broadcasts; recurring is PR-e.

**Rate-limit warning:**
- Cabinet preview shows estimated send duration based on segment size + notifier's per-chat throttle (already 30/sec global per ADR-0034).
- Warn if segment > 10k members (multi-hour send).

**Effort:** ~6h.

---

### PR-e · Recurring broadcasts + history/analytics

**Recurring:**
- `tg_broadcasts.recurrence` (cron expression OR enum: weekly/monthly).
- Each fire creates a new "sent broadcast" row (snapshot of body at fire time so editing later doesn't retroactively change history).

**Send history view:**
- Per-broadcast: sent_count, delivered_count (from notifier audit table), opt_out_count, link_click_rate (via Plausible event tracking if button URLs are tracked).

**Effort:** ~4h.

---

## Sub-task: event-driven reminders (slots into #294's umbrella)

Already partially shipped — `event-reminders.service.ts` exists in workspace module. Verify per-event override (off / different copy / different timing) is wired. If not, that's a small follow-up under PR-a/b's umbrella.

## Open decisions

1. **Segment criteria DSL.** Two options: Directus-filter-shaped JSON (chosen above; minimal mapping) OR a custom narrower DSL (less power, easier UX). Recommendation: stay with Directus-shaped; complexity hides behind the cabinet UI.
2. **Image storage.** Directus assets (chosen) vs Telegram's CDN re-upload per send. Directus is simpler; Telegram requires re-upload anyway per send (file IDs aren't portable across bots).
3. **Per-tenant broadcasts vs cross-tenant.** Default: per-country (operator-scoped). Super-admin can target multiple countries. UI hides this complexity behind a single tenant picker.
4. **Test member.** Send a test broadcast to just the operator before going live? Yes — bake into the send-now flow as a confirmation step.

## Why split into 5 PRs

Each sub-PR is independently shippable + reviewable. PR-a unblocks the cabinet shell (operator sees the "Broadcasts" section as soon as it lands). PR-b lets them draft messages without sending. PR-c lets them define audiences. PR-d turns it live. PR-e is the polish layer.

## Dependencies between #294 sub-PRs and other deferred work

- **#322 (post-event survey)** auto-fire depends on PR-d (cron + dispatcher). When PR-d lands, wire the survey URL into the post-event reminder envelope.
- **#325-b (waitlist auto-promotion on cancel)** depends on PR-d (need the dispatcher to fire the "spot opened up" notification).
- **#324 (cancellation analytics event)** depends on PR-d (the `tg.bot.registration_cancelled` event needs the dispatcher).

Coordinated landing: ship #294 PR-a→PR-d, then immediately back-fill #322/#325-b/#324 deferrals in one operator-side wire-up PR.

## Related

- ADR-0034 — Telegram-as-IdP + ESB-ready bot architecture. Notifier uses Redis Streams + outbox pattern; this PR's producer slots into that contract.
- `feedback_authentik_should_be_wrapped` — broadcasts cabinet is operator-facing, must SSO via Authentik (existing workspace pattern handles this).
