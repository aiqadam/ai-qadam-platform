# Step 1 — Requirement Validation

## Raw Input

PR 2/6 of `FR-BOT-002` ("Bot member commands"): implement `/register <N>`
and `/cancel <N>` for the Telegram bot. PR 1/6 (`wf-20260731-feat-174`,
merged as #201/#202) shipped `/help`, `/events`, `/event <N>` and left the
event-detail "Register" inline button as an explicit placeholder callback.
This PR wires that button to a real registration action and adds `/cancel`.

## Analysis

### Completeness Issues Found

None blocking. The FR's functional-scope table and Notes section, plus PR
1's `## Implementation progress` planning table, already specify:
- Command surface: `/register <N>`, `/cancel <N>`.
- API shape: `POST /v1/internal/telegram/register` proxying to
  `POST /v1/events/:id/register`; `DELETE` variant proxying to the
  existing cancel path.
- Header name (`x-internal-auth`), already corrected in FR-BOT-002 Notes.

One genuine gap resolved during codebase research (not a spec ambiguity,
an implementation detail the FR correctly left to the implementer):
**identity-key direction.** `RegistrationsDirectusService.register()` /
`.cancel()` take a platform `users.id` and internally call
`DirectusUsersBridgeService.resolveDirectusId(userId)` to get the
`directusUserId` they actually send to Directus. The bot's internal
routes receive `directusUserId` (already resolved via the existing
`lookup` endpoint) — the **reverse** direction. `DirectusUsersBridgeService`
has no existing reverse lookup (`directusUserId` -> platform `users.id`);
confirmed via `grep -rn "eq(users.directusUserId" apps/api/src` (no
hits). This PR adds one narrow reverse-lookup method to
`DirectusUsersBridgeService` (the established single source of truth for
this bridge, per the task brief) rather than inventing a heuristic in the
new internal controller/service.

**"QR deep-link" wording (FR-BOT-002 functional-scope table, `/register`
row) — confirmed stale.** Checked `RegistrationView`/`RegisterResponse`
(`registrations-directus.service.ts`, `registrations.controller.ts`) and
the live web UI's registration flow (`RegistrationCTA.tsx`,
`use-registrations.ts`): no QR code, deep-link, or ticket-URL field
exists anywhere in the real registration response shape today. Only a
`checkinCode` (used by the *operator* check-in scanner via a different
surface, `registration-checkin.controller.ts`) exists, and it is not
exposed to the member-facing register response at all. This matches the
task brief's suspicion that "QR deep-link" is a stale V1 spec artifact
(consistent with the historical `ISS-UAT-010-1` note about QR being
dropped). **Decision:** the bot's register confirmation message will NOT
reference a QR code or deep-link — it echoes the event title and
status only, matching what the API actually returns. Documented here per
AGENTS.md §9 honesty requirement.

**EULA/`RegistrationConsentRequiredError` handling.** Checked the live web
UI (`RegistrationCTA.tsx` -> `useRegisterForEvent`): it calls register
with **no** `acceptance` body at all — there is no mature EULA-prompt UI
even on the web client today (the `GET /v1/events/:id/consent-prompt`
endpoint exists in `eula.controller.ts` but nothing calls it from
`apps/web-next`). So there is no established client-side precedent to
mirror. **Decision (documented per the task brief's explicit ask for a
judgement call, AGENTS.md §14):** the bot's `/register` handler does not
attempt to collect EULA consent (out of scope — no seeded event in this
codebase's current UAT fixtures requires one, confirmed via the BP-UAT-010
script and seed data used at Step 13). If
`RegistrationConsentRequiredError` is thrown, the bot shows a plain
"registration requires additional confirmation on the web — visit
aiqadam.org to complete it" message rather than crashing or silently
retrying, matching the same posture as the web UI itself, which also has
no automated flow for this case yet. This is the minimum-viable UX per
AGENTS.md §14; a follow-up FR can build the bot-side consent flow once
the web UI has one to mirror.

### Conflicts with Existing Features

None. Extends the same `TelegramInternalController` (or a sibling file in
the same module, per PR 1 precedent) and the same
`RegistrationsDirectusService` used by the existing browser-authenticated
`RegistrationsController` — no duplicate business logic, per the task
brief's explicit instruction to inject `RegistrationsDirectusService`
directly rather than re-implement capacity/waitlist logic.

### Architectural Feasibility

Fits the established pattern precisely:
- New internal routes live under `v1/internal/telegram` (existing
  `@Controller('v1/internal/telegram')` in `auth.controller.ts`), guarded
  by the existing `InternalAuthGuard`.
- Zod validation at the boundary (AGENTS.md §5 / §1 rule 5) — matches
  every existing route in that controller.
