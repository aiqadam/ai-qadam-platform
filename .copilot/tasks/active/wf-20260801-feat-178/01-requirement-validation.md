# 01 — Requirement Validation: FR-BOT-002 PR 5/6 — `/interests`

## Raw Input

> PR 5 of a planned 6-PR sequence implementing `docs/03-requirements/FR-BOT-002.md`
> ("Bot member commands"). This PR covers the `/interests` command: "Shows
> current topic interests as toggle buttons; tapping a topic adds or removes
> it."
>
> Scope (pre-decided, not open for renegotiation):
> - API: `GET /v1/internal/telegram/interests` (current interests +
>   available-topics list) and `POST /v1/internal/telegram/interests/toggle`
>   (idempotent add-if-absent/remove-if-present), `InternalAuthGuard`-protected,
>   Zod-validated, on `TelegramInternalController`.
> - Bot: `/interests` command handler + inline keyboard with per-button
>   selected/unselected state, tap-to-toggle, in-place re-render. Bracket
>   marker (`[x]`/`[ ]`) for state. Locale updates dropping the "(coming
>   soon)" suffix on `help.interests`. Add to `BOT_COMMANDS`.
> - Out of scope: `/upgrade`, `/start` refinements.

`requirement_ref: FR-BOT-002` (existing FR, this is PR 5/6 — no new
`FEAT-BOT-N` code assigned, per the workflow brief).

## Analysis

### Completeness Issues Found

None that block the PR. The scope brief is specific and testable. Two
under-specified points were resolved during this validation pass (see
Formalized Requirement below):

1. **Which service owns the read/write of a user's actual interests, and
   which supplies the picker's candidate-topic list.** Resolved by reading
   the source — see "Architectural Feasibility" below.
2. **How the bot's `directusUserId`-only identity gets to `MeProfileService`,
   which needs `(userId, email)`.** Resolved — a new
   `DirectusUsersBridgeService` method, following the exact existing
   `resolveUserIdFromDirectusId` pattern.

### Conflicts with Existing Features

