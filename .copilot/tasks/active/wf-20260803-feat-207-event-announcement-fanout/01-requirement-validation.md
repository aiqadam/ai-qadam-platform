# Requirement Validation: FR-NTF-002 (Event announcement fan-out)

**Workflow:** wf-20260803-feat-207-event-announcement-fanout  
**Analyst:** RequirementAnalyst  
**Date:** 2026-08-03  
**Requirement File:** [docs/03-requirements/FR-NTF-002.md](../../../docs/03-requirements/FR-NTF-002.md)

---

## Raw Input

The requirement FR-NTF-002 exists as a documented requirement in the repository at `docs/03-requirements/FR-NTF-002.md`. It was authored as part of Sprint 5.5 planning (Roadmap Sprint 5.5) and specifies:

**Requirement text:** "Event announcement fan-out - When an event is published, the platform sends an announcement to all members whose topic interests intersect with the event's topics, for the same country."

**GitHub issue:** https://github.com/aiqadam/ai-qadam-platform/issues/136

**Current status:** Planned (not yet implemented)

**Module:** Notifications (NTF)

---

## Analysis

### Completeness Assessment

Evaluated against the 5 completeness criteria:

#### 1. **Specific** ✅ PASS with minor clarifications needed

The requirement defines 6 functional scope items:

1. **Trigger** — Directus flow `events-announce-on-publish` with action hooks on `events.items.create` and `events.items.update` where status flips draft→published. Idempotency via "already-published" check. ✅
2. **Audience resolution** — Filters by: topic intersection, `notification_email_enabled=true`, dedupe via `notifications_sent`, excludes `is_temporary=true`. ✅
3. **Fan-out** — `POST /v1/internal/announce-event` per matched user, dispatches via FR-NTF-001 dispatcher using template `event_announced`. ✅
4. **Rate control** — Audience >1000 → BullMQ job with controlled concurrency; otherwise direct dispatch. ⚠️ **NEEDS CLARIFICATION**
5. **Telegram channel** — Gated on FR-NTF-004; sends to users with `notification_telegram_enabled=true` and `telegram_id`. ✅
6. **Content** — Event title, date/time, venue, format chip, "Register now" CTA button. ✅

**Clarification needed on item 4 (Rate control):**
- The requirement specifies "BullMQ job with controlled concurrency" for large audiences
- The current architecture uses **Redis Streams + Python notifier** for Telegram delivery (per ADR-0034), not BullMQ
- BullMQ is used for internal NestJS background jobs, but FR-NTF-004 explicitly states rate limiting is the notifier's responsibility, not a "BullMQ outbox/dispatcher rate limiter"
- **Recommendation:** Clarify whether email fan-out to >1000 users should use BullMQ (reasonable for email), or if this is a stale reference to an earlier architecture

#### 2. **Testable** ✅ PASS

All 7 acceptance criteria are observable and verifiable:

- **AC-1:** "Publishing a new event sends announcement emails only to members who have at least one matching topic interest" — testable via email delivery verification with topic-filtered audience
- **AC-2:** "A member with no topic interests set receives no announcement" — testable via negative assertion
- **AC-3:** "Publishing the same event twice does not send a duplicate announcement" — testable via idempotency check (no second notification record)
- **AC-4:** "A member in a different country (KZ) does not receive announcements for UZ events" — testable via tenant isolation verification
- **AC-5:** "Users with `notification_email_enabled=false` are excluded" — testable via preference-gated delivery check
- **AC-6:** "The announcement email includes a working 'Register now' link to the event page" — testable via email content inspection and link click-through
- **AC-7:** "For large audiences (> 1000), the fan-out completes within 10 minutes without overloading the email service" — testable via performance/load test with timing assertion

#### 3. **Non-conflicting** ✅ PASS with architecture synchronization note

Cross-referenced with dependent and related requirements:

**Dependencies (requirement explicitly lists):**
- **FR-EVT-007** (Topic tagging) — status: In Progress ✓
- **FR-NTF-001** (Notification dispatcher) — status: Shipped ✓  
- **FR-NTF-004** (Telegram adapter) — status: Implemented; noted as "gating" Telegram fan-out ✓

