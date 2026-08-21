#!/usr/bin/env bats
# scripts/tests/bootstrap-source-file-existing-collection.bats
#
# Regression test for ISS-CMS-BOOTSTRAP-SOURCE-FILE-215 (wf-20260821-fix-215):
# infrastructure/directus/bootstrap.sh defined content_documents.source_file
# (FR-CMS-008) only inside content_documents's own collection-creation
# payload. ensure()'s existence-check is a bare GET on the collection URL —
# if the collection already exists (e.g. QA, whose content_documents was
# created by an earlier FR-CMS-007 bootstrap run, T-0136), the entire
# collection-creation call short-circuits as a no-op, embedded fields
# included, and source_file is silently never added. The same class of gap
# also affected the content_documents/read public permission's `fields`
# allowlist: ensure_perm_for_policy's existence-check is (policy,
# collection, action) only, so appending source_file to an
# already-existing permission row's allowlist was likewise silently
# skipped.
#
# Found live 2026-08-21 running T-0141 (aiqadam-infra) against QA: the
# relation-creation step failed with HTTP 400 "Field \"source_file\"
# doesn't exist in collection \"content_documents\"" because the field
# itself was never created.
#
# This file is a *static* regression — no Directus, no Docker, no curl.
# It inspects bootstrap.sh with grep so it can run in CI without
# infrastructure, paired with a live re-bootstrap-against-an-
# already-provisioned-instance check the TestRunner performs separately.
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/bootstrap-source-file-existing-collection.bats
#   pnpm test:bash

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  BOOTSTRAP="$REPO_ROOT/infrastructure/directus/bootstrap.sh"
  export REPO_ROOT BOOTSTRAP
}

# ─── AC-1: a dedicated field-level ensure() call exists for source_file ──

@test "AC-1: bootstrap.sh has a dedicated 'field content_documents.source_file' ensure() call" {
  [ -f "$BOOTSTRAP" ] || { echo "bootstrap.sh not found at $BOOTSTRAP"; return 1; }
  # Pre-fix: source_file was declared only inside the collection payload's
  # fields:[] array — no standalone ensure() call targeting
  # /fields/content_documents/source_file existed. Post-fix: exactly the
  # same pattern used for events.translations (a genuinely post-hoc field
  # addition to an already-shipped collection).
  grep -qE '^ensure "field content_documents\.source_file"' "$BOOTSTRAP" \
    || { echo "missing dedicated ensure() call for field content_documents.source_file"; return 1; }
  grep -qE '\$\{DIRECTUS_URL\}/fields/content_documents/source_file' "$BOOTSTRAP" \
    || { echo "missing GET check URL \${DIRECTUS_URL}/fields/content_documents/source_file"; return 1; }
}

# ─── AC-2: the field-level ensure() call precedes the relation ensure() ──

@test "AC-2: the source_file field ensure() call appears before the source_file relation ensure() call" {
  # Ordering matters: Directus's /relations endpoint 400s if the field it
  # references doesn't exist yet (the exact failure this bug caused live).
  local field_line relation_line
  field_line="$(grep -nE '^ensure "field content_documents\.source_file"' "$BOOTSTRAP" | head -1 | cut -d: -f1)"
  relation_line="$(grep -nE '^ensure "relation content_documents\.source_file' "$BOOTSTRAP" | head -1 | cut -d: -f1)"
  [[ -n "$field_line" ]] || { echo "field ensure() call not found"; return 1; }
  [[ -n "$relation_line" ]] || { echo "relation ensure() call not found"; return 1; }
  [[ "$field_line" -lt "$relation_line" ]] \
    || { echo "field ensure() (line $field_line) must precede relation ensure() (line $relation_line)"; return 1; }
}

# ─── AC-3: a fields-patch helper exists and is used for the public grant ─

@test "AC-3: bootstrap.sh defines ensure_perm_fields_include and uses it for content_documents/read + source_file" {
  grep -qE '^ensure_perm_fields_include\(\)' "$BOOTSTRAP" \
    || { echo "missing ensure_perm_fields_include() helper definition"; return 1; }
  # The call itself spans multiple physical lines (backslash
  # continuation); the "content_documents read source_file" argument
  # trio lives on a continuation line, not the invocation line.
  grep -qE '^\s*ensure_perm_fields_include\s' "$BOOTSTRAP" \
    || { echo "no ensure_perm_fields_include call found"; return 1; }
  grep -qE '^\s*content_documents read source_file\s*\\$' "$BOOTSTRAP" \
    || { echo "missing ensure_perm_fields_include call patching content_documents/read's fields to include source_file"; return 1; }
}

# ─── AC-4: the patch call's target fields array still includes source_file ─

@test "AC-4: the ensure_perm_fields_include call's fields array includes source_file" {
  local block
  block="$(grep -A2 -E '^\s*ensure_perm_fields_include\s' "$BOOTSTRAP")"
  [[ -n "$block" ]] || { echo "call block not found"; return 1; }
  grep -qE 'content_documents read source_file' <<<"$block" \
    || { echo "ensure_perm_fields_include call is not for content_documents/read + source_file:"$'\n'"$block"; return 1; }
  grep -qE '"source_file"' <<<"$block" \
    || { echo "ensure_perm_fields_include call's fields array does not mention source_file:"$'\n'"$block"; return 1; }
}
