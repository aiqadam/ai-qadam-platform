---
id: ISS-CMS-BOOTSTRAP-SOURCE-FILE-215
status: fixed
created: 2026-08-21
workflow: wf-20260821-fix-215
---

# infrastructure/directus/bootstrap.sh silently skips content_documents.source_file on any instance where content_documents pre-exists

## Summary

`bootstrap.sh` (FR-CMS-008) added `content_documents.source_file` only
inside `content_documents`'s own collection-creation payload. The
script's `ensure()` helper existence-checks by a bare `GET` on the
collection URL — if the collection already exists, the entire
creation call (embedded fields included) short-circuits as a no-op.
Any environment where `content_documents` was created before
FR-CMS-008 shipped (i.e. any instance that already ran FR-CMS-007's
bootstrap) never gets the field.

The same class of gap independently affected the
`content_documents/read` public permission: `ensure_perm_for_policy`'s
existence check is `(policy, collection, action)` only, so appending
`source_file` to an already-existing permission row's `fields`
allowlist was also silently skipped.

## Found

2026-08-21, executing `ai-qadam-infra` task T-0141 (provisioning
`/rules` source-document downloads on QA). QA's `content_documents`
collection was created by an earlier bootstrap run (T-0136, before
FR-CMS-008 existed). Re-running `bootstrap.sh` against QA failed:

```
[content_documents]
  ✓ collection content_documents (exists)
  ✗ relation content_documents.source_file -> directus_files.id HTTP 400
{"errors":[{"message":"Invalid payload. Field \"source_file\" doesn't exist in collection \"content_documents\"."...
```

Confirmed via source inspection: no dedicated `ensure "field
content_documents.source_file"` call existed anywhere in the script
(unlike the correct precedent, `events.translations`, which is added
via its own `ensure "field events.translations" ...` call against
`/fields/events/translations`).

## Fix

- Added a dedicated `ensure "field content_documents.source_file"`
  call (same pattern as `events.translations`), placed before the
  existing relation-creation call.
- Added a new helper `ensure_perm_fields_include()` — PATCHes an
  existing permission row's `fields` array to include a required
  field if missing; no-op if already present. Used it to patch
  `content_documents/read`'s allowlist to include `source_file`
  on instances where that permission row predates FR-CMS-008.
- Both fixes are additive and safe on genuinely fresh instances too
  (the field-ensure call and the fields-patch call are both no-ops
  once their target already has the expected shape).

## Regression test

`scripts/tests/bootstrap-source-file-existing-collection.bats` (static,
grep-based, no Directus required) — asserts the dedicated field-ensure
call exists and precedes the relation-ensure call, and that
`ensure_perm_fields_include` is defined and wired for
`content_documents/read` + `source_file`.

## Verification

Re-ran `bootstrap.sh` against QA Directus after the fix — see
`ai-qadam-infra` task T-0141 for the live re-run result.
