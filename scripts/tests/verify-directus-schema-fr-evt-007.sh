#!/usr/bin/env bash
# scripts/tests/verify-directus-schema-fr-evt-007.sh
#
# Automated schema verification for FR-EVT-007 Phase 1 data model.
# Verifies topics collection, event_topics junction, member_interests.topic FK.
#
# Usage:
#   DIRECTUS_URL=http://localhost:8055 \
#   DIRECTUS_TOKEN=<admin-token> \
#   bash scripts/tests/verify-directus-schema-fr-evt-007.sh
#
# Exit codes:
#   0  All checks passed
#   1  One or more checks failed
#
# Part of wf-20260803-feat-202 (FR-EVT-007 Phase 1).
# See .copilot/tasks/active/wf-20260803-feat-202/06-test-design.md for test plan.

set -euo pipefail

: "${DIRECTUS_URL:?DIRECTUS_URL is required (e.g., http://localhost:8055)}"
: "${DIRECTUS_TOKEN:?DIRECTUS_TOKEN is required}"

# Colour helpers (matches existing repo patterns)
readonly GREEN='\033[0;32m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'
ok()   { printf '%b  ✓%b %s\n' "$GREEN" "$NC" "$*"; }
fail() { printf '%b  ✗ FAIL:%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

H_AUTH="Authorization: Bearer ${DIRECTUS_TOKEN}"

echo "[FR-EVT-007 Phase 1 Schema Verification]"
echo ""

# ── Test AV-1.1: Topics collection exists ──────────────────────────────────

echo "[AV-1.1] Verify topics collection exists"
topics_collection=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/collections/topics" 2>&1 || echo "CURL_ERROR")

if echo "$topics_collection" | jq -e '.data.collection == "topics"' > /dev/null 2>&1; then
  ok "topics collection exists"
else
  fail "topics collection not found. Response: ${topics_collection}"
fi

# ── Test AV-1.2: Topics collection has required fields ────────────────────

echo "[AV-1.2] Verify topics collection has required fields"
topics_fields=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/fields/topics" | jq -r '.data[].field' | sort | tr '\n' ',')

required_fields="country,date_created,date_updated,id,name,name_ru,slug,sort"
if [[ "$topics_fields" == *"$required_fields"* ]]; then
  ok "topics collection has all required fields"
else
  fail "topics collection missing fields. Expected: ${required_fields}. Got: ${topics_fields}"
fi

# ── Test AV-1.3: 24 total topics seeded (8 per country × 3 countries) ──────

echo "[AV-1.3] Verify 24 total topics seeded (8 per country × 3 countries)"
total_topics=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/items/topics?limit=-1" | jq -r '.data | length')

if [[ "$total_topics" -eq 24 ]]; then
  ok "24 topics seeded (8 × 3 countries)"
else
  fail "Expected 24 topics, got ${total_topics}"
fi

# ── Test AV-1.4: UZ topics have correct slugs ──────────────────────────────

echo "[AV-1.4] Verify UZ topics have correct slugs in sort order"
uz_slugs=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/items/topics?filter[country][_eq]=uz&fields=slug&sort=sort" \
  | jq -r '.data[].slug' | tr '\n' ',' | sed 's/,$//')

expected_uz="ai-ml,mlops,python,frontend,backend,data-engineering,hardware-robotics,research"
if [[ "$uz_slugs" == "$expected_uz" ]]; then
  ok "UZ topics have correct slugs in sort order"
else
  fail "UZ slugs mismatch. Expected: ${expected_uz}. Got: ${uz_slugs}"
fi

# ── Test AV-1.5: KZ topics count ───────────────────────────────────────────

echo "[AV-1.5] Verify KZ topics count"
kz_topics=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/items/topics?filter[country][_eq]=kz&limit=-1" | jq -r '.data | length')

if [[ "$kz_topics" -eq 8 ]]; then
  ok "KZ topics: 8 rows"
else
  fail "Expected 8 KZ topics, got ${kz_topics}"
fi

# ── Test AV-1.6: TJ topics count ───────────────────────────────────────────

echo "[AV-1.6] Verify TJ topics count"
tj_topics=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/items/topics?filter[country][_eq]=tj&limit=-1" | jq -r '.data | length')

if [[ "$tj_topics" -eq 8 ]]; then
  ok "TJ topics: 8 rows"
else
  fail "Expected 8 TJ topics, got ${tj_topics}"
fi

# ── Test AV-1.7: Russian names populated ───────────────────────────────────

echo "[AV-1.7] Verify Russian names populated for UZ ai-ml topic"
uz_ai_ml_ru=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/items/topics?filter[slug][_eq]=ai-ml&filter[country][_eq]=uz&fields=name_ru" \
  | jq -r '.data[0].name_ru')

expected_ru="ИИ/МО"
if [[ "$uz_ai_ml_ru" == "$expected_ru" ]]; then
  ok "UZ ai-ml topic has Russian name: ${uz_ai_ml_ru}"
else
  fail "Expected Russian name '${expected_ru}', got '${uz_ai_ml_ru}'"
fi

# ── Test AV-1.8: Topics sort field defaults to 100 ─────────────────────────

echo "[AV-1.8] Verify topics.sort field default (seeded topics should have sort 1-8)"
uz_ai_ml_sort=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/items/topics?filter[slug][_eq]=ai-ml&filter[country][_eq]=uz&fields=sort" \
  | jq -r '.data[0].sort')

if [[ "$uz_ai_ml_sort" -eq 1 ]]; then
  ok "UZ ai-ml topic has sort=1 (first topic)"
else
  fail "Expected sort=1 for UZ ai-ml, got ${uz_ai_ml_sort}"
fi

# ── Test AV-2.1: Event_topics junction exists ──────────────────────────────

echo "[AV-2.1] Verify event_topics collection exists"
event_topics_collection=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/collections/event_topics" 2>&1 || echo "CURL_ERROR")

if echo "$event_topics_collection" | jq -e '.data.collection == "event_topics"' > /dev/null 2>&1; then
  ok "event_topics junction collection exists"
else
  fail "event_topics collection not found. Response: ${event_topics_collection}"
fi

# ── Test AV-2.2: Event_topics has required fields ──────────────────────────

echo "[AV-2.2] Verify event_topics has required fields"
event_topics_fields=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/fields/event_topics" | jq -r '.data[].field' | sort | tr '\n' ',')

required_et_fields="date_created,event,id,topic"
if [[ "$event_topics_fields" == *"$required_et_fields"* ]]; then
  ok "event_topics has all required fields"
else
  fail "event_topics missing fields. Expected: ${required_et_fields}. Got: ${event_topics_fields}"
fi

# ── Test AV-2.3: Event_topics initially empty ──────────────────────────────

echo "[AV-2.3] Verify event_topics initially empty (no events tagged yet)"
event_topics_count=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/items/event_topics?limit=-1" | jq -r '.data | length')

if [[ "$event_topics_count" -eq 0 ]]; then
  ok "event_topics is empty (expected: no events tagged in Phase 1)"
else
  # Not a hard failure — might have test data
  printf '  ! event_topics has %d rows (expected 0 for fresh bootstrap)\n' "$event_topics_count"
fi

# ── Test AV-3.1: Member_interests.topic field exists ───────────────────────

echo "[AV-3.1] Verify member_interests.topic FK field exists"
topic_field=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/fields/member_interests/topic" 2>&1 || echo "CURL_ERROR")

if echo "$topic_field" | jq -e '.data.field == "topic"' > /dev/null 2>&1; then
  ok "member_interests.topic FK field exists"
else
  fail "member_interests.topic field not found. Response: ${topic_field}"
fi

# ── Test AV-3.2: Member_interests.topic is nullable ────────────────────────

echo "[AV-3.2] Verify member_interests.topic is nullable (Phase 1 migration)"
is_nullable=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/fields/member_interests/topic" | jq -r '.data.schema.is_nullable')

if [[ "$is_nullable" == "true" ]]; then
  ok "member_interests.topic is nullable (Phase 1 allows NULL during backfill)"
else
  fail "member_interests.topic should be nullable in Phase 1, got is_nullable=${is_nullable}"
fi

# ── Test AV-3.3: Member_interests.topic is uuid type ───────────────────────

echo "[AV-3.3] Verify member_interests.topic is uuid type"
topic_type=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/fields/member_interests/topic" | jq -r '.data.type')

if [[ "$topic_type" == "uuid" ]]; then
  ok "member_interests.topic is uuid type"
else
  fail "Expected member_interests.topic type 'uuid', got '${topic_type}'"
fi

# ── Test AV-3.4: Member_interests.topic_tag still exists (backward compat) ──

echo "[AV-3.4] Verify member_interests.topic_tag still exists (backward compatibility)"
topic_tag_field=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/fields/member_interests/topic_tag" 2>&1 || echo "CURL_ERROR")

if echo "$topic_tag_field" | jq -e '.data.field == "topic_tag"' > /dev/null 2>&1; then
  ok "member_interests.topic_tag field exists (Phase 1 backward compatibility)"
else
  fail "member_interests.topic_tag field should still exist in Phase 1"
fi

# ── Test AV-4.1: Topics.country FK relation ────────────────────────────────

echo "[AV-4.1] Verify topics.country FK relation to countries collection"
country_relation=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/relations/topics/country" | jq -r '.data.related_collection')

if [[ "$country_relation" == "countries" ]]; then
  ok "topics.country FK points to countries collection"
else
  fail "Expected topics.country → countries, got ${country_relation}"
fi

# ── Test AV-4.2: Event_topics.event FK relation ────────────────────────────

echo "[AV-4.2] Verify event_topics.event FK relation to events collection"
event_relation=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/relations/event_topics/event" | jq -r '.data.related_collection')

if [[ "$event_relation" == "events" ]]; then
  ok "event_topics.event FK points to events collection"
else
  fail "Expected event_topics.event → events, got ${event_relation}"
fi

# ── Test AV-4.3: Event_topics.topic FK relation ────────────────────────────

echo "[AV-4.3] Verify event_topics.topic FK relation to topics collection"
topic_relation=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/relations/event_topics/topic" | jq -r '.data.related_collection')

if [[ "$topic_relation" == "topics" ]]; then
  ok "event_topics.topic FK points to topics collection"
else
  fail "Expected event_topics.topic → topics, got ${topic_relation}"
fi

# ── Test AV-4.4: Member_interests.topic FK relation ────────────────────────

echo "[AV-4.4] Verify member_interests.topic FK relation to topics collection"
mi_topic_relation=$(curl -fsS -H "${H_AUTH}" \
  "${DIRECTUS_URL}/relations/member_interests/topic" | jq -r '.data.related_collection')

if [[ "$mi_topic_relation" == "topics" ]]; then
  ok "member_interests.topic FK points to topics collection"
else
  fail "Expected member_interests.topic → topics, got ${mi_topic_relation}"
fi

# ── All tests passed ────────────────────────────────────────────────────────

echo ""
printf '%b  ✅ All FR-EVT-007 Phase 1 schema verification tests passed%b\n' "$GREEN" "$NC"
exit 0