None. `member_interests` (Directus collection, owned by `MeProfileService`)
is already read/written by the web `/me/profile` cabinet (F-S3.6b, ADR-0033
cabinet #5) and exercised by `BP-UAT-003` AC-3. This PR adds a second
surface (the bot) onto the **same underlying resource** — no schema change,
no new collection, no competing write path. Same "second surface onto an
existing resource" shape as PR 2's `/register`+`/cancel` reusing
`RegistrationsDirectusService`, and PR 3's `/me` reusing
`RegistrationsDirectusService.listMine()` — this repo's established pattern
for bot commands that mirror an existing web capability.

### Architectural Feasibility

**Verified against the actual source files** (the pre-established research
handed into this task was directionally correct but needed two corrections,
noted below):

1. **`MeProfileService.listInterests/addInterest/removeInterest`**
   (`apps/api/src/modules/me-profile/me-profile.service.ts:352-393`) is
   confirmed as the correct service for reading/writing a user's actual
   interests. It reads/writes the `member_interests` Directus collection
   (`topic_tag` + `intent`, `intent ∈ {learn, practice, mentor, discuss}`),
   keyed on `(userId, email)` → internally resolves to `directusUserId` via
   `resolveDirectusId()` → `DirectusUsersBridgeService.ensureLinked()`.
   `topic_tag` is a free-text string column with no enum/candidate-list
   source anywhere in this service or its Directus schema — confirmed by
   reading the full file; there is no `TOPIC_TAGS` constant or similar here.

2. **`TelegramEventTopicsService`**
   (`apps/api/src/modules/telegram/telegram-event-topics.service.ts`) is
   confirmed as a static, curated, in-code enum (`KNOWN_EVENT_TOPICS`, 7
   entries: `llm`, `mlops`, `computer-vision`, `product`, `career`, `ethics`,
   `infra`), each with `{slug, label, icon}` and locale-aware translations
   (`ru`, `uz`) via `KNOWN_EVENT_TOPIC_TRANSLATIONS`. `.list(locale)` and
   `.isKnown(slug)` are its public surface. It taxonomizes **events**
   (`events.topic_tags[]`), a different concept from a per-user interest
   record, but it is the only fixed candidate-topic list anywhere in the
   codebase and is the obvious reference source for "what topics can a
   member pick from" in a bot picker UI.

3. **Import feasibility — confirmed, and the diagnosis is correct but for a
   slightly different reason than stated in the pre-established research.**
   Read `apps/api/src/modules/telegram/telegram.module.ts` in full:
   `TelegramEventTopicsService` is a provider but **is not in the module's
   `exports` array** (`exports: [TelegramService, TgConfigService,
   OutboxPublisher, DB]`) — so it cannot be injected by any other module
   regardless of the circular-dependency question. Separately, the
   documented cycle (`AuthModule → InteractionsModule → TelegramModule →
   AuthModule`, `telegram.module.ts`'s own header comment, PR #187/#202) is
   real but runs through `TelegramModule`'s *import* of `AuthModule`, not
   the reverse — importing `TelegramModule` from `AuthModule` would be a
   new edge on top of an already-forwardRef'd cycle, an unnecessary risk
   for a 7-entry static list. Both facts point to the same conclusion the
   brief anticipated: **do not import `TelegramEventTopicsService`.**
   Duplicate the static topic list directly in the new internal-telegram
   code, mirroring the exact precedent PR 1/6 already set for
   `TelegramEventsService` (see `telegram-auth.service.ts:25-36`'s own
   "Reuse vs. duplicate" comment — a small, stable, operator-curated list
   duplicated rather than risking a cross-module import). Concretely: a
   small `INTEREST_TOPICS` constant (slug/label pairs) lives in
   `telegram-auth.service.ts` itself, next to the other FEAT-BOT-2 schemas —
   it can reuse the *same 7 slugs* as `KNOWN_EVENT_TOPICS` for
   consistency (a member's "AI Ethics" interest and an event's "AI Ethics"
   tag should mean the same thing), but as an independently-owned literal,
   not an import. Locale handling matches the bot's own existing pattern:
   the bot already carries `ru`/`en` strings per-key in
   `locales/ru.py`/`locales/en.py` (not server-resolved like
   `TelegramEventTopicsService.list(locale)`), so the topic labels for the
   picker should live bot-side in the locale files too — the API returns
   bare slugs, the bot renders labels, exactly how every other picker in
   this bot works (no I18nLocale plumbing needs to cross the internal API
   boundary for this feature). **Net effect: API returns/accepts `topic_tag`
   as an opaque slug string; slug→label mapping is bot-side, not API-side.**
   This is a *simplification* versus the pre-established research's
   suggestion of an API-side `{slug, label, icon}` duplicate — no need to
   duplicate icon/label data on the API side when the bot already owns
   locale-specific rendering for everything else.

4. **Identity resolution — confirmed, one new bridge method needed.**
   `apps/api/src/modules/users/schema.ts` confirms `users` has both `id`
   and `email` (and `directusUserId`) as direct columns on one row. The
   existing `DirectusUsersBridgeService.resolveUserIdFromDirectusId()`
   (`directus-users-bridge.service.ts:221-228`) already queries exactly this
   table keyed on `users.directusUserId`, but only projects `{id}`. Per
   the exact same pattern, extend the bridge with a new method that
   projects `{id, email}` in one query — e.g.
   `resolveUserAndEmailFromDirectusId(directusUserId): Promise<{userId:
   string; email: string} | null>`. This is the cleanest approach: it's a
   one-column addition to an existing, already-narrow read query, follows
   the bridge service's established naming/shape convention exactly
   (`resolveUserIdFromDirectusId` → `resolveUserAndEmailFromDirectusId`),
   and avoids a second round trip. Do **not** add a second Directus call or
   a new heuristic — everything needed is already in `platform.users`.

5. **Module wiring — confirmed via `me-profile.module.ts` and
   `auth.module.ts`: `MeProfileService` must NOT be imported into
   `AuthModule`.** `MeProfileModule` already imports `AuthModule`
   (`me-profile.module.ts:8`, `imports: [DirectusModule, AuthModule]`) —
   this is the *same* module-boundary hazard the codebase has already hit
   and fixed twice (`RegistrationsModule` and, per its own header comment,
   the reverted `TelegramModule` attempt): if `AuthModule` also imported
   `MeProfileModule` to reach `MeProfileService`, that is
   `AuthModule → MeProfileModule → AuthModule`, an unresolvable cycle of
   the exact same shape, this time with no existing forwardRef precedent
   on the `MeProfileModule` side to lean on (unlike `RegistrationsModule`,
   which already imports `AuthModule` for `AuthGuard` and would need the
   analogous treatment). The safe fix, following the **exact same fix
   already used twice in this file** (`RegistrationsModule`'s import into
   `AuthModule` is wrapped in `forwardRef(() => RegistrationsModule)` per
   `auth.module.ts:45`): import `MeProfileModule` into `AuthModule` wrapped
   in `forwardRef(() => MeProfileModule)`, matching the `RegistrationsModule`
   precedent (not the `PointsModule` precedent, which needed no forwardRef
   because `PointsModule` doesn't import `AuthModule`). `MeProfileService`
   must also be exported from `MeProfileModule` for this to work — checked
   `me-profile.module.ts:11`: `exports: [MeProfileService]` — **already
   exported**, no change needed there.

6. **Toggle semantics.** `MeProfileService` has no native "toggle" method —
   only `addInterest`/`removeInterest`, both of which internally call
   `listInterests` first (dedup-check / ownership-check respectively). The
   new API-side `toggle` operation is a thin compose: call `listInterests`,
   check whether `(topic_tag, intent)` is present, then call
   `addInterest` or `removeInterest` accordingly, returning the resulting
   list. No change needed inside `MeProfileService` itself — the toggle
   logic is new code in `TelegramAuthService`, matching where PR 2-4 put
   all of their bot-specific composition logic (never inside the reused
   service).

7. **`intent` field.** `member_interests` rows require an `intent` (`learn |
   practice | mentor | discuss`) alongside `topic_tag` — `addInterest`'s
   signature is `(userId, email, topicTag, intent)`, not just a bare topic.
   FR-BOT-002's row text ("Shows current topic interests as toggle
   buttons") does not mention intent at all, and the bot's tap-to-toggle UX
   (one button per topic) has no natural slot for a 4-way intent picker
   without a second layer of UI the brief does not ask for and the FR
   AC list does not test. **Decision, following this FR's own established
   precedent for narrowing scope explicitly** (see FR-BOT-002.md's
   "Implementation progress" notes on streak/account-type/link-CTA, PR 3):
   the bot hardcodes a single default intent — `'learn'` — for every
   topic it adds via `/interests`. This is a genuine, documented scope
   narrowing (the web `/me/profile` cabinet lets a member pick per-topic
   intent and hold the same topic under multiple intents simultaneously;
   the bot's toggle model is simpler: one topic = one row = present or
   absent). It is not a silent gap: a member with `LLMs/learn` AND
   `LLMs/mentor` from the web (per `BP-UAT-003` Step 007's own documented
   "same topic, different intent is allowed" behavior) would see a bot
   toggle button that reads "selected" if EITHER intent-row exists for
   that topic (existence-of-any-row, not exact `(topic, intent)` match),
   and tapping "remove" when two intent-rows exist needs a defined
   behavior. Recommended, and left to CodeDeveloper to confirm against
   ACs: toggle-off removes only the `'learn'`-intent row if one exists
   (matching what toggle-on would have created), leaving other-intent rows
   from the web UI untouched — never mass-deletes a topic across all
   intents from a single bot tap. This must be called out explicitly in
   the PR description as a documented scope boundary, same posture as
   PR 3's streak gap.

### Architectural fit — module boundaries, tenancy, data ownership

- No new DB migration (confirmed — `member_interests` already exists and
  is fully covered by `MeProfileService`). Matches the task brief's own
  expectation.
- No cross-schema query — the new API routes proxy through
  `MeProfileService` → `DirectusClient`, same as every other Directus-backed
  bot route in this sequence.
- `InternalAuthGuard` + Zod validation on the new routes matches every
  existing `TelegramInternalController` route exactly (`x-internal-auth`
  header, per FR-BOT-002.md Notes' corrected wording).
- Tenancy: interests are **not** tenant-scoped — `member_interests` has no
  `country_code` column (confirmed: `MemberInterestRow`/`MemberInterest`
  interfaces carry no country field, and `listInterests`'s Directus filter
  is `{member: {_eq: directusUserId}}` only). No `country` param needed on
  either new route, unlike every other FEAT-BOT-2 route so far (`/events`,
  `/register`, `/me`, `/leaderboard` all take `country`). This is a
  legitimate difference, not an omission — interests are a global,
  per-member attribute (matches `architecture.md`'s §"Multi-tenancy
  implementation" point 5: "Some data is global... no `country_code`").

## Business process linkage check (Step 4)

Per the task brief: check whether an interests-toggle surface fits an
existing `BP-UAT-NNN` more specifically than `BP-UAT-010`.

**Finding — corrects the pre-established research.** The research handed
into this task claimed `BP-UAT-003` covers only "the unrelated `/me/profile`
web page, zero overlap" with an interests surface. This is **not accurate**
on inspection: `docs/02-business-processes/uat/BP-UAT-003.md` **AC-3**
reads "Member can add and remove interests (same tag with different intent
is allowed; same tag+intent deduplicates)," with **Steps 006–008** and
**Negative 002** exercising exactly `MeProfileService.listInterests` /
`addInterest` (the identical service and identical `member_interests`
collection this PR's API routes proxy). `BP-UAT-003` is a real, topically
precise fit for "interests" as a *resource* — it is the UAT spec that
already defines correct add/remove/dedupe behavior for this exact data.

However, **`BP-UAT-003` as currently scoped and registered is a web-only
spec** (`environment: http://localhost:4321`, every step action is a
browser navigation/click against `/me/profile`) — it contains zero bot
surface, zero Telegram interaction, and zero `InternalAuthGuard`/internal
route steps. Retrofitting bot steps into `BP-UAT-003` is out of scope for
this PR (the task brief explicitly does not ask for UAT spec authoring, and
`protocol.md`'s "don't force a link" guidance is about not inventing a
link where the *registered* process doesn't cover the *actual delivered
surface* — a spec that tests the underlying resource via a different
channel is adjacent, not identical).

**Decision:** `FR-BOT-002.md`'s frontmatter `business_process` stays
`[BP-UAT-010]` unchanged, per the task brief's own default and consistent
with PR 3/PR 4's judgment calls (frontmatter represents the FR as a whole,
not per-PR surfaces; BP-UAT-010 already covers this FR's dominant
registration-flow ACs). This is **not** the same situation as PR 4's
`BP-UAT-012` finding (a spec that's "never run, no spec authored" — genuinely
nothing to link to). `BP-UAT-003` is fully authored, `status: Ready`, with
real ACs covering the identical resource — recording this explicitly as a
**documented adjacency, not a gap**: a future BP-UAT-003 revision could add
bot-surface steps (mirroring how BP-UAT-010's own spec already covers both
web and, per PR 2, bot registration in one process), but authoring that
revision is out of this PR's scope. Flagging this for the Orchestrator /
BusinessAnalyst as a candidate follow-up, not creating a new issue
unprompted.

## Formalized Requirement

**FR-BOT-002, PR 5/6 — `/interests` command.**

The bot exposes a member-facing `/interests` command that lets a member
view and toggle their topic interests, reusing the same
`member_interests` resource and `MeProfileService` the web `/me/profile`
cabinet already uses (F-S3.6b, ADR-0033 cabinet #5; `BP-UAT-003` AC-3).

### API surface (new, on `TelegramInternalController`)

- **`GET /v1/internal/telegram/interests`** — query: `{ directusUserId:
  uuid }` (no `country` — interests are not tenant-scoped, see
  Architectural Feasibility above). Returns:
  ```
  {
    selected: string[]      // topic_tag slugs currently selected (intent-agnostic presence)
    available: string[]     // the fixed candidate slug list (duplicated 7-entry constant)
  }
  ```
  Resolves `directusUserId` → `(userId, email)` via the new bridge method,
  then calls `MeProfileService.listInterests(userId, email)`, reduces to
  the distinct set of `topic_tag`s present (any intent counts as
  "selected" for toggle-button rendering purposes — see point 7 above).

- **`POST /v1/internal/telegram/interests/toggle`** — body: `{
  directusUserId: uuid, topic: <one of the fixed slugs> }`. Idempotent
  single-call toggle: if the topic is currently selected (any intent),
  remove the `'learn'`-intent row for that topic if present (see point 7);
  otherwise add a new `'learn'`-intent row. Returns the same `{selected,
  available}` shape as the GET, post-toggle, so the bot can re-render in
  one round trip without a second GET.

  `topic` is validated against the fixed slug list at the controller/Zod
  layer (`z.enum([...])`, matching `countrySchema`'s own pattern) — an
  unknown slug is a 400, not silently accepted into `member_interests` as
  free text (even though the underlying column allows arbitrary strings,
  this route only ever writes from the curated list, keeping the bot's
  topic vocabulary aligned with the events taxonomy).

### Identity resolution (new)

- `DirectusUsersBridgeService.resolveUserAndEmailFromDirectusId(directusUserId:
  string): Promise<{userId: string; email: string} | null>` — single query
  against `platform.users` keyed on `directusUserId`, projecting `{id,
  email}`. Mirrors `resolveUserIdFromDirectusId` exactly; a miss returns
  `null`, surfaced by `TelegramAuthService` as the same
  `{error: 'telegram_user_not_found'}` 404 convention `requirePlatformUserId`
  already uses.

### Module wiring (new)

- `AuthModule` imports `MeProfileModule` wrapped in
  `forwardRef(() => MeProfileModule)` (mirrors the existing
  `forwardRef(() => RegistrationsModule)` treatment at
  `auth.module.ts:45`, needed because `MeProfileModule` already imports
  `AuthModule`). `MeProfileService` is already exported from
  `MeProfileModule` — no change needed there.
- `TelegramAuthService`'s constructor gains
  `@Inject(forwardRef(() => MeProfileService)) private readonly meProfile:
  MeProfileService` — same `@Inject(forwardRef(...))` requirement already
  documented and hit live for `RegistrationsDirectusService`
  (`telegram-auth.service.ts:301-310`'s own comment: Nest's
  `design:paramtypes` reflection can't resolve a forwardRef'd provider
  through the constructor-parameter type alone).

### Bot surface (new)

- `apps/bot/src/handlers/interests.py` — `/interests` command handler +
  toggle callback handler, following `events.py`'s
  `handle_events_page_callback` in-place-edit precedent
  (`callback.message.edit_text(...)` with the freshly re-rendered keyboard,
  not a new message).
- `apps/bot/src/keyboards/interests.py` — one button per topic, `[x]
  <label>` / `[ ] <label>` prefix per selected state (plain bracket marker,
  not emoji-as-state, per the task brief — the bot's existing emoji usage
  elsewhere, e.g. `events.button_next`/`button_prev`'s ➡️/⬅️, is a
  navigation affordance, not a state encoding, so this is a different use
  and the "no ambiguity" rationale in the brief stands). Topic labels are
  resolved bot-side from `locales/{ru,en}.py`, keyed by the same slugs the
  API returns (see Architectural Feasibility point 3 — no label/icon data
  crosses the internal API boundary).
- `apps/bot/src/services/api_client.py` — `get_interests()` and
  `toggle_interest()` methods, following `get_leaderboard`'s exact
  request/error-handling shape (`ApiUnavailableError` on non-2xx/network
  error, `x-internal-auth` header, dataclass result types mirroring the
  API's response shape 1:1).
- `apps/bot/src/locales/ru.py` and `en.py`: drop the "(скоро)"/"(coming
  soon)" suffix on `help.interests` (mirrors PR 4's exact treatment of
  `help.leaderboard`); add topic label keys + toggle button copy +
  unavailable-state copy, following `leaderboard.*`'s naming convention
  (`interests.title`, `interests.empty` [if the fixed list were ever
  empty — defensive, matches `leaderboard.empty`'s posture even though the
  static list is never actually empty], `interests.unavailable`, plus one
  key per topic label).
- `apps/bot/src/main.py`: add `/interests` to `BOT_COMMANDS` (no argument,
  same category as `/me`/`/leaderboard` per the existing comment block
  above `BOT_COMMANDS`), register `interests.router` in
  `build_dispatcher()` before `fallback.router`.

### Cross-references

- `FR-BOT-002.md` functional-scope table row: `/interests` (unchanged
  wording — the row already matches this PR's scope exactly).
- `docs/02-business-processes/uat/BP-UAT-003.md` — adjacent (same
  resource, different channel), not linked in frontmatter this PR; flagged
  as a candidate follow-up for BusinessAnalyst, not actioned here.
- `FR-BOT-002.md` frontmatter `business_process` stays `[BP-UAT-010]`.
- Precedent PRs: PR 1/6 (duplicate-over-cross-module-import precedent for
  `TelegramEventTopicsService`), PR 2/6 (`forwardRef` module-cycle fix
  precedent for `RegistrationsModule`, reverse-bridge-lookup precedent),
  PR 3/6 (scope-narrowing-is-documented-not-silent precedent for the
  `intent` decision above), PR 4/6 ("(coming soon)" suffix removal
  precedent).

## Acceptance Criteria (draft)

- **AC-1:** Given a member with no `member_interests` rows, when they send
  `/interests`, then the bot shows all available topics as unselected
  (`[ ]`) toggle buttons.
- **AC-2:** Given a member with an existing `member_interests` row for
  topic `llm` (any intent), when they send `/interests`, then the `llm`
  button renders selected (`[x]`) and all others unselected.
- **AC-3:** Given the `/interests` keyboard is showing, when the member
  taps an unselected topic button, then a `member_interests` row is
  created for that topic (intent=`learn`), the API call is idempotent
  (a concurrent duplicate tap does not create a second row — reuses
  `addInterest`'s existing dedup-by-listing behavior), and the message is
  edited in place to show that button now selected.
- **AC-4:** Given the `/interests` keyboard is showing, when the member
  taps a selected topic button, then the corresponding `member_interests`
  row(s) created by this toggle path are removed, and the message is
  edited in place to show that button now unselected.
- **AC-5:** Given the API is unavailable, when the member sends
  `/interests` or taps a toggle button, then the bot shows the
  `interests.unavailable` error message (matches FR-BOT-002 Notes' "API
  unavailable (retry message)" convention) rather than crashing or
  showing a stale/blank keyboard.
- **AC-6:** Given a member interacts with `/interests`, when the toggle
  keyboard renders, then every button's callback_data stays within
  Telegram's 64-byte limit (matches `ME_CANCEL_PREFIX`/`EVENTS_PAGE_PREFIX`'s
  own established short-prefix convention).
- **AC-7:** Given the same member also has web-set interests with a
  non-`learn` intent for a topic (e.g. `LLMs/mentor` from `/me/profile`),
  when they toggle that topic OFF via the bot, then only the `learn`-intent
  row (if any) is removed — the `mentor`-intent row from the web remains
  untouched (verifies the point-7 scope decision doesn't silently
  mass-delete cross-surface data).
- **AC-8:** Given `/help` is sent, then the `help.interests` line no
  longer shows a "(coming soon)"/"(скоро)" suffix, in both `ru` and `en`.
- **AC-9:** Given the bot starts up, then `/interests` appears in the
  Telegram command menu (`BOT_COMMANDS`) with no required argument.
- **AC-10:** Given a request to either new internal route without a valid
  `x-internal-auth` header, then the request is rejected by
  `InternalAuthGuard` (matches every other `TelegramInternalController`
  route).
- **AC-11:** Given `POST .../interests/toggle` is called with a `topic`
  value not in the fixed candidate list, then the API returns 400 (Zod
  validation), and no `member_interests` write occurs.

## Gate Result

```yaml
gate: requirement-analyst
status: passed
reasoning: >
  Specific: exact routes, request/response shapes, module-wiring change,
  and bot file layout are all fully specified and verified against the
  actual source files (not just the pre-established research, which
  contained one inaccuracy — corrected above — and one recommendation
  simplified — the label/icon duplication — after reading the real code).
  Testable: 11 draft ACs cover the toggle behavior, the cross-surface
  intent-scoping decision, error states, and wiring constraints.
  Non-conflicting: reuses the existing member_interests resource and
  MeProfileService with no schema change; no competing write path.
  Architecturally feasible: the one real risk (a second AuthModule
  circular-dependency edge, this time via MeProfileModule rather than
  TelegramModule/RegistrationsModule) has an exact precedent fix already
  proven twice in this codebase (forwardRef, matching RegistrationsModule's
  treatment) — confirmed by reading auth.module.ts, me-profile.module.ts,
  and telegram.module.ts directly, not assumed.
  Scoped to one module layer per surface (API: auth.controller.ts +
  telegram-auth.service.ts + directus-users-bridge.service.ts; Bot:
  handlers/keyboards/services/locales/main.py), matching every prior PR
  in this sequence.
  Referenced: FR-BOT-002.md, BP-UAT-003.md (adjacency noted, not linked),
  BP-UAT-010.md (unchanged), ADR-0033, and PR 1-4's own precedent comments.
blocking_issues: []
needs_clarification: []
notes: >
  One scope decision left as a recommendation for CodeDeveloper to confirm
  against the draft ACs rather than a hard mandate: toggle-off should
  remove only the 'learn'-intent row it would have created (AC-7), not
  every intent-row for that topic, to avoid a bot tap silently deleting
  web-authored data under a different intent. This is a genuine product
  micro-decision within a CodeDeveloper's normal implementation authority
  (unlike PR 3's streak gap, which was a full concept absence) — flagged
  here for visibility, not escalated.
  BP-UAT-003 adjacency (documented above) is a candidate follow-up for a
  future BusinessAnalyst-authored spec revision adding bot-surface steps;
  not actioned in this PR, per task brief scope.
```
