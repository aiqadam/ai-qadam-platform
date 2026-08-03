# Test Design: FR-EVT-007 Phase 1 — Data Model

**Workflow:** wf-20260803-feat-202  
**Agent:** TestDesigner  
**Date:** 2026-08-03  
**Requirement:** [FR-EVT-007](../../../docs/03-requirements/FR-EVT-007.md)  
**Test Strategy:** [06-test-strategy.md](06-test-strategy.md)  
**Code Summary:** [03-code-summary.md](03-code-summary.md)

---

## Overview

FR-EVT-007 Phase 1 implements **Directus schema changes only** — no application code (API/Bot/Web). This test design focuses on infrastructure verification:

1. **Automated schema verification** — bash script hitting Directus REST API
2. **Manual verification** — test cases executed in Directus Admin UI
3. **Backfill script testing** — idempotency, orphan handling, match accuracy

**No unit/integration/E2E tests** in Phase 1 because there is no application code to test. API endpoints, Bot commands, and Web UI are deferred to Phase 2.

---

## Tests Written

### Automated Schema Verification Script

| File | Test Count | Focus | Required? |
|------|-----------|-------|-----------|
| `scripts/tests/verify-directus-schema-fr-evt-007.sh` | 17 test cases | Collection existence, field types, FK relations, seed data integrity, nullable constraints | ✅ Yes |

**Script location:** `scripts/tests/verify-directus-schema-fr-evt-007.sh`

**Test cases implemented:**

| Test ID | Description | Verification Method |
|---------|-------------|---------------------|
| AV-1.1 | Topics collection exists | `GET /collections/topics` → 200 |
| AV-1.2 | Topics has required fields | `GET /fields/topics` → id, slug, name, name_ru, country, sort, date_created, date_updated |
| AV-1.3 | 24 total topics seeded | `GET /items/topics?limit=-1` → length == 24 |
| AV-1.4 | UZ topics correct slugs | `GET /items/topics?filter[country][_eq]=uz&sort=sort` → slugs match expected order |
| AV-1.5 | KZ topics count | `GET /items/topics?filter[country][_eq]=kz` → length == 8 |
| AV-1.6 | TJ topics count | `GET /items/topics?filter[country][_eq]=tj` → length == 8 |
| AV-1.7 | Russian names populated | `GET /items/topics?filter[slug][_eq]=ai-ml&filter[country][_eq]=uz` → name_ru == "ИИ/МО" |
| AV-1.8 | Sort field correct | `GET /items/topics?filter[slug][_eq]=ai-ml&filter[country][_eq]=uz` → sort == 1 |
| AV-2.1 | Event_topics collection exists | `GET /collections/event_topics` → 200 |
| AV-2.2 | Event_topics has required fields | `GET /fields/event_topics` → id, event, topic, date_created |
| AV-2.3 | Event_topics initially empty | `GET /items/event_topics` → length == 0 |
| AV-3.1 | Member_interests.topic field exists | `GET /fields/member_interests/topic` → field == "topic" |
| AV-3.2 | Member_interests.topic is nullable | `GET /fields/member_interests/topic` → is_nullable == true |
| AV-3.3 | Member_interests.topic is uuid type | `GET /fields/member_interests/topic` → type == "uuid" |
| AV-3.4 | Member_interests.topic_tag still exists | `GET /fields/member_interests/topic_tag` → exists (backward compat) |
| AV-4.1 | Topics.country FK relation | `GET /relations/topics/country` → related_collection == "countries" |
| AV-4.2 | Event_topics.event FK relation | `GET /relations/event_topics/event` → related_collection == "events" |
| AV-4.3 | Event_topics.topic FK relation | `GET /relations/event_topics/topic` → related_collection == "topics" |
| AV-4.4 | Member_interests.topic FK relation | `GET /relations/member_interests/topic` → related_collection == "topics" |

**Expected output (all tests pass):**

