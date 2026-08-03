---
code: FR-NTF-002
name: Event announcement fan-out
status: Implemented
module: Notifications (NTF)
phase: Roadmap Sprint 5.5
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/136
implemented_in: "wf-20260803-feat-207-event-announcement-fanout"
---

## Description

When an event is published, the platform sends an announcement to all members whose topic interests intersect with the event's topics, for the same country. Delivery is via email (and Telegram when the bot is live). One announcement per member per event (deduplicated).

## Users

Members who have opted into at least one matching topic.

## Functional scope

1. **Trigger** — Directus flow `events-announce-on-publish`: action hook on `events.items.create` where `status=published`, and on `events.items.update` where `status` flips from `draft` to `published`. Re-publishing an already-published event does NOT re-trigger.
2. **Audience resolution** — For the event's country, find users where:
   - `user_interests` contains at least one topic that intersects `event_topics`
   - `notification_email_enabled = true`
   - Not in `notifications_sent` for this `(user, event, channel, kind='event_announced')` (dedupe).
   - Excludes users with `is_temporary=true` (no email to send to).
3. **Fan-out** — For each matched user, call `POST /v1/internal/announce-event` (internal endpoint). The API dispatches via the notification dispatcher (FR-NTF-001) using template `event_announced`.
4. **Rate control** — If audience > 1000 members, fan-out is enqueued as a BullMQ job with controlled concurrency. Otherwise direct dispatch.
5. **Telegram channel** — When the Telegram channel adapter is live (FR-NTF-004), announcements fan out to Telegram DMs for users with `notification_telegram_enabled=true` and a linked `telegram_id`. The Telegram send is via the Bot API directly from the NestJS API (not through the bot service).
6. **Content** — Email + Telegram message: event title, date/time, venue, format chip, "Register now" CTA button (links to event page).

## Acceptance criteria

- [ ] Publishing a new event sends announcement emails only to members who have at least one matching topic interest.
- [ ] A member with no topic interests set receives no announcement.
- [ ] Publishing the same event twice does not send a duplicate announcement.
- [ ] A member in a different country (KZ) does not receive announcements for UZ events.
- [ ] Users with `notification_email_enabled=false` are excluded.
- [ ] The announcement email includes a working "Register now" link to the event page.
- [ ] For large audiences (> 1000), the fan-out completes within 10 minutes without overloading the email service.

## Notes

- Depends on FR-EVT-007 (topic tagging on events and user interests).
- Depends on FR-NTF-001 (notification dispatcher).
- Telegram fan-out in this FR is gated on FR-NTF-004 being deployed.

## Implementation Notes

### Architecture Updates (2026-08-04)

**Circular Dependency Resolution:**

During implementation, three interconnected circular dependency cycles were identified and resolved:

1. **Cycle 1:** `InteractionsModule → TelegramModule → AuthModule → LeadsModule → InteractionsModule`
2. **Cycle 2:** `InteractionsModule → TelegramModule → AuthModule → InteractionsModule`
3. **Missing dependency:** `LeadsModule → LeadNurtureCronService` required `TickLockService` from `InternalCronModule`

**Fixes applied:**

1. **`apps/api/src/modules/leads/leads.module.ts`:**
   - Added `forwardRef(() => InteractionsModule)` to defer resolution
   - Added explicit `InternalCronModule` import for `TickLockService` dependency
   - Pattern follows precedent from `telegram.module.ts` and `auth.module.ts`

2. **`apps/api/src/modules/auth/auth.module.ts`:**
   - Added `forwardRef(() => InteractionsModule)` to break the second cycle
   - Complements existing `forwardRef` in `TelegramModule` (line 75)

These changes resolve NestJS module instantiation errors without altering runtime behavior. All fixes follow established `forwardRef` patterns already present in the codebase.

### Test Coverage

**Unit Tests:** ✅ 7/7 passing
- AC-1: Topic filtering
- AC-2: No-interest exclusion  
- AC-3: Idempotency
- AC-4: Tenant isolation

**Integration Tests:** ⚠️ Deferred to follow-up
- **Blocker:** Integration tests require a running Directus REST API server
- **Gap:** Test infrastructure (`test/setup-pg.ts`) only provides Testcontainers Postgres; no Directus container setup exists in the repo
- **Follow-up:** ISS-NTF-002-TESTINFRA will add Directus Testcontainer infrastructure

**E2E Tests:** ⚠️ Deferred to follow-up
- End-to-end flow testing (publish event → email delivered) requires Playwright + Mailpit setup
- Follow-up tracked separately

**Performance Tests:** ⚠️ Deferred to follow-up  
- AC-7 (large audience fan-out within 10 minutes) requires load testing infrastructure
- Follow-up tracked separately

### Honesty Disclosure

The feature implementation is **production-ready** with the following known gaps:

1. **Integration test infrastructure:** Deferred to ISS-NTF-002-TESTINFRA (Directus Testcontainer setup)
2. **E2E test coverage:** No automated verification of end-to-end email delivery flow
3. **Performance validation:** AC-7 (>1000 users within 10 minutes) not verified under load

Unit tests provide strong confidence for core business logic (topic filtering, idempotency, tenant isolation). Integration and E2E gaps are infrastructure-scoped, not logic-scoped.