**Implicit dependencies identified:**
- **FR-NTF-005** (Notification preferences) — status: Implemented; provides `notification_email_enabled` field ✓
- **FR-USR-004** (User preferences UI) — status: Shipped; provides web UI for managing notification toggles ✓

**Related features:**
- **EventBroadcastService** (`apps/api/src/modules/workspace/event-broadcast.service.ts`) — **CURRENT STATE MISMATCH**
  - The service **already exists** and implements publication broadcast pattern (F-S1.1a, kind='published')
  - **Gap:** Current implementation sends to ALL members in a country (`country: { _eq: event.country }`), **not filtered by topic interests**
  - This requirement (FR-NTF-002) is the addition of topic-interest-based filtering on top of the existing broadcast infrastructure

No contradictions found, but **architectural alignment issue** noted in item 4 above (BullMQ vs Redis Streams for rate control).

#### 4. **Scoped to one module layer** ✅ PASS

- Primary module: **Notifications (NTF)** — owns the fan-out orchestration and delivery
- Clean boundaries respected:
  - Reads event data via Directus API (no cross-schema queries)
  - Reads topic interests via existing `user_interests` table managed by FR-EVT-007
  - Calls notification dispatcher (FR-NTF-001) as a service interface
  - Telegram delivery routed through FR-NTF-004 adapter (proper channel abstraction)
  - Dedupe state tracked in `notifications_sent` collection
- No violations of module isolation

#### 5. **Referenced** ⚠️ NEEDS FRONTMATTER UPDATE

- ✅ GitHub issue field is set: `https://github.com/aiqadam/ai-qadam-platform/issues/136`
- ❌ `business_process` frontmatter field is missing

**Required action:** Add `business_process` field to frontmatter. Based on semantic search, this requirement relates to:
- **BP-UAT-001** (Event publication broadcast) — existing UAT tests the publication trigger and audience resolution

### Conflicts with Existing Features

**One architectural refinement needed (not a conflict):**

The requirement describes a **Directus flow** (`events-announce-on-publish`) as the trigger mechanism, but the current implementation uses a **NestJS-side pattern**:

**Current implementation:**
- `EventsService.patch()` detects draft→published transition (apps/api/src/modules/workspace/events.service.ts lines 110-130)
- Fires `EventBroadcastService.broadcastPublication()` best-effort `.catch()` (never blocks operator response)

**Requirement text:**
- "Directus flow `events-announce-on-publish`: action hook on `events.items.create` where `status=published`, and on `events.items.update` where `status` flips from `draft` to `published`"

**Resolution:** The NestJS-side trigger is architecturally superior (no Directus flow overhead, direct control, already integrated with API audit logging). The requirement text should be updated to match the implemented pattern, OR the Directus flow should be explicitly rejected in favor of the API-side trigger. **Recommendation:** Update requirement text to reflect NestJS-side trigger as the canonical pattern (cite F-S1.1a implementation).

No other conflicts detected. The `event_announcements` ledger pattern is already shipped and in use.

### Architectural Feasibility

#### Trigger Mechanism ✅ SOUND (with clarification)

**Current state (already shipped):**
- `EventsService.patch()` detects status flip
- Fires `EventBroadcastService.broadcastPublication()` asynchronously (best-effort)
- Idempotent via `event_announcements` ledger lookup

**Requirement state:**
- Describes Directus flow as trigger

**Verdict:** NestJS-side trigger is the correct pattern (already implemented). Requirement text should be updated to reflect reality, not the original Directus-flow plan.

#### Audience Resolution ✅ SOUND (requires new filtering logic)

**Current implementation:**
```typescript
// apps/api/src/modules/workspace/event-broadcast.service.ts lines 79-80
const { userIds, total } = await this.members.resolveToUserIds({
  country: { _eq: event.country },
});
```
**Sends to ALL members in the event's country.**