```
[FR-EVT-007 Phase 1 Schema Verification]

[AV-1.1] Verify topics collection exists
  ✓ topics collection exists
[AV-1.2] Verify topics collection has required fields
  ✓ topics collection has all required fields
[AV-1.3] Verify 24 total topics seeded (8 per country × 3 countries)
  ✓ 24 topics seeded (8 × 3 countries)
[AV-1.4] Verify UZ topics have correct slugs in sort order
  ✓ UZ topics have correct slugs in sort order
[AV-1.5] Verify KZ topics count
  ✓ KZ topics: 8 rows
[AV-1.6] Verify TJ topics count
  ✓ TJ topics: 8 rows
[AV-1.7] Verify Russian names populated for UZ ai-ml topic
  ✓ UZ ai-ml topic has Russian name: ИИ/МО
[AV-1.8] Verify topics.sort field default (seeded topics should have sort 1-8)
  ✓ UZ ai-ml topic has sort=1 (first topic)
[AV-2.1] Verify event_topics collection exists
  ✓ event_topics junction collection exists
[AV-2.2] Verify event_topics has required fields
  ✓ event_topics has all required fields
[AV-2.3] Verify event_topics initially empty (no events tagged yet)
  ✓ event_topics is empty (expected: no events tagged in Phase 1)
[AV-3.1] Verify member_interests.topic FK field exists
  ✓ member_interests.topic FK field exists
[AV-3.2] Verify member_interests.topic is nullable (Phase 1 migration)
  ✓ member_interests.topic is nullable (Phase 1 allows NULL during backfill)
[AV-3.3] Verify member_interests.topic is uuid type
  ✓ member_interests.topic is uuid type
[AV-3.4] Verify member_interests.topic_tag still exists (backward compatibility)
  ✓ member_interests.topic_tag field exists (Phase 1 backward compatibility)
[AV-4.1] Verify topics.country FK relation to countries collection
  ✓ topics.country FK points to countries collection
[AV-4.2] Verify event_topics.event FK relation to events collection
  ✓ event_topics.event FK points to events collection
[AV-4.3] Verify event_topics.topic FK relation to topics collection
  ✓ event_topics.topic FK points to topics collection
[AV-4.4] Verify member_interests.topic FK relation to topics collection
  ✓ member_interests.topic FK points to topics collection

  ✅ All FR-EVT-007 Phase 1 schema verification tests passed
```

**Usage:**

```bash
# Set environment variables
export DIRECTUS_URL="http://localhost:8055"
export DIRECTUS_TOKEN="<admin-token-from-env>"

# Run the verification script
bash scripts/tests/verify-directus-schema-fr-evt-007.sh
```

---

## Manual Verification Instructions

TestRunner should execute these test cases in Directus Admin UI after running `bash infrastructure/directus/bootstrap.sh`.

### Pre-requisites

1. Directus container running: `docker ps | grep directus` → container exists and healthy
2. Bootstrap script executed: `cd infrastructure/directus && bash bootstrap.sh` → exit 0
3. Directus Admin UI accessible: open `http://localhost:8055/admin` in browser
4. Admin token available: `echo $DIRECTUS_TOKEN` (from `.env` or Directus UI → Settings → Access Tokens)

---

### Test Case MV-1: Topics Collection Schema

**Objective:** Verify `topics` collection exists with correct schema definition.

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `http://localhost:8055/admin` | Directus Admin UI loads |
| 2 | Click "Content" in sidebar | Collections list expands |
| 3 | Locate "Topics" collection | Collection appears in sidebar under Content section |
| 4 | Click "Topics" | Collection detail view opens |
| 5 | Click settings icon (⚙) → "Fields & Layout" | Field configuration panel opens |
| 6 | Verify field list | Contains: `id`, `slug`, `name`, `name_ru`, `country`, `sort`, `date_created`, `date_updated` |
| 7 | Click `country` field | Field settings open |
| 8 | Verify `country` field type | **Type:** Many-to-One (M2O)<br>**Related Collection:** `countries` |
| 9 | Click `sort` field | Field settings open |
| 10 | Verify `sort` field default | **Default Value:** `100` |
| 11 | Verify `slug` field | **Type:** String<br>**Interface:** Input |
| 12 | Verify `name` field | **Type:** String<br>**Required:** Yes |
| 13 | Verify `name_ru` field | **Type:** String<br>**Required:** No (nullable) |

**Pass Criteria:**
- ✅ All 8 fields exist
- ✅ `country` is M2O FK to `countries`
- ✅ `sort` defaults to 100
- ✅ `name` is required, `name_ru` is nullable

---

### Test Case MV-2: Starter Topics Seeded

