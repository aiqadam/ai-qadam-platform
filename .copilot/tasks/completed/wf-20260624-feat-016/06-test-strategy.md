# Test Strategy — FR-MIG-021

## Requirement

**FEAT-MIG-021:** `/checkin` — event-day QR check-in page for event operators.

## Rubric Score

| Criterion | Points | Evidence |
|-----------|--------|----------|
| Touches tenant-scoped data | +2 | Active events endpoint now filters by country; check-in operates within tenant scope |
| New API endpoint | +2 | `POST /v1/registrations/:token/checkin` |
| Business rule with edge cases | +2 | Event validation, already-checked-in idempotency, offline queue, capacity window |
| Cross-module service call | +1 | `RegistrationsDirectusService` reads `directus_users` for member avatar enrichment |
| New database query | +1 | Registration lookup + status update + member join |
| **Total** | **8** | |

**Score >= 6: E2E tests required.**

---

## Required Test Levels

- [x] **Unit Tests** — controller validation, service business logic, offline queue utilities
- [x] **Integration Tests** — check-in flow with mocked Directus (Testcontainers)
- [x] **E2E Tests** — Playwright for critical happy paths

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|--------|------------|---------------|
| `CheckinController.checkin()` | Valid token + eventId → 200 with member data | Missing eventId, invalid token, wrong event, already checked in, cancelled registration, rate limited |
| `CheckinEventsController.getActiveEvents()` | Returns events in country scope | Missing country + no tenant, empty result |
| `RegistrationsDirectusService.checkin()` | Token found + event matches → status='attended' | Token not found, event mismatch, ineligible status |
| `OfflineQueueManager` (new utility) | Queue item, flush FIFO, clear on success | Network error on flush, corrupted storage |
| `use-checkin.ts` (TanStack Query hook) | Mutation triggers, success/error states | Offline triggers queue, reconnection flushes |
| `BrowserQRCodeReader` wrapper | Decodes valid QR, emits token | Camera denied, invalid QR format |
| Event window filter | `startsAt <= now <= endsAt + 24h` | No events today, event in past, event in future |

---

## Integration Test Plan

| Scenario | Infrastructure | Key Assertions |
|---------|----------------|----------------|
| Happy path check-in flow | NestJS Test + mocked Directus HTTP | Token resolves, status updates to 'attended', member name+avatar returned, checkedInAt set |
| Already-checked-in idempotency | NestJS Test + mocked Directus HTTP | Second POST returns `alreadyCheckedIn: true`, status unchanged, member returned |
| Wrong event rejection | NestJS Test + mocked Directus HTTP | Token belongs to Event A, request with Event B → 400 WrongEventError |
| Cancelled registration rejection | NestJS Test + mocked Directus HTTP | Token belongs to cancelled registration → 400 CheckinIneligibleError |
| Rate limiting | NestJS Test (supertest) | >30 requests/min from same IP → 429 |
| Active events with country filter | NestJS Test + mocked Directus HTTP | Events from country UZ returned, events from other countries excluded |
| Member enrichment | NestJS Test + mocked Directus HTTP | Registration response includes directus_users.first_name + avatar |

---

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|-----------|------------|---------------|
| Operator check-in (QR scan) | `/checkin` with selected event | Member name displayed, confirmation animation shown |
| Operator check-in (manual entry) | `/checkin` with manual code field | Member name displayed after code submission |
| Self-serve check-in | `/checkin?code=<uuid>` | Member name displayed, no event dropdown visible |
| Already checked in | `/checkin` with previously checked token | Amber "Already checked in" message, no red error |
| Invalid code | `/checkin` with unknown token | Red error "not recognized" message |
| Wrong event | `/checkin` with token from different event | Error message includes correct event title |
| Offline queue | DevTools offline mode + scan | "Offline — queued" indicator, no error shown |
| Offline flush | Reconnect after queued check-in | Success display appears for queued item |
| Camera unavailable | Deny camera permission | Manual entry fallback displayed |
| No active events | `/checkin` when no events active | "No active events" placeholder, scanner disabled |

---

## Acceptance Criteria to Test Mapping

