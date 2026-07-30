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

- **Workflow:** not yet scheduled.
- **PR:** —
