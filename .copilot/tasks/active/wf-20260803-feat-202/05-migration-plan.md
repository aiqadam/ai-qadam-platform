# DB Migration Plan: FR-EVT-007 (Event topic tagging)

**Workflow:** wf-20260803-feat-202  
**Author:** DBMigrationAuthor  
**Date:** 2026-08-03  
**Requirement:** [FR-EVT-007](../../../docs/03-requirements/FR-EVT-007.md)  
**Impact Analysis:** [02-impact-analysis.md](02-impact-analysis.md)

---

## Requirement Summary

FR-EVT-007 introduces structured event topic tagging: events are tagged with one or more community topics (AI/ML, MLOps, Python, etc.); members select interests; announcements target matching users. This replaces the free-form `topic_tag` string in `member_interests` with a proper FK to a new `topics` collection.

---

## Schema Changes

**Target:** Directus schema only (no Drizzle migrations in `apps/api/drizzle/`)  
**File:** `infrastructure/directus/bootstrap.sh`

### 1. Create `topics` collection

New collection, country-scoped:

```bash
echo "[FR-EVT-007 — topics]"
ensure "collection topics" \
  "${DIRECTUS_URL}/collections/topics" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"topics",
    "schema":{"name":"topics"},
    "meta":{
      "icon":"category",
      "note":"Community topics for event tagging + member interests. Country-scoped. FR-EVT-007.",
      "sort_field":"sort"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"slug","type":"string","schema":{"is_nullable":false,"max_length":60},"meta":{"interface":"input","width":"half","required":true,"note":"Lowercase, hyphenated. Unique per country."}},
      {"field":"name","type":"string","schema":{"is_nullable":false,"max_length":100},"meta":{"interface":"input","width":"half","required":true,"note":"English display name"}},
      {"field":"name_ru","type":"string","schema":{"is_nullable":true,"max_length":100},"meta":{"interface":"input","width":"half","note":"Russian display name (optional)"}},
      {"field":"country","type":"string","schema":{"is_nullable":false,"max_length":2},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"sort","type":"integer","schema":{"is_nullable":false,"default_value":100},"meta":{"interface":"input","width":"half","note":"Display order in dropdown/checklist"}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}},
      {"field":"date_updated","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-updated"]}}
    ]
  }'

ensure "relation topics.country -> countries.code" \
  "${DIRECTUS_URL}/relations/topics/country" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"topics","field":"country","related_collection":"countries","schema":{"on_delete":"RESTRICT"}}'
```

**Indexes required:**
- `slug` — for API query by slug
- `country` — for tenant filtering (auto-indexed via FK)
- `sort` — for ordered dropdown rendering
- Unique constraint: `(slug, country)` — same slug can exist across countries (e.g. "ai-ml" in UZ and KZ)

**Note:** Directus bootstrap.sh does not expose index creation via JSON schema — indexes are created by Directus automatically for FK fields. The `(slug, country)` unique constraint will be enforced at the application layer (API endpoint validation + Directus Flow hook).

### 2. Create `event_topics` M2M junction

Standard M2M junction (events ↔ topics):

```bash
echo "[FR-EVT-007 — event_topics]"
ensure "collection event_topics" \
  "${DIRECTUS_URL}/collections/event_topics" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"event_topics",
    "schema":{"name":"event_topics"},
    "meta":{
      "icon":"link",
      "note":"M:N junction between events and topics. Operator-managed via /workspace/events/[id]. FR-EVT-007.",
      "sort_field":"date_created"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"event","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{title}}"}}},
      {"field":"topic","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}}
    ]
  }'

ensure "relation event_topics.event -> events.id" \
  "${DIRECTUS_URL}/relations/event_topics/event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"event_topics","field":"event","related_collection":"events","schema":{"on_delete":"CASCADE"}}'

ensure "relation event_topics.topic -> topics.id" \
  "${DIRECTUS_URL}/relations/event_topics/topic" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"event_topics","field":"topic","related_collection":"topics","schema":{"on_delete":"RESTRICT"}}'
```

