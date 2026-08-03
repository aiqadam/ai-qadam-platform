# Requirement Validation: FR-EVT-007 (Event topic tagging and interest matching)

**Workflow:** wf-20260803-feat-202  
**Analyst:** RequirementAnalyst  
**Date:** 2026-08-03  
**Requirement File:** [docs/03-requirements/FR-EVT-007.md](../../../docs/03-requirements/FR-EVT-007.md)

---

## Raw Input

The requirement FR-EVT-007 already exists as a documented requirement in the repository at `docs/03-requirements/FR-EVT-007.md`. It was authored as part of Sprint 5.5 planning and specifies:

**Requirement text:** "Event topic tagging and interest matching - Events are tagged with community topics; members select interests; announcements target matching users"

**GitHub issue:** https://github.com/aiqadam/ai-qadam-platform/issues/134

**Current status:** Planned (not yet implemented)

---

## Analysis

### Completeness Assessment

Evaluated against the 5 completeness criteria:

#### 1. **Specific** ✅ PASS
- Clearly defines 7 functional scope items with concrete implementation details
- Specifies data model: `topics` collection with schema (`id`, `slug`, `name`, `name_ru`, `country`, `sort`)
- Specifies junction tables: `event_topics` (M2M) and `user_interests` (M2M)
- Defines Directus validation rules (at least one topic required on publish)
- Specifies API endpoints: `GET /v1/internal/announce-event`, plus internal endpoints for interest management
- Specifies bot command: `/interests` with toggle behavior
- Defines web UI surface: topic checkboxes on `/me/preferences`

#### 2. **Testable** ✅ PASS
All 6 acceptance criteria are observable and verifiable:
- **AC-1:** "At least one topic must be selected before an event can be published" — testable via Directus validation rejection
- **AC-2:** "A member who selects 'AI/ML' receives announcements only for events tagged with 'AI/ML'" — testable via email delivery verification
- **AC-3:** "A member with no interests set receives no announcement emails" — testable via negative assertion
- **AC-4:** "Adding a new topic in Directus makes it available for both event tagging and member interest selection" — testable via CRUD verification
- **AC-5:** "Cross-tenant leak check: a UZ member does not receive announcements for KZ events" — testable via isolation verification
- **AC-6:** "Bot `/interests` shows current topics and lets user toggle them; changes persist" — testable via state persistence check

#### 3. **Non-conflicting** ✅ PASS
No conflicts detected. Cross-referenced with:
- **FR-NTF-002** (Event announcement fan-out) — explicitly depends on FR-EVT-007 ✓
- **FR-NTF-005** (Notification preferences) — explicitly depends on FR-EVT-007 for `user_interests` table ✓
- **FR-NTF-003** (24h reminder) — notes dependency on FR-EVT-007 infrastructure ✓
- **FR-BOT-002** (Bot commands) — implements `/interests` command, references FR-EVT-007 ✓
- **FR-CMS-005** (Audience segments) — uses topic interests for segment criteria ✓
- **FR-ADM-006** (Country provisioning) — specifies seeding starter topics ✓

All dependencies are properly documented in both directions. No contradictions found.

#### 4. **Scoped to one module layer** ✅ PASS
- Primary module: **Events (EVT)** — owns the topics catalog and event-to-topic relationships
- Clean boundaries respected:
  - Topics data lives in Directus schema (content management)
  - NestJS API reads topics via Directus API (no cross-schema queries)
  - Bot calls NestJS API for interest management (proper layering)
  - Notifications module reads topic data through API interfaces (dependency injection)
- No violations of module isolation

#### 5. **Referenced** ⚠️ NEEDS FRONTMATTER UPDATE
- ✅ GitHub issue field is set: `https://github.com/aiqadam/ai-qadam-platform/issues/134`
- ❌ `business_process` frontmatter field is missing

**Required action:** Add `business_process` field to frontmatter based on UAT registry analysis.

### Conflicts with Existing Features

**None detected.** 

All downstream dependencies properly acknowledge this requirement:
- FR-NTF-002 lists FR-EVT-007 as a dependency
- FR-NTF-005 lists FR-EVT-007 as a dependency
- FR-NTF-003 notes infrastructure dependency
- No duplicate or contradictory topic/interest implementations found