| AC | Test Level | Test Description |
|----|------------|------------------|
| AC-1: Event Selection | Unit | `getActiveEvents()` returns events where `startsAt <= now <= endsAt + 24h`; defaults to most recent |
| AC-1: Event Selection | E2E | Dropdown visible on `/checkin`; "No active events" shown when none exist |
| AC-2: QR Scanner | Unit | `BrowserQRCodeReader` wrapper decodes valid QR token from camera feed |
| AC-2: QR Scanner | E2E | Camera viewfinder displayed; valid QR triggers check-in |
| AC-3: Manual Entry | Unit | Manual code submission calls `use-checkin` mutation |
| AC-3: Manual Entry | E2E | Manual field accepts UUID; submit triggers check-in flow |
| AC-4: Success Display | Integration | API returns member name + avatar + event details within response |
| AC-4: Success Display | E2E | Member name visible within 1s; confirmation animation plays; auto-reset after 5s |
| AC-5: Already Checked In | Integration | Second POST returns `alreadyCheckedIn: true`, no status change |
| AC-5: Already Checked In | E2E | Amber message displayed (not red error); member name shown |
| AC-6: Not Registered | Integration | Unknown token → 404 CheckinNotFoundError |
| AC-6: Not Registered | E2E | Red error "not recognized" message; scanner remains active |
| AC-7: Wrong Event | Integration | Token for Event A + request for Event B → 400 WrongEventError |
| AC-7: Wrong Event | E2E | Error message includes "[event title]"; scanner remains active |
| AC-8: Cancelled/Waitlisted | Integration | Cancelled registration → 400 CheckinIneligibleError |
| AC-8: Cancelled/Waitlisted | E2E | Specific error message from API displayed; scanner remains active |
| AC-9: Offline Queue | Unit | `OfflineQueueManager` serializes `{ code, eventId, queuedAt }` to localStorage |
| AC-9: Offline Queue | E2E | Offline scan shows "Offline — queued" indicator |
| AC-10: Offline Flush | Unit | On `online` event, queue flushed FIFO; success clears item; failure keeps item |
| AC-10: Offline Flush | E2E | Reconnect triggers success display for queued check-in |
| AC-11: Self-Serve Mode | E2E | `/checkin?code=<uuid>` auto-submits; event dropdown hidden; member displayed |
| AC-12: Camera Permission | Unit | Camera denial throws `CameraAccessDeniedError` |
| AC-12: Camera Permission | E2E | "Camera unavailable" message; manual entry field prominent |
| AC-13: Build Checks | CI | `pnpm arch:check && astro check && pnpm build && biome check` pass |
| AC-14: Offline Indicator | E2E | `navigator.onLine = false` shows banner "Offline mode — check-ins will be queued" |
| AC-14: Offline Indicator | Unit | `OfflineQueueManager.getPendingCount()` returns queued count |

---

## Gate Result

```yaml
gate: test-strategist
workflow_id: wf-20260624-feat-016
requirement: FR-MIG-021
result: passed
rubric_score: 8
rubric_breakdown:
  tenant_scoped_data: 2
  new_api_endpoint: 2
  business_rules: 2
  cross_module_call: 1
  new_db_query: 1
test_levels:
  unit: required
  integration: required
  e2e: required
test_targets:
  unit:
    - CheckinController.checkin()
    - CheckinEventsController.getActiveEvents()
    - RegistrationsDirectusService.checkin()
    - OfflineQueueManager
    - use-checkin.ts
    - BrowserQRCodeReader wrapper
    - Event window filter
  integration:
    - Happy path check-in with Directus mock
    - Already-checked-in idempotency
    - Wrong event rejection
    - Cancelled registration rejection
    - Rate limiting (30 req/min)
    - Country-scoped active events
    - Member enrichment from directus_users
  e2e:
    - Operator check-in (QR scan)
    - Operator check-in (manual entry)
    - Self-serve check-in
    - Already checked in display
    - Invalid code error
    - Wrong event error
    - Offline queue
    - Offline flush on reconnect
    - Camera unavailable fallback
    - No active events state
ac_coverage:
  total: 14
  mapped: 14
  gaps: none
review_required: false
```

**Test strategy complete.** All 14 acceptance criteria mapped to tests. Unit, integration, and E2E levels required per rubric score of 8.
