# Runbook: Speaker pipeline + post-event cron

**Audience:** operators managing speaker confirmations; engineers wiring the post-event scheduler.
**Pre-reading:** [event-publication-broadcast.md](./event-publication-broadcast.md), [event-pre-event-reminders.md](./event-pre-event-reminders.md), [event-csat.md](./event-csat.md), [ux-and-content-guidelines.md §13](../ux-and-content-guidelines.md#13-notification-copy-library).
**Ships:** F-S1.1b (speaker_added on confirm) + F-S1.1c (post-event cron). Closes Sprint 1.

## What this ships

### F-S1.1b — speaker_added on confirm

Operator manages `event_speakers` rows via:
- `GET    /v1/workspace/events/:eventId/speakers` (AuthGuard) — list
- `POST   /v1/workspace/events/:eventId/speakers` (AuthGuard) — invite (status=invited; rejects dupe `(event, speaker)`)
- `PATCH  /v1/workspace/events/:eventId/speakers/:eventSpeakerId` (AuthGuard) — change status, talk title/topic, order
- `DELETE /v1/workspace/events/:eventId/speakers/:eventSpeakerId` (AuthGuard)

When an operator PATCHes status to `confirmed` (from anything else), the service:
1. Sets `confirmed_at = now()` on the row
2. Dispatches `speaker_added` to every `status IN (registered, attended)` user of the event
3. Records `event_announcements` row with `kind='speaker_added', speaker=<id>` for idempotency

Per-speaker idempotency uses the new `event_announcements.speaker` FK — the unique tuple is `(event, kind='speaker_added', speaker)`. The same speaker can't double-dispatch; different speakers on the same event each get their own row.

### F-S1.1c — post-event cron

External scheduler POSTs to `/v1/internal/post-event/tick` (InternalAuthGuard) ~hourly. The service:
1. Finds events where `status='published' AND ends_at < now AND post_event_processed=false`.
2. For each:
   - Dispatches `speaker_thanks_with_referral_ask` to **confirmed speakers** (operational_contract — service-level "thanks for speaking")
   - Dispatches `next_event_teaser` to **attendees** if there's a next published event in same country (explicit_opt_in on `events` purpose — marketing-class)
   - Sets `events.post_event_processed = true` (LAST — so partial failures retry next tick)

Idempotency: the boolean. Once true, the event is skipped forever (until manually re-set in Directus admin).

## Anatomy of an event lifecycle (Sprint 1 stack)

```
operator drafts event in /workspace/events
operator adds + confirms 1-3 speakers (F-S1.1b)
  → each confirm → speaker_added dispatch to attendees
operator flips status draft → published (F-S1.1a)
  → event_announce dispatch to country audience
  → (operator may publish before all speakers confirmed; F-S1.1b dispatches continue post-publish)
T-7d before event:
  → F-S1.5 member-matching dispatch (3 people you might want to meet)
T-2d before event:
  → F-S1.4 reminder_72h dispatch ("bring a question")
T-3h before event:
  → F-S1.4 reminder_3h dispatch ("doors open in 3h")
event runs; operator scans QR check-ins at /checkin
ends_at < now (post-event cron fires within the hour):
  → F-S1.1c speaker_thanks_with_referral_ask → confirmed speakers
  → F-S1.1c next_event_teaser → attendees (if next event exists)
  → post_event_processed = true
operator visits /workspace/events/[id] (post phase):
  → F-S1.3 CSAT summary card surfaces collected ratings
  → operator works through the 4 followup checkbox items
```

## Scope cuts in v1

- **CSAT dispatch is NOT in F-S1.1c** — needs per-recipient template rendering to embed a `CsatService.mintToken(deliveryId)` link in each delivery's email body. The dispatcher renders one payload per interaction today, not per delivery. Until the renderer ships, CSAT must be manually triggered by an operator via `/workspace/announce` with `intent='csat'` and a tokenized link in the body. F-S1.1c will fire CSAT automatically once the renderer lands.
- **Speaker-side proposal flow** — speakers can't submit proposals via API today. Operators create `speakers` rows in Directus admin then add them to `event_speakers` via the workspace endpoint. Public proposal page is F-S4.x.
- **No web UI in this PR** — the speaker panel for `EventControlPanel` cabinet is intentionally deferred. Operators hit the API directly OR use the Directus admin during the gap. Cabinet UI is a follow-up.
- **No `speaker_added` for past-event speakers** — if an operator confirms a speaker AFTER the event has ended, the dispatch fires anyway (the service doesn't check `ends_at`). Acceptable: attendees might want to know who they heard speak. Documented here so it's not a surprise.

## Wiring the post-event cron scheduler

Same external-scheduler pattern as F-S1.4 reminders + F-S1.5 matches. Recommended: GitHub Actions cron, ~hourly:

```yaml
name: post-event-cron-tick
on:
  schedule:
    - cron: '15 * * * *' # every hour at :15
  workflow_dispatch: {}
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST \
            -H "x-internal-auth: $INTERNAL_API_TOKEN" \
            https://aiqadam.org/api/v1/internal/post-event/tick
        env:
          INTERNAL_API_TOKEN: ${{ secrets.INTERNAL_API_TOKEN }}
```

Hourly cadence matches the urgency — speaker thanks within ~1h of event end + teaser within ~1h is enough. Tighter cadence has no benefit.

## Operational verification

### Speaker pipeline

```bash
# Create event_speaker row
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"speakerId":"<spk-uuid>","talkTitle":"Why transformers?"}' \
  https://aiqadam.org/api/v1/workspace/events/<eventId>/speakers
# → 201 + { eventSpeaker: { status: 'invited', ... } }

# Confirm — fires speaker_added broadcast
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"status":"confirmed"}' \
  https://aiqadam.org/api/v1/workspace/events/<eventId>/speakers/<esId>
# → 200 + { eventSpeaker: { status: 'confirmed', confirmedAt: '...' } }
# Within seconds: registered attendees receive 'speaker_added' email.

# Verify ledger
# SELECT * FROM event_announcements
# WHERE event='<eventId>' AND kind='speaker_added' AND speaker='<spk-uuid>';
# → 1 row with dispatched_interaction_id + recipient_count
```

### Post-event cron

```bash
# After an event's ends_at has passed, tick:
curl -X POST -H "x-internal-auth: $TOKEN" \
  https://aiqadam.org/api/v1/internal/post-event/tick
# → { evaluated: 1, processed: [{eventId, speakerThanksRecipients, nextEventTeaserRecipients}], errors: [] }
# Confirmed speakers receive 'speaker_thanks_with_referral_ask'
# Attendees receive 'next_event_teaser' if a next event exists in the same country
# events.post_event_processed flips to true

# Tick again immediately → evaluated: 0 (filter excludes processed events)
```

## Failure modes + recovery

### "I confirmed a speaker but attendees didn't get the email"
1. Was the broadcast skipped? Look at api logs for `speaker_added skipped — already dispatched` — means a prior ledger row already exists for `(event, speaker)`. Delete it in Directus admin if you genuinely want to re-broadcast.
2. Were there zero attendees? `speaker_added no-audience` log line. The dispatch only fires when there's a registered/attended user — confirming a speaker for an empty event is a no-op (logged + ledger row recorded with `recipient_count=0`).
3. Check `interactions` for a row with `intent='speaker_added'` matching the timestamp; if missing, the broadcast didn't fire at all → check operator's PATCH response for an error.

### "Speaker got a thank-you for an event they didn't speak at"
Speaker rows track confirmed-status per event. If they got it, somebody confirmed them on that event. Check `event_speakers` for the row.

### "Two next_event_teaser emails for the same event"
Should be impossible — `post_event_processed` boolean is the gate. If it happens, look at Directus admin — somebody flipped the boolean back to false.

### "post-event cron processed an event but `post_event_processed` is still false"
Likely an error in one of the dispatch steps (the patch is the LAST step). Check api logs for `post-event tick error event=…`. Fix the underlying cause (Resend outage, etc.) and the next tick will reprocess.

### "I want to re-fire post-event for a specific event"
In Directus admin: `UPDATE events SET post_event_processed=false WHERE id='<uuid>';` → next tick reprocesses. WARNING: this WILL re-send speaker_thanks + next_event_teaser. Don't do it casually.

## Related

- `apps/api/src/modules/workspace/event-speakers.service.ts` — CRUD + speaker_added broadcast
- `apps/api/src/modules/workspace/event-speakers.controller.ts` — 4 operator endpoints
- `apps/api/src/modules/workspace/post-event-cron.service.ts` — tick orchestration + dispatch
- `apps/api/src/modules/workspace/post-event-cron.controller.ts` — POST entry
- `apps/api/test/event-speakers-service.spec.ts` — 5 unit tests
- `apps/api/test/post-event-cron-service.spec.ts` — 6 unit tests
- `apps/e2e/tests/smoke-speaker-pipeline.spec.ts` — 6 smoke tests
- `infrastructure/directus/bootstrap.sh` — `event_speakers` collection + `event_announcements.speaker` FK + `events.post_event_processed`
- UX copy: `speaker_added`, `speaker_thanks_with_referral_ask`, `next_event_teaser` in `ux-and-content-guidelines.md §13`
