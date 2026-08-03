# Code Summary — FEAT-NTF-004 (Telegram notification adapter gap-fill)

Workflow: `wf-20260803-feat-197`

## Requirement Implemented

Gap-fill against the already-shipped `TelegramAdapter` (ADR-0034), per
`01-requirement-validation.md` / `02-impact-analysis.md`:

1. `inline_buttons` passthrough from `TelegramAdapter.send()`'s payload into
   the `tg.dispatch.v1` envelope (was hardcoded `null`).
2. A Telegram-safe-HTML allowlist sanitizer (`<b> <i> <u> <s> <a> <code>
   <pre>`, FR-NTF-004 §3), applied to `text` inside `TelegramAdapter.send()`
   before the envelope is built, so every current and future caller gets it.
3. Telegram-channel dispatch added to the 3 registration Directus flows
   (`capacity_email_confirmed`, `capacity_email_waitlisted`,
   `promo_email_promoted`) in `infrastructure/directus/flows-bootstrap.sh`,
   alongside — never replacing — their existing unconditional email
   dispatch, gated per-recipient on `directus_users.telegram_user_id` +
   `telegram_opted_out_at`, using Finding A's recommended option (a):
   Directus-flow-side split via a new exec-type gate op per flow, mirroring
   the file's existing `decide_status`/`promo_gate`/`checkin_gate` pattern.