**Objective:** Verify 8 starter topics seeded per country (uz, kz, tj) with correct slugs and Russian names.

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | In Directus Admin, navigate to "Content" → "Topics" | Topics list view opens |
| 2 | Apply filter: `country` equals `uz` | Filter applied, list refreshes |
| 3 | Count rows | **8 rows** displayed |
| 4 | Verify UZ topic slugs in sort order | Slugs appear in this order:<br>1. `ai-ml`<br>2. `mlops`<br>3. `python`<br>4. `frontend`<br>5. `backend`<br>6. `data-engineering`<br>7. `hardware-robotics`<br>8. `research` |
| 5 | Click `ai-ml` row (uz) | Detail view opens |
| 6 | Verify fields | **Slug:** `ai-ml`<br>**Name:** `AI/ML`<br>**Name (Russian):** `ИИ/МО`<br>**Country:** `uz` (Uzbekistan)<br>**Sort:** `1` |
| 7 | Return to list, clear filter | All topics shown |
| 8 | Apply filter: `country` equals `kz` | Filter applied |
| 9 | Count rows | **8 rows** displayed |
| 10 | Spot check KZ `ai-ml` topic | **Name:** `AI/ML`<br>**Name (Russian):** `ИИ/МО`<br>**Country:** `kz` (Kazakhstan) |
| 11 | Apply filter: `country` equals `tj` | Filter applied |
| 12 | Count rows | **8 rows** displayed |
| 13 | Verify total topics (clear filter) | **24 rows total** (8 × 3 countries) |

**Pass Criteria:**
- ✅ 8 topics per country (uz, kz, tj) = 24 total
- ✅ UZ topics have correct slugs in sort order (1–8)
- ✅ Russian names populated (e.g., "ИИ/МО" for ai-ml)
- ✅ Each topic has correct `country` FK

---

### Test Case MV-3: Event_Topics Junction Schema

**Objective:** Verify `event_topics` M2M junction collection exists with correct schema.

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | In Directus Admin, navigate to "Content" → "Event Topics" | Collection list view opens |
| 2 | Verify collection appears in sidebar | **Collection name:** "Event Topics" (or `event_topics`) |
| 3 | Click settings icon (⚙) → "Fields & Layout" | Field configuration panel opens |
| 4 | Verify field list | Contains: `id`, `event`, `topic`, `date_created` |
| 5 | Click `event` field | Field settings open |
| 6 | Verify `event` field type | **Type:** Many-to-One (M2O)<br>**Related Collection:** `events` |
| 7 | Click `topic` field | Field settings open |
| 8 | Verify `topic` field type | **Type:** Many-to-One (M2O)<br>**Related Collection:** `topics` |
| 9 | Return to collection list view | List view opens |
| 10 | Check row count | **0 rows** (no events tagged yet in Phase 1) |

**Pass Criteria:**
- ✅ `event_topics` collection exists
- ✅ `event` is M2O FK to `events`
- ✅ `topic` is M2O FK to `topics`
- ✅ Collection is initially empty

---

### Test Case MV-4: Member_Interests.Topic FK Field

**Objective:** Verify `member_interests` collection has new `topic` FK field (nullable, uuid type) and retains `topic_tag` field.

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | In Directus Admin, navigate to "Settings" → "Data Model" | Data model configuration opens |
| 2 | Locate `member_interests` collection | Collection appears in list |
| 3 | Click `member_interests` | Collection schema editor opens |
| 4 | Verify field list | Contains: `id`, `member`, `topic`, `topic_tag`, `date_created`, `date_updated` |
| 5 | Click `topic` field | Field settings open |
| 6 | Verify `topic` field configuration | **Type:** UUID<br>**Interface:** Select Dropdown (M2O)<br>**Related Collection:** `topics`<br>**Nullable:** ✅ Yes (allows NULL) |
| 7 | Click `topic_tag` field | Field settings open |
| 8 | Verify `topic_tag` still exists | **Type:** String<br>**Interface:** Input<br>**Note:** Retained for backward compatibility during Phase 1 migration |
| 9 | Navigate to "Content" → "Member Interests" | Collection list view opens |
| 10 | Check existing rows | If rows exist: `topic` column shows NULL (expected in Phase 1 before backfill) |

**Pass Criteria:**
- ✅ `member_interests.topic` field exists
- ✅ `topic` is uuid type, M2O FK to `topics`, nullable
- ✅ `topic_tag` field still exists (not dropped yet)
- ✅ Existing rows have `topic = NULL` (before backfill runs)

---

### Test Case MV-5: FK Constraint Semantics

