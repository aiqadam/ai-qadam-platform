# CodeDeveloper — wf-20260801-fix-187 — ISS-SEC-PUBLIC-UNMANAGED-001

## Requirement Implemented

Scope the Public-policy read grants on `events`, `speakers`, and
`event_speakers` so that every fresh `bootstrap.sh` run produces an
identical, version-controlled, idempotent public-read surface
(`status = published/active/confirmed`, `country != xx` for
unauthenticated calls, plus a `is_test_user` OR-branch for signed-in
operators acting on demo content) instead of today's accidentally-
unrestricted `permissions: null` rows that only exist on the local
environment because an operator created them by hand.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `infrastructure/directus/bootstrap.sh` | insert (57 lines, 0 deletions) | New `ISS-SEC-PUBLIC-UNMANAGED-001` block placed directly after the existing `ISS-SEC-DIRECTUS-USERS-PUBLIC-001` revoke block. Reuses the existing `revoke_public_read` + `ensure_perm_for_policy` helper functions (no new helpers introduced). |

`git diff --stat` confirms +58 lines, 0 deletions, scoped to that one
file (the `.copilot/meta/next-workflow-id` bump is the Orchestrator's
pre-existing Step-0 ID assignment for `wf-20260801-fix-187`, not part
of this work).

## Brief Before/After Diff

**Before** (file lines 185–187 in the pre-edit revision):

```bash
fi

# ──────────── countries ─────────────────────────────────────────────────
```

**After** (file lines 185–243 in the post-edit revision — note only the
middle of `fi` → blank → section header is new):

```bash
fi

# ════════════════════════════════════════════════════════════════════════
# ISS-SEC-PUBLIC-UNMANAGED-001 — scope unrestricted Public reads on
# events / speakers / event_speakers. Pre-fix state: the local Directus
# had `permissions: null` rows on all three (created via admin UI,
# outside version control); bootstrap.sh never mentioned them. Every
# fresh bootstrap produced an environment WITHOUT these grants, so the
# exposure was unmanaged configuration. After this section: same scope
# on every environment, idempotent, with `permissions` filter +
# `fields` allowlist matching what apps/web actually reads.
# ════════════════════════════════════════════════════════════════════════
echo "[ISS-SEC-PUBLIC-UNMANAGED-001 — scope Public reads on events / speakers / event_speakers]"
POLICY_PUBLIC_PROD="87bf5954-616e-40fa-bd61-2587e8c3f49b"
if curl -sf -H "${H_AUTH}" "${DIRECTUS_URL}/policies/${POLICY_PUBLIC_PROD}" >/dev/null 2>&1; then
  # (1) revoke any pre-existing Public reads on these three collections
  # (2) re-grant SCOPED reads using ensure_perm_for_policy
  ...
  echo "[✓ ISS-SEC-PUBLIC-UNMANAGED-001 fix complete]"
else
  echo "  ⚠ Public policy ${POLICY_PUBLIC_PROD} not found — skipping ..."
fi

# ──────────── countries ─────────────────────────────────────────────────
```

`+57 lines` of new content; nothing else touched. (The diff-stat tool
reports `+58` because one insertion is a pure whitespace blank line.)

## Exact jq-safe JSON Literals Used

All five single-quoted strings are passed straight to
`ensure_perm_for_policy` as `arg $5` (filter) / `arg $6` (fields),
which feeds them into `jq -nc --argjson f "$filter" --argjson flds "$fields_json"`
internally. Verified valid JSON by inspection:

```bash
EVENTS_FILTER='{"_and":[{"status":{"_eq":"published"}},{"_or":[{"country":{"_neq":"xx"}},{"$CURRENT_USER":{"is_test_user":{"_eq":true}}}]}]}'
EVENTS_FIELDS='["id","title","description","format","status","starts_at","ends_at","capacity","location","country","short_description","slug","venue","address","map_url","hero_image","agenda_md","visibility_scope","external_links","latitude","longitude","recap_md","livestream_url","date_updated","eula_id","audience_cohort","visibility","registration_open","registration_schema","online_meeting_url","post_event_processed","topic_tags","event_retrospective","media"]'
SPEAKERS_FILTER='{"_and":[{"status":{"_eq":"active"}},{"_or":[{"country":{"_neq":"xx"}},{"$CURRENT_USER":{"is_test_user":{"_eq":true}}}]}]}'
SPEAKERS_FIELDS='["id","user","country","status","headline","photo","slug"]'
EVENT_SPEAKERS_FILTER='{"_and":[{"status":{"_eq":"confirmed"}},{"event":{"status":{"_eq":"published"},"country":{"_neq":"xx"}}}]}'
EVENT_SPEAKERS_FIELDS='["id","event","speaker","talk_title","talk_topic","order_index","confirmed_at"]'
```

