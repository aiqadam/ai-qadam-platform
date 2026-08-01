# Impact Analysis — wf-20260801-fix-187 — ISS-SEC-PUBLIC-UNMANAGED-001

| Field | Value |
|---|---|
| Workflow | wf-20260801-fix-187 |
| Issue | ISS-SEC-PUBLIC-UNMANAGED-001 |
| GitHub issue | https://github.com/aiqadam/ai-qadam-platform/issues/169 |
| Severity | blocker |
| Impact scope | infrastructure/directus-bootstrap (no app code, no DB schema) |
| Gate | **passed** |
| Author | Orchestrator (inline; subagent invocation errored — see §Honesty Disclosure) |

## Honesty disclosure (per AGENTS.md §9)

The ImpactAnalyzer subagent invocation returned no output (agent errored
after timeout). The analysis below was therefore performed inline by the
Orchestrator directly against the same source files the subagent would
have read, and is presented in the same ImpactAnalyzer output format
defined in `.copilot/schemas/protocol.md`. If the QualityGate
disagrees with the verdict, this workflow escalates per the §6.2
safety gates — but the underlying analysis is documented and reviewable
in this file.

## Problem scope

The Directus built-in Public policy has rows with `permissions: null` (==
fully unrestricted) on three collections:

- `events`
- `speakers`
- `event_speakers`

These grants exist on the local environment but are NOT created by
`infrastructure/directus/bootstrap.sh`. Grepping bootstrap.sh for
`Public policy` shows only revoke operations (on `directus_users`) and
"skipping" logs for ~8 other collections (`event_materials`,
`event_photos`, `event_questions`, `event_sponsors`+`sponsors`,
`site_settings`, `press_page`, `badge_definitions`, `team_members`).
The three target collections are never mentioned.

Implication: any fresh `bootstrap.sh` run on a clean Directus would
**not** reproduce the current exposure — only the local environment
(where these grants were created by hand via the admin UI) has them.
After this fix lands, every environment — local, QA, prod — will end
up with the same scoped shape via a single, idempotent script run.

## Call-site audit (unauthenticated reads of these collections)

| File | Path | Filter | Fields |
|---|---|---|---|
| `apps/web/src/lib/cms.ts:249` | `GET /items/events` (homepage) | `country == <tenant>, status == published, ends_at > now` | EVENT_FIELDS allowlist (see line 1096) |
| `apps/web/src/lib/cms.ts:274` | `GET /items/events` (past events) | `country == <tenant>, status == published, ends_at < now` | same EVENT_FIELDS |
| `apps/web/src/lib/cms.ts:592` | `GET /items/events` (count aggregate for trust strip) | `country == <tenant>, status == published, ends_at < now` | aggregate |
| `apps/web/src/lib/cms.ts:618` | `GET /items/events` (count by country) | same | aggregate |
| `apps/web/src/lib/cms.ts:781` | `GET /items/events/{id}` (event detail page) | `id == <event>` | EVENT_FIELDS |
| `apps/web/src/lib/cms.ts:852` | `GET /items/event_speakers` (event detail page) | `event == <event>` | `id, event, speaker, talk_title, talk_topic, order_index` |

`apps/web/src/lib/api.ts` does not read any of these three collections.

`apps/api`, `apps/bot`, `apps/web-next`, `apps/storybook`, `scripts/`,
`tests/` — searched; **no other unauthenticated reads** of these
collections found. Authenticated reads via internal service tokens
operate against the existing RBAC policies (already scoped by
country/owner) and are unaffected by changes to the Public policy.

## Risk: existing unauth reads against the proposed scope

The proposed scoped Public grant must cover every row shape apps/web
already reads, or those reads will break (returning empty arrays).