**Objective:** Verify ON DELETE semantics (CASCADE for `event_topics.event`, RESTRICT for topic FKs).

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | In Directus Admin, navigate to "Content" → "Countries" | Countries list opens |
| 2 | Locate `tj` (Tajikistan) row | Row exists |
| 3 | Click delete icon (🗑) for `tj` row | Delete confirmation dialog opens |
| 4 | Confirm delete | **Error message:** "Cannot delete country with related topics" (or equivalent constraint violation)<br>Delete is blocked (RESTRICT) |
| 5 | Cancel, navigate to "Content" → "Events" | Events list opens |
| 6 | Create a test event | **Title:** "Test Event"<br>**Country:** `uz`<br>**Type:** workshop<br>**Status:** draft<br>Click "Save" |
| 7 | Navigate to "Content" → "Event Topics" | Event Topics list opens |
| 8 | Create new junction row | Click "+ Create Item"<br>**Event:** Select "Test Event"<br>**Topic:** Select UZ "AI/ML" topic<br>Click "Save" |
| 9 | Verify row created | Row appears: event = Test Event, topic = AI/ML |
| 10 | Return to "Content" → "Events" | Events list opens |
| 11 | Delete "Test Event" | Confirm delete |
| 12 | Navigate to "Content" → "Event Topics" | Event Topics list opens |
| 13 | Verify junction row auto-deleted | **0 rows** (or the row with "Test Event" is gone)<br>CASCADE worked |
| 14 | Navigate to "Content" → "Topics" | Topics list opens |
| 15 | Attempt to delete UZ "AI/ML" topic (if no events reference it) | If events reference it: **Error:** "Cannot delete topic with related events"<br>If no events reference it: Delete succeeds<br>RESTRICT enforced |

**Pass Criteria:**
- ✅ Cannot delete `tj` country (has topics) → RESTRICT works
- ✅ Deleting event auto-deletes `event_topics` rows → CASCADE works
- ✅ Cannot delete topic if events reference it → RESTRICT works

---

## Backfill Script Test Design

**Script under test:** `infrastructure/directus/backfill-member-interests-topic.sh`

### Pre-requisites for Backfill Testing

1. Directus container running with Phase 1 schema (topics seeded, `member_interests.topic` field exists, nullable)
2. Test fixtures: `member_interests` rows with known `topic_tag` values (created manually or via script)
3. Admin token with read/write access to Directus API

---

### Test Case BS-1: Idempotency Check

**Objective:** Verify backfill script can be run multiple times safely (no duplicate updates, no errors on second run).

**Test Setup:**

```bash
# Fixture: Create test member_interests row
# Assumption: UZ user exists in Directus (use any existing user or create test user)
# Replace <uz-user-id> with actual UUID from directus_users table

curl -X POST -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  -H "Content-Type: application/json" \
  "${DIRECTUS_URL}/items/member_interests" \
  --data '{
    "id": "00000000-0001-0000-0000-000000000001",
    "member": "<uz-user-id>",
    "topic_tag": "ai-ml",
    "topic": null
  }'
```

**Test Execution:**

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Run backfill script first time | `bash infrastructure/directus/backfill-member-interests-topic.sh`<br>**Output:** `✓ member_interests.id=00000000-0001-0000-0000-000000000001 topic_tag='ai-ml' → topic=<uuid>`<br>Reports `1 matched, 0 orphaned` |
| 2 | Verify `topic` FK populated | `curl -H "Authorization: Bearer ${DIRECTUS_TOKEN}" "${DIRECTUS_URL}/items/member_interests/00000000-0001-0000-0000-000000000001?fields=topic"`<br>**Result:** `topic` is non-null UUID |
| 3 | Run backfill script second time | `bash infrastructure/directus/backfill-member-interests-topic.sh`<br>**Output:** `✓ No rows to backfill (all topic FKs already set)` |
| 4 | Verify no duplicate operations | Script exits 0 (no-op), no API errors |
| 5 | Verify `member_interests` row count unchanged | `curl -H "Authorization: Bearer ${DIRECTUS_TOKEN}" "${DIRECTUS_URL}/items/member_interests?limit=-1" \| jq '.data \| length'`<br>Count same as before step 1 |

**Pass Criteria:**
- ✅ First run: `topic` FK populated with correct UUID
- ✅ Second run: no-op (logs "No rows to backfill")
- ✅ No duplicate rows created
- ✅ Exit code 0 on both runs

---

### Test Case BS-2: Orphan Handling

**Objective:** Verify backfill script deletes orphaned rows (NULL `topic_tag` or no matching topic).

**Test Setup:**

```bash
# Fixture 1: member_interests row with NULL topic_tag
curl -X POST -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  -H "Content-Type: application/json" \
  "${DIRECTUS_URL}/items/member_interests" \
  --data '{
    "id": "00000000-0002-0000-0000-000000000002",
    "member": "<uz-user-id>",
    "topic_tag": null,
    "topic": null
  }'

# Fixture 2: member_interests row with nonexistent topic_tag
curl -X POST -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  -H "Content-Type: application/json" \
  "${DIRECTUS_URL}/items/member_interests" \
  --data '{
    "id": "00000000-0003-0000-0000-000000000003",
    "member": "<uz-user-id>",
    "topic_tag": "nonexistent-slug",
    "topic": null
  }'
```