**Required change (FR-NTF-002):**
- Add topic intersection filter:
  ```typescript
  // Pseudocode — actual implementation will use Directus filter syntax
  const matchingUsers = await findUsersWhere({
    country: event.country,
    AND: [
      { user_interests.topic: { _in: event_topics } },
      { notification_email_enabled: true },
      { is_temporary: false },
      { NOT: { notifications_sent: { event_id: eventId, kind: 'event_announced' } } }
    ]
  });
  ```
- This requires:
  1. Reading `event_topics` for the event (M2M junction)
  2. Finding users with `user_interests` matching any of those topics (intersection)
  3. Applying existing consent/dedupe filters

**Feasibility:** Sound. All required data exists:
- `topics` collection (FR-EVT-007)
- `event_topics` M2M junction (FR-EVT-007)
- `user_interests` M2M junction (FR-EVT-007)
- `notifications_sent` dedupe table (mentioned in sprint-5-to-8-plan.md)

#### Rate Control / Concurrency ⚠️ NEEDS CLARIFICATION

**Requirement text:**
"If audience > 1000 members, fan-out is enqueued as a BullMQ job with controlled concurrency. Otherwise direct dispatch."

**Architecture reality:**
1. **Email delivery:** Uses `InteractionsService.dispatch()` which is already asynchronous and handles batching internally. No explicit BullMQ job queue exists for email fan-out today.
2. **Telegram delivery:** Uses Redis Streams + Python notifier (ADR-0034). Rate limiting is the notifier's responsibility (30 msg/sec), not a BullMQ job.

**Recommendation:**
- **For email:** Either (a) add BullMQ job queue for large email batches (reasonable), or (b) rely on existing InteractionsService batching (current behavior). Clarify in refined requirement.
- **For Telegram:** FR-NTF-004 already specifies rate limiting is the notifier's concern. Remove BullMQ reference from this requirement for Telegram channel.

#### Dedupe Mechanism ✅ SOUND

**Requirement specifies:**
- `notifications_sent` table with natural key `(user, event, channel, kind)` prevents duplicate sends

**Current state:**
- `event_announcements` ledger records `(event, kind='published')` — achieves idempotency at the **dispatch level** (entire cohort), not per-recipient
- FR-NTF-001 mentions `notifications_sent` for per-recipient tracking

**Verdict:** Both mechanisms work together:
1. `event_announcements` prevents duplicate dispatches (workflow-level idempotency)
2. `notifications_sent` prevents duplicate deliveries if a member appears in multiple cohorts (recipient-level idempotency)

Architecturally sound.

#### Telegram Integration ✅ SOUND (gated correctly)

**Requirement specifies:**
- Telegram fan-out is gated on FR-NTF-004 (status: Implemented)
- Sends to users with `notification_telegram_enabled=true` and `telegram_id`

**Current state:**
- FR-NTF-004 is marked "Implemented" (per requirement registry)
- `TelegramAdapter` exists (`apps/api/src/modules/interactions/channels/telegram-adapter.ts`)
- Eligibility check: `directus_users.telegram_user_id` set AND `telegram_opted_out_at` null

**Verdict:** Architecturally aligned. FR-NTF-002 can enable Telegram channel in the `allowedChannels` array when FR-NTF-004 is fully verified.

---

## Formalized Requirement

### FEAT-NTF-002: Event announcement topic-filtered fan-out

**Statement:**  
When an event transitions from draft to published status, the platform sends an announcement notification to all members in the event's country whose topic interests intersect with the event's topics. Members control delivery via per-channel notification preferences (`notification_email_enabled`, `notification_telegram_enabled`). Announcements are deduplicated per `(user, event, channel, kind)` to prevent duplicate sends. The dispatch is idempotent per `(event, kind='published')` so that re-saving an already-published event does not re-announce.

### Actors
- **System:** Detects draft→published transition, resolves matching audience, dispatches notifications
- **Members:** Receive announcement notifications via enabled channels (email, Telegram)
- **Organizers:** Trigger announcements by publishing events in Directus or via `/workspace/events/[id]` control panel

