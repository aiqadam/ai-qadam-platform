#!/usr/bin/env bash
# Idempotently seed the 5 content_documents rows for the Community Rules
# & Documents library (FR-CMS-007, AC-2/AC-3/AC-4), and attach each row's
# original source .docx as a downloadable Directus file asset
# (FR-CMS-008, AC-3/AC-4). Run AFTER bootstrap.sh has created the
# content_documents collection (including its source_file field).
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
#
# FR-CMS-008 source-file upload
# -----------------------------
# The binary sources live in ${SOURCE_DOC_DIR} (default
# portal-content/20260819/, gitignored — present on the operator's
# machine, never in the repo or in CI). Uploading is therefore
# BEST-EFFORT and never fatal: a missing local directory or file is
# reported and skipped, the content row still seeds, and /rules/{slug}
# renders label-only exactly as before (FR-CMS-008 AC-8). Set
# SKIP_SOURCE_FILES=1 to skip the upload pass entirely.
#
# Upload idempotency (FR-CMS-008 AC-4) — deliberately a different shape
# from the slug-keyed row idempotency above, because it dedupes a
# directus_files asset rather than a content_documents row:
#   1. If the row already has a non-null source_file, do nothing (the
#      link is already established; no re-upload, no orphan asset).
#   2. Otherwise look for an existing directus_files row with the same
#      filename_download and reuse its id (covers the case where a
#      previous run uploaded the asset but failed before linking it).
#   3. Only if neither holds is the file actually uploaded.
# Re-running the script any number of times therefore creates at most
# one directus_files row per source document.
#
# Uploads land in the `public-documents` folder (PUBLIC_ASSET_FOLDER_ID,
# created by bootstrap.sh). This is REQUIRED, not cosmetic: Directus
# returns 403 on an anonymous GET /assets/:id unless a directus_files read
# grant covers the file, and that grant is deliberately scoped to this one
# folder so anonymous visitors can read these governance documents and
# nothing else in the file table. A file uploaded outside the folder is
# linked successfully but is not downloadable by real visitors.

set -euo pipefail

: "${DIRECTUS_URL:?DIRECTUS_URL is required}"
: "${DIRECTUS_TOKEN:?DIRECTUS_TOKEN is required}"

H_AUTH="Authorization: Bearer ${DIRECTUS_TOKEN}"
H_JSON="content-type: application/json"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTENT_DIR="${REPO_ROOT}/infrastructure/directus/content/rules"
# Gitignored, operator-local source binaries (see header). Overridable so
# the same script works from a different checkout/export location.
SOURCE_DOC_DIR="${SOURCE_DOC_DIR:-${REPO_ROOT}/portal-content/20260819}"
DOCX_MIME="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
# FR-CMS-008 — uploads MUST land in this folder or they are not publicly
# downloadable. The Public policy's directus_files read grant is scoped to
# exactly this folder id (bootstrap.sh, PUBLIC_ASSET_FOLDER_ID) precisely so
# that anonymous users can read these governance documents and nothing else;
# a file uploaded outside it returns 403 on /assets/:id. Keep the two
# constants in sync — the id is deliberately hardcoded in both places rather
# than looked up by name, so it is identical in every environment.
PUBLIC_ASSET_FOLDER_ID="${PUBLIC_ASSET_FOLDER_ID:-0f9b1c2d-3e4f-5a6b-8c9d-0e1f2a3b4c5d}"
# shellcheck source=scripts/tests/directus-retry-helper.bash
source "${REPO_ROOT}/scripts/tests/directus-retry-helper.bash"

# find_existing_file_id <filename_download>
# Echo the id of an already-uploaded directus_files row with this exact
# filename_download *inside the public-assets folder*, or nothing.
# Read-only GET — deliberately not routed through
# directus_request_with_retry (see that helper's contract: GETs add load
# without a back-pressure semantic).
#
# The folder filter matters: an unscoped filename match could reuse a
# same-named asset that lives outside the public folder, which would link
# the row to a file anonymous visitors cannot read (403) — silently
# reintroducing the exact bug this folder scoping exists to prevent.
find_existing_file_id() {
  local filename="$1"
  curl -s -H "${H_AUTH}" \
    --get --data-urlencode "filter[filename_download][_eq]=${filename}" \
    --data-urlencode "filter[folder][_eq]=${PUBLIC_ASSET_FOLDER_ID}" \
    "${DIRECTUS_URL}/files?fields=id&limit=1" \
    | jq -r '.data[0].id // empty' 2>/dev/null || true
}