### Architectural Feasibility

#### Data Schema Placement ✅ SOUND
- Topics in Directus schema: Follows established pattern (events, countries, partners all live in Directus)
- Junction tables in Directus schema: Consistent with M2M pattern used for `event_speakers`, `user_skills`
- Cross-schema query prohibition respected: API reads via Directus SDK, not direct SQL

#### Multi-tenancy ✅ SOUND
- Topics are country-scoped via `country` FK
- Requirement explicitly specifies country isolation in AC-5
- Aligns with tenant-aware repository pattern (architecture.md §Multi-tenancy)

#### Module Boundaries ✅ SOUND
- Events module owns topics catalog
- Users module reads topics for interest management
- Notifications module consumes topic-user intersection via service interface
- No circular dependencies created

#### API Design ✅ SOUND
- Internal endpoint pattern: `GET /v1/internal/announce-event` matches existing `/v1/internal/*` conventions
- Public endpoints follow REST conventions: `POST/DELETE /v1/me/profile/interests/:id`
- Bot integration via API: Consistent with FR-BOT-001 architecture

#### Performance Considerations ✅ ADDRESSED
- FR-NTF-002 specifies rate control for large fan-outs (>1000 members)
- Deduplication via `notifications_sent` table prevents duplicate announcements
- Indexed junction tables for efficient intersection queries

### Business Process Linkage

Based on BP-UAT registry analysis, this requirement affects:

| BP-UAT Code | Process Name | Relevance |
|-------------|--------------|-----------|
| BP-UAT-001 | Event publication broadcast | Uses topic-interest matching for announcement targeting |
| BP-UAT-004 | Operator cohort builder | Segment criteria includes topic interests |
| BP-UAT-005 | Operator announce composer | Segment-based targeting uses topic model |

**Recommended frontmatter addition:**
```yaml
business_process: 
  - BP-UAT-001
  - BP-UAT-004
  - BP-UAT-005
```

---

## Formalized Requirement

**Requirement identifier:** FR-EVT-007 (already assigned)  
**Module:** Events (EVT)  
**Status:** Planned → Ready for Development

### Statement

Events are tagged with community-specific topics (AI/ML, MLOps, Python, etc.) managed in Directus. Members select their topic interests via web preferences or bot commands. When an event is published, only members whose interests intersect with the event's topics (within the same country) receive announcements. This drives the notification fan-out system and ensures members receive relevant content only.

### Actors
- **Organizers:** Tag events with 1+ topics during creation/editing in Directus
- **Members:** Select/deselect topic interests via `/me/preferences` (web) or `/interests` (bot)
- **System:** Resolves matching audience on event publish, triggers fan-out

### Dependencies
- **Requires:** FR-EVT-001 (Event CRUD) — shipped
- **Enables:** 
  - FR-NTF-002 (Announcement fan-out) — blocked by this
  - FR-NTF-005 (Notification preferences) — blocked by this
  - FR-NTF-003 (24h reminder) — infrastructure dependency
  - FR-CMS-005 (Segment builder) — topic criteria
  - FR-BOT-002 `/interests` command — PR 5/6 references this

### Technical Scope

**Database (Directus schema):**
- `topics` collection: `id` (PK), `slug` (unique per country), `name` (en), `name_ru`, `country` (FK), `sort` (int)
- `event_topics` junction: `event` (FK), `topic` (FK)
- `user_interests` junction: `user` (FK to `directus_users`), `topic` (FK), `created_at`

**Validation:**
- Directus flow: Reject event publish if `event_topics` is empty
- Country-scoped: A topic created for UZ is not visible/selectable in KZ

**API Endpoints:**
- `GET /v1/internal/announce-event?event_id={id}` — returns list of `{user_id, email, telegram_id}` where interests ∩ event_topics ≠ ∅
- `GET /v1/me/profile/interests` — current user's interests
- `POST /v1/me/profile/interests` — add interest (upsert `user_interests`)
- `DELETE /v1/me/profile/interests/:topic_id` — remove interest

