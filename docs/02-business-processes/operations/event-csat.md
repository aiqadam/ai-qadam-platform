---
type: operator-runbook
---

# Runbook: Event CSAT — capture + operator surface

**Audience:** operators reading scores; engineers wiring the post-event dispatcher.
**Pre-reading:** [event-publication-broadcast.md](event-publication-broadcast.md), [event-pre-event-reminders.md](event-pre-event-reminders.md), [ux-and-content-guidelines.md §13](../../04-development/design-system/ux-and-content-guidelines.md#13-notification-copy-library), [ADR-0033](../../adr/0033-community-member-graph.md).
**Ships:** F-S1.2 (capture) + F-S1.3 (operator surface). The post-event cron that DISPATCHES the CSAT (intent `csat`) is F-S1.1c — when it ships, the link should embed a token minted by `CsatService.mintToken(deliveryId)`.

## End-to-end flow

```
1. Post-event dispatcher (F-S1.1c) sends interaction { intent: 'csat',
   payload: { event_id }, … } to attendee cohort.
   For each delivery, CsatService.mintToken(deliveryId) → HMAC JWT
   embedded in the email body as
     https://aiqadam.org/feedback/csat?t=<token>
2. Visitor lands at /feedback/csat?t=<token>
   → CsatForm reads ?t=
   → picks rating 1-5 + optional comment
   → POST /v1/feedback/csat { token, rating, comment? }
3. CsatService.submit:
   → verify HMAC (issuer aiqadam-api-csat, audience aiqadam-csat, 30-day TTL)
   → fetch interaction_deliveries.{id, responded_at, interaction.payload.event_id}
   → 401 if delivery missing / 409 if already responded
   → PATCH delivery { state: 'responded', responded_at: now }
   → INSERT interaction_responses {
        delivery, response_intent: 'csat_score',
        payload: { rating, comment? },
        event: <event_id from interaction.payload>
      }
4. Operator opens /workspace/events/[id] when phase = 'post'
   → cabinet renders CSAT card (CsatSummaryCard component)
   → GET /v1/workspace/events/:id/csat → CsatService.summaryForEvent
   → aggregates by interaction_responses.event (NEVER joins to recipient_user)
```

## Anonymity contract

| Layer | Contains user id? | Notes |
|---|---|---|
| `interaction_responses` row | **No** | `delivery` FK is present but only for dispatcher lifecycle (state=responded). The operator API never traverses `delivery → recipient_user`. |
| `interaction_responses.event` | n/a | Cohort-level link only |
| `interaction_responses.payload.rating` | n/a | The score itself |
| `interaction_responses.payload.comment` | n/a | Free-text; sanitised + capped at 4000 chars |
| `interaction_deliveries.responded_at` | technically yes (delivery has `recipient_user`) | Used for **idempotency only** — operator API never reads `responded_at` joined with `recipient_user` |
| `interaction_deliveries.state='responded'` | technically yes | Same as above — operational marker |

This is "anonymity by convention" not by schema constraint. Two enforcement aids:
1. `CsatService.summaryForEvent` deliberately queries `interaction_responses` filtered by `event` — never touches `interaction_deliveries.recipient_user`.
2. Code-review rule: any new operator-facing CSAT view must NOT join through the delivery FK. If you find yourself wanting to do per-operator-per-member CSAT analytics, file an ADR proposing the policy change first.

## Token contract

- **Algorithm:** HS256 (jose)
- **Secret:** `JWT_SIGNING_SECRET` (same secret used for access tokens + lead-verify tokens)
- **Issuer:** `aiqadam-api-csat`
- **Audience:** `aiqadam-csat`
- **Subject:** `interaction_deliveries.id` (uuid)
- **TTL:** 30 days from mint

Rotating `JWT_SIGNING_SECRET` invalidates outstanding CSAT links. Accept this; impacted users can re-request (no automated re-send today). Coordinate with auth runbook before any rotation.

## Operator-facing summary shape

`GET /v1/workspace/events/:id/csat` returns:

```json
{
  "csat": {
    "eventId": "<uuid>",
    "count": 42,              // accepted csat_score responses
    "delivered": 100,         // csat-intent deliveries that left the dispatcher
    "responseRate": 0.42,
    "avg": 4.31,              // or null when count == 0
    "distribution": { "1": 1, "2": 3, "3": 8, "4": 12, "5": 18 },
    "comments": [
      { "rating": 5, "comment": "great talks", "receivedAt": "2026-06-15T01:00:00.000Z" }
    ]
  }
}
```

Comments list is capped at **50** per request (`COMMENTS_LIMIT` constant) and each comment is truncated to **500 chars** in the preview (`COMMENT_PREVIEW_MAX`). Full comments live in Directus admin for engineer-only deep-dives.

## Failure modes + recovery

### "I clicked the link but got 'Missing token'"
The `?t=...` query param was stripped. Likely caused by an email client mangling the URL on copy-paste. Reply to the dispatcher's `from` address; operator can mint a fresh link via API (until a workspace UI lands).

### "I clicked the link but got 401 invalid_token"
Token is malformed, tampered with, or older than 30 days. Same recovery as above.

### "I clicked twice and got 'Already responded' the second time"
By design. One CSAT response per (member, event). The first submission is recorded.

### "Operator CSAT card shows 0 / 0 delivered"
Possible causes:
1. F-S1.1c post-event cron hasn't fired (or hasn't shipped) — no `csat` interactions exist for this event yet.
2. The CSAT was dispatched via a different intent name or without `payload.event_id` — check the interaction row in Directus admin.
3. The `delivered` denominator counts deliveries in `state IN (sent, delivered, opened, clicked, responded)` — failed/skipped don't count. If everything failed, the denominator is 0 and rate shows `—`.

### "Response rate looks low / doesn't match my expectation"
- Denominator = csat-intent deliveries that succeeded (sent or later state). Members who unsubscribed or never delivered (bounced) don't count.
- Numerator = accepted `csat_score` responses for THIS event. Out-of-range ratings (junk data) are silently skipped in the aggregate.

### "I want to delete a CSAT response"
Directus admin only (engineers). Operator UI deliberately can't because once you give operators delete-power, the anonymity story falls apart (deleting a row reveals which user it came from via the delivery FK).

## Related

- `apps/api/src/modules/workspace/csat.service.ts` — token mint/verify, submit, summary
- `apps/api/src/modules/workspace/csat.controller.ts` — public POST + operator GET
- `apps/api/test/csat-service.spec.ts` — 10 unit tests (token round-trip + submit happy path + 4 reject paths + summary aggregation + empty)
- `apps/web/src/pages/feedback/csat.astro` + `apps/web/src/components/CsatForm.tsx` — public form
- `apps/web/src/components/workspace/EventControlPanel.tsx` `CsatSummaryCard` — operator surface (rendered when event phase=post)
- `infrastructure/directus/bootstrap.sh` `[interaction_responses]` — added `event` FK
- Marketing playbook §17 NPS work depends on the same pattern (different `response_intent='enps_score'`).


## System requirements

| FR | Capability | Status |
|---|---|---|
| [FR-EVT-006](../../03-requirements/FR-EVT-006.md) | Post-event survey | Shipped |
| [FR-REG-001](../../03-requirements/FR-REG-001.md) | Registration flow | Shipped |
| [FR-NTF-001](../../03-requirements/FR-NTF-001.md) | Notification dispatcher | Shipped |
| [FR-CMS-003](../../03-requirements/FR-CMS-003.md) | Form builder | Shipped |