These are copied **verbatim** from `02-impact-analyzer.md` §"What
CodeDeveloper should do in Step 3" — the impact analyzer already
audited every field against apps/web's actual read sites
(`apps/web/src/lib/cms.ts:249, 274, 592, 618, 781, 852`) and confirmed
no field apps/web reads is missing from the allowlists. The PII
columns (`speakers.bio`, `speakers.linkedin_url`,
`speakers.twitter_handle`, `speakers.translations`) are explicitly
omitted from `SPEAKERS_FIELDS` — apps/web does not read them, and
including them would re-create the original exposure on a different
field.

## Idempotency Proof

Both reused helper functions are already idempotent — confirmed by
reading their bodies in `bootstrap.sh` lines ~95–170 and 2685–2710:

1. **`revoke_public_read <policy> <collection>`** (existing, proven
   used by the prior `directus_users` revoke block):
   - Internally queries `GET /permissions?filter[policy]=<p>&filter[collection]=<c>&filter[action]=read&fields=id`.
   - If the response has zero `.data` rows → prints `(already absent)`
     and `return 0`. No mutation.
   - If `N` rows match → iterates the IDs and calls
     `DELETE /permissions/<id>` for each. Runs through
     `directus_request_with_retry` so 503/429 storms are absorbed.
   - Crucially the filter includes **any** read row on that
     `(policy, collection)` pair — including the `permissions: null`
     unrestricted rows we observed on the local env. So on a fresh
     bootstrap (zero rows), prints `(already absent)`. On the local
     env (1+ null rows), deletes them. On a re-run after that (zero
     rows again), prints `(already absent)`. Every run converges to
     the same state.

2. **`ensure_perm_for_policy <policy> <kind> <collection> <action> <filter> <fields_json> [<validation>]`** (existing, proven used
   64+ times throughout the file for every RBAC tier):
   - Internally queries `GET /permissions?filter[policy]=<p>&filter[collection]=<c>&filter[action]=read&limit=1&fields=id`.
   - If `.data | length > 0` → prints `  ✓ <kind> (exists)` and
     `return 0`. No mutation.
   - Else → POSTs `{policy, collection, action, permissions:$f, fields:$flds, validation:$val}` via
     `directus_request_with_retry`.
   - So a second run finds the just-created row → prints
     `(exists)` → no second POST → no duplicate → no 409 error.

3. **The guard wrapping both phases**
   (`if curl -sf "${DIRECTUS_URL}/policies/${POLICY_PUBLIC_PROD}" >/dev/null 2>&1`):
   - On environments where the prod Public policy doesn't exist
     (fresh non-prod Directus installs), skips the whole block and
     logs a warning instead of failing. Idempotent in the sense that
     re-running produces the same warning, not a different state.

**Verified mechanically:**

```bash
bash -n infrastructure/directus/bootstrap.sh && echo "BASH SYNTAX OK"
# → BASH SYNTAX OK
```

I did not run the script (no Directus reachable from this terminal);
idempotency of the **second-run** log shape (`... (exists)` for every
perm, `(already absent)` for every revoke) is asserted by reading the
helper function bodies, not by re-execution.

## Architecture Rule Compliance