4. FR-NTF-004.md's doc correction is explicitly **not** done here — reserved
   for Step 9 (DocWriter) per the task instructions.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/interactions/channels/telegram-adapter.ts` | Modified | Extended `payloadSchema` with optional `inline_buttons` (2D array of `{text, url}`, defaults to `undefined`/`null` downstream — AC-2); threaded parsed value into envelope's `payload.template.inline_buttons` (was hardcoded `null`); applied new `sanitizeTelegramHtml()` to `text` before envelope build (AC-1/AC-3/AC-4). |
| `apps/api/src/modules/interactions/channels/telegram-html-sanitizer.ts` | Added | New allowlist-based HTML tag stripper (`ALLOWED_TAGS = ['b','i','u','s','a','code','pre']`). Regex-tokenizes tags, strips every disallowed tag, and additionally strips any allowlisted tag involved in unmatched/cross-nested pairing (conservative: prefer stripping a malformed pair over shipping broken HTML to Telegram's strict parser). Split into `toTagMatches`/`findTagsToStrip`/`rebuildWithout` helpers to stay under the 60-line function guideline. |
| `infrastructure/directus/flows-bootstrap.sh` | Modified | Added 6 new UUID constants (`OP_CAPACITY_TELEGRAM_GATE[_WL]`, `OP_CAPACITY_TELEGRAM_CONFIRMED`/`_WAITLISTED`, `OP_PROMO_TELEGRAM_GATE`, `OP_PROMO_TELEGRAM_PROMOTED`). Extended `capacity_user_lookup`, `capacity_user_lookup_wl`, `promo_user_lookup` item-read ops' `query.fields` with `telegram_user_id`/`telegram_opted_out_at`. Added 3 new `exec`-type Telegram-eligibility gate ops (one per flow branch) and 3 new terminal `request` ops that POST Telegram-shaped bodies (HTML text + `inline_buttons` where applicable) to `/v1/internal/interactions/dispatch` with `allowedChannels: ["telegram"]`. Re-chained each email op's `resolve` (previously `null`) to point at its new gate op, so email always fires unconditionally and Telegram fires additionally only when eligible (gate's `reject: null` = clean no-op). |

## Key Design Decisions

- **Finding A option (a), not (b).** Followed the impact analysis's
  recommended Directus-flow-side split rather than a NestJS-side helper —
  smaller diff, reuses the file's own proven exec-op-gate pattern
  (`decide_status`, `promo_gate`, `checkin_gate`), and keeps
  `InteractionsService`'s public surface untouched (confirmed: no changes
  needed to `interactions.service.ts` or `interactions.module.ts`).
- **Email op → gate op resolve chaining, not a parallel branch.** Each
  gate op is chained via the *email op's* `resolve` (not a fork at the
  lookup op), so the sequencing is explicit: email always sends first and
  unconditionally, then the gate evaluates Telegram eligibility using data
  already collected by the lookup op earlier in the chain (`data.<lookup_key>`
  is available to every downstream exec op in the same flow run). This
  matches the instructed ordering ("chained via `resolve` after the
  existing email-dispatch op fires").
- **Intent reuse, not new intents.** The new Telegram request ops reuse the
  same `intent` value as their sibling email op (`waitlisted` / `registered`
  / `promoted`) rather than inventing distinct intents. Rationale: the
  `interaction_deliveries` row's `channel` column (not `intent`) is what
  distinguishes the email delivery from the Telegram delivery for the same
  logical notification event — introducing a second intent per event would
  make it look like two unrelated notification *events* instead of one
  event delivered over two channels, which doesn't match how
  `event-reminders.service.ts`'s established pattern treats
  `INTENT_BY_KIND` (one intent per logical notification, dispatched once
  per eligible channel).
- **No button for waitlisted, per explicit FR/impact-analysis confirmation.**
  `capacity_telegram_waitlisted`'s body has no `inline_buttons` field at
  all (mirrors the `registration-waitlisted` email template, which also has
  none). `capacity_telegram_confirmed` and `promo_telegram_promoted` both
  include a single-row, single-button `inline_buttons` array labeled
  "Open event page", matching FR-NTF-004's stated ACs verbatim.
- **Button URL sourced from trusted item-read output only.** Both buttons'
  URLs use `{{ event_lookup.id }}` / `{{ promo_load_event.id }}` — Directus
  item-read output already selected in each flow (never `$trigger.payload`
  or any user-settable field) — per the impact analysis's explicit security
  flag on URL sourcing.
- **Interpolated user/event text kept out of tag attributes.** In all 3 new
  Telegram bodies, `{{ event_lookup.title }}` / `{{ promo_load_event.title }}`
  land only inside `<b>...</b>` textContent position, never inside the
  `<a href="...">` attribute — the attribute's only dynamic segment is the
  trusted `.id` field. This follows the task's explicit instruction on
  where interpolated text may safely land in the HTML string, given that
  Directus Liquid templates have no native escaping primitive and building
  one was explicitly out of scope.
- **Escaping discipline is a real, named residual gap — not silently
  patched over.** Traced the actual risk through to ground truth (see
  Known Limitations): an event title containing literal allowlisted-tag
  syntax (e.g. `<a href="https://evil.com">click</a>` as the title text)
  would survive `sanitizeTelegramHtml()` unchanged, because a
  well-formed/balanced `<a>` tag is indistinguishable from a
  legitimately-authored one once it's already inside the string the
  sanitizer receives. The FR explicitly scopes the sanitizer as an
  allowlist stripper, not an escaper, and building a Liquets-template
  escaping helper was explicitly declared out of scope — so this is
  flagged, not fixed, per the task's own boundary.
- **JSON escaping level in the Directus flow bodies — traced and
  corrected during implementation.** The 3 new Telegram request ops need a
  literal `\n\n` paragraph break inside their `text` field once the
  request finally reaches our API as valid JSON. Because `options.body` is
  itself a JSON *string* field inside the outer operation JSON that bash's
  heredoc produces, a single backslash-escape (`\n\n`, matching the level
  used everywhere else "textual" content appears in this file) gets
  unescaped to a **raw newline byte** by Directus's own JSON.parse when it
  stores the operation — which would then make Directus's rendered HTTP
  request body invalid JSON (a bare control character inside a string
  literal) when it's sent onward to our API. Verified this end-to-end with
  a 3-stage trace (bash heredoc expansion → simulated Directus JSON.parse
  of the stored `options.body` → simulated Liquid render + our API's own
  JSON parse) and confirmed the fix: these 3 bodies use `\\n\\n` (doubled)
  in the source so the value that finally reaches our API's body-parser
  contains real newlines, while every intermediate hop still sees valid
  JSON. This is a one-off escaping-level correction specific to the
  newline-containing bodies — the pre-existing 3 email ops have no `\n` in
  their bodies at all, so they were never exposed to this issue and are
  untouched here beyond their `query.fields`/`resolve` edits.
- **UUID constants follow the file's existing per-group numeric-suffix
  convention** (`11111111-c3c1-4001-8001-0000000000XX` for the capacity
  flow's group, `...c3c2-4002-8002-...` for the promotion flow's group),
  continuing each group's existing sequence (`018`+) rather than using
  random UUIDs, matching the file's own documented idempotent-upsert
  design.

## Architecture Rule Compliance

- **Module boundaries:** `TelegramAdapter` changes stay entirely within the
  `interactions` module's own adapter; the new sanitizer file is a sibling
  in the same `channels/` directory, imported only by the adapter. No
  cross-module entity/repository import. `interactions.service.ts` and
  `interactions.module.ts` are unchanged (confirmed by re-read after
  edits) — consistent with Finding A option (a).
- **Zod at boundaries:** `payloadSchema` (the Telegram adapter's own
  boundary validation) extended with `inlineButtonsSchema` — a proper Zod
  schema, not `z.any()`/`z.unknown()` for the button shape.
- **No `any`:** none introduced. `TagMatch` is a fully-typed interface;
  `unknown`/type-guards used where needed (`isAllowedTag` as a type
  predicate).
- **No cross-schema queries:** the 3 lookup-op field extensions
  (`telegram_user_id`, `telegram_opted_out_at`) are additions to existing
  Directus item-read ops against `directus_users` — same collection,
  same query mechanism already in use, not a new query pattern or a raw
  SQL cross-schema reach.
- **Auth/consent unchanged:** new Telegram request ops use
  `consentBasis: "operational_contract"`, matching their sibling email ops
  in the same flows exactly (no new consent basis introduced).
- **No new stack dependency:** the sanitizer is pure regex/string logic —
  no HTML parser package added, matching FR-NTF-004 §3's explicit
  "not a full HTML parser dependency" instruction.
- **DB migration:** none needed/made. `outbox.payload` is unstructured
  `jsonb`; `inline_buttons` is purely an application-layer Zod addition,
  confirmed by the impact analysis's direct schema read.

## Formatter Check

- `pnpm --filter api typecheck` — clean, no errors.
- `pnpm --filter api lint` (Biome) — `Checked 323 files. No fixes applied.`
- `pnpm --filter api build` (`nest build`) — clean.
- `pnpm biome check --write apps/api/src/modules/interactions/channels/telegram-adapter.ts apps/api/src/modules/interactions/channels/telegram-html-sanitizer.ts` — clean, no fixes applied (also cross-checked with the deprecated `--apply` flag name from the agent brief; same result, Biome just warns `--apply` is deprecated in favor of `--write`).
- `bash -n infrastructure/directus/flows-bootstrap.sh` — syntax OK.
- Additional self-verification beyond the mandated commands (this file has
  no unit-test harness anywhere in the codebase, per the impact analysis):
  extracted and JSON-validated all 31 heredoc operation blocks (28
  pre-existing + 3 new) via a Node script simulating bash's heredoc
  variable-substitution rules, confirming 0 malformed blocks; additionally
  ran the 3 new Telegram request ops' bodies through a full 3-stage trace
  (bash heredoc expansion → Directus's own JSON.parse of the stored
  `options.body` → simulated Liquid render + final JSON parse as our API
  would see it) to catch the newline double-escaping issue described above
  before it could reach a live Directus instance.

## Known Limitations

- **Sanitizer cannot distinguish a legitimately-authored `<a>` tag from a
  malicious one smuggled in via user-controlled event-title/name text.**
  If an event title itself contains well-formed allowlisted-tag syntax
  (e.g. a title literally containing `<a href="https://evil.com">click
  me</a>`), `sanitizeTelegramHtml()` will preserve it, because a
  balanced/well-formed `<a>` tag is indistinguishable from a
  template-authored one once it's inside the string being sanitized. This
  is an inherent consequence of the FR's own scope split (sanitizer =
  strip-only; escaping user data = each caller's job, no
  Directus-Liquid-escaping helper in scope) rather than an implementation
  bug — flagging it explicitly rather than silently expanding scope to
  "fix" it with an escaping mechanism the requirement doc placed out of
  bounds. Residual mitigation in place: interpolated event/user text in
  the 3 new flow bodies is placed only in `<b>...</b>` textContent
  position, never inside an `<a>` tag's own attributes, which closes the
  narrower attribute-injection vector (a title breaking out of an `href=`
  string) even though it doesn't close the "title contains its own full
  tag" vector. Recommend SecurityReviewer confirm this residual risk is
  acceptable for Phase 1 (event titles are organizer-authored, not raw
  end-user input, which narrows — but doesn't eliminate — the practical
  exposure).
- **This workflow's diff cannot verify actual Telegram delivery.**
  Consistent with the stated verification boundary in
  `01-requirement-validation.md`: `TelegramAdapter.send()` returns `'sent'`
  once the envelope is durably written to the outbox; the outbox → Redis
  Streams relay and the Python notifier's real `sendMessage` call are
  separate, already-shipped (relay) / not-fully-built (notifier) processes
  outside this diff. AC-5 through AC-8 (registration flows reaching
  Telegram) require live-local-run verification against a running Directus
  + Postgres stack — no unit-test precedent exists in this codebase for
  `flows-bootstrap.sh` changes (confirmed by the impact analysis's search
  of `.copilot/tasks/completed/`); this is TestRunner/Orchestrator's job at
  Step 8, not built here.
- **The Python notifier's own `sendMessage`/inline-keyboard rendering code
  is not part of this diff.** Explicitly out of scope per the handoff.
  `inline_buttons` now correctly reaches the outbox envelope (this
  workflow's provable boundary), but whether the notifier actually renders
  it as a Telegram inline keyboard depends on that separate, not-yet-fully
  -built piece.
- **No automated test coverage added in this step.** Per the agent
  division of labor, TestDesigner (a later workflow step) owns writing the
  new `describe` blocks in `apps/api/test/interactions-telegram-adapter.spec.ts`
  for AC-1/AC-2/AC-3/AC-4 and the sanitizer's own unit tests. This step's
  validation was limited to typecheck/lint/build/format plus the
  hand-rolled Node-based verification described above (not a substitute
  for the real Vitest suite).

## Retry 1 — Security Findings Addressed

Both MAJOR findings from `04-security-review.md` fixed. No other section of
this file was touched or re-litigated — the original implementation stands
except for the two changes below.

### MAJOR-1 — `inline_buttons` size bounds

File: `apps/api/src/modules/interactions/channels/telegram-adapter.ts`

`inlineButtonSchema`/`inlineButtonsSchema` had no `.max()` bounds, unlike the
sibling `text` field (`.min(1).max(4096)`). Fixed:

- `text: z.string().min(1).max(64)` — practical Telegram inline-button label
  rendering limit before client-side truncation (no documented hard API cap;
  64 is a widely-observed practical ceiling, same order of magnitude as this
  codebase's own existing `tg-broadcasts.controller.ts` `buttonSchema.label`
  bound, which uses the identical `.max(64)`).
- `url: z.string().min(1).max(2048).url()` — added `.url()` on top of the
  length bound so a malformed URL fails fast at the adapter boundary. `.max(2048)`
  matches the existing `tg-broadcasts.controller.ts` `buttonSchema.url` bound
  exactly, so both Telegram-button schemas in this codebase are now
  consistent.
- Array bounds: `z.array(z.array(inlineButtonSchema).max(10)).max(10)` — caps
  both rows and buttons-per-row at 10. Telegram's Bot API does not publish a
  hard documented limit on `inline_keyboard` dimensions; the existing
  codebase precedent (`tg-broadcasts.controller.ts`'s flat `.max(8)`,
  commented "8 (Telegram limit)") is a self-imposed business cap on a
  single-column flat list, not a citable per-dimension API ceiling for a full
  2D grid, so I did not have a more precise real limit to swap in — kept the
  security reviewer's suggested `.max(10)` per dimension as a small,
  reasonable, cheap guard consistent with `security.md`'s "every field has a
  max length" rule.

**Backward-compatibility / regression check performed:**
- AC-2 (omitted `inline_buttons` stays optional/undefined): unaffected —
  `.optional()` wrapper untouched, no default added.
- AC-1 passthrough for existing callers: traced both real call sites by
  direct read.
  - `event-reminders.service.ts`'s `buildReminderPayload()`:
    `inline_buttons: [[{ text: '📖 Details', url: 'https://aiqadam.org/events/${event.id}' }]]`
    — 1 row, 1 button, 9-char label, well-formed URL. Passes all new bounds.
  - The 3 new Directus flow ops (`flows-bootstrap.sh` lines 381/595, plus the
    waitlisted body which has no `inline_buttons` at all): both button-bearing
    bodies use `{ "text": "Open event page", "url": "https://aiqadam.org/events/{{ event_lookup.id }}" }`
    (or `promo_load_event.id`) — 1 row, 1 button, 17-char label, URL renders
    to a well-formed `https://aiqadam.org/events/<uuid>` after Liquid
    substitution (the `{{ }}` interpolation only ever substitutes the trusted,
    already-verified-UUID `.id` field, not the URL scheme/host). Passes all
    new bounds.
