# Impact Analysis: FR-NTF-002 (Event announcement topic-filtered fan-out)

**Workflow:** wf-20260803-feat-207-event-announcement-fanout  
**Analyst:** ImpactAnalyzer  
**Date:** 2026-08-03  
**Requirement:** [FR-NTF-002](../../../docs/03-requirements/FR-NTF-002.md)  
**Validation:** [01-requirement-validation.md](01-requirement-validation.md)

---

## Validated Requirement

**FR-NTF-002: Event announcement topic-filtered fan-out**

When an event transitions from draft to published status, the platform sends an announcement notification to all members in the event's country whose topic interests intersect with the event's topics. Members control delivery via per-channel notification preferences (`notification_email_enabled`, `notification_telegram_enabled`). Announcements are deduplicated per `(user, event, channel, kind)`.

**Current state:** `EventBroadcastService.broadcastPublication()` sends to ALL members in the event's country. This requirement adds topic-interest filtering on top of the existing broadcast infrastructure.

---

## Affected Layers

### API Layer (NestJS)

| Module | Files Modified | Change Type | Description |
|--------|---------------|-------------|-------------|
| `workspace` | `event-broadcast.service.ts` | **Modified** | Add topic-interest filtering to `broadcastPublication()` method; enable Telegram channel |
| `workspace` | `members.service.ts` | **Modified** | Extend `resolveToUserIds()` filter to support topic intersection queries |
| `directus` | `directus.client.ts` | **No change** | Existing Directus filter syntax supports topic joins |

**No new endpoints.** This is an internal service modification only.

**API surface changes:**

| Endpoint | Method | Change | Breaking? |
|----------|--------|--------|-----------|
| _(internal)_ | N/A | EventBroadcastService method signature unchanged | ❌ No |

### DB Changes Required

**No schema changes.** All required collections already exist from FR-EVT-007:

- ✅ `topics` collection (country-scoped topic catalog)
- ✅ `event_topics` M2M junction (events ↔ topics)
- ✅ `member_interests` M2M junction (directus_users ↔ topics)
- ✅ `event_announcements` ledger (idempotency tracking)
- ✅ `directus_users.notification_email_enabled` field (FR-NTF-005)
- ✅ `directus_users.notification_telegram_enabled` field (FR-NTF-005)

**Database operations at runtime:**

1. **Fetch event topics** via Directus API: `GET /items/event_topics?filter[event][_eq]={eventId}`
2. **Resolve audience with topic filter** via extended Directus query
3. **Dedupe check** via `event_announcements` ledger lookup (existing pattern)

### Shared Types

**No new schemas required.** Existing types are sufficient.

### Frontend

**No frontend changes.** This requirement affects backend broadcast logic only.

### Bot

**No bot changes.** Telegram delivery is handled by the notification dispatcher.

### Workers

**Optional (rate control clarification needed):** Defer BullMQ job queue to follow-up workflow if performance testing shows need.

---

## Cross-Module Calls

| Caller | Called | Via | Purpose |
|--------|--------|-----|---------|
| `EventBroadcastService` | `DirectusClient` | `directus.get()` | Fetch event data + event_topics junction |
| `EventBroadcastService` | `MembersService` | `resolveToUserIds()` | Resolve audience with topic filter |
| `EventBroadcastService` | `InteractionsService` | `dispatch()` | Send notifications via multi-channel dispatcher |

---

## Risk Flags

### Security Review Required

| Risk | Severity | Impact | Mitigation |
|------|----------|--------|------------|
| **Cross-tenant topic leak** | 🔴 MAJOR | UZ member receives KZ event announcement if topic filtering is not properly country-scoped | Verify `members.resolveToUserIds()` filter includes `country: { _eq: event.country }` AND `member_interests.topic` intersection. Add integration test AC-4 (tenant isolation). |
| **Missing consent enforcement** | 🟡 MINOR | User with `notification_email_enabled=false` receives email | Existing: `InteractionsService` enforces channel toggles. Verify AC-5 test coverage. |
| **Idempotency bypass** | 🟡 MINOR | Re-publishing event sends duplicate announcements | Existing: `event_announcements` ledger prevents re-dispatch. Verify AC-3 test coverage. |