**Bot:**
- `/interests` command: Lists topics for user's country as inline keyboard (`[x]`/`[ ]`), toggle adds/removes row

**Web:**
- `/me/preferences` page: Topic checkboxes (multi-select), save triggers POST/DELETE batch

**Seeding:**
- `scripts/seed-topics.ts` (or equivalent): 6–8 starter topics per country on country provisioning

---

## Acceptance Criteria (Validated)

The existing 6 acceptance criteria in FR-EVT-007.md are **complete and testable**. No modifications needed. Reproduced here for reference:

- **AC-1:** At least one topic must be selected before an event can be published (Directus validation rejects empty `event_topics`).
- **AC-2:** A member who selects "AI/ML" receives announcements only for events tagged with "AI/ML".
- **AC-3:** A member with no interests set receives no announcement emails (opt-in model).
- **AC-4:** Adding a new topic in Directus makes it available for both event tagging and member interest selection.
- **AC-5:** Cross-tenant leak check: a UZ member does not receive announcements for KZ events.
- **AC-6:** Bot `/interests` shows the current topics and lets the user toggle them; changes persist.

**Test strategy note for TestDesigner:**
- AC-1: Directus validation test (attempt publish with empty topics)
- AC-2, AC-3: Integration test with Mailpit (seed event, seed users with/without interests, verify email recipients)
- AC-4: CRUD integration test (Directus API + NestJS API)
- AC-5: Multi-tenant isolation test (seed both UZ and KZ, verify no cross-pollination)
- AC-6: Bot FSM test + API integration (toggle, verify persistence)

---

## Recommendations for Implementation

### 1. Frontmatter Update Required

**File:** `docs/03-requirements/FR-EVT-007.md`

**Changes:**
```yaml
---
code: FR-EVT-007
name: Event topic tagging and interest matching
status: Planned
module: Events (EVT)
phase: Roadmap Sprint 5.5
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/134
business_process:              # ← ADD THIS
  - BP-UAT-001                 # ← Event publication broadcast
  - BP-UAT-004                 # ← Operator cohort builder
  - BP-UAT-005                 # ← Operator announce composer
---
```

### 2. Implementation Sequence

Recommended PR sequence (respects natural seams, AGENTS.md §4):

**PR 1: Data model**
- Directus `topics` collection + country seed script
- `event_topics` and `user_interests` junctions
- Directus validation flow (require ≥1 topic on publish)

**PR 2: API endpoints**
- Internal `/announce-event` resolver (intersection query)
- Public `/me/profile/interests` CRUD
- Unit + integration tests

**PR 3: Bot `/interests` command**
- FSM state for toggle flow
- Inline keyboard builder
- Integration with PR 2 API

**PR 4: Web preferences UI**
- `/me/preferences` topic checkboxes
- Batch save handler
- E2E test with Playwright

**PR 5: Fan-out integration**
- Wire FR-NTF-002 to call the intersection resolver
- BP-UAT verification

### 3. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Large fan-out (>1000 users) overloads email service | FR-NTF-002 specifies BullMQ job queue with controlled concurrency |
| Duplicate announcements | Dedupe on `notifications_sent.(user, event, channel, kind)` table |
| Cross-tenant data leak | AC-5 explicitly tests; country-scoped queries enforced by tenant middleware |
| Topic taxonomy diverges per country | Acceptable per requirement; each country manages own topics |

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-EVT-007 is complete, architecturally sound, non-conflicting, and ready for development. One minor frontmatter update required (business_process field)."
  findings:
    - "All 5 completeness criteria satisfied: specific, testable, non-conflicting, single-module-scoped, referenced"
    - "No architectural violations: respects data ownership, module boundaries, multi-tenancy, API conventions"
    - "No conflicts with existing requirements: all dependencies properly bidirectional"
    - "All 6 acceptance criteria are testable with clear verification paths"
    - "Frontmatter missing business_process field — should reference BP-UAT-001, BP-UAT-004, BP-UAT-005"
    - "GitHub issue field already correctly set"
    - "Recommended 5-PR implementation sequence respects natural vertical slices (AGENTS.md §4)"
```