- No schema/migration changes — pure proxy, per the task brief's own
  prediction ("if you find yourself needing one, that's a signal
  something is being duplicated").
- Two-repo change (`apps/api` + `apps/bot` submodule) — exact precedent
  already established by PR 1 (`wf-20260731-feat-174`).

## Formalized Requirement

**FR-BOT-002 PR 2/6** — Registration and cancellation commands for the
Telegram bot.

### API surface (apps/api)

- `POST /v1/internal/telegram/register` — body `{ telegramUserId? via
  directusUserId, eventId, country }`. Resolves `directusUserId` ->
  platform `users.id` via a new `DirectusUsersBridgeService` reverse
  lookup, then calls `RegistrationsDirectusService.register()` with that
  platform id. Returns `{ status, eventTitle }` (status is the service's
  own `'registered' | 'waitlisted' | 'cancelled' | 'attended'` union,
  faithfully passed through — no separate waitlist-detection logic).
- `DELETE /v1/internal/telegram/register` — body `{ directusUserId,
  eventId, country }` (DELETE-with-body, matching this being an internal
  service-to-service call, not a browser fetch bound by REST-body
  conventions some proxies dislike — acceptable here since both ends are
  our own code). Calls `RegistrationsDirectusService.cancel()`.
- Both routes: `InternalAuthGuard`-protected, Zod-validated, live in
  `TelegramInternalController` (same class as PR 1's `events`/`events/:id`
  — matches the file-organization precedent).
- Error mapping: `RegistrationNotFoundError` -> 404,
  `RegistrationConsentRequiredError` -> 409 (distinct from generic 400 so
  the bot can special-case it without string-matching a message),
  `RegistrationIneligibleError` -> 400. New reverse-lookup miss (bridge
  has no platform user for this `directusUserId`) -> 404
  `{ error: 'telegram_user_not_found' }`, matching `lookupUser`'s existing
  convention for "we don't recognize this identity."

### Bot surface (apps/bot)

- `/register <N>` command handler (`handlers/registration.py` or added to
  `event_detail.py` — CodeDeveloper's call per file-organization
  precedent) + the PR 1 placeholder callback (`handle_register_placeholder`
  in `event_detail.py`) rewired to call the same registration logic.
- `/cancel <N>` command handler, same file.
- Two confirmation messages: `registration.confirmed` (status ==
  `'registered'`) vs. `registration.waitlisted` (status ==
  `'waitlisted'`) — both include the event title, neither references a
  QR code (see stale-wording finding above).
- Error states (FR-BOT-002 Notes' four generic ones, applied to this
  command): API unavailable -> retry message (reuse
  `event.unavailable`-style locale pattern); event not found -> reuse
  `event.not_found`; already-registered -> idempotent message (confirmed
  via code read: `RegistrationsDirectusService.register()` returns the
  **existing row** idempotently on a duplicate call, does NOT throw — so
  the bot's "already registered" message is really just the normal
  confirmation message rendered again, not a distinct error path).
- New: `/cancel <N>` when not registered -> `Registration.cancel()`
  returns `null` (not an exception) when no active reg exists — bot shows
  a one-line "you're not registered for this event" message (not in the
  FR's explicit list, reachable, judgement call per task brief).
- `EVENT_REGISTER_PREFIX` callback rewired; no new callback prefix needed
  for cancel in this PR (out of scope — `/me`'s registration list with a
  Cancel button is PR 3's concern per the FR's own planned-PR table).

## Acceptance Criteria (draft)

- AC-1: `/register 5` registers the user for event 5; they receive a
  confirmation message with the event title (FR-BOT-002's own AC,
  restated).
- AC-2: Registering for a fully-booked event returns a waitlist
  confirmation message, distinct copy from AC-1 (FR-BOT-002's own AC).
- AC-3: `/cancel 5` cancels the user's registration; the waitlist
  promotion (if any) is handled server-side by the existing Directus flow
  — this PR verifies the API call succeeds and the bot shows a
  confirmation, not the promotion email itself (out of scope, already
  covered by BP-UAT-010/BP-UAT-014's existing flow).
- AC-4: Tapping PR 1's "Register" button on `/event <N>` now performs a
  real registration (no more placeholder toast).
- AC-5: `/register <N>` for an already-registered user returns the same
  confirmation message idempotently (no duplicate registration row, no
  crash).
- AC-6: `/register <N>` for a nonexistent/unpublished event N shows an
  error message, does not crash.
- AC-7: `/cancel <N>` for an event the user isn't registered for shows a
  one-line error message, does not crash.
- AC-8: API-unavailable during either command shows a retry message,
  matching the existing `event.unavailable`-style pattern from PR 1.

## Business-Process Linkage

`business_process: [BP-UAT-010]` — confirmed against
`docs/02-business-processes/uat/registry.md` row
`[BP-UAT-010](BP-UAT-010.md) | Event registration flow`. This PR is the
first to touch that surface from the bot's side (PR 1 was read-only
browsing). `FR-BOT-002.md`'s frontmatter `business_process: []` will be
updated to `[BP-UAT-010]` at Step 9 (DocWriter), per the task brief's
explicit instruction. Step 13 (post-merge UAT re-verification) is
therefore MANDATORY for this workflow.

## Gate Result

gate_result:
  status: passed
  summary: "FR-BOT-002 PR 2/6 scope validated: /register + /cancel internal API routes and bot handlers, reusing RegistrationsDirectusService directly; QR-deep-link wording confirmed stale, EULA edge case scoped to a plain fallback message."
  findings:
    - "Reverse directusUserId -> platform users.id lookup does not exist yet; adding one narrow method to DirectusUsersBridgeService is in scope for this PR."
    - "QR deep-link in FR-BOT-002's functional-scope table does not correspond to any real field in RegistrationView/RegisterResponse or the web UI today — treated as stale spec wording, not implemented."
    - "No mature EULA-consent UI precedent exists anywhere in the codebase (web UI calls register with no acceptance body) — bot gets a plain fallback message on RegistrationConsentRequiredError, not a full consent flow."
    - "business_process frontmatter on FR-BOT-002.md confirmed as BP-UAT-010 against the UAT registry; Step 13 is mandatory."
