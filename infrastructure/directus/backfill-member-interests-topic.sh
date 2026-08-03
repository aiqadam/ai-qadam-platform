#!/usr/bin/env bash
# Backfill member_interests.topic FK from topic_tag strings.
# Run once after topics collection seeded, before dropping topic_tag.
#
# Usage:
#   DIRECTUS_URL=https://cms.aiqadam.org \
#   DIRECTUS_TOKEN=$(cat /tmp/aiqadam-secrets-DIRECTUS_TOKEN) \
#   bash infrastructure/directus/backfill-member-interests-topic.sh
#
# Part of FR-EVT-007 Phase 2 migration. Phase 1 creates the nullable topic
# FK field; this script populates it; Phase 3 drops topic_tag and makes
# topic NOT NULL.

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
