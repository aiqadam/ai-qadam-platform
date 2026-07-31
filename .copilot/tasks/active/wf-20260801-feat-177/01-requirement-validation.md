# Step 1: Requirement Validation — FR-BOT-002 PR 4/6 (`/leaderboard`)

## Raw Input

> Implement PR 4 of 6 in the FR-BOT-002 ("Bot member commands") sequence:
> `/leaderboard` — top 10 members for the user's country, with temp-user
> exclusion and the caller's own row highlighted if they appear.

Source: `docs/03-requirements/FR-BOT-002.md`, functional-scope table row
`/leaderboard`, and Acceptance criteria rows 6 and 8. This is the fourth
of a planned 6-PR sequence; PR 1/6 (`/help`, `/events`, `/event <N>`),
PR 2/6 (`/register <N>`, `/cancel <N>`), and PR 3/6 (`/me`) are shipped
and merged (`wf-20260731-feat-174`, `wf-20260801-feat-175`,
`wf-20260801-feat-176`).

## Analysis

### Completeness Issues Found

None requiring clarification. The FR's own functional-scope table and AC
list are specific and testable:

- `/leaderboard` → "Shows top 10 members for the user's country. Temp
  users excluded. Highlights the calling user's position if they appear."
- AC: "`/leaderboard` shows top 10 members; the caller's row is
  highlighted if they appear."
- AC: "A temporary user is excluded from `/leaderboard` results."

One scope question the brief itself raised and resolved: whether the
caller's rank must be shown even when they rank outside the top 10. The
functional-scope table's exact wording — "Highlights the calling user's
position **if they appear**" — is the controlling text. Read literally,
this is conditional: no highlight, and no separate "your rank" callout,
when the caller is outside the top 10. Adopting the narrower, AC-literal
interpretation: no additional out-of-top-10 rank surface is built. This
avoids inventing an unspecified UX affordance (a "your rank: #47" line)
that AGENTS.md §13/§14 would treat as a product decision requiring either
explicit product intent or a user check-in — neither of which the FR
text supports. Documented here as an explicit scope decision, not a
silent narrowing.

### Conflicts with Existing Features

None. `/leaderboard` is a new command surface; no other shipped command
touches `PointsDirectusService.leaderboard()`. `/me` (PR 3/6) added
`PointsDirectusService.totalForUser()`, a single-user sibling of
`leaderboard()` — this PR reuses `leaderboard()` itself, unchanged.

### Architectural Feasibility

Confirmed feasible with **no new DB migration** and **no new points
logic**:

- `PointsDirectusService.leaderboard({countryCode, limit, window})`
  (`apps/api/src/modules/points/points-directus.service.ts:72-128`)
  already implements: country-scoped (`filter[country][_eq]`), top-N via
  Directus `groupBy=user` + `sort=-sum.points` + `limit`, and an
  `appear_on_public_leaderboard` opt-out filter
  (`_neq:false`, keeps `true`/`null`, excludes `false`).