**Indexes required:**
- `event` — auto-indexed via FK
- `topic` — auto-indexed via FK
- Unique constraint: `(event, topic)` — application-layer enforcement via Directus Flow hook

**Deletion semantics:**
- ON DELETE CASCADE for `event` — deleting an event removes its topic tags
- ON DELETE RESTRICT for `topic` — cannot delete a topic if events reference it

### 3. Alter `member_interests` collection

**Operations:**

1. **Add `topic` uuid FK** before dropping `topic_tag` (to allow backfill without data loss)
2. **Drop `topic_tag` varchar column** after backfill completes

**Implementation:**

```bash
echo "[FR-EVT-007 — member_interests.topic FK]"
ensure "field member_interests.topic" \
  "${DIRECTUS_URL}/fields/member_interests/topic" \
  "${DIRECTUS_URL}/fields/member_interests" \
  '{
    "field":"topic",
    "type":"uuid",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"select-dropdown-m2o",
      "width":"half",
      "display":"related-values",
      "display_options":{"template":"{{name}}"},
      "note":"FK to topics.id. Replaces topic_tag string. FR-EVT-007."
    }
  }'

ensure "relation member_interests.topic -> topics.id" \
  "${DIRECTUS_URL}/relations/member_interests/topic" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_interests","field":"topic","related_collection":"topics","schema":{"on_delete":"RESTRICT"}}'
```

**Drop `topic_tag` column:**

```bash
echo "[FR-EVT-007 — drop member_interests.topic_tag]"
drop_field "member_interests" "topic_tag"
```

**Migration order:**
1. Run bootstrap with `topic` field added (nullable)
2. Run backfill script (see §4 below) to populate `topic` FK from `topic_tag` strings
3. Verify zero NULL `topic` values remain (or handle orphans)
4. Run bootstrap with `drop_field` call to remove `topic_tag`
5. Alter `topic` field to `is_nullable:false` via PATCH `/fields/member_interests/topic`

**Indexes:**
- `topic` — auto-indexed via FK
- Unique constraint: `(member, topic)` — application-layer enforcement (already present as per-row business logic)

**Breaking change:** Existing bot `/interests` command reads `topic_tag` — coordination required (see §6).

### 4. Seed `topics` rows

Per-country starter topics (8 each):

```bash
seed_topic() {
  local country="$1" slug="$2" name="$3" name_ru="$4" sort="$5"
  local id
  id=$(curl -s -H "${H_AUTH}" \
    "${DIRECTUS_URL}/items/topics?filter%5Bslug%5D%5B_eq%5D=${slug}&filter%5Bcountry%5D%5B_eq%5D=${country}&fields=id&limit=1" \
    | jq -r '.data[0].id // empty' 2>/dev/null || true)
  if [ -n "${id}" ]; then
    echo "  ✓ topic ${country}/${slug} (exists)"
  else
    if directus_request_with_retry POST "${DIRECTUS_URL}/items/topics" \
         -H "${H_AUTH}" -H "${H_JSON}" \
         --data "$(jq -nc --arg c "$country" --arg s "$slug" --arg n "$name" --arg r "$name_ru" --argjson o "$sort" \
           '{country:$c,slug:$s,name:$n,name_ru:$r,sort:$o}')"; then
      echo "  + topic ${country}/${slug} (created)"
    else
      local code
      code=$(cat /tmp/directus-last-code 2>/dev/null || echo "?")
      echo "  ✗ topic ${country}/${slug} HTTP ${code}"
      return 1
    fi
  fi
}

echo "[FR-EVT-007 — seed topics for uz]"
seed_topic uz "ai-ml" "AI/ML" "ИИ/МО" 1
seed_topic uz "mlops" "MLOps" "MLOps" 2
seed_topic uz "python" "Python" "Python" 3
seed_topic uz "frontend" "Frontend" "Фронтенд" 4
seed_topic uz "backend" "Backend" "Бэкенд" 5
seed_topic uz "data-engineering" "Data Engineering" "Инженерия данных" 6
seed_topic uz "hardware-robotics" "Hardware/Robotics" "Железо/Робототехника" 7
seed_topic uz "research" "Research" "Исследования" 8

echo "[FR-EVT-007 — seed topics for kz]"
seed_topic kz "ai-ml" "AI/ML" "ИИ/МО" 1
seed_topic kz "mlops" "MLOps" "MLOps" 2
seed_topic kz "python" "Python" "Python" 3
seed_topic kz "frontend" "Frontend" "Фронтенд" 4
seed_topic kz "backend" "Backend" "Бэкенд" 5
seed_topic kz "data-engineering" "Data Engineering" "Инженерия данных" 6
seed_topic kz "hardware-robotics" "Hardware/Robotics" "Железо/Робототехника" 7
seed_topic kz "research" "Research" "Исследования" 8

echo "[FR-EVT-007 — seed topics for tj]"
seed_topic tj "ai-ml" "AI/ML" "ИИ/МО" 1
seed_topic tj "mlops" "MLOps" "MLOps" 2
seed_topic tj "python" "Python" "Python" 3
seed_topic tj "frontend" "Frontend" "Фронтенд" 4
seed_topic tj "backend" "Backend" "Бэкенд" 5
seed_topic tj "data-engineering" "Data Engineering" "Инженерия данных" 6
seed_topic tj "hardware-robotics" "Hardware/Robotics" "Железо/Робототехника" 7
seed_topic tj "research" "Research" "Исследования" 8
```