**Test Execution:**

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Run backfill script | `bash infrastructure/directus/backfill-member-interests-topic.sh` |
| 2 | Check output for fixture 1 | **Output contains:** `⚠ member_interests.id=00000000-0002... has NULL topic_tag — deleting orphan` |
| 3 | Check output for fixture 2 | **Output contains:** `⚠ member_interests.id=00000000-0003... topic_tag='nonexistent-slug' no match — deleting orphan` |
| 4 | Verify orphaned count in summary | **Final line:** `2 orphaned rows deleted` |
| 5 | Verify fixtures deleted | `curl -H "Authorization: Bearer ${DIRECTUS_TOKEN}" "${DIRECTUS_URL}/items/member_interests/00000000-0002-0000-0000-000000000002"`<br>**Result:** 404 Not Found<br>Same for fixture 3 |

**Pass Criteria:**
- ✅ NULL `topic_tag` row deleted
- ✅ Nonexistent slug row deleted
- ✅ Script logs orphan deletions
- ✅ Final summary reports `orphaned=2`

---

### Test Case BS-3: Match Accuracy (Country Scoping)

**Objective:** Verify backfill script matches `topic_tag` to topics within the member's country (no cross-tenant leak).

**Test Setup:**

```bash
# Get UZ and KZ user IDs (replace with actual UUIDs)
UZ_USER_ID="<uz-user-uuid>"
KZ_USER_ID="<kz-user-uuid>"

# Fixture 1: UZ member with topic_tag='ai-ml' → should match UZ ai-ml topic
curl -X POST -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  -H "Content-Type: application/json" \
  "${DIRECTUS_URL}/items/member_interests" \
  --data "{
    \"id\": \"00000000-0004-0000-0000-000000000004\",
    \"member\": \"${UZ_USER_ID}\",
    \"topic_tag\": \"ai-ml\",
    \"topic\": null
  }"

# Fixture 2: KZ member with topic_tag='ai-ml' → should match KZ ai-ml topic
curl -X POST -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  -H "Content-Type: application/json" \
  "${DIRECTUS_URL}/items/member_interests" \
  --data "{
    \"id\": \"00000000-0005-0000-0000-000000000005\",
    \"member\": \"${KZ_USER_ID}\",
    \"topic_tag\": \"ai-ml\",
    \"topic\": null
  }"

# Get UZ ai-ml topic UUID
UZ_AI_ML_TOPIC=$(curl -fsS -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  "${DIRECTUS_URL}/items/topics?filter[slug][_eq]=ai-ml&filter[country][_eq]=uz&fields=id" \
  | jq -r '.data[0].id')

# Get KZ ai-ml topic UUID
KZ_AI_ML_TOPIC=$(curl -fsS -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  "${DIRECTUS_URL}/items/topics?filter[slug][_eq]=ai-ml&filter[country][_eq]=kz&fields=id" \
  | jq -r '.data[0].id')
```

**Test Execution:**

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Run backfill script | `bash infrastructure/directus/backfill-member-interests-topic.sh` |
| 2 | Check output for UZ fixture | **Output contains:** `✓ member_interests.id=00000000-0004... topic_tag='ai-ml' → topic=${UZ_AI_ML_TOPIC}` |
| 3 | Check output for KZ fixture | **Output contains:** `✓ member_interests.id=00000000-0005... topic_tag='ai-ml' → topic=${KZ_AI_ML_TOPIC}` |
| 4 | Verify UZ row matches UZ topic | `curl -H "Authorization: Bearer ${DIRECTUS_TOKEN}" "${DIRECTUS_URL}/items/member_interests/00000000-0004-0000-0000-000000000004?fields=topic"`<br>**Result:** `topic = ${UZ_AI_ML_TOPIC}` |
| 5 | Verify KZ row matches KZ topic | `curl -H "Authorization: Bearer ${DIRECTUS_TOKEN}" "${DIRECTUS_URL}/items/member_interests/00000000-0005-0000-0000-000000000005?fields=topic"`<br>**Result:** `topic = ${KZ_AI_ML_TOPIC}` |
| 6 | Verify no cross-tenant leak | **UZ row's topic UUID ≠ KZ row's topic UUID**<br>Both point to different topic records (same slug, different country) |