### Dependencies
- **FR-EVT-007** (Topic tagging) — In Progress; provides `topics`, `event_topics`, `user_interests` data model
- **FR-NTF-001** (Notification dispatcher) — Shipped; provides multi-channel dispatch infrastructure
- **FR-NTF-004** (Telegram adapter) — Implemented; enables Telegram channel delivery
- **FR-NTF-005** (Notification preferences) — Implemented; provides `notification_email_enabled`, `notification_telegram_enabled` fields

### Trigger Mechanism
- **Implemented pattern:** `EventsService.patch()` (NestJS API) detects `status` flip from `draft` to `published`
- **Calls:** `EventBroadcastService.broadcastPublication(eventId)` asynchronously (best-effort `.catch()`, never blocks operator response)
- **Alternative (requirement text, not implemented):** Directus flow `events-announce-on-publish` with action hooks
- **Verdict:** NestJS-side trigger is canonical; Directus flow approach is superseded

### Audience Resolution Algorithm

```typescript
// Pseudocode — actual implementation uses Directus SDK filter syntax
function resolveAudience(event: Event): Promise<string[]> {
  // 1. Get event's topics
  const eventTopics = await getEventTopics(event.id);
  
  // 2. Find users with matching interests
  const candidateUsers = await findUsersWhere({
    country: { _eq: event.country },
    user_interests: {
      topic: { _in: eventTopics.map(t => t.id) }
    },
    notification_email_enabled: { _eq: true },
    is_temporary: { _neq: true }
  });
  
  // 3. Dedupe against notifications_sent
  const alreadySent = await getAlreadySentUserIds(event.id, 'event_announced');
  const filteredUsers = candidateUsers.filter(u => !alreadySent.includes(u.id));
  
  return filteredUsers.map(u => u.id);
}
```

### Idempotency Guarantees

1. **Dispatch level:** `event_announcements` ledger records `(event, kind='published', dispatched_interaction_id, recipient_count, sent_at)`. Before dispatching, check if row exists. If exists, return `status: 'already_dispatched'`.
2. **Delivery level:** `notifications_sent` table records `(user, event, channel, kind)` per successful delivery. InteractionsService checks this before sending.

### Rate Control (Clarification Required)

**As written in requirement:**
- Audience >1000 → BullMQ job with controlled concurrency
- Audience ≤1000 → direct dispatch

**Clarification needed:**
- Email: Specify whether to add BullMQ job queue for large batches, or rely on existing InteractionsService batching
- Telegram: Rate limiting is handled by Python notifier (30 msg/sec, per ADR-0034 §Q2/Q6), not BullMQ. Remove BullMQ reference for Telegram channel.

**Recommendation for refined requirement:**
```markdown
4. **Rate control**
   - Email: For audiences >1000, dispatch is enqueued as a BullMQ background job with concurrency=10 (prevents overwhelming Listmonk/Resend). Otherwise, InteractionsService handles inline batching.
   - Telegram: Rate limiting is handled by the Python notifier process (30 msg/sec global limit per Telegram Bot API). NestJS side enqueues to Redis Streams; notifier consumes with rate control.
```

### Content Template

**Email:**
- Subject: `{event.title} — {dateShort}`
- Body (plain text + HTML):
  ```
  The next AI Qadam event is on.
  
  {event.title} on {dateLong}. {event.location}.
  
  Registration is open now: https://aiqadam.org/events/{event.id}
  {capacityHint if event.capacity set}
  
  — AI Qadam
  ```
- Unsubscribe link: Revokes `events` consent purpose

**Telegram:**
- Same content as email body
- Inline button: "Register now" → deep link to event page
- HTML formatting: `<b>`, `<i>`, `<a>` (Telegram-safe subset)

### Module Placement

- **Primary owner:** `apps/api/src/modules/workspace/event-broadcast.service.ts` (already exists)
- **New logic:** Add topic-interest filtering to `broadcastPublication()` method
- **Calls:** `InteractionsService.dispatch()` (FR-NTF-001) with `intent: 'event_announce'`, `consentScope: { purpose: 'events' }`, `allowedChannels: ['email', 'telegram']`