### 5. Add validation to `events` collection

**Validation requirement:** At least one topic must be selected before an event can be published (AC-1).

**Implementation:** Directus Flow hook on `items.update` and `items.create` for `events` collection:

- Trigger: `Filter` → `events` → `action = update OR create` → `status = published`
- Operation: `Run Script` (JavaScript)
  ```javascript
  module.exports = async function(data) {
    const eventId = data.keys[0];
    const topicCount = await $api.get(`/items/event_topics?filter[event][_eq]=${eventId}&aggregate[count]=*`);
    if (topicCount.data[0].count.id === 0) {
      throw new Error('Cannot publish event without at least one topic (FR-EVT-007 AC-1)');
    }
  }
  ```
- Rollback operation: reject the update (Directus returns 400 to the client)

**Note:** The Directus Flow definition is NOT created via `bootstrap.sh` — it is provisioned manually in Directus Admin UI or via `infrastructure/directus/flows-bootstrap.sh` (separate script for Flow definitions). This migration plan documents the required Flow; implementation is CodeDeveloper's responsibility (Step 6).

---

## Migration Files

**No Drizzle migration files.** This is a Directus-only schema change.

**Affected files:**
1. `infrastructure/directus/bootstrap.sh` — add 5 new sections:
   - `[FR-EVT-007 — topics]` (collection + relation + unique constraint note)
   - `[FR-EVT-007 — event_topics]` (collection + 2 relations)
   - `[FR-EVT-007 — member_interests.topic FK]` (field + relation)
   - `[FR-EVT-007 — drop member_interests.topic_tag]` (drop_field call)
   - `[FR-EVT-007 — seed topics]` (3 x 8 seed_topic calls)

2. `infrastructure/directus/backfill-member-interests-topic.sh` — new file (see §4 below)

**Type:** Forward-only with explicit backfill step.

**Destructive:** YES — `drop_field member_interests topic_tag` removes existing column and data. Backfill MUST succeed before this step runs.

---

## Backfill Migration Script

**File:** `infrastructure/directus/backfill-member-interests-topic.sh`

**Purpose:** Populate `member_interests.topic` FK by matching `topic_tag` (lowercase, trimmed) to `topics.slug` WHERE `topics.country = (SELECT country FROM directus_users WHERE id = member_interests.member)`.

**Algorithm:**

