# Code Summary — wf-20260801-fix-188-public-policy-uuid-lookup

## Requirement Implemented

**ISS-PUB-POLICY-UUID-PIN-001** — Replace the env-specific
`POLICY_PUBLIC_PROD="87bf5954-…"` UUID pin in
`infrastructure/directus/bootstrap.sh` with the stable
`$t:public_label` name-lookup pattern already used by
ISS-SEC-DIRECTUS-USERS-PUBLIC-001 (line 178) and
ISS-SEC-PUBLIC-UNMANAGED-001 (line ~2979). The pin silently skipped
all 8 lower public-read grant blocks on every Directus env except
the one it was observed on; the migration makes the grants apply
on local, QA, and prod identically.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `infrastructure/directus/bootstrap.sh` | Modified (74 +, 41 −) | Migrated 8 lower public-read blocks from `POLICY_PUBLIC_PROD` UUID pin to `$t:public_label` name lookup. Removed the now-unused `POLICY_PUBLIC_PROD="87bf5954-…"` definition in the event_materials block (the variable is no longer referenced anywhere in the file). |

### Per-block delta

| Block | Collection(s) | Lines (approx. in patched file) | Guard |
|---|---|---|---|
| 1 | `event_materials` | 4500–4535 | Name lookup |
| 2 | `event_photos` | 4577–4605 | Name lookup (comments updated from "Reuses the POLICY_PUBLIC_PROD pin set earlier") |
| 3 | `event_questions` | 4666–4694 | Name lookup |
| 4 | `event_sponsors` + `sponsors` | 4751–4793 | Name lookup (single `PUBLIC_POLICY_ID` shared across both grants in the block) |
| 5 | `site_settings` | 5347–5377 | Name lookup |
| 6 | `press_page` | 5437–5467 | Name lookup |
| 7 | `badge_definitions` | 5557–5587 | Name lookup |
| 8 | `team_members` | 5662–5692 | Name lookup |

The historical comment at line 2973 (in the ISS-SEC-PUBLIC-UNMANAGED-001
section) still references the `87bf5954-…` pin when explaining why
this migration was out-of-scope for the previous PR — left intact
because revising it would expand the diff without changing
semantics.

## Key Design Decisions

1. **Variable name: `PUBLIC_POLICY_ID` (new, block-scoped).** The
   two higher sections of the file already use different names for
   the same lookup — `DIRECTUS_PUBLIC_POLICY_ID` (line 178) and
   `ISS_169_PUBLIC_POLICY_ID` (line 2979) — both to avoid clashing
   with one another and to keep each section's variable
   self-identifying. Following that precedent, the eight migrated
   blocks each declare a local `PUBLIC_POLICY_ID` (no shadow risk:
   the two higher variables are still in scope but never read by
   these blocks). This preserves the file's existing convention.

2. **Lookup snippet byte-identical to line 178.** I copied the
   already-working pattern from ISS-SEC-DIRECTUS-USERS-PUBLIC-001
   verbatim (the URL-encoded filter, the `jq -r '.data[0].id //
   empty'`, the `2>/dev/null || true` guard against curl-jq
   pipeline failure). DRY in shell would mean extracting a helper
   function, but that would couple the eight blocks together and
   either move the lookup to the top of the script (cross-section
   coupling) or repeat the helper at the bottom — the current
   repetition is the lower-risk choice and matches what the rest of
   this 5,500-line script does.

3. **Guard semantics preserved.** Each block still does
   `count = curl… /permissions?filter…&limit=1 → if > 0 echo
   "exists" else POST and echo "created"`. The only thing that
   changed is the existence check (resolved policy id via name
   lookup) and the variable name inside the body. Idempotent
   re-run behavior is unchanged: a re-bootstrap against an env
   where the permissions already exist still prints `✓ … (public,
   exists)` and creates nothing new.

4. **Warning echo updated, not removed.** The original blocks each
   warned via `echo "  ⚠ Public policy $POLICY_PUBLIC_PROD not
   found — skipping…"`. After migration, `$POLICY_PUBLIC_PROD` no
   longer exists, so the warning now references the lookup key by
   name (`Public policy ($t:public_label) not found…`), matching
   the format ISS-SEC-DIRECTUS-USERS-PUBLIC-001 already uses.

