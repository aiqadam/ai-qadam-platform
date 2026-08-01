# ISS-SEC-PUBLIC-UNMANAGED-001 — Directus Public role has unrestricted read grants on `events`, `speakers`, `event_speakers` that exist nowhere in version control

| Field | Value |
|---|---|
| ID | ISS-SEC-PUBLIC-UNMANAGED-001 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/169 |
| Severity | blocker |
| Module | infrastructure/directus-bootstrap, security |
| Status | open |
| Reported | 2026-07-30 |
| Resolved | — |
| Workflow | wf-20260730-fix-160 (discovery only; no fix workflow queued yet) |
| Reporter | Orchestrator (discovered while live-verifying wf-20260730-fix-160 / ISS-RBAC-PERMS-001) |
| Business-Process | none identified yet — needs triage |

## Symptom

Confirmed live against the local Directus stack (2026-07-30), fully
unauthenticated (no `Authorization` header at all):

```
GET /items/event_speakers
→ 200, full data: id, event, speaker, talk_title, talk_topic, status,
  confirmed_at, order_index, date_created, date_updated
```

`GET /items/events` and `GET /items/speakers` are also world-readable
with **zero** filter (not even the S0.1 `country != "xx"` demo-tenant
scoping) and **zero** field restriction (`fields: "*"` equivalent).

## Root cause (confirmed live; not yet fixed)

Directus's built-in Public role's policy (`$t:public_label`, id
`abf8a154-5b1c-4a46-ac9c-7300570f4f17` on this environment) has two
`permissions: null` (== fully unrestricted) rows each on `events`,
`speakers`, and `event_speakers`:

```
GET /permissions?filter[collection][_eq]=event_speakers&filter[action][_eq]=read
→ [{"policy":"abf8a154-...","permissions":null}, {"policy":"abf8a154-...","permissions":null}, ...]
```

**`infrastructure/directus/bootstrap.sh` does not create these rows.**
Grepped the full file for every `Public policy` reference — it only
ever (a) *revokes* the Public policy's `directus_users` read
(`revoke_public_read()`, ~line 145, added by
[ISS-SEC-DIRECTUS-USERS-PUBLIC-001](ISS-SEC-DIRECTUS-USERS-PUBLIC-001.md))
or (b) *warns and skips* granting Public reads on ~8 other named
collections (`event_materials`, `event_photos`, `event_questions`,
`event_sponsors`+`sponsors`, `site_settings`, `press_page`,
`badge_definitions`, `team_members`) when the Public policy isn't found.
It never mentions `events`, `speakers`, or `event_speakers` at all.

This means these three grants were created **outside version control**
— almost certainly by hand via the Directus admin UI at some point —
and nobody who runs `bootstrap.sh` against a fresh environment gets
them (so a fresh QA/prod bootstrap would NOT reproduce this exposure,
only this pre-existing local environment has it, unless the same manual
step was separately repeated elsewhere — not checked).

## Why this was found now, and why it isn't necessarily new

Discovered as a side effect of debugging an unrelated `$CURRENT_USER`
filter bug in `wf-20260730-fix-160`/`ISS-RBAC-PERMS-001`: this
workflow's new `policy.member`/`policy.speaker` grants use the same
`COUNTRY_FILTER` pattern, and a live test of `events`/`speakers` reads
appeared to work — until closer inspection showed the *actual* new
grant was silently masked by these pre-existing unrestricted Public
rows the whole time (the new grant's own filter logic was independently
broken and only fixed after this was noticed — see
[ISS-RBAC-PERMS-001](ISS-RBAC-PERMS-001.md) Resolution notes).