---

## Test Scope

### Unit Tests

**File:** `apps/api/test/event-broadcast-service.spec.ts`

**Total:** 6 test cases (3 new, 3 modified).

### Integration Tests

**New suite:** `apps/api/test/event-broadcast-topic-filtering.integration.spec.ts`

**Total:** 3 integration test suites, ~12 test cases.

---

## File-Level Impact Summary

### Modified Files

| File | Lines Changed (est.) | Change Type | Complexity |
|------|---------------------|-------------|------------|
| `apps/api/src/modules/workspace/event-broadcast.service.ts` | +40 / -5 | Add topic fetching + filter logic | Medium |
| `apps/api/test/event-broadcast-service.spec.ts` | +60 / -10 | Update mocks, add 3 new test cases | Medium |

### New Files

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `apps/api/test/event-broadcast-topic-filtering.integration.spec.ts` | ~200 | Integration tests for topic filtering + tenant isolation |

**Total impact:** ~90 lines modified, ~200 lines added across 3 files (1 new, 2 modified).

---

## Implementation Plan (for CodeDeveloper)

### Step 1: Extend `EventBroadcastService.broadcastPublication()`

**File:** `apps/api/src/modules/workspace/event-broadcast.service.ts`

**Changes:**

1. **Fetch event topics** after `fetchEvent()`
2. **Modify audience filter** in `resolveToUserIds()` call
3. **Enable Telegram channel** in `allowedChannels`
4. **Add private method `fetchEventTopics()`**

### Step 2: Verify `MembersService.resolveToUserIds()` supports Directus nested filters

**No code changes required.**

### Step 3: Update unit tests

**File:** `apps/api/test/event-broadcast-service.spec.ts`

### Step 4: Add integration tests

**New file:** `apps/api/test/event-broadcast-topic-filtering.integration.spec.ts`

---

## Deployment Strategy

**Single-phase deployment (no breaking changes).**

**Rollback plan:** Revert single commit.

---

## Performance Considerations

| Concern | Impact | Mitigation |
|---------|--------|------------|
| **Nested Directus query** | +50-100ms query time | Monitor with AC-7 test |
| **Large audience dispatch** | Risk of overwhelming email service | Rely on existing batching; add BullMQ only if needed |

---

## Known Limitations & Follow-up Work

| Limitation | Severity | Follow-up |
|-----------|----------|-----------|
| **No BullMQ job queue for large audiences** | 🟡 MINOR | Defer to future workflow if AC-7 fails |
| **No retry mechanism** | 🟡 MINOR | Defer retry logic to future feature |
| **Email template not personalized** | 🟢 COSMETIC | Deferred to FR-NTF-001 Phase 2 |

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-NTF-002 impact fully analyzed; no schema changes, 1 service modified (EventBroadcastService + topic filtering), 3 test files (1 new, 2 modified), no breaking changes, no new cross-module dependencies, 1 MAJOR security risk flagged (tenant isolation) with mitigation plan."
  findings:
    - "✅ No database schema changes (FR-EVT-007 already shipped required collections)"
    - "✅ Modified: apps/api/src/modules/workspace/event-broadcast.service.ts (+40/-5 lines)"
    - "✅ Modified: apps/api/test/event-broadcast-service.spec.ts (+60/-10 lines)"
    - "✅ New: apps/api/test/event-broadcast-topic-filtering.integration.spec.ts (~200 lines)"
    - "✅ No API surface changes (internal service modification only)"
    - "⚠️ SECURITY RISK — Cross-tenant topic leak (MAJOR): Mitigation required"
    - "Test scope: 6 unit tests (3 new, 3 modified), 3 integration test suites"
    - "Deployment: single-phase, no breaking changes, revert-safe"