1. Fetch all `member_interests` rows WHERE `topic IS NULL` (existing data pre-migration)
2. For each row:
   - Fetch `member.country` via `directus_users.id = member_interests.member`
   - Normalize `topic_tag`: lowercase, trim, replace spaces with hyphens
   - Query `topics` WHERE `slug = normalized_tag AND country = member_country`
   - If match found: PATCH `member_interests` with `topic = topics.id`
   - If no match: log warning + DELETE the orphan row (expected orphans: 0 per impact analysis)
3. Report: matched count, orphan count

**Implementation:**

```bash
#!/usr/bin/env bash
# Backfill member_interests.topic FK from topic_tag strings.
# Run once after topics collection seeded, before dropping topic_tag.
#
# Usage:
#   DIRECTUS_URL=https://cms.aiqadam.org \
#   DIRECTUS_TOKEN=$(cat /tmp/aiqadam-secrets-DIRECTUS_TOKEN) \
#   bash infrastructure/directus/backfill-member-interests-topic.sh

set -euo pipefail

: "${DIRECTUS_URL:?DIRECTUS_URL is required}"
: "${DIRECTUS_TOKEN:?DIRECTUS_TOKEN is required}"

H_AUTH="Authorization: Bearer ${DIRECTUS_TOKEN}"
H_JSON="content-type: application/json"

echo "[Backfill member_interests.topic FK]"

# Fetch all member_interests rows where topic IS NULL
interests=$(curl -s -H "${H_AUTH}" \
  "${DIRECTUS_URL}/items/member_interests?filter[topic][_null]=true&fields=id,member,topic_tag&limit=10000" \
  | jq -c '.data[]')

if [ -z "${interests}" ]; then
  echo "  ✓ No rows to backfill (all topic FKs already set)"
  exit 0
fi

matched=0
orphaned=0

while IFS= read -r row; do
  id=$(echo "$row" | jq -r '.id')
  member=$(echo "$row" | jq -r '.member')
  topic_tag=$(echo "$row" | jq -r '.topic_tag // empty')

  if [ -z "${topic_tag}" ]; then
    echo "  ⚠ member_interests.id=${id} has NULL topic_tag — deleting orphan"
    curl -s -X DELETE -H "${H_AUTH}" "${DIRECTUS_URL}/items/member_interests/${id}" > /dev/null
    ((orphaned++))
    continue
  fi

  # Fetch member's country
  member_country=$(curl -s -H "${H_AUTH}" \
    "${DIRECTUS_URL}/users/${member}?fields=country" \
    | jq -r '.data.country // empty')

  if [ -z "${member_country}" ]; then
    echo "  ⚠ member_interests.id=${id} member=${member} has no country — deleting orphan"
    curl -s -X DELETE -H "${H_AUTH}" "${DIRECTUS_URL}/items/member_interests/${id}" > /dev/null
    ((orphaned++))
    continue
  fi

  # Normalize topic_tag: lowercase, trim, spaces → hyphens
  normalized=$(echo "$topic_tag" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr ' ' '-')

  # Find matching topic
  topic_id=$(curl -s -H "${H_AUTH}" \
    "${DIRECTUS_URL}/items/topics?filter[slug][_eq]=${normalized}&filter[country][_eq]=${member_country}&fields=id&limit=1" \
    | jq -r '.data[0].id // empty')

  if [ -n "${topic_id}" ]; then
    # Patch member_interests with topic FK
    curl -s -X PATCH -H "${H_AUTH}" -H "${H_JSON}" \
      "${DIRECTUS_URL}/items/member_interests/${id}" \
      --data "{\"topic\":\"${topic_id}\"}" > /dev/null
    echo "  ✓ member_interests.id=${id} topic_tag='${topic_tag}' → topic=${topic_id}"
    ((matched++))
  else
    echo "  ⚠ member_interests.id=${id} topic_tag='${topic_tag}' no match in topics (country=${member_country}) — deleting orphan"
    curl -s -X DELETE -H "${H_AUTH}" "${DIRECTUS_URL}/items/member_interests/${id}" > /dev/null
    ((orphaned++))
  fi
done <<< "${interests}"

echo ""
echo "Backfill complete: ${matched} matched, ${orphaned} orphaned"

if [ "${orphaned}" -gt 0 ]; then
  echo "⚠ ${orphaned} rows were deleted (no matching topic). Review logs."
fi
```

