# Impact Analysis: FR-EVT-007 (Event topic tagging and interest matching)

**Workflow:** wf-20260803-feat-202  
**Analyst:** ImpactAnalyzer  
**Date:** 2026-08-03  
**Requirement:** [FR-EVT-007](../../../docs/03-requirements/FR-EVT-007.md)  
**Validation:** [01-requirement-validation.md](01-requirement-validation.md)

---

## DB Changes Required

**Yes** — Directus schema only. No Drizzle migrations.

### Schema Operations (in `infrastructure/directus/bootstrap.sh`)

1. **Create `topics` collection**
   - Primary key: `id` (uuid, auto-generated)
   - Unique constraint: `(slug, country)` — same slug can exist across countries
   - FK: `country → countries.code` (RESTRICT)
   - Indexes: `slug`, `country`, `sort`

2. **Create `event_topics` collection**
   - Primary key: `id` (uuid, auto-generated)
   - FKs: `event → events.id` (CASCADE), `topic → topics.id` (CASCADE)
   - Unique constraint: `(event, topic)`
   - Indexes: `event`, `topic`

3. **Alter `member_interests` collection**
   - **Drop** `topic_tag` varchar column  
   - **Add** `topic` uuid column, FK → `topics.id` (RESTRICT)
   - Keep `intent` enum
   - Add unique constraint: `(member, topic)`
   - **Migration strategy:** Backfill `topic` FK by matching `topic_tag` → `topics.slug`

4. **Add validation to `events` collection**
   - Directus hook: reject publish if `event_topics` count = 0 (AC-1)

5. **Seed `topics` rows**
   - Per country: 8 starter topics with `sort` 1–8
   - Slugs: `ai-ml`, `mlops`, `python`, `frontend`, `backend`, `data-engineering`, `hardware-robotics`, `research`

---

## Affected Layers

### API Layer (NestJS)

**New endpoint:** `GET /v1/internal/announce-event` (internal audience resolution)

**Modified modules:**
- `me-profile`: interests CRUD updated for FK schema
- `auth` (telegram-auth.service): dynamic topic fetch replaces hardcoded enum
- `internal`: new InternalAnnouncementsController

**Breaking changes:** 3 bot-facing endpoints (schema changes to `topicId` instead of `topic_tag`)

### Frontend Layer

- `/me/preferences` page: topic interests section added
- Bot `/interests` command: dynamic topic fetch

### Shared Types

New Zod schemas: `TopicSchema`, `EventTopicSchema`, `MemberInterestSchema`, `AnnounceEventAudienceSchema`

---

## Security Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `/v1/internal/announce-event` lacks auth | **BLOCKER** | Require `InternalAuthGuard` (bearer token) |
| Cross-tenant leak: UZ member sees KZ topics | **MAJOR** | Enforce country filter in all topic queries |
| Topic deletion orphans member_interests | **MINOR** | FK `ON DELETE RESTRICT` |

---

## Test Scope

- **Unit tests:** 8 test cases across 3 modules
- **Integration tests:** 4 test suites (Testcontainers Postgres + Directus)
- **E2E tests:** 2 flows (web preferences + bot command)

---

## Deployment Order

1. Directus schema (idempotent bootstrap script)
2. `packages/shared-types` (new Zod schemas)
3. API (new + modified endpoints)
4. Bot (updated `ApiClient`)
5. Web (updated `PreferencesForm`)

---

## Data Migration Strategy

**Backfill `member_interests.topic` FK:**
- Script: `infrastructure/directus/migrations/backfill-member-interests-topic-fk.js`
- Match `topic_tag` (lowercase, trim) to `topics.slug` WHERE `topics.country = member_country`
- Orphan handling: DELETE + log warning (expected orphans: 0)

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-EVT-007 impact fully analyzed; 2 new Directus collections, 3 API modules affected, 3 breaking endpoint changes, coordination with bot submodule required, no architecture violations."
  findings:
    - "New Directus collections: `topics`, `event_topics`"
    - "Modified Directus collection: `member_interests` (migration required)"
    - "New API endpoint: GET /v1/internal/announce-event (InternalAuthGuard required)"
    - "Modified API endpoints: breaking changes, bot coordination required"
    - "Frontend: /me/preferences extended, Bot: /interests updated"
    - "Test scope: 8 unit tests, 4 integration test suites, 2 E2E flows"
    - "Data migration: backfill member_interests.topic FK"
    - "Deployment order: Directus → shared-types → API → Bot → Web"
    - "Architecture compliance: ✅ Module boundaries, ✅ Multi-tenancy, ✅ No circular deps"
    - "Security risks: 1 BLOCKER (internal auth), 1 MAJOR (cross-tenant), 2 MINOR"
```