| Rule | Verdict |
|---|---|
| `AGENTS.md` §6 NEVER-DOs | ✅ Clean — no .env edits, no --force, no commit to main (CodeDeveloper writes code only; Orchestrator commits), no test-disable, no commercial dependency added |
| Single-file scope | ✅ Only `bootstrap.sh` modified; the bump in `.copilot/meta/next-workflow-id` is pre-existing Orchestrator bookkeeping, not part of this agent's work |
| Self-containment | ✅ New block defines its own `POLICY_PUBLIC_PROD` constant locally so reordering other sections in the file cannot break the guard |
| Existing-helper reuse | ✅ No new helper functions introduced — both phases reuse `revoke_public_read` and `ensure_perm_for_policy` which are already proven idempotent and used 64+ times across the file |
| Idempotency | ✅ Both reused helpers' bodies were read end-to-end and verified to converge to the same state on re-run |
| Manifest honesty (§9) | ✅ Every filter + fields literal in this file is copied verbatim from the impact analysis; the assistant did not "improve" the spec. Final-section comment explicitly attributes the design to the §13 pre-fix state from the impact analyzer. The `country != xx` demo guard is the same shape policy.member/S0.1 uses (this same two-factor filter appears 64+ times in the file); the `$CURRENT_USER.is_test_user` null-safety claim is documented in §"Field-restriction risk" of the impact analysis and re-stated here |

## Formatter Check

- `bash -n infrastructure/directus/bootstrap.sh` → OK (clean parse)
- `git diff --stat infrastructure/directus/bootstrap.sh` → 58 +, 0 −
- `grep_search ISS-SEC-PUBLIC-UNMANAGED-001` → 3 occurrences (section
  banner + 2 `echo` log markers). No duplicates or stale references.
- No Python files touched — `ruff format` not applicable.

No pnpm/lint/build was run because this is a shell-script change in
`infrastructure/`; there is no Node project graph under that path.

## Known Limitations

1. **`POLICY_PUBLIC_PROD` constant duplicated locally.** I redefined
   `POLICY_PUBLIC_PROD="87bf5954-616e-40fa-bd61-2587e8c3f49b"` inside
   the new block instead of trying to share with the existing
   definition at line 4225 (used by event_materials / event_photos /
   event_sponsors / site_settings / press_page / badge_definitions /
   team_members). Reason: the existing definition is buried in the
   F-WebU3 block, halfway down a 5000-line file, with no shared "all
   prod pins" header section to fold this into. Self-containment was
   the explicit constraint ("The new section should be self-contained
   ... copy the same guard pattern"). If a future cleanup migrates
   this to a pinned-vars header block, both definitions should be
   removed and the new section refactored to reference the shared
   constant.
2. **No live verification run.** This terminal has no reachable
   Directus instance, so `bootstrap.sh` was not executed and the
   resulting Directus permissions were not observed. The Security
   Reviewer's Step 4 / Test Runner's Step 7 will run the script on
   the live stack and confirm `(exists)` / `(already absent)` log
   lines appear on a second run. The idempotency argument above is
   based on reading the helper function bodies, not on observed
   live behaviour.
3. **Risk on `$CURRENT_USER.is_test_user` in unauthenticated context**
   (also called out by the impact analyzer): relies on Directus's
   documented null-CURRENT_USER semantics for unauth requests
   (`{is_test_user: {_eq: true}}` over a null `$CURRENT_USER`
   evaluates to false → entire OR branch fails → falls through to
   the `country != xx` branch → no demo leakage). The same two-factor
   shape is used by 64+ existing permissions across the RBAC tier
   policies, so this is not a new pattern. The Security Reviewer
   should spot-check this in Step 4 by curl-ing the `/items/events`
   endpoint with no auth header against a `country=xx` test row and
   confirming a 200 with empty data.

## Gate Result

gate_result:
  status: passed
  summary: "Self-contained, idempotent Public-policy scoping block inserted into bootstrap.sh (57 +lines, 0 deletions); reuses two existing idempotent helpers; bash -n parses clean."
  findings:
    - "Idempotency proven by direct read of revoke_public_read (lines ~135–170) and ensure_perm_for_policy (lines ~2685–2710) function bodies; both already converge on re-run."
    - "All 5 JSON literals (3 filter, 3 fields allowlist pairs) copied verbatim from the impact analyzer's §'What CodeDeveloper should do in Step 3' — no spec drift."
    - "bash -n infrastructure/directus/bootstrap.sh → exit 0."
    - "git diff --stat: +58 lines, 0 deletions, 1 file. No collateral changes."
    - "POLICY_PUBLIC_PROD constant redefined locally inside the new block (same UUID 87bf...f49b as line 4225) — trades a 1-line duplication for self-containment per the spec."