**Error handling:**
- NULL `topic_tag` → delete (orphan)
- Member has no `country` → delete (orphan)
- No matching `topics.slug` for `(normalized_tag, member_country)` → delete + log warning

**Expected orphans:** 0 per impact analysis. If orphans > 0, review before proceeding.

---

## Tenant Scoping

**New tables tenant-scoped:**
- ✅ `topics.country` (uuid FK → `countries.code`) — tenant boundary
- ❌ `event_topics` — not tenant-scoped (inherits from `events.country` via FK)
- ❌ `member_interests` — not tenant-scoped (inherits from `directus_users.country` via FK)

**Indexes:**
- `topics.country` — auto-indexed via FK (ensures O(1) tenant filtering in API queries)

**Cross-tenant leak protection:**
- API query for topics MUST filter by `country = request.user.country`
- API query for `event_topics` MUST join through `events.country = request.user.country`
- API query for `member_interests` MUST join through `directus_users.country = request.user.country`
- Directus permission policy enforces `{"country":{"_eq":"$CURRENT_COUNTRY"}}` filter on `topics` collection

---

## Rollback Strategy

### Safe rollback (before `drop_field` step)

1. **If backfill fails:** restore from Postgres backup (pre-migration snapshot)
2. **If validation Flow causes issues:** disable the Flow in Directus Admin → no schema rollback needed
3. **If API/bot coordination breaks:** revert API + bot code via `git revert` — schema stays (forward-compatible)

### Unsafe rollback (after `drop_field` step)

**`drop_field member_interests topic_tag` is DESTRUCTIVE and IRREVERSIBLE** — Directus runs `ALTER TABLE member_interests DROP COLUMN topic_tag` which deletes data at the Postgres level.

**Recovery options:**
1. **Restore from Postgres backup** taken BEFORE `drop_field` step
2. **Recreate `topic_tag` column** manually via Directus Admin → `ALTER TABLE` (empty column) → backfill from `topics.slug` via reverse join (lossy if topics.slug ≠ original topic_tag)

**Recommended rollback strategy:**
- Take Postgres dump BEFORE running bootstrap with `drop_field` call:
  ```bash
  pg_dump -h localhost -U aiqadam_cms -d aiqadam_cms --no-owner --no-acl \
    --table=member_interests --table=topics --table=event_topics \
    > /tmp/directus-pre-drop-topic-tag.sql
  ```
- If rollback needed: `psql -h localhost -U aiqadam_cms -d aiqadam_cms < /tmp/directus-pre-drop-topic-tag.sql`

**Migration phases (minimize risk):**

| Phase | Action | Rollback cost |
|---|---|---|
| 1 | Add `topics` collection + seed | Zero (DROP TABLE) |
| 2 | Add `event_topics` collection | Zero (DROP TABLE) |
| 3 | Add `member_interests.topic` FK (nullable) | Zero (DROP COLUMN) |
| 4 | Run backfill script | Low (DELETE orphans + Postgres restore) |
| 5 | **POINT OF NO RETURN** — `drop_field topic_tag` | HIGH (Postgres restore only) |
| 6 | Alter `topic` to NOT NULL | Low (ALTER COLUMN) |
| 7 | Deploy API/bot code | Low (git revert) |

**Recommendation:** Execute phases 1–4 in one maintenance window, verify success, then execute phase 5 in a second window after smoke tests pass.

---

## Coordination with Other Changes

**Breaking changes to bot API:**
- `GET /me/interests` response shape changes from `{ topic_tag: string, intent: string }` to `{ topic: { id, slug, name }, intent: string }`
- `POST /me/interests` body changes from `{ topic_tag: string, intent }` to `{ topic_id: uuid, intent }`

