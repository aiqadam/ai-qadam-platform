#!/usr/bin/env bash
# Idempotently seed the 5 content_documents rows for the Community Rules
# & Documents library (FR-CMS-007, AC-2/AC-3/AC-4). Run AFTER
# bootstrap.sh has created the content_documents collection.
#
# Usage:
#   DIRECTUS_URL=https://cms.aiqadam.org \
#   DIRECTUS_TOKEN=$(cat /tmp/aiqadam-secrets-DIRECTUS_TOKEN) \
#   bash infrastructure/directus/seed-content-documents.sh
#
# Each row's body_md is read from content/rules/<slug>.md — a faithful
# reflow of that document's own structure/headings/wording (AC-3): no
# merging, synthesizing, or reconciling terminology differences between
# documents. In particular "Хранитель" (Charter, MoU) and "Основатель"
# (Global Board Положение, Soglashenie) are both kept verbatim in their
# own source file — do not "fix" this inconsistency when editing.
#
# Idempotent on slug: re-running updates an existing row's fields
# (title/labels/body) rather than creating a duplicate, so this script
# doubles as the update path when a source document is corrected.

set -euo pipefail

: "${DIRECTUS_URL:?DIRECTUS_URL is required}"
: "${DIRECTUS_TOKEN:?DIRECTUS_TOKEN is required}"

H_AUTH="Authorization: Bearer ${DIRECTUS_TOKEN}"
H_JSON="content-type: application/json"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTENT_DIR="${REPO_ROOT}/infrastructure/directus/content/rules"
# shellcheck source=scripts/tests/directus-retry-helper.bash
source "${REPO_ROOT}/scripts/tests/directus-retry-helper.bash"

# seed_content_document <slug> <title> <source_document_label> <status_label> <display_order>
# Reads body_md from ${CONTENT_DIR}/<slug>.md.
seed_content_document() {
  local slug="$1" title="$2" source_label="$3" status_label="$4" display_order="$5"
  local body_file="${CONTENT_DIR}/${slug}.md"
  if [ ! -f "${body_file}" ]; then
    echo "  ✗ content_documents/${slug} — missing ${body_file}"
    return 1
  fi

  # Payload is written to a temp file and passed via `--data @file` rather
  # than as a literal shell/curl argument: on Windows/MSYS (a supported
  # dev platform for this repo), curl hits ARG_MAX once body_md exceeds
  # roughly 5-10KB (confirmed empirically — the Charter's 42KB body_md
  # failed with "Argument list too long" while the 5KB Manifesto did not).
  # `--data @file` streams the payload instead of passing it as argv.
  local body_json_file
  body_json_file=$(mktemp)
  # shellcheck disable=SC2064 # intentional: expand $body_json_file now
  trap "rm -f '${body_json_file}'" RETURN

  jq -n \
    --arg slug "${slug}" \
    --arg title "${title}" \
    --arg source_label "${source_label}" \
    --arg status_label "${status_label}" \
    --argjson display_order "${display_order}" \
    --rawfile body_md "${body_file}" \
    '{
      slug: $slug,
      status: "published",
      title: $title,
      source_document_label: $source_label,
      status_label: $status_label,
      body_md: $body_md,
      display_order: $display_order
    }' > "${body_json_file}"

  local existing_id
  existing_id=$(curl -s -H "${H_AUTH}" \
    --get --data-urlencode "filter[slug][_eq]=${slug}" \
    "${DIRECTUS_URL}/items/content_documents?fields=id&limit=1" \
    | jq -r '.data[0].id // empty' 2>/dev/null || true)

  if [ -n "${existing_id}" ]; then
    if directus_request_with_retry PATCH \
         "${DIRECTUS_URL}/items/content_documents/${existing_id}" \
         -H "${H_AUTH}" -H "${H_JSON}" --data "@${body_json_file}"; then
      echo "  ~ content_documents/${slug} (updated)"
    else
      local code
      code=$(cat /tmp/directus-last-code 2>/dev/null || echo "?")
      echo "  ✗ content_documents/${slug} update HTTP ${code}"
      return 1
    fi
  else
    if directus_request_with_retry POST "${DIRECTUS_URL}/items/content_documents" \
         -H "${H_AUTH}" -H "${H_JSON}" --data "@${body_json_file}"; then
      echo "  + content_documents/${slug} (seeded)"
    else
      local code
      code=$(cat /tmp/directus-last-code 2>/dev/null || echo "?")
      echo "  ✗ content_documents/${slug} create HTTP ${code}"
      return 1
    fi
  fi
}

echo "[content_documents — Community Rules & Documents library]"
seed_content_document "manifesto" \
  "AI Qadam Manifesto" "AI Qadam Manifesto.docx" "Current" 10
seed_content_document "charter-v0-1" \
  "AI Qadam Charter v0.1" "AI Qadam Charter v0 1.docx" "Current" 20
seed_content_document "kazakhstan-mou" \
  "AI Qadam Kazakhstan MoU" "AI_Qadam_Kazakhstan_MoU-2105 (3).docx" "Current" 30
seed_content_document "global-board-polozhenie-v1" \
  "AI Qadam Global Board Положение v1.0" "AI Qadam Global Board Положение (2).docx" \
  "Superseded by Charter v0.1" 40
seed_content_document "soglashenie-v1" \
  "AI Qadam Соглашение v1.0" "AI Qadam Soglashenie v1 (2).docx" \
  "Superseded by Charter v0.1" 50

echo
echo "✅ content_documents seeded (5 rows)."