### Cross-references
- Depends on: FR-EVT-007, FR-NTF-001, FR-NTF-004, FR-NTF-005
- Consumed by: BP-UAT-001 (Event publication broadcast verification)
- Related: FR-ADM-003 (Announcement composer — different use case: operator-initiated cohort announcements, not event-triggered)

---

## Acceptance Criteria (draft for TestDesigner)

These map 1:1 to the requirement's ACs, with clarifications for testability:

### AC-1: Topic-filtered delivery
**Given:** An event with topics `["AI/ML", "MLOps"]` is published  
**And:** Member A has interests `["AI/ML"]`, Member B has interests `["Python"]`, Member C has no interests  
**When:** The announcement dispatch runs  
**Then:** Member A receives the announcement email, Members B and C do not

### AC-2: No interests = no announcement
**Given:** A member with `user_interests` empty (no rows)  
**And:** An event is published  
**When:** The announcement dispatch runs  
**Then:** The member does not receive any notification

### AC-3: Idempotency on re-publish
**Given:** An event is published and announcement is sent  
**When:** The event is saved again without changing status (stays `published`)  
**Then:** No second announcement is sent (check: no new `notifications_sent` row, `event_announcements` row unchanged)

### AC-4: Tenant isolation
**Given:** Event E1 in country `uz`, Event E2 in country `kz`  
**And:** Member M in country `kz` with interests matching E1's topics  
**When:** E1 is published  
**Then:** Member M does not receive E1's announcement (cross-tenant leak prevented)

### AC-5: Preference gating
**Given:** Member M has `notification_email_enabled=false`  
**And:** M has topic interests matching the published event  
**When:** The event is published  
**Then:** M does not receive the email announcement (preference respected)

### AC-6: Email content correctness
**Given:** An event is published  
**And:** At least one member receives the announcement  
**When:** The email is inspected  
**Then:** It contains a clickable "Register now" link to `https://aiqadam.org/events/{event.id}` that loads the event detail page

### AC-7: Large audience performance
**Given:** A published event with topics matching >1000 members  
**When:** The announcement dispatch runs  
**Then:** All eligible members receive the notification within 10 minutes (measured from dispatch initiation to last delivery recorded in `notifications_sent`)

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-NTF-002 is specific, testable, non-conflicting, architecturally feasible, and scoped to Notifications module. Two clarifications recommended before implementation: (1) Update trigger description to match NestJS-side pattern (not Directus flow), (2) Clarify rate-control mechanism for email (BullMQ or existing batching) and remove BullMQ reference for Telegram (ADR-0034 already specifies notifier-side rate limiting). Frontmatter `business_process` field should be added."
  findings:
    - "PASS — Completeness: All 6 functional scope items are specified with sufficient detail for implementation"
    - "PASS — Testability: All 7 acceptance criteria are observable and verifiable"
    - "PASS — Non-conflicting: Dependencies (FR-EVT-007, FR-NTF-001, FR-NTF-004, FR-NTF-005) are correctly identified; no contradictions found"
    - "PASS — Architectural feasibility: Topic-interest filtering aligns with existing data model; idempotency mechanism sound; Telegram integration properly gated"
    - "PASS — Module scoping: Notifications (NTF) module owns fan-out; clean boundaries with Events, Users, Interactions modules"
    - "RECOMMENDATION — Trigger mechanism: Requirement text describes Directus flow; implementation uses NestJS-side EventsService.patch() trigger (F-S1.1a, already shipped). Update requirement text to reflect NestJS pattern as canonical."
    - "RECOMMENDATION — Rate control: Clarify email batching strategy (BullMQ vs InteractionsService); remove BullMQ reference for Telegram (ADR-0034 specifies notifier-side rate limiting)."
    - "RECOMMENDATION — Add `business_process: [BP-UAT-001]` to frontmatter for UAT linkage"