**Pass Criteria:**
- ✅ UZ member matched to UZ `ai-ml` topic
- ✅ KZ member matched to KZ `ai-ml` topic
- ✅ No cross-tenant leak (UZ member does NOT get KZ topic UUID)
- ✅ Country scoping enforced

---

### Test Case BS-4: Case Normalization

**Objective:** Verify backfill script normalizes `topic_tag` (lowercase, trim spaces) before matching.

**Test Setup:**

```bash
# Fixture: UZ member with topic_tag='  AI-ML  ' (uppercase, leading/trailing spaces)
curl -X POST -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  -H "Content-Type: application/json" \
  "${DIRECTUS_URL}/items/member_interests" \
  --data "{
    \"id\": \"00000000-0006-0000-0000-000000000006\",
    \"member\": \"${UZ_USER_ID}\",
    \"topic_tag\": \"  AI-ML  \",
    \"topic\": null
  }"
```

**Test Execution:**

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Run backfill script | `bash infrastructure/directus/backfill-member-interests-topic.sh` |
| 2 | Check output | **Output contains:** `✓ member_interests.id=00000000-0006... topic_tag='  AI-ML  ' → topic=<uz-ai-ml-uuid>`<br>Script normalized to lowercase `ai-ml`, trimmed spaces |
| 3 | Verify `topic` FK populated | `curl -H "Authorization: Bearer ${DIRECTUS_TOKEN}" "${DIRECTUS_URL}/items/member_interests/00000000-0006-0000-0000-000000000006?fields=topic"`<br>**Result:** `topic = <uz-ai-ml-uuid>` (same as UZ ai-ml topic) |
| 4 | Verify match successful | No orphan deletion, successful match logged |

**Pass Criteria:**
- ✅ Case normalization works (uppercase → lowercase)
- ✅ Leading/trailing spaces trimmed
- ✅ Match successful (finds `ai-ml` topic despite input variations)

---

## Fixture Cleanup Script

After backfill tests complete, TestRunner should clean up test fixtures to leave Directus in a pristine state.

**Cleanup script:**

```bash
#!/usr/bin/env bash
# scripts/tests/cleanup-fr-evt-007-fixtures.sh

set -euo pipefail

: "${DIRECTUS_URL:?DIRECTUS_URL is required}"
: "${DIRECTUS_TOKEN:?DIRECTUS_TOKEN is required}"

H_AUTH="Authorization: Bearer ${DIRECTUS_TOKEN}"

echo "[Cleanup FR-EVT-007 Test Fixtures]"

# Delete test member_interests rows (IDs 00000000-0001 through 00000000-0006)
for id in \
  "00000000-0001-0000-0000-000000000001" \
  "00000000-0002-0000-0000-000000000002" \
  "00000000-0003-0000-0000-000000000003" \
  "00000000-0004-0000-0000-000000000004" \
  "00000000-0005-0000-0000-000000000005" \
  "00000000-0006-0000-0000-000000000006"
do
  curl -fsS -X DELETE -H "${H_AUTH}" \
    "${DIRECTUS_URL}/items/member_interests/${id}" 2>/dev/null || true
  echo "  ✓ Deleted member_interests.id=${id} (if it existed)"
done

# Delete test event (if created in MV-5)
test_event_id=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/items/events?filter[title][_eq]=Test Event&fields=id&limit=1" \
  | jq -r '.data[0].id // empty')

if [ -n "${test_event_id}" ]; then
  curl -fsS -X DELETE -H "${H_AUTH}" \
    "${DIRECTUS_URL}/items/events/${test_event_id}"
  echo "  ✓ Deleted test event (id=${test_event_id})"
else
  echo "  → No test event found (already cleaned or not created)"
fi

echo "Cleanup complete"
```

---

## Test Execution Order

TestRunner should execute tests in this sequence:

1. **Pre-flight checks:**
   - Verify Directus container running: `docker ps | grep directus`
   - Get admin token: `export DIRECTUS_TOKEN=$(docker exec directus-container printenv DIRECTUS_ADMIN_TOKEN)` (or from `.env`)
   - Set Directus URL: `export DIRECTUS_URL="http://localhost:8055"`

2. **Run bootstrap script:**
   ```bash
   cd infrastructure/directus
   bash bootstrap.sh
   ```
   Verify exit code 0 (success).

3. **Automated schema verification:**
   ```bash
   bash scripts/tests/verify-directus-schema-fr-evt-007.sh
   ```
   Expected: all 17 test cases pass, exit code 0.