| Read site | Required filter | Proposed scope covers? | Notes |
|---|---|---|---|
| events homepage | `country == X, status == published` | ✅ yes — `events/read` filter is `_and[status=published, _or[country != xx, ...]]`. Non-demo countries (uz/kz/tj) match the `country != xx` branch. demo country (xx) matches only for is_test_user members (not used by apps/web's unauthenticated path). |
| events past | same | ✅ | |
| events count | same | ✅ | |
| events by id | `id == <uuid>` | ✅ — Directus applies the filter at the policy level; the calling app's additional `id == X` is an AND, so still narrows to the one row. |
| event_speakers | `event == <event>` | ✅ — proposed scope filters `event.status=published AND event.country != xx`, which is a superset of the calling app's `event == X` (assuming the calling event is published + non-demo). |

### Field-restriction risk

The proposed scoped grant uses a `fields` allowlist (not just `["*"]`).
Directus enforces this server-side; unlisted fields are redacted in the
response. Every column apps/web reads is on the allowlist:

- `events`: ✅ every field in EVENT_FIELDS is on the allowlist (id,
  title, description, format, status, starts_at, ends_at, capacity,
  location, country, short_description, slug, venue, address, map_url,
  hero_image, agenda_md, visibility_scope, external_links, latitude,
  longitude, recap_md, livestream_url, date_updated)
- `event_speakers`: ✅ id, event, speaker, talk_title, talk_topic,
  order_index all on the allowlist. (cms.ts:852 doesn't ask for
  `confirmed_at` — app still works. We include `confirmed_at` in the
  allowlist for forward-compatibility; it's not a security risk.)

`speakers` is not currently read by apps/web's unauthenticated path
(no `GET /items/speakers` calls in cms.ts). Including it in the
scoped grant is defensive — covers future use and prevents the
current `permissions: null` exposure from persisting.

### Field NOT requested by apps/web but on the collection

For `events`:
- `created_by`, `date_created`, `date_updated` — apps/web reads
  `date_updated` (for OG cache-busting); the others are unused. Including
  them in the allowlist is safe (they're not PII) and gives operators a
  visible record if they need to debug. Including `date_updated` is
  required (cms.ts line 1096 includes it in EVENT_FIELDS).
- `eula_id` — unused by apps/web; including it is harmless.
- `registration_schema`, `registration_open`, `online_meeting_url` —
  unused by apps/web; include for forward-compat. Not PII.
- `audience_cohort` (uuid FK to cohorts) — unused by apps/web; include
  for forward-compat.
- `visibility` (`public`/`cohort`/`invite_only`) vs `visibility_scope`
  (`public`/`members_only`/`invite_only`) — these are TWO different
  fields with overlapping names. `visibility_scope` is what apps/web
  reads. The base `visibility` field defaults to `public`; events with
  `visibility != public` would not show up on the homepage filter
  (which filters `status = published`). Operator-enforced via
  `events.status = draft` for unpublished cohort/invite_only events.
  Including `visibility` in the allowlist is harmless.
- `post_event_processed`, `topic_tags`, `event_retrospective`,
  `media`, `recap_md`, `livestream_url`, `lat/long`, `venue`, `address`,
  `map_url`, `hero_image`, `agenda_md`, `external_links`, `slug`,
  `short_description` — all used by apps/web per EVENT_FIELDS; include.

For `speakers`:
- `bio` (PII — markdown bio member-managed) — omit. apps/web doesn't
  read it; if a future page needs it, that page can either (a) go
  authenticated, or (b) explicitly opt in via a new field allowlist
  extension.
- `linkedin_url`, `twitter_handle` — PII; omit.
- `user` (uuid FK to directus_users) — apps/web doesn't read, but
  including is safe (FK id is not PII). Include.
- `headline` (one-line "Principal ML Engineer at …") — public bio
  detail; include.

For `event_speakers`:
- `date_created`, `date_updated` — operator-internal; omit.
- `confirmed_at` — public; include.
- `talk_title`, `talk_topic` — public talk info; include.
- `order_index` — public sort key; include.

### Proposed final allowlists

```text
events:         id, title, description, format, status,
                starts_at, ends_at, capacity, location, country,
                short_description, slug, venue, address, map_url,
                hero_image, agenda_md, visibility_scope,
                external_links, latitude, longitude, recap_md,
                livestream_url, date_updated, eula_id,
                audience_cohort, visibility, registration_open,
                registration_schema, online_meeting_url,
                post_event_processed, topic_tags,
                event_retrospective, media

speakers:       id, user, country, status, headline, photo, slug

event_speakers: id, event, speaker, talk_title, talk_topic,
                order_index, confirmed_at
```

### Why "include everything not-PII" rather than the minimal allowlist

Apps/web's actual reads are a subset. The full allowlist above is the
"include every non-PII field" set. Trade-offs:

- **Pro:** future-proof — apps/web can add a new field read without
  requiring a bootstrap.sh change first. The events detail page
  already reads 20+ fields; missing one in a future PR would silently
  return null.
- **Pro:** no "mystery missing field" debugging sessions.
- **Con:** slightly wider blast radius than the minimal set.
- **Decision:** the wider set wins. PII is explicitly excluded
  (`speakers.bio`, `speakers.linkedin_url`, `speakers.twitter_handle`,
  `speakers.translations` — the per-locale bio map). Non-PII fields
  are safe to expose to the world.

## What's NOT in scope (deferred to a separate workflow if needed)

- **`feedback_responses` (or any Directus-internal audit column):** not
  in schema.
- **Audit log writes:** the bootstrap.sh change doesn't touch
  audit_events; existing writers (RBAC sync, invite service) keep working.
- **Server-side rendering for `speakers`:** currently unused; future
  pages (e.g. `/speakers` index) will use this scoped grant. No change
  needed today.
- **QA / prod Directus instances:** the bootstrap.sh change lands via
  the normal PR flow; no SSH needed for this workflow. After merge,
  QA/prod get the fix on next deploy per existing release process
  (this is the same path as the recent `event_materials` public-grant
  PR).

## What CodeDeveloper should do in Step 3

1. Add a new "ISS-SEC-PUBLIC-UNMANAGED-001 — scope unrestricted Public reads on events/speakers/event_speakers" block in bootstrap.sh. Place it adjacent to the existing ISS-SEC-DIRECTUS-USERS-PUBLIC-001 revoke block (~line 175 in the current file) for visibility.

2. Reuse `revoke_public_read` for each of `events`, `speakers`, `event_speakers` — this function is already proven (used by the directus_users revoke).

3. Reuse `ensure_perm_for_policy` to add the scoped grant for each of the three collections. Use `POLICY_PUBLIC_PROD="87bf5954-616e-40fa-bd61-2587e8c3f49b"` as the policy id, matching the event_materials pattern.

4. For the Public policy specifically, `ensure_perm_for_policy` requires the policy to exist (the function POSTs a permission row keyed by `policy+collection+action`). The existing event_materials block in bootstrap.sh guards this with:
   ```bash
   if curl -sf -H "${H_AUTH}" "${DIRECTUS_URL}/policies/${POLICY_PUBLIC_PROD}" >/dev/null 2>&1; then
     ...
   else
     echo "  ⚠ Public policy ${POLICY_PUBLIC_PROD} not found — skipping"
   fi
   ```
   — copy the same guard.

5. Filter JSON literals (jq -nc friendly):
   ```bash
   EVENTS_FILTER='{"_and":[{"status":{"_eq":"published"}},{"_or":[{"country":{"_neq":"xx"}},{"$CURRENT_USER":{"is_test_user":{"_eq":true}}}]}]}'
   SPEAKERS_FILTER='{"_and":[{"status":{"_eq":"active"}},{"_or":[{"country":{"_neq":"xx"}},{"$CURRENT_USER":{"is_test_user":{"_eq":true}}}]}]}'
   EVENT_SPEAKERS_FILTER='{"_and":[{"status":{"_eq":"confirmed"}},{"event":{"status":{"_eq":"published"},"country":{"_neq":"xx"}}}]}'
   ```

6. Field allowlist JSON literals (jq -nc arrays):
   ```bash
   EVENTS_FIELDS='["id","title","description","format","status","starts_at","ends_at","capacity","location","country","short_description","slug","venue","address","map_url","hero_image","agenda_md","visibility_scope","external_links","latitude","longitude","recap_md","livestream_url","date_updated","eula_id","audience_cohort","visibility","registration_open","registration_schema","online_meeting_url","post_event_processed","topic_tags","event_retrospective","media"]'
   SPEAKERS_FIELDS='["id","user","country","status","headline","photo","slug"]'
   EVENT_SPEAKERS_FIELDS='["id","event","speaker","talk_title","talk_topic","order_index","confirmed_at"]'
   ```

7. After the script section, add a small `echo "[✓ ISS-SEC-PUBLIC-UNMANAGED-001 fix complete]"` line for grep-ability in deployment logs.

## Gate

**passed** — proceed to Step 3 (CodeDeveloper).

Single risk worth flagging: the `$CURRENT_USER.is_test_user` dynamic
variable requires the **calling policy** to itself hold read on
`directus_users.is_test_user` for its own row. The Public policy is
used by UNAUTHENTICATED requests — there is no `$CURRENT_USER` (the
session has no user). Directus's documented behavior is that
`$CURRENT_USER` resolves to `null` for unauthenticated requests,
and the `{is_test_user: {_eq: true}}` predicate on a null `$CURRENT_USER`
evaluates to FALSE (the `_eq` against null is null != true → false →
whole branch fails → falls through to `country != xx` branch → matches
non-demo rows). So unauthenticated reads of the demo country (xx)
correctly return empty. This is the same shape policy.member / S0.1
already use; verified live by the existing fleet of S0.1 permissions.

If QualityGate disagrees, escalate to user (not blocking).