# attach_source_file <slug> <filename>
# Upload ${SOURCE_DOC_DIR}/<filename> and set it as the row's source_file.
# Best-effort: returns 0 (non-fatal) on every skip path so a missing local
# binary never fails the content seed.
attach_source_file() {
  local slug="$1" filename="$2"

  if [ "${SKIP_SOURCE_FILES:-0}" = "1" ]; then
    return 0
  fi

  local source_path="${SOURCE_DOC_DIR}/${filename}"
  if [ ! -f "${source_path}" ]; then
    echo "    · source_file skipped — ${source_path} not present locally"
    return 0
  fi

  # One GET for both the row id and its current source_file — the row was
  # just upserted by seed_content_document, so it is expected to exist.
  local row_json row_id existing_source_file
  row_json=$(curl -s -H "${H_AUTH}" \
    --get --data-urlencode "filter[slug][_eq]=${slug}" \
    "${DIRECTUS_URL}/items/content_documents?fields=id,source_file&limit=1" || true)
  row_id=$(printf '%s' "${row_json}" | jq -r '.data[0].id // empty' 2>/dev/null || true)
  if [ -z "${row_id}" ]; then
    echo "    ✗ source_file skipped — content_documents/${slug} not found"
    return 0
  fi

  existing_source_file=$(printf '%s' "${row_json}" \
    | jq -r '.data[0].source_file // empty' 2>/dev/null || true)
  if [ -n "${existing_source_file}" ]; then
    echo "    = source_file already linked (${filename})"
    return 0
  fi

  # Reuse an asset a previous (partially-failed) run already uploaded.
  local file_id
  file_id=$(find_existing_file_id "${filename}")

  if [ -z "${file_id}" ]; then
    # `-F file=@path` streams from disk — no ARG_MAX exposure on
    # Windows/MSYS, unlike passing a payload as a literal argv string
    # (see the body_md `--data @file` note in seed_content_document).
    # Not routed through directus_request_with_retry: that helper
    # re-issues the request on 429/503, and a retried multipart upload
    # can leave a duplicate asset behind — exactly what AC-4 forbids.
    #
    # `folder` MUST come before the `file` part: Directus applies the
    # multipart fields it has already parsed to the file it then creates,
    # so a `folder` part sent after the payload is ignored and the asset
    # lands at the root — where the anonymous read grant does not reach.
    local upload_response
    upload_response=$(curl -s -H "${H_AUTH}" \
      -F "folder=${PUBLIC_ASSET_FOLDER_ID}" \
      -F "title=${filename}" \
      -F "file=@${source_path};type=${DOCX_MIME};filename=${filename}" \
      "${DIRECTUS_URL}/files" || true)
    file_id=$(printf '%s' "${upload_response}" | jq -r '.data.id // empty' 2>/dev/null || true)
    if [ -z "${file_id}" ]; then
      echo "    ✗ source_file upload failed for ${filename}"
      return 0
    fi
    echo "    ↑ uploaded ${filename}"
  else
    echo "    = reusing already-uploaded ${filename}"
  fi

  local link_json_file
  link_json_file=$(mktemp)
  # shellcheck disable=SC2064 # intentional: expand $link_json_file now
  trap "rm -f '${link_json_file}'" RETURN
  jq -n --arg source_file "${file_id}" '{source_file: $source_file}' > "${link_json_file}"

  if directus_request_with_retry PATCH \
       "${DIRECTUS_URL}/items/content_documents/${row_id}" \
       -H "${H_AUTH}" -H "${H_JSON}" --data "@${link_json_file}"; then
    echo "    → source_file linked (${filename})"
  else
    local code
    code=$(cat /tmp/directus-last-code 2>/dev/null || echo "?")
    echo "    ✗ source_file link HTTP ${code} for ${slug}"
  fi
}

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

# The source_document_label argument doubles as the on-disk filename in
# ${SOURCE_DOC_DIR} — the labels were taken verbatim from those files.
# attach_source_file is called separately (not from inside
# seed_content_document) so its `trap ... RETURN` cannot clobber the
# body-payload cleanup trap of the enclosing function.
echo "[content_documents — Community Rules & Documents library]"
seed_content_document "manifesto" \
  "AI Qadam Manifesto" "AI Qadam Manifesto.docx" "Current" 10
attach_source_file "manifesto" "AI Qadam Manifesto.docx"
seed_content_document "charter-v0-1" \
  "AI Qadam Charter v0.1" "AI Qadam Charter v0 1.docx" "Current" 20
attach_source_file "charter-v0-1" "AI Qadam Charter v0 1.docx"
seed_content_document "kazakhstan-mou" \
  "AI Qadam Kazakhstan MoU" "AI_Qadam_Kazakhstan_MoU-2105 (3).docx" "Current" 30
attach_source_file "kazakhstan-mou" "AI_Qadam_Kazakhstan_MoU-2105 (3).docx"
seed_content_document "global-board-polozhenie-v1" \
  "AI Qadam Global Board Положение v1.0" "AI Qadam Global Board Положение (2).docx" \
  "Superseded by Charter v0.1" 40
attach_source_file "global-board-polozhenie-v1" "AI Qadam Global Board Положение (2).docx"
seed_content_document "soglashenie-v1" \
  "AI Qadam Соглашение v1.0" "AI Qadam Soglashenie v1 (2).docx" \
  "Superseded by Charter v0.1" 50
attach_source_file "soglashenie-v1" "AI Qadam Soglashenie v1 (2).docx"

echo
echo "✅ content_documents seeded (5 rows)."