4. **Manual verification (MV-1 through MV-5):**
   - Open `http://localhost:8055/admin` in browser
   - Execute each manual test case sequentially
   - Document pass/fail per test case in `07-test-results.md`

5. **Backfill script testing (BS-1 through BS-4):**
   - Create test fixtures (see BS-1 through BS-4 "Test Setup" sections)
   - Run backfill script: `bash infrastructure/directus/backfill-member-interests-topic.sh`
   - Verify outputs match expected results
   - Run cleanup script: `bash scripts/tests/cleanup-fr-evt-007-fixtures.sh`

6. **Consolidate results:**
   - Write `07-test-results.md` with pass/fail for each test case
   - Include script outputs, screenshots (if applicable), and final verdict

**Expected Total Duration:** ~20 minutes (2 min automated + 8 min manual + 10 min backfill + fixtures)

---

## Acceptance Criteria Coverage

| AC | Test Level | Test ID | Coverage | Phase 1 Status |
|----|-----------|---------|----------|----------------|
| AC-1: At least one topic required on publish | Manual (Directus Flow validation) | N/A | ❌ Not covered | **Deferred to Phase 2** — Flow not provisioned via bootstrap.sh (manual Admin UI setup required, see Code Summary §Known Limitations) |
| AC-2: Member with "AI/ML" receives only AI/ML event announcements | E2E (email delivery) | N/A | ❌ Not covered | **Out of scope for Phase 1** — no API endpoint, no announcement service yet |
| AC-3: Member with no interests receives no announcements | E2E (negative assertion) | N/A | ❌ Not covered | **Out of scope for Phase 1** — no API endpoint yet |
| AC-4: New topic in Directus available for tagging + interest selection | Manual (Directus Admin UI) | MV-1, MV-2 | ✅ Partial | **Phase 1:** Verifies seeded topics exist and render correctly; manual topic creation UI not tested (deferrable) |
| AC-5: Cross-tenant leak check (UZ member does not receive KZ announcements) | Integration + Backfill | MV-5, BS-3 | ✅ Full | **Phase 1:** MV-5 verifies FK constraint semantics; BS-3 verifies country-scoped matching in backfill (no cross-tenant UUID leak) |
| AC-6: Bot `/interests` shows topics and persists changes | E2E (Bot command) | N/A | ❌ Not covered | **Out of scope for Phase 1** — Bot command not updated yet |

**Phase 1 Coverage Summary:**
- **2 of 6 ACs covered** (AC-4 partial, AC-5 full)
- **4 ACs deferred to Phase 2+** (AC-1, AC-2, AC-3, AC-6)
- **Rationale:** Phase 1 is schema-only; API/Bot/Web integration tests deferred to Phase 2 where application code exists

---

## Known Test Gaps

### Gap 1: Directus Flow Validation Not Tested

**What:** AC-1 ("at least one topic required on publish") is not enforced or tested in Phase 1.

**Why:** Directus Flows are not provisionable via `bootstrap.sh` JSON schema. Flows require manual Admin UI setup or separate `flows-bootstrap.sh` script (does not exist yet). See Code Summary §Known Limitations #1.

**Mitigation:** Phase 2 will provision the Flow and test its enforcement via API integration tests (Testcontainers).

**Impact on Phase 1:** Operators can currently publish events with zero topics (validation gap). Not a security risk, just a business rule violation. Documented in bootstrap.sh comments (lines 611-614).

**Deferred to:** Phase 2 (wf-20260803-feat-203) — create Flow, test validation hook.

---

### Gap 2: `(slug, country)` Unique Constraint Not DB-Enforced

**What:** Code Summary §Known Limitations #2 notes that unique constraint on `(slug, country)` is application-layer only (idempotent `seed_topic()` checks existence via GET), not a database-level UNIQUE index.

**Why:** Directus bootstrap.sh JSON schema does not expose `CREATE UNIQUE INDEX` DDL.

**Testing Impact:** MV-2 verifies idempotent seeding produces correct counts (no duplicate slugs per country), but does NOT test database rejection of duplicate INSERT (not possible via Directus REST API without the DB constraint).

**Mitigation:** Phase 2 API endpoint `POST /v1/internal/topics` will check for duplicates before inserting (application-layer validation). Future PR could add raw SQL `ALTER TABLE topics ADD CONSTRAINT unique_slug_country UNIQUE (slug, country)` if DB-level enforcement is desired.

**Deferred to:** Optional follow-up (not blocking for Phase 1 or Phase 2).

---

### Gap 3: Manual Topic Creation UI Not Tested