- Confirmed no existing test in `apps/api/test/interactions-telegram-adapter.spec.ts`
  references `inline_buttons` at all (grepped — zero matches), so no test
  fixture needed updating.

### MAJOR-2 — `"`/`\` guard on event titles

File: `apps/api/src/modules/workspace/events.controller.ts`

**Schema inventory performed first, per the task's instruction to find ALL
title schemas before fixing any:** `patchEventSchema.title` in
`events.controller.ts` is the **only** NestJS-side schema governing
`events.title`. There is no separate event-creation schema/endpoint in the
API — `EventsController` has no `@Post()` create method (confirmed by full
file read: only `list`, `detail`, `patch`, `regenerateSocialCard`,
`upsertFollowup`). Events are created directly against Directus (its own
`events.title` field is `string`/`max_length:200` with no character-class
restriction, per `infrastructure/directus/bootstrap.sh` line 445), outside
NestJS's validation boundary entirely — that create path is unchanged by
this fix (out of scope: Directus's own admin UI is not something this
workflow touches, matching the FR's stated boundary). So there is exactly
one schema to fix, and it's fixed — no gap between a create path and an edit
path, because no NestJS-side create path exists.

Fix applied:
```ts
const TITLE_SAFE_CHARS = /^[^"\\]*$/;
const TITLE_SAFE_MESSAGE = 'Title cannot contain a quote (") or backslash (\\) character.';

const patchEventSchema = z.object({
  title: z.string().trim().min(1).max(200).regex(TITLE_SAFE_CHARS, TITLE_SAFE_MESSAGE).optional(),
  ...
```

**Fixture/test regression check performed:** searched `apps/api/test/`
(all `*events*.spec.ts` files: `events-service.spec.ts`,
`telegram-events-internal.spec.ts`, `telegram-events-service.spec.ts`,
`checkin-events.controller.spec.ts`) and `infrastructure/` (seed data) for
any event title containing a literal `"` or `\`. **None found** — every
fixture title is a plain alphanumeric string (e.g. `'AI Qadam Meetup'`,
`'Renamed'`, `'Meetup #1'`). The two `grep` hits inside
`infrastructure/directus/bootstrap.sh`/`flows-bootstrap.sh` matching a
naive `"`/`\` pattern were false positives from the JSON *schema
definitions themselves* (e.g. `"max_length":200`), not actual seeded title
values — there is no `seed_event`-style function seeding real event rows
with special characters, unlike e.g. `seed_team_member`. Additionally,
`events-service.spec.ts`'s `patch` test calls `EventsService.patch()`
directly (service layer), bypassing `patchEventSchema` entirely (which
lives in the controller), so it could not have been affected either way.
**Conclusion: no fixture or test needed changes; this is a clean,
non-breaking tightening.**

This is a schema-tightening, not a data migration — no existing Directus
row is touched or re-validated by this change (Zod validation only runs on
new PATCH requests going forward), so there is no risk of breaking already
-stored production titles; a pre-existing title with a `"` would simply
become un-editable via this endpoint until corrected, which is the intended,
narrow effect.

### Files Changed (this retry)

| File | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/interactions/channels/telegram-adapter.ts` | Modified | Added `.max()` bounds to `inlineButtonSchema.text`/`.url` (+ `.url()` format check) and `.max(10)` caps on both `inlineButtonsSchema` array dimensions (MAJOR-1). |
| `apps/api/src/modules/workspace/events.controller.ts` | Modified | Added a `.regex(/^[^"\\]*$/, ...)` guard to `patchEventSchema.title` disallowing `"`/`\` characters, to prevent a title from breaking the outer JSON structure of Directus Liquid-templated request bodies downstream (MAJOR-2). Confirmed this is the only NestJS-side event-title schema (no create endpoint exists). |

### Validation (this retry)

- `pnpm --filter api typecheck` — clean.
- `pnpm --filter api lint` (Biome) — `Checked 323 files. No fixes applied.`
- `pnpm --filter api build` (`nest build`) — clean.
- `pnpm biome check --write apps/api/src/modules/interactions/channels/telegram-adapter.ts apps/api/src/modules/workspace/events.controller.ts` — `Checked 2 files. No fixes applied.`
- `pnpm --filter api test -- interactions-telegram-adapter events-service` — 4 test files, 108 tests, all passed. Confirms no regression in either changed file's existing test coverage.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Retry 1 complete: both MAJOR findings from the security review fixed. MAJOR-1 (inline_buttons unbounded) — added .max(64) on button text, .max(2048).url() on button url, .max(10) on both array dimensions of inlineButtonsSchema; verified both real call sites (event-reminders.service.ts and the 3 new Directus flow ops) still validate successfully (all are 1-row/1-button with short text/url). MAJOR-2 (unescaped quote/backslash in event titles) — added a character-class regex guard to patchEventSchema.title, confirmed it is the ONLY NestJS-side event-title schema (no create endpoint exists in EventsController), confirmed no existing test fixture or seed data uses a title containing '\"' or '\\' (searched all events-related spec files and infrastructure seed scripts), confirmed this is a non-breaking forward-only tightening (no existing Directus row is re-validated). All validation commands (typecheck/lint/build/biome/targeted tests) clean. Original implementation from the prior pass is otherwise untouched, per instruction."
  findings:
    - "MAJOR-1 fixed: apps/api/src/modules/interactions/channels/telegram-adapter.ts — inlineButtonSchema.text now .min(1).max(64), .url now .min(1).max(2048).url(); inlineButtonsSchema now z.array(z.array(inlineButtonSchema).max(10)).max(10). Verified against both real call sites (event-reminders.service.ts's buildReminderPayload and the 3 new Directus flow ops in flows-bootstrap.sh) — all pass the new bounds unchanged (single-row, single-button, short text/well-formed URL)."
    - "MAJOR-2 fixed: apps/api/src/modules/workspace/events.controller.ts — patchEventSchema.title gained .regex(/^[^\"\\\\]*$/, 'Title cannot contain a quote (\") or backslash (\\\\) character.'). Confirmed this is the only NestJS-side schema governing events.title (no create endpoint exists in EventsController; events are created directly in Directus, outside this workflow's scope). Confirmed no existing test fixture or seed data would break (searched all events-related spec files + infrastructure seed scripts, zero real matches — prior grep hits were JSON-schema-definition false positives, not seeded title values)."
    - "No other findings re-opened or re-litigated. Residual sanitizer gap (well-formed <a> tag inside an event title survives sanitizeTelegramHtml) remains an accepted Phase-1 risk per the security review's own judgment call — not touched by this retry, reserved for a FR-NTF-004.md documentation note at Step 9/DocWriter as the security review recommended."
    - "typecheck/lint/build/biome all clean. Targeted test run (interactions-telegram-adapter + events-service specs): 4 files, 108 tests, all passed — no regression introduced by either schema tightening."
```