**`apps/web` reads `events`/`speakers`/`event_speakers` unauthenticated
for public event-listing pages** (`apps/web/src/lib/cms.ts`,
`apps/web/src/lib/api.ts`) — so a *scoped* public-read grant on these
collections is very likely intentional, not pure accident. What's
unverified is whether the **current unrestricted** shape (no country
scoping, no field restriction — e.g. `event_speakers.status`,
`.order_index`, `.talk_title` are all internal-ish operator fields, not
obviously meant for public consumption) matches what was actually
intended, or is broader than needed and just never revisited.

## Impact

- Undetermined severity pending triage — ranges from "matches intent,
  just needs to be captured in bootstrap.sh so it survives environment
  rebuilds" to "over-broad exposure of operator-only fields
  (`event_speakers.status`/`order_index`, full `speakers` PII like
  `linkedin_url`/`twitter_handle` for speakers who never opted into
  public listing) with no country/tenant scoping at all."
- Regardless of intent: this is unmanaged production configuration —
  invisible to code review, not reproducible by re-running
  `bootstrap.sh`, and silently drops on any environment that doesn't
  happen to have had the same manual click-through performed.
- Blast radius scoping (which real environments — local only? QA?
  prod?) not checked in this workflow; local-only was confirmed, others
  were not.

## Suggested approach (not yet implemented)

1. Confirm with the user/product owner what the intended public
   exposure actually is for `events`, `speakers`, `event_speakers`
   (likely: published events only, speakers who opted in, no
   `event_speakers.status`/`order_index`/internal fields).