5. **No new collection-specific changes.** The pre-PR grant body
   (collection name, `permissions` filter, `fields` allow-list) is
   preserved verbatim for each of the 8 blocks. If the migration
   unblocks a previously-skipped block on local, the same grant
   that would have applied on prod will now apply on local — no
   behavioral surprises.

## Architecture Rule Compliance

- **Module boundaries:** Single-file change in
  `infrastructure/directus/`. No imports, no DB schema, no shared
  types, no API/web/bot code touched. ✅
- **Tenant scoping:** N/A — bootstrap operates on Directus global
  permissions, not tenant-scoped tables. ✅
- **Zod at boundaries:** N/A — shell script reading Directus
  REST responses; jq-path guard (`… // empty`) prevents undefined
  access. ✅
- **No cross-schema queries:** N/A — bootstrap doesn't query the
  Postgres schema directly. ✅
- **No `any` / type-unsafe casts:** N/A — shell script. ✅
- **Auth at controller level:** N/A — bootstrap runs against the
  admin token held in the script env. ✅
- **Idempotency:** Preserved — each block keeps its count-then-POST
  shape; if a previous run already created the row, the next run
  just echoes `exists` and continues. Verified by reading the
  patched block (e.g. event_materials lines 4511–4534). ✅
- **No new dependencies, no new file surface.** ✅

## Formatter Check

Shell script — `bash -n` syntax validation is the appropriate
self-check. Output:

```
$ bash -n infrastructure/directus/bootstrap.sh
$ echo $?
0
```

No formatter configured for `.sh` in this repo
(`biome.json` covers JS/TS only, and the rest of
`infrastructure/` follows hand-formatting conventions). I
preserved the existing 2-space indentation, line continuation
style, and trailing-comment placement used elsewhere in the
script.

`POLICY_PUBLIC_PROD` occurrences in patched file: **0** (verified
via `grep`).
`87bf5954-…` occurrences in patched file: **1** (line 2973, the
historical-comment reference described in the per-block delta
table — out-of-scope to touch).
Line endings: LF-only (`\n`), 5,696 lines — matches the base
file's encoding (`git show origin/main:…` returns LF-only, 5,663
lines; +33 lines is net of the inserted lookup snippets minus the
removed pin definition).

## Known Limitations

1. **Live pre-flight not run from this session.** A local Directus
   container may exist in this repo's Docker stack; if so, a curl
   against `/policies?filter[name][_eq]=$t:public_label&fields=id`
   should return the local env's policy id (the issue file
   documents `abf8a154-5b1c-4a46-ac9c-7300570f4f17` as the
   expected value). I did not run that command — `docker exec` in
   my terminal session returned no container — but the pattern is
   byte-identical to line 178's working lookup, so the migration
   carries no new unknowns.

2. **No script change beyond bootstrap.sh.** Sister scripts
   (`provision-*.sh`, `cutover-*.sh`) do not embed the
   `87bf5954-…` pin, so they need no edits. A repo-wide
   `rg "87bf5954"` would be a useful follow-up audit (the
   informational comment at line 2973 is the only remaining
   in-repo occurrence).

3. **Documented deferred work:** The historical comment at line
   2973 still reads as if the lower blocks *currently* skip on
   non-prod envs. After this PR lands, that comment is stale (the
   bug it describes is now resolved). Left as-is in this PR to
   keep the diff scoped; a follow-up doc PR can update the
   comment.

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-08-03T00:00:00Z"
  summary: "Eight lower public-read blocks in infrastructure/directus/bootstrap.sh now resolve the Directus Public policy by its stable name ($t:public_label) instead of an env-specific UUID pin. POLICY_PUBLIC_PROD no longer appears in the file. bash -n is clean."
  findings:
    - "All 8 blocks migrated to byte-identical lookup pattern as the line-178 reference (ISS-SEC-DIRECTUS-USERS-PUBLIC-001)."
    - "Idempotent permission behavior preserved per block — count-then-POST shape unchanged."
    - "POLICY_PUBLIC_PROD occurrences: 0 (grep). 87bf5954 pin occurrences: 1 (line 2973 historical comment)."
    - "bash -n infrastructure/directus/bootstrap.sh exits 0."
    - "File line endings: LF-only, matches base (5,696 patched vs 5,663 base — net +33 lines from inserted lookup snippets)."
  output_file: ".copilot/tasks/active/wf-20260801-fix-188-public-policy-uuid-lookup/03-code-summary.md"
```