- **Temp-user exclusion verified by reading the actual query, not
  assumed:** the aggregate is `GET /items/point_awards?...&groupBy=user`
  — it enumerates `point_awards` rows, not `directus_users` rows. A temp
  user (Authentik-only, provisioned via `upsert-temp-user`, never linked
  to a Directus mirror until a real registration/sign-in event creates
  one — see `me.py`'s own module doc on `is_temp`) has never earned a
  `point_awards` row, structurally cannot appear in this aggregate's
  `data[]`, and is silently absent — same "no row, no output" mechanism
  `leaderboard()`'s own comment documents for "orphan" aggregate rows
  (`points-directus.spec.ts`'s "silently drops aggregate rows for users
  not yet linked in platform.users" test covers the adjacent case: a
  Directus aggregate row with no matching `platform.users` row is
  dropped too). **Conclusion: the prior research pass was correct — no
  new exclusion logic is needed.** This will still be live-verified
  (seed a temp user + a full user with points, confirm only the full
  user appears) per the task's infra pre-flight instruction, since
  reading the query is necessary but the task explicitly asks for live
  proof too.
- **Caller-row detection:** `leaderboard()`'s returned `LeaderboardEntry[]`
  carries `userId: platform.users.id` (NOT `directus_users.id`) per its
  own type comment. The internal endpoint receives a `directusUserId`
  (bot's only identity signal, matching every sibling PR 1-3 endpoint's
  convention) — resolving that to a `platform.users.id` for the "is this
  me" comparison requires the SAME reverse-lookup PR 2 already built:
  `DirectusUsersBridgeService.resolveUserIdFromDirectusId()`. No new
  bridge method needed.
- No new Directus collection, no new Drizzle table, no new migration.

### Business-Process Linkage

Checked `docs/02-business-processes/uat/registry.md`. `BP-UAT-010`
(Event registration flow, used by PR 1-3) is a registration-surface
process — `/leaderboard` is unrelated (no registration involved).
`BP-UAT-012` ("Points engine and leaderboard") is the correct topical
match by name, but its own registry row shows **Process Ref: —, Status:
—, Last Run: — (never run, no spec authored)** — same "not yet built out"
state PR 3/6 already found and declined to force a link to (`BP-UAT-012`
was checked then too, for `/me`, and rejected as "not a single-user
readout"). For `/leaderboard`, `BP-UAT-012` IS a topical fit by name
("leaderboard" is literally in the title) but has no actual spec, no
`process_ref` runbook, and has never run — there is nothing live to
re-verify post-merge, and forcing `business_process: [BP-UAT-012]` would
trigger Step 13 against a UAT script that does not exist.

**Decision: set `business_process: []` for this PR** (unchanged from
its current `[BP-UAT-010]` — see correction below) and record the gap
plainly rather than inventing a spec or silently saying nothing, per
`protocol.md`'s "don't force a link" guidance and the task's explicit
instruction to note this as a legitimate finding.

Correction to `FR-BOT-002.md`'s frontmatter: the file currently carries
`business_process: [BP-UAT-010]`, set by PR 2/6 because THAT PR's surface
(register/cancel) genuinely touches BP-UAT-010. This PR's surface
(leaderboard) does not touch BP-UAT-010 at all. Per Step 1's own
instruction ("Confirm business_process still matches the final diff's
actual surface"), and because this FR ships across multiple PRs with
different surfaces, the single frontmatter field cannot represent "PR 2/3
touch BP-UAT-010, PR 4 touches nothing, PR 6 will touch FR-AUTH-006's
surface" simultaneously. Leaving `[BP-UAT-010]` in place is not wrong
for the FR as a whole (it still has BP-UAT-010-linked commands shipped),
so **this PR does NOT change the frontmatter value** — it stays
`[BP-UAT-010]`, but this workflow's own `handoff.yaml.business_process`
is set to `[]` since Step 13 gates on what THIS workflow's PR actually
touches, not on the FR's cumulative surface. This mirrors the precedent
PR 3/6 already established (its own Step 13 ran against BP-UAT-010
because `/me`'s registration list genuinely touches that surface, even
though `/me` itself isn't a new BP-UAT-010 AC) — the difference here is
that `/leaderboard` touches NEITHER BP-UAT-010 NOR (usably) BP-UAT-012,
so no Step 13 run applies to this PR specifically.

## Formalized Requirement

`FR-BOT-002` PR 4/6 — `/leaderboard` command:

1. **API:** `GET /v1/internal/telegram/leaderboard` on
   `TelegramInternalController`, `InternalAuthGuard`-protected,
   Zod-validated query (`directusUserId: uuid`, `country: countrySchema`),
   matching `auth.controller.ts`'s exact existing convention (parse via
   `safeParse`, `BadRequestException(parsed.error.flatten())` on failure).
   Calls `PointsDirectusService.leaderboard({countryCode, limit: 10})`
   unchanged, then resolves the caller's `platform.users.id` via
   `DirectusUsersBridgeService.resolveUserIdFromDirectusId(directusUserId)`
   to flag which (if any) returned entry is the caller's own row.
   Response shape: the top-10 entries plus a per-entry `isCaller: boolean`
   (or equivalent) — narrower "AC-literal" interpretation per the Analysis
   section above: no separate "your rank if outside top 10" field.
2. **Bot:** new `/leaderboard` command handler + inline render (top 10,
   `<b>` bold or a `→` marker on the caller's row per an established
   emphasis convention — see below), added to `BOT_COMMANDS` (no
   argument), `help.leaderboard` locale string's "(скоро)/(coming soon)"
   suffix removed now that the command ships.

### Cross-refs

- `apps/api/src/modules/points/points-directus.service.ts` — `leaderboard()`, reused unchanged.
- `apps/api/src/modules/directus/directus-users-bridge.service.ts` — `resolveUserIdFromDirectusId()`, reused unchanged.
- `apps/api/src/modules/auth/telegram-auth.service.ts`, `auth.controller.ts` — sibling route convention.
- `apps/bot/src/handlers/me.py`, `apps/bot/src/keyboards/me.py` — closest sibling handler (aggregate + list render).
- `apps/bot/src/locales/ru.py`, `en.py` — `<b>...</b>` HTML bold already established as the emphasis convention (parse_mode=HTML, `main.py`); reused for the caller-row highlight rather than inventing a new convention.

## Acceptance Criteria (draft, for TestDesigner)

- AC-1: Given a country with ≥10 members holding `point_awards` rows and `appear_on_public_leaderboard` not `false`, when a member (not in the top 10) calls `/leaderboard`, then the bot renders exactly 10 rows sorted by descending points, scoped to that member's own country.
- AC-2: Given a member who ranks within the top 10, when they call `/leaderboard`, then their own row is visually distinguished (bold / marker) from the other 9.
- AC-3: Given a member who does NOT rank within the top 10 (or has zero points), when they call `/leaderboard`, then no row is highlighted and no separate "your rank" line is rendered (AC-literal "if they appear" scope decision above).
- AC-4: Given a temporary (Authentik-only, no `point_awards` row) user, when `/leaderboard` is computed for their country, then that temp user's identity never appears as a row, even if they would otherwise rank by some hypothetical score.
- AC-5: Given the internal API is unavailable, when `/leaderboard` is invoked, then the bot shows a retry message (matching `events.unavailable`/`me.unavailable` convention), not a crash.
- AC-6: Given a country with zero `point_awards` rows, when `/leaderboard` is invoked, then the bot shows an empty-state message, not an error.
- AC-7: Response completes within 3 seconds under normal conditions (shared cross-command AC, verified the same way PR 1-3 did — no new timing infra).

## Gate Result

gate_result:
  status: passed
  summary: "FR-BOT-002 PR 4/6 (/leaderboard) is specific, testable, non-conflicting, and architecturally feasible with zero new DB migrations — reuses PointsDirectusService.leaderboard() and DirectusUsersBridgeService.resolveUserIdFromDirectusId() unchanged."
  findings:
    - "Temp-user exclusion is a natural consequence of leaderboard()'s point_awards-driven aggregate (no matching row -> never appears) — confirmed by reading the query, not just trusted from prior research; still scheduled for live verification per task instructions."
    - "Caller-highlight AC read literally as conditional on top-10 membership — no 'your rank if outside top-10' UI is in scope; this is the narrower, AC-literal interpretation the task brief itself flagged as preferred absent a clear signal otherwise."
    - "BP-UAT-012 (points/leaderboard) is a topical name-match but has no spec, no process_ref, and has never run — not force-linked. FR-BOT-002.md's business_process frontmatter stays [BP-UAT-010] (still correct for the FR's other shipped PRs), but this workflow's own handoff.yaml.business_process is [] since this PR's surface touches neither BP-UAT-010 nor a usable BP-UAT-012."