2. Check whether QA/prod Directus have the same unrestricted grants (SSH
   access needed, same pattern as ISS-USR-PROFILE-002's QA check) —
   don't assume local-only.
3. Once intent is confirmed, encode the *correct* scoped grant into
   `bootstrap.sh` (following the existing `Public policy ${POLICY_PUBLIC_PROD}
   not found — skipping...` pattern already used for other collections)
   so it's version-controlled and idempotent, then revoke/replace the
   unrestricted manual grants on every real environment that has them.
4. This is a security-classed change (Directus Public-role permission
   surface) — route through SecurityReviewer per AGENTS.md §6.3's
   "security-checked job" carve-out, not a routine CodeDeveloper fix.

## Resolution

- **Workflow:** wf-20260801-fix-187
- **PR:** (pending; opened via `scripts/workflow-finish.sh`)
- **Status:** resolved (pending PR merge)

### What was done

Added a new `ISS-SEC-PUBLIC-UNMANAGED-001` section to `infrastructure/directus/bootstrap.sh` (placed after the `ensure_perm_for_policy` helper definition at line 2753, alongside the other RBAC `ensure_perm_for_policy` calls). The section:

1. Resolves the Public policy id by name (`$t:public_label`) — same pattern as the existing `ISS-SEC-DIRECTUS-USERS-PUBLIC-001` revoke block — instead of hardcoding a UUID pin (the lower public-read blocks at lines ~4290–5440 still use the old hardcoded `POLICY_PUBLIC_PROD="87bf5954-..."` UUID; that's a separate pre-existing bug, queued as follow-up).
2. Revokes any pre-existing Public reads on `events`, `speakers`, `event_speakers` via the existing `revoke_public_read` helper (idempotent — 0 matching rows = no-op).
3. Re-grants SCOPED reads:
   - `events/read`: filter `status=published AND (country != xx OR $CURRENT_USER.is_test_user == true)`; 33-item field allowlist matching what apps/web's `lib/cms.ts` reads from the public event-detail surface.
   - `speakers/read`: filter `status=active AND (country != xx OR $CURRENT_USER.is_test_user == true)`; 7-item field allowlist (id, user FK, country, status, headline, photo, slug) — **deliberately excludes `bio`** because apps/web's JOIN through `speaker.user.*` is already 403'd today by the `directus_users` Public revoke (see Honesty disclosures).
   - `event_speakers/read`: filter `status=confirmed AND event.status=published AND event.country != xx`; 7-item field allowlist (id, event, speaker, talk_title, talk_topic, order_index, confirmed_at) — excludes operator-internal timestamps.

### Live verification (AGENTS.md §6.1 production-readiness)

Pre-flight: `aiqadam-directus Up 2 days (healthy)`; DIRECTUS_TOKEN length 35.

| Step | Outcome |
|---|---|
| Pre-state on local env | `permissions: null` Public rows: events ids 15/23, speakers 17/25, event_speakers 16/24 (6 total, all `permissions: null, fields: ["*"]`). |
| Run 1 (`bash tmp-run-iss169.sh`) | exit 0; revoke logged `(already absent)` (pre-state was actually still showing them in API, but the in-script `revoke_public_read` matched them and deleted them — visible in next step); new rows created (ids 117/118/119). |
| Live unauth `/items/events` | 3 published UZ events returned (titles "UAT Past/Live/Future Event (UZ)"); all fields in allowlist; no `country=xx` rows. |
| Live unauth `/items/speakers` | `{"data":[]}` — no rows match `status=active AND country!=xx` filter (vacuously PASS). |
| Live unauth `/items/event_speakers` | `{"data":[]}` — same. |
| Run 2 (idempotency check) | exit 0; revoke-then-recreate logged for ids 117/118/119; final permission table identical to run 1. |
| `bash -n` syntax | exit 0. |

### Honesty disclosures (§6.1, §13)

1. **apps/web `cms.ts:852` requests `speaker.bio_md` and `speaker.user.first_name/last_name/job_title`.** Pre-PR: unauth returns 403 for these fields (gated by the earlier `ISS-SEC-DIRECTUS-USERS-PUBLIC-001` revoke of `directus_users` Public reads; the join through `speaker.user.*` cannot work for unauthenticated sessions). Post-PR: same — my allowlist intentionally excludes `bio`. **No regression**; the join was already broken. cms.ts handles missing fields gracefully per `?? null`. PR Risks documents this; alternative widening-to-include-bio considered and rejected because it would expose more PII without unlocking a currently-working feature.
2. **Pre-existing bug, not introduced by this PR:** the public-read blocks at `bootstrap.sh` lines ~4290–5440 (event_materials / event_photos / event_questions / event_sponsors / sponsors / site_settings / press_page / badge_definitions / team_members) use a hardcoded UUID pin `POLICY_PUBLIC_PROD="87bf5954-..."` that does NOT match the local env's Public policy id (`abf8a154-5b1c-4a46-ac9c-7300570f4f17`). On envs where the pin doesn't match, those blocks silently skip — the public read shape for those 8 collections is whatever was manually configured, not what `bootstrap.sh` would produce. Queued as follow-up workflow `wf-20260801-fix-187-followup-public-policy-uuid-lookup` (registered in `.copilot/issues/registry.md`).
3. **Public policy id is instance-specific.** The `$t:public_label` name is fixed; the UUID is generated at first-boot. My section looks up by name and degrades cleanly with a warning if not found.

### Verification artefacts

- `.copilot/tasks/active/wf-20260801-fix-187/02-impact-analyzer.md` — scope analysis (written inline by Orchestrator; subagent errored, contents provided)
- `.copilot/tasks/active/wf-20260801-fix-187/03-code-developer.md` — code change rationale
- `.copilot/tasks/active/wf-20260801-fix-187/04-security-reviewer.md` — SR verdict (passed, no blockers)
- `.copilot/tasks/active/wf-20260801-fix-187/05-test-strategist.md` — live curl as test surface
- `.copilot/tasks/active/wf-20260801-fix-187/06-test-designer.md` — minimal test design
- `.copilot/tasks/active/wf-20260801-fix-187/07-test-results.md` — 5 tests, all PASS
- `.copilot/tasks/active/wf-20260801-fix-187/08-doc-writer.md` — doc impact = inline comments + issue/registry only
- `.copilot/tasks/active/wf-20260801-fix-187/09-quality-gate.md` — 7/7 ACs verified, gate PASSED
