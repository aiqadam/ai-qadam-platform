---
code: FR-CMS-004
name: Telegram broadcast composer (operator)
status: Shipped
module: CMS / Content (CMS)
phase: V1 (#294, issues #369–#376) / Rebuild M2.7–M2.8 (V2, Not Started)
---

## Description

Operators can compose, schedule, and send targeted Telegram broadcasts from the workspace. Broadcasts are composed in a rich-text editor with inline buttons, targeted to a saved audience segment, and sent immediately or scheduled. Sent broadcast history and analytics are tracked.

## Users

Organizers, Country Admins (compose); Super Admin (send-now + cross-country).

## Functional scope

1. **Broadcasts collection** — `tg_broadcasts` Directus collection: `title`, `status` (draft/scheduled/sending/sent/failed), `html_body` (Telegram-safe HTML subset), `image_asset` (file M2O), `inline_buttons` (jsonb, max 8 `{text, url}` pairs), `scheduled_at`, `sent_at`, `sent_count`, `segment_id` (FK), `country`, `created_by`.
2. **Broadcast composer UI** — `/workspace/integrations/telegram/broadcasts/new` and `/broadcasts/[id]` (`TgBroadcastComposer` island):
   - Rich-text editor producing the Telegram-safe HTML subset (`<b>`, `<i>`, `<u>`, `<s>`, `<a>`, `<code>`, `<pre>`).
   - Image upload via Directus assets API.
   - Inline buttons builder (text + URL pairs, max 8).
   - Preview pane rendering the composed message.
   - CTAs: Save as draft, Schedule (pick datetime), Send now (super-admin only).
3. **Audience segments** — `tg_segments` Directus collection: `name`, `criteria_jsonb` (Directus-filter-shaped JSON: country_in, registered_for_event, preferred_topics_contains, linked_within_days). See FR-CMS-005 for segment builder.
4. **Send-now** — `POST /v1/admin/tg-broadcasts/:id/send-now` (super-admin only). Transitions `draft → sending → sent`. For each member in resolved segment: enqueue a `tg.dispatch.v1` envelope via OutboxPublisher. Records `sent_count`. Status: `failed` if the enqueue errors.
5. **Scheduled sends** — `aiqadam-tg-broadcast-cron.sh` (systemd timer, every minute): picks `status=scheduled AND scheduled_at <= now`, runs send logic, flips to `sent`.
6. **Rate-limit warning** — Composer shows estimated send duration for segments > 10k (based on 30/sec Telegram rate limit per ADR-0034).
7. **Recurring broadcasts** — `tg_broadcasts.recurrence` (cron expression or enum weekly/monthly). Each fire creates a new sent-broadcast row (snapshot of body at fire time).
8. **Send history** — Per-broadcast analytics: `sent_count`, `delivered_count`, `opt_out_count`.

## Acceptance criteria

- [ ] An operator can create a draft broadcast, compose a message with formatting and an image, attach an audience segment, and schedule it.
- [ ] A scheduled broadcast is sent within 2 minutes of its `scheduled_at` time.
- [ ] Send-now is restricted to super-admin; an operator-role user sees a disabled "Send now" button.
- [ ] A segment that resolves 0 members shows a warning before sending.
- [ ] Sending to a segment > 10k shows an estimated duration warning.
- [ ] The broadcasts list at `/workspace/integrations/telegram/broadcasts` shows sent count and status for each broadcast.
- [ ] Sending the same broadcast twice (bug scenario) does not deliver duplicates (idempotency via `notifications_sent` in the dispatcher).

## Notes

- This FR covers the producer side. The consumer (bot delivery) is via the existing `tg.dispatch.v1` outbox pattern (ADR-0034).
- V2 (web-next): M2.7 (Telegram segments builder) and M2.8 (broadcasts composer + actions) are not started.
- Shipped in V1 as PR series #294-a through #294-e.