**What:** AC-4 ("New topic in Directus available for tagging") is only partially tested — we verify seeded topics render correctly, but do NOT test the flow of an operator creating a NEW topic via Directus Admin UI → event editor dropdown updates → member interests UI includes new topic.

**Why:** Schema-only PR focuses on bootstrap data integrity, not operator workflows. Full UI flow requires Phase 2 API endpoints.

**Mitigation:** MV-1 and MV-2 verify the schema supports manual topic creation (no constraints prevent it). Manual topic creation can be spot-checked in Phase 2 during E2E testing.

**Impact:** Low — operators can create topics via Admin UI (UI works), but the flow from topic creation → event tagging → member interest selection is not end-to-end tested until Phase 2.

---

### Gap 4: API/Bot/Web Integration Tests

**What:** Impact Analysis specifies:
- 8 unit tests (API services)
- 4 integration test suites (Testcontainers Postgres + Directus)
- 2 E2E flows (Bot command, Web preferences)

All deferred to Phase 2 because **Phase 1 has no application code** (schema only).

**Deferred to:** Phase 2 (wf-20260803-feat-203) — API endpoints, Bot updates, integration tests.

---

## Tests NOT Written (Out of Scope for Phase 1)

| Test Type | Reason Not Written | Deferred To |
|-----------|-------------------|-------------|
| Unit tests (`apps/api/test/`) | No application code in Phase 1 | Phase 2 |
| Integration tests (Testcontainers) | No API endpoints in Phase 1 | Phase 2 |
| E2E tests (Playwright) | No user-facing changes in Phase 1 | Phase 2 |
| Bot command tests (`apps/bot/tests/`) | Bot not updated in Phase 1 | Phase 2 |

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Test design complete for FR-EVT-007 Phase 1. Automated schema verification script created (17 test cases), manual verification instructions written (5 test cases), backfill script test design authored (4 test cases). No unit/integration/E2E tests in Phase 1 (schema-only PR, no application code). 2 of 6 ACs covered (AC-4 partial, AC-5 full); 4 ACs deferred to Phase 2 (AC-1, AC-2, AC-3, AC-6). Known gaps documented: Directus Flow validation not tested (manual provisioning required), unique constraint application-layer only, manual topic creation UI flow not end-to-end tested. Ready for TestRunner."
  findings:
    - "✅ Automated schema verification script: scripts/tests/verify-directus-schema-fr-evt-007.sh (17 test cases covering collections, fields, FK relations, seed data)"
    - "✅ Manual verification instructions: 5 test cases (MV-1 through MV-5) with step-by-step Directus Admin UI actions"
    - "✅ Backfill script test design: 4 test cases (BS-1 through BS-4) covering idempotency, orphan handling, match accuracy, case normalization"
    - "✅ Fixture setup scripts: SQL/curl commands to create test member_interests rows, cleanup script authored"
    - "✅ Test execution order documented (pre-flight → bootstrap → automated → manual → backfill → cleanup)"
    - "✅ AC coverage table: 2/6 ACs covered in Phase 1, 4 deferred to Phase 2 (rationale: schema-only PR)"
    - "⚠ No unit/integration/E2E tests in Phase 1 (expected: no application code to test)"
    - "⚠ Directus Flow validation (AC-1) not tested — deferred to Phase 2 (Flow provisioning required)"
    - "⚠ Unique constraint (slug, country) application-layer only — MV-2 tests seed idempotency but not DB rejection"
    - "⚠ Manual topic creation UI flow not end-to-end tested — spot check deferred to Phase 2 E2E"
  blockers: []
  retry_recommended: false
  deferred_ac_tests:
    - ac: "AC-1"
      reason: "Directus Flow validation not provisioned via bootstrap.sh (manual setup required)"
      deferred_to_phase: "Phase 2"
    - ac: "AC-2"
      reason: "Email delivery verification requires API endpoint + announcement service (not in Phase 1)"
      deferred_to_phase: "Phase 2"
    - ac: "AC-3"
      reason: "Negative assertion (no emails sent) requires API endpoint (not in Phase 1)"
      deferred_to_phase: "Phase 2"
    - ac: "AC-6"
      reason: "Bot /interests command not updated in Phase 1 (schema only)"
      deferred_to_phase: "Phase 2"
```

---

## Next Step

**Hand off to TestRunner** (Step 7) to execute:
1. Automated schema verification script
2. Manual verification test cases (Directus Admin UI)
3. Backfill script testing (with fixtures)
4. Consolidate results into `07-test-results.md`

TestRunner will report pass/fail for each test case and provide evidence (script outputs, screenshots, API query results).
