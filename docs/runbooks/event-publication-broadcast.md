# Runbook: Event publication broadcast (`event_announce`)

**Audience:** country leads + super-admins.
**Pre-reading:** [ADR-0033](../adr/0033-community-member-graph.md), [ux-and-content-guidelines.md §13](../ux-and-content-guidelines.md#13-notification-copy-library), [interaction-architecture.md](../interaction-architecture.md), [operator-event-control.md](./operator-event-control.md).
**Ships:** F-S1.1a.

## What happens when an operator publishes an event

```
Operator opens /workspace/events/[id]
  → flips Status from Draft → Published
  → clicks Save
  → PATCH /v1/workspace/events/:id { status: 'published' }
     EventsService.patch reads PRIOR status first → 'draft'
     EventsService.patch PATCHes Directus
     EventsService.patch detects transition draft → published
       → fires EventBroadcastService.broadcastPublication(eventId)
         best-effort .catch() — never blocks the operator's response

EventBroadcastService.broadcastPublication
  → look up event_announcements (event, kind='published') — idempotency
       → if exists, log 'already_dispatched' + return existing row's data
  → fetch event (title, country, dates, capacity, location)
  → resolve audience: MembersService.resolveToUserIds({country: {_eq: event.country}})
       → hard cap 5000 (MAX_DISPATCH_AUDIENCE)
       → if 0, record no_audience ledger row + return
  → InteractionsService.dispatch({
       intent: 'event_announce',
       audience: { userIds: [...country members...] },
       consentBasis: 'explicit_opt_in',          ← marketing-class
       consentScope: { purpose: 'events' },      ← gates per-recipient
       allowedChannels: ['email'],
       payload: { subject, text }                ← ux §13 canonical shape
     })
  → record event_announcements ledger row
       (event, kind='published', dispatched_interaction_id, recipient_count, sent_at)
```

Per-recipient consent check (`ConsentService.check`) runs INSIDE the dispatcher: any recipient without an active `member_consents` row for `purpose='events'` is silently marked `delivery.state='skipped_consent'`. Operator can see the breakdown in `/workspace/announce` history (when that view ships) or directly in the `deliveries` collection.

## Idempotency contract

- **Re-saving the same event** with status still `published` → no re-broadcast (PRIOR-status check guards the trigger; ledger lookup short-circuits if the trigger somehow fires).
- **Publishing → cancelled → published again** (operator rolls back then re-publishes) → still no re-broadcast. The `event_announcements` row from the first publish persists. **If you genuinely need to re-broadcast** (e.g. major reschedule), delete the `event_announcements` row in Directus admin OR file a follow-up to add a "re-announce" operator action.
- **Concurrent operator publishes** (two ops save at the same moment) → both PATCH succeed; one wins the ledger insert via Directus's normal write semantics. The second insert errors but the broadcast's catch-all swallows it; the operator's PATCH response is unaffected.

## Audience model

v1 sends to **every member in the event's country**, regardless of their interest tags. Per-recipient `events` consent gates delivery. Future refinements (interest-tag filtering, opt-out-from-this-country, etc.) land in the marketing playbook §16 segmentation work.

`MAX_DISPATCH_AUDIENCE` cap of 5000 applies — if a country grows past that, the broadcast TRUNCATES silently (with `truncated: true` on the resolve result, but not surfaced today). For Year-1 scale (UZ ≤ ~3k members projected) this is comfortably within bounds.

## Failure modes + recovery

### "I published the event but nobody got the email"
Check, in order:
1. `event_announcements` row for that event with `kind='published'`. If missing, broadcast didn't fire — check api logs for `publication broadcast failed`.
2. If row exists with `recipient_count=0`, the country has zero members with the consent (or zero members at all).
3. If row exists with `recipient_count>0` but no email arrived for known-consented members, check `deliveries` collection filtered by `interaction=<dispatched_interaction_id>`. State will be `sent` / `failed` / `skipped_consent` / `skipped_policy`.
4. If state=`failed`, the Resend adapter logs the reason — check api container logs.

### "Two members got duplicate emails"
Shouldn't happen — idempotency on `(event, kind)` row. If it does, look for two `event_announcements` rows for the same event (operator manually deleted the first then re-published?).

### "I want to re-broadcast after a major reschedule"
Today: delete the `event_announcements` row for that event (kind='published') in Directus admin, then re-save the event status (any transition triggers a re-check, but you'll need to flip to draft + back to published OR add a follow-up endpoint that explicitly re-fires the broadcast).

**Follow-up worth filing**: "Operator re-broadcast button" in the event control panel that clears the ledger row + re-fires. Until then, the manual-delete dance is operator-only.

### "Broadcast is going to wrong country"
The event's `country` field is the source of truth. The cabinet doesn't currently let an operator change it (engineer-only per F-S3.4 runbook). If wrong, fix in Directus admin BEFORE publishing.

### "I want to preview the email before publishing"
v1: send to yourself first (set your account's `country` matching the event, ensure your `events` consent is granted, publish). v2 (future): "Send test" button on the event control panel.

## Audit + observability

- `event_announcements` is the ledger — query it for "did this event broadcast?"
- `interactions` collection (Sprint 5.5/4 dispatcher) is the audit trail per dispatch.
- `deliveries` collection has per-recipient outcome.
- API logs `publication broadcast dispatched event=X interaction=Y audience=N` on success and `publication broadcast failed event=X: …` on failure.

## Related

- `apps/api/src/modules/workspace/event-broadcast.service.ts` — orchestrator
- `apps/api/src/modules/workspace/events.service.ts` — trigger (`patch()` detects status flip)
- `apps/api/test/event-broadcast-service.spec.ts` — 4 unit tests (happy path + idempotent + no-audience + capacity copy)
- `infrastructure/directus/bootstrap.sh` `[event_announcements]` — ledger schema
- UX copy: [`ux-and-content-guidelines.md §13`](../ux-and-content-guidelines.md#13-notification-copy-library) `event_announce` row
- F-S1.1b (speaker_added) + F-S1.1c (post-event followup) reuse the same `event_announcements` pattern — they add new `kind` values to the same collection.