**Deployment order (per impact analysis):**
1. Directus schema (this migration) — run `bootstrap.sh` with FR-EVT-007 sections
2. Backfill script — run `backfill-member-interests-topic.sh`
3. `packages/shared-types` — deploy new Zod schemas (`TopicSchema`, `EventTopicSchema`, `MemberInterestSchema`)
4. API — deploy modified endpoints + new `InternalAnnouncementsController`
5. Bot — deploy updated `ApiClient` (reads `topic.slug` instead of `topic_tag`)
6. Web — deploy updated `/me/preferences` form (reads topics collection)

**Rollout strategy:** Blue-green deployment with API/bot coordination gate — do not deploy bot until API reflects new schema.

---

## Self-Check

- [x] All tenant-scoped tables have `country` column: `topics.country` (FK → countries.code)
- [x] All foreign keys indexed: `topics.country`, `event_topics.event`, `event_topics.topic`, `member_interests.topic` (Directus auto-indexes FKs)
- [x] `date_created` / `date_updated` present on every new table: `topics`, `event_topics` (yes), `member_interests` (already exists)
- [x] No raw SQL hand-written: all schema changes via Directus bootstrap.sh JSON (Directus generates SQL)
- [x] Migration is reversible: **partially** — phases 1–4 are reversible; phase 5 (`drop_field`) requires Postgres restore
- [x] Destructive change documented: YES — `drop_field member_interests topic_tag` is destructive; rollback = Postgres restore

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-EVT-007 Directus schema complete: 2 new collections (topics, event_topics), 1 altered collection (member_interests), 8 topics seeded per country, backfill script authored, rollback strategy documented with POINT OF NO RETURN at phase 5."
  findings:
    - "Schema changes: topics collection (country-scoped), event_topics M2M junction, member_interests.topic FK (replaces topic_tag)"
    - "Migration type: forward-only with explicit backfill step"
    - "Destructive: YES — drop_field member_interests.topic_tag (phase 5) deletes data; Postgres backup required"
    - "Tenant scoping: topics.country FK + index; cross-tenant leak protection via API filter + Directus policy"
    - "Rollback strategy: phases 1-4 reversible (DROP TABLE/COLUMN); phase 5+ requires Postgres restore"
    - "Coordination: breaking changes to bot API (topic_tag → topic_id); deployment order: Directus → backfill → shared-types → API → Bot → Web"
    - "Validation: Directus Flow hook enforces ≥1 topic on event publish (AC-1)"
    - "Backfill script: backfill-member-interests-topic.sh matches topic_tag → topics.slug per member.country; orphan handling = DELETE + log"
  output_file: ".copilot/tasks/active/wf-20260803-feat-202/05-migration-plan.md"
  timestamp: "2026-08-03T00:00:00Z"
```

---

## Next Steps (for CodeDeveloper)

1. **Implement bootstrap.sh additions** — insert 5 new sections at appropriate locations (after existing `member_interests` section, before permissions section)
2. **Create backfill script** — `infrastructure/directus/backfill-member-interests-topic.sh` as specified in §4
3. **Create Directus Flow** for event publish validation — via `infrastructure/directus/flows-bootstrap.sh` or manual Admin UI provisioning
4. **Test locally:**
   ```bash
   # 1. Run bootstrap with new sections
   DIRECTUS_URL=http://localhost:8055 \
   DIRECTUS_TOKEN=$(cat /tmp/aiqadam-secrets-DIRECTUS_TOKEN) \
   bash infrastructure/directus/bootstrap.sh

   # 2. Verify collections exist
   curl -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
     http://localhost:8055/collections/topics | jq

   # 3. Run backfill (will be no-op on fresh instance)
   bash infrastructure/directus/backfill-member-interests-topic.sh

   # 4. Manually test: create event, attempt to publish without topics → expect 400
   ```
5. **Take Postgres backup** before running phase 5 (drop_field) on any environment with real data
6. **Coordinate with bot submodule** — do not merge API PR until bot PR is ready (breaking change gate)
