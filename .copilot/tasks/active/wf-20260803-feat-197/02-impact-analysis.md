# Impact Analysis — FEAT-NTF-004 (Telegram notification adapter gap-fill)

Workflow: `wf-20260803-feat-197`

## Validated Requirement

**FEAT-NTF-004** (reuses `FR-NTF-004`'s code — correction + gap-fill, not a
new number). Per `01-requirement-validation.md`: the already-shipped
`TelegramAdapter` (ADR-0034) gains (1) `inline_buttons` passthrough into the
`tg.dispatch.v1` envelope, (2) a Telegram-safe-HTML allowlist sanitizer
applied before the envelope is built, and (3) Telegram-channel dispatch
(HTML body + "Open event page" inline button) added to the
registration-confirmed / -waitlisted / -promoted flows, alongside (not
replacing) existing email dispatch, gated on
`directus_users.telegram_user_id` set + `telegram_opted_out_at` null.
`FR-NTF-004.md`'s architecture description is corrected to match the shipped
outbox → Streams → notifier design in the same pass (item 4, Step 9/DocWriter
— noted here, not executed at this step).

**Finding A carried forward as a hard constraint on item 2's implementation**
(see `01-requirement-validation.md` for full derivation): `InteractionsService.dispatch()`
calls `pickPrimaryChannel(input.allowedChannels)` **once**, returning only
`allowedChannels[0]` — it does not fan out. `allowedChannels: ["email",
"telegram"]` on a single `dispatch()` call would silently route every
recipient (including telegram-eligible ones) to email only. Item 2 must
issue **two separate dispatch calls**, each single-element
`allowedChannels`, gated per-recipient on Telegram eligibility — mirroring
`event-reminders.service.ts`'s `processCandidate`/`dispatchChannel` split
(L190–239). This impact analysis is written against option **(a)**
(Directus-flow-side split) as the recommended default per the requirement
doc, with option (b) noted as CodeDeveloper's alternative if the flow-JSON
diff proves unwieldy.

---

## Affected Layers

### API (NestJS)

| Component | Change | Notes |
|---|---|---|
| `apps/api/src/modules/interactions/channels/telegram-adapter.ts` | Extend `payloadSchema` with optional `inline_buttons`; thread into envelope's `template.inline_buttons` (replace hardcoded `null`); add sanitizer call on `text` before envelope build | Primary surface. No new file needed — could add a sibling `telegram-html-sanitizer.ts` (recommended, keeps the regex/allowlist logic unit-testable in isolation) or inline as a private method/function in the same file. Either is architecturally acceptable; CodeDeveloper's call — flagging as a design choice, not mandating a new file. |
| `apps/api/src/modules/interactions/interactions.service.ts` | **No change** if option (a) is chosen (Directus-side split). If CodeDeveloper picks option (b) instead, a new helper/branch here (or a thin wrapper the internal controller calls) would be needed — see Finding A options. | Flag to CodeDeveloper: confirm which option was taken and update this row accordingly in `03-code-summary.md`. |
| `apps/api/src/modules/interactions/interactions.types.ts` | No change expected — `ChannelAdapter.send()` signature, `DispatchInput`, `payload: z.record(...)` all stay as-is | Confirmed below under API Surface Changes. |
| `apps/api/src/modules/interactions/interactions.module.ts` | No change — no new providers/adapters, same adapter registered under the same token | — |
| `apps/api/src/modules/workspace/event-reminders.service.ts` | **No change** — this is the reference pattern, not a modification target. Its `buildReminderPayload()`'s existing `inline_buttons` construction is what AC-1/AC-4 protect against regressing. | Read-only reference for CodeDeveloper. |

### Infrastructure / Config (non-NestJS, non-TypeScript) — FLAGGED

**`infrastructure/directus/flows-bootstrap.sh` is a second affected surface
outside CodeDeveloper's usual `apps/api` working set.** This is a bash
script that idempotently upserts Directus flow/operation JSON via the
Directus REST API (`upsert "..." "operations" "$ID" "$JSON"` helper) — not
a NestJS module, not compiled, not covered by `tsc`/Biome/Vitest. Concretely,
for option (a), CodeDeveloper needs to edit:

1. **`capacity_user_lookup`** (item-read, `directus_users`, ~line 316–333) —
   extend `query.fields` from `["email", "first_name"]` to
   `["email", "first_name", "telegram_user_id", "telegram_opted_out_at"]`.
2. **`capacity_user_lookup_wl`** (item-read, `directus_users`, ~line
   241–260) — same field-list extension.
3. **`promo_user_lookup`** (item-read, `directus_users`, ~line 468–487) —
   same field-list extension.
4. **`capacity_email_confirmed`** (request op, ~line 292–313) — add a new
   sibling "request" operation (e.g. `capacity_telegram_confirmed`) chained
   off `capacity_user_lookup`'s `resolve`, or restructure `resolve` to a
   parallel pair. Directus flow ops are a linked list (`resolve`/`reject`
   FK to the next op's UUID) — **only one `resolve` target per op**, so
   "fire both email and telegram unconditionally" needs either (i) a new
   op chained after the email op (`capacity_email_confirmed.resolve →
   capacity_telegram_confirmed`), gating the Telegram POST's *content*
   conditionally via the request body's own template logic (Directus
   request ops don't support conditional execution natively — the body
   is a Liquid-style `{{ }}` string template, not a branch), or (ii) an
   `exec`-type op (JS) inserted between lookup and the two request ops
   that returns a truthy/falsy value to gate `resolve` vs `reject` on the
   Telegram-eligibility check, mirroring the existing `decide_status`
   exec-op pattern in the same file (~line 287 area, "Op 3: exec script").
   **Recommend the exec-op-gate pattern** — it is already proven in this
   exact file for a structurally identical problem (conditional
   branching off item-read output), so CodeDeveloper isn't inventing a
   new mechanism.
5. **`capacity_email_waitlisted`** (~line 215–236) and **`promo_email_promoted`**
   (~line 442–463) — same treatment as #4, for their respective flows
   (`FLOW_REG_CAPACITY` waitlist branch, `FLOW_REG_PROMOTION`).
6. New deterministic UUID constants (following the file's existing
   `OP_CAPACITY_USER_LOOKUP`-style naming, e.g.
   `OP_CAPACITY_TELEGRAM_CONFIRMED="11111111-c3c1-4001-8001-0000000000XX"`)
   for each new operation — the file uses hardcoded UUIDs for idempotent
   re-runs (`upsert` keys off these), not name-based lookup.

**Directus schema/collection changes: none needed.** `interaction_deliveries`
and `outbox` already have everything required — the Telegram eligibility
check reads existing `directus_users.telegram_user_id` /
`telegram_opted_out_at` columns (already present per ADR-0033/the
`InteractionsService.resolveRecipients` precedent), just not currently
selected by these 3 flow ops' `query.fields`. No new Directus field, no new
collection.

### DB Changes Required: **NO**

Confirmed by reading `apps/api/src/modules/telegram/schema.ts` directly:
the `outbox` table's `payload` column is `jsonb('payload').notNull()` — a
fully unstructured JSON blob written verbatim by `TelegramAdapter.send()`
and XADD'd by the relay with no schema validation at the Postgres layer.
Adding `inline_buttons` content to `envelope.payload.template.inline_buttons`
is purely an application-layer (Zod `payloadSchema`) change; it requires
**zero** Drizzle migration. Same conclusion for `tg_send_log` and
`tg_config` — neither table's shape is touched by any of the 4 requirement
items. DBMigrationAuthor step is not needed for this workflow.

### Shared Types (`packages/shared-types/`)

No change expected. `dispatchInputSchema` (interactions.types.ts) already
declares `payload: z.record(z.string(), z.unknown())` — an open bag not
re-declared in `packages/shared-types`; the Telegram-specific `payloadSchema`
lives locally in `telegram-adapter.ts` and is not exported/shared. Confirmed
no cross-package import of Telegram payload shapes exists today (adapter's
schema is adapter-private).

### Frontend (`apps/web` / `apps/web-next`)

No change. This workflow is entirely server-side (NestJS adapter + Directus
flow config); no new page, no new API client call, no UI surface.

### Bot (`apps/bot`)

No change **in this workflow's diff** — explicitly out of scope per the
handoff ("apps/bot's own sendMessage/rate-limit code... is a known gap,
not silently invented here"). The notifier consuming `tg.dispatch.v1` and
rendering `inline_buttons` is a real dependency for this feature to be
end-to-end complete, but building/modifying it is not part of this
workflow — flag as a Note in the corrected `FR-NTF-004.md` (item 4, Step 9),
not a code change here.

### Workers (`apps/workers` / BullMQ)

No change. Explicitly out of scope (handoff: "BullMQ in any form" is
excluded). The outbox → Redis Streams relay (`outbox-relay.service.ts`) is
already shipped and untouched by this workflow.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/internal/interactions/dispatch` | POST | None to the endpoint's own contract (`dispatchInputSchema`) — `payload` is already `z.record(z.string(), z.unknown())`, an open bag with no shape validation at this layer; Telegram-specific validation happens downstream inside `TelegramAdapter.send()` via its own local `payloadSchema`. Callers (the 3 Directus flow ops) will send a richer `payload` body (HTML text + `inline_buttons`) for the new Telegram-branch calls, and 3 existing calls gain new selected fields (`telegram_user_id`, `telegram_opted_out_at`) upstream in their own item-read ops — neither changes what this endpoint itself accepts or returns. | **No.** Purely additive; existing callers (email-only bodies) are unaffected — confirmed no existing `allowedChannels`/`payload` shape assumption is invalidated. |
| `TelegramAdapter.send()` (internal method, not HTTP) | — | `payloadSchema` gains an optional `inline_buttons` field; `text` passes through a new sanitizer before being written to the envelope | **No.** Optional field with `undefined`/omitted behavior preserved (AC-2); sanitizer is designed to be a no-op / byte-identical pass-through for the one existing production caller's already-safe input (AC-4 — `event-reminders.service.ts`'s `telegramHtmlBody()` output, which only ever emits `<b>` tags plus pre-escaped text). |

No new endpoint is introduced. No existing endpoint's request/response DTO
changes shape in a way that breaks a typed caller.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `InteractionsService.deliverToRecipient()` | `TelegramAdapter.send()` | In-process method call, DI-injected via `CHANNEL_ADAPTERS` multi-provider token (existing, unchanged) |
| `TelegramAdapter.send()` | `OutboxPublisher.publish()` (same-transaction Postgres insert) | In-process, existing, unchanged |
| **`infrastructure/directus/flows-bootstrap.sh`'s 3 flow `request` ops** (`capacity_email_confirmed`, `capacity_email_waitlisted`, `promo_email_promoted`, plus their new Telegram-branch siblings) | `POST /v1/internal/interactions/dispatch` (NestJS API) | HTTP, cross-repo-boundary / config-vs-code — Directus flow JSON (config, not source-controlled TypeScript in the usual sense, though the bootstrap script itself is versioned) calling into the NestJS internal API over HTTP with a static bearer-style header (`x-internal-auth: {{ $env.INTERNAL_API_TOKEN }}`). **This row is the one worth explicitly calling out per the ImpactAnalyzer role's step 8** — it's a genuine cross-module call across a config/code boundary that doesn't fit the NestJS-module-to-NestJS-module pattern the architecture doc's "Module boundaries" section is written for. No architecture-rule violation (this pattern is pre-existing and already ADR-adjacent per ADR-0034/the 5.5/5 email migration), just flagged because it's the surface CodeDeveloper is least likely to default to touching. |
| Outbox → Redis Streams relay → Python notifier | Telegram Bot API `sendMessage` | Out of this workflow's diff entirely (unchanged, pre-existing per ADR-0034) |

No new cross-schema query is introduced (architecture.md's "Cross-schema
queries are forbidden" rule is not implicated — the flow ops already read
`directus_users` via Directus's own item-read op type, not raw SQL; adding
2 more field names to an existing read is not a new query pattern).

---

## Risk Flags

### Security Review Required

1. **Telegram-safe-HTML sanitizer — injection/misrender surface.**
   `TelegramAdapter` currently trusts `text` as pre-sanitized; this
   workflow adds the first stripping/validation layer in the dispatch
   path. Concrete risks for SecurityReviewer to examine once code lands:
   - **Escape-before-strip ordering.** User-controlled data (event
     titles, member `first_name`) flows into the new registration-flow
     Telegram bodies (item 2) and must be HTML-escaped (`&`, `<`, `>`)
     **before** being wrapped in allowlisted tags — exactly the existing
     `escapeHtml()` pattern in `event-reminders.service.ts` (L394–396):
     `<b>${escapeHtml(title)}</b>`. If the new registration-flow body
     construction interpolates `event_lookup.title` /
     `capacity_user_lookup.first_name` raw into an HTML string and only
     *then* the sanitizer strips disallowed tags, a title/name containing
     `<script>` or a bare `<` could either (a) get allowlist-stripped
     coincidentally-safely, or (b) if it contains only allowlisted tag
     *syntax* crafted by an attacker-controlled event title (e.g. a
     malicious organizer-entered title containing `<a href="...">`),
     survive the allowlist strip and inject an unintended link/formatting
     into another user's Telegram DM. Escaping user data first, then
     wrapping in the fixed template's own allowlisted tags, closes this;
     sanitizing the whole assembled string without first escaping
     interpolated user data does not.
   - **Malformed/malicious tags reaching Telegram's own HTML parser.**
     Telegram's Bot API `parse_mode: 'HTML'` has its own strict parser
     that 400s the whole `sendMessage` call on invalid nesting/unclosed
     tags — a regex-based allowlist-strip (not a real parser) can leave
     structurally broken HTML (e.g. an unmatched `<b>` if the closing tag
     used a disallowed variant like `<B>` case mismatch, or nested-tag
     edge cases). This isn't a browser XSS risk (Telegram is not a
     browser and does not execute script tags), but it **is** a delivery-
     reliability risk: a malformed envelope reaching the notifier could
     cause `sendMessage` to fail for that recipient, silently starving
     the Telegram channel while email still succeeds (AC-8/AC-9 would
     still pass since they're email-focused, but the Telegram delivery
     itself would silently degrade with no test coverage currently
     designed to catch parser-level malformation, only "are disallowed
     tags absent" per AC-3). Recommend SecurityReviewer also ask whether
     TestDesigner's sanitizer test suite (see Test Scope) should include
     at least one case of intentionally-malformed nesting to confirm the
     stripped output remains parseable, not just tag-absent.
   - **Not a full HTML parser dependency, per explicit instruction** —
     the regex-allowlist approach is deliberately chosen (matches
     FR-NTF-004 §3's own spec + the requirement doc's explicit "not a
     full HTML parser dependency" instruction); SecurityReviewer should
     evaluate the *regex's* completeness/safety, not push back on the
     architectural choice of regex-vs-parser itself, which is already
     decided.

2. **Inline button URL construction — low risk, but confirm the pattern.**
   `event-reminders.service.ts`'s existing pattern:
   `` `https://aiqadam.org/events/${event.id}` `` (L336) — `event.id` is a
   Directus-generated UUID (primary key), read from a trusted
   `event_lookup`/`promo_load_event` Directus item-read op, never
   user-typed input, so injection risk (URL-scheme smuggling,
   `javascript:` URLs, etc.) is low **provided the new registration-flow
   code follows the same pattern** (event id from the flow's own
   `event_lookup`/`promo_load_event` op output, not from any field an
   end user can set). Flag for SecurityReviewer to confirm CodeDeveloper's
   actual implementation sources the URL's event-id segment from
   `event_lookup.id` (or `promo_load_event.id`) and not from, say, a
   `$trigger.payload` field an attacker-adjacent client could shape (the
   trigger payload for `registrations.items.create`/`.update` is
   itself server-validated Directus data, but the specific field chosen
   matters — confirm it's the id, not a title/free-text field, feeding
   the URL path segment).

3. **New Telegram request-body Liquid templating in flows-bootstrap.sh.**
   The existing ops already interpolate `{{ event_lookup.title }}` etc.
   directly into a JSON string body via Directus's Liquid-style
   templating (see `capacity_email_confirmed`'s existing `body` field) —
   this is a pre-existing pattern, not new risk introduced by this
   workflow, but the new Telegram-branch ops will do the same for HTML
   body content. Same escaping concern as (1) applies at this layer too
   if the HTML wrapping happens in the Liquid template string itself
   rather than being pre-rendered server-side — recommend CodeDeveloper
   keep HTML construction (escaping + tag-wrapping) inside
   `TelegramAdapter`'s sanitizer (single enforcement point per the
   requirement's own stated intent: "ANY caller... gets the safety
   guarantee"), not duplicated/reinvented in the flow's Liquid body
   string, which has no escaping primitives of its own.

### Architecture Rule Risks

None blocking. Specifically checked against `architecture.md`'s "Module
boundaries" and "Data ownership" sections:

- No cross-schema query introduced (still Directus-item-read → NestJS via
  HTTP, never raw SQL against another schema).
- No module reaches into another module's internals — `TelegramAdapter`
  changes stay within the `interactions` module's own adapter; if
  CodeDeveloper picks Finding-A option (b) instead of (a), the new
  NestJS-side helper must still go through `InteractionsService`'s own
  public surface, not bypass it — flag this constraint explicitly if (b)
  is chosen.
- `infrastructure/directus/flows-bootstrap.sh` editing is **unusual but
  not a rule violation** — it's flagged above as a surface CodeDeveloper
  doesn't normally touch, not as an architecture violation. No existing
  rule in `architecture.md` scopes CodeDeveloper's edits to `apps/api/`
  only; the workflow's own scope (per `01-requirement-validation.md`)
  explicitly includes it.
- No new stack dependency (no HTML parser library added — regex-only per
  explicit instruction), so no "stack deviation requires user approval"
  trigger either.

---

## Test Scope

### Unit (`apps/api/test/`)

- **Existing baseline confirmed:** `apps/api/test/interactions-telegram-adapter.spec.ts`
  already exercises policy gates (no telegram id / opted-out / no tenant),
  payload validation (empty text / over-length / bad `parse_mode`), and
  the happy path (envelope shape, `delivery_key`, fresh envelope ids per
  call, outbox-publish-failure surfacing) against a real Testcontainers
  Postgres (`inject('TEST_DATABASE_URL')` + `drizzle`/`postgres` client,
  not a mock DB) — this is an integration-flavored unit spec (real DB,
  faked/real `OutboxPublisher`). New tests for AC-1/AC-2 (inline_buttons
  passthrough + backward-compat) and AC-3/AC-4 (sanitizer allowlist strip
  + byte-identical pass-through for the existing reminder body) belong as
  new `describe` blocks in this same file, following its established
  `recipient()`/`db.select().from(outbox)` assertion style.
- **New sanitizer unit tests** (whether the sanitizer lands as a separate
  `telegram-html-sanitizer.ts` file or stays inline in
  `telegram-adapter.ts`): allowlist tag preservation (`<b> <i> <u> <s>
  <a> <code> <pre>`), disallowed-tag stripping (`<script>`, `<div>`,
  `<img>`, and per the Security Review flag above, at least one
  malformed/unclosed-tag case), and the AC-4 regression check
  (`event-reminders.service.ts`'s `telegramHtmlBody()` output for all
  three reminder kinds passed through byte-identical).
- **`apps/api/test/interactions-service.spec.ts`** — confirmed existing
  baseline is a pure-mock suite (no Directus, no Postgres) asserting
  `dispatch()`'s single-channel routing (`pickPrimaryChannel` picks
  `allowedChannels[0]`), consent gating, and de-dup. **If Finding-A
  option (a) is chosen, this file needs no change** (the split happens
  in Directus flow JSON, not in `InteractionsService`). **If option (b)
  is chosen instead, this file needs new tests** for the new
  email-plus-conditional-telegram helper — flag this dependency
  explicitly so TestDesigner knows which file is in scope based on
  CodeDeveloper's actual implementation choice.

### Integration (Testcontainers)

- The existing `interactions-telegram-adapter.spec.ts` pattern (real
  Postgres via Testcontainers, asserting actual `outbox` rows) is the
  right level for AC-1/AC-2/AC-3/AC-4 — no new integration surface needed
  beyond extending that file.
- AC-5/AC-6/AC-7/AC-8 (registration flows reaching Telegram) are
  **not achievable as a NestJS-only Testcontainers integration test**
  because the trigger is a Directus flow (config, runs inside the
  Directus container, not in the NestJS test process). These ACs need
  the flow-verification approach below instead.

### Directus Flow JSON Changes — Not Unit-Testable; Verification Approach

**No precedent exists in `.copilot/tasks/completed/` for a prior workflow
that unit-tested a `flows-bootstrap.sh` change** (searched; the two
issue-resolution workflows found that touched adjacent registration-flow
concerns — `wf-20260731-fix-169`, `wf-20260731-fix-165` — were doc-only /
NestJS-service-only respectively, neither modified flow JSON itself). The
closest real precedent is commit `da9e242` (`ISS-UAT-010-3`, "include
`/checkin?code=` link in registration-confirmed email"), which fixed two
`flows-bootstrap.sh` config bugs (wrong URL host, `undefined` auth token)
that were **only discoverable by actually running local UAT and observing
the email/DM fail to arrive** — i.e., the established verification method
for this file is **not** a unit test but a live local run.

Recommended approach for CodeDeveloper/TestDesigner, consistent with that
precedent and with `flows-bootstrap.sh`'s own idempotent `upsert` design
(re-running the script against a live Directus is a safe no-op for
unchanged ops and an update-in-place for changed ones — confirmed via the
script's own "Op N (terminal...)" bottom-up comment structure and
`docs/05-other/agent-prompts.md`'s explicit note: *"idempotent: run twice
locally against prod Directus = no-op the second time"*):

1. Re-run `infrastructure/directus/flows-bootstrap.sh` against the local
   Directus (docker compose stack) after editing — confirms the script
   itself is syntactically valid bash and the `upsert` calls succeed
   (non-zero exit / Directus API error surfaces immediately).
2. Manually (or via a scripted `curl`/Playwright-driven) trigger each of
   the 3 flows locally: create a registration under capacity (→
   `capacity_email_confirmed` path), over capacity (→
   `capacity_email_waitlisted` path), and a promotion from waitlist (→
   `promo_email_promoted` path), each with a seed user carrying a
   Telegram-eligible `telegram_user_id` + null `telegram_opted_out_at`
   directly on `directus_users` (no such fixture exists in
   `BP-UAT-010.json` today — see the Business Process Linkage gap named
   in `01-requirement-validation.md`; a minimal ad-hoc test user is
   sufficient here without extending the formal UAT fixture, since that
   extension was explicitly deferred as a follow-up).
3. Observe the outcome the way this workflow's own stated verification
   boundary allows: query `interaction_deliveries` (via Directus API or
   direct Postgres `directus` schema read) for a `channel='telegram'`
   row in `state='sent'` for that user/event, and inspect the
   corresponding `outbox` row's `payload.template.inline_buttons` content
   directly in Postgres (`platform` schema) — mirrors exactly the
   assertion style the existing
   `interactions-telegram-adapter.spec.ts` unit tests already use
   against the outbox table, just performed manually/via a smoke script
   post-flow-trigger instead of via Vitest.
4. Confirm the negative case (AC-8): a seed user with no
   `telegram_user_id` still gets exactly the existing email row and no
   `interaction_deliveries` row with `channel='telegram'`.

This is inherently a manual/local-UAT-style verification, not something
TestDesigner should attempt to force into a Vitest file — flagging this
explicitly per the ImpactAnalyzer role's Test Scope section so CodeDeveloper
and TestDesigner don't spend cycles trying to build Directus-flow unit
test infrastructure that doesn't exist anywhere else in this codebase.

### E2E (Playwright)

None required/available for this workflow's diff — `apps/e2e` targets
`apps/web`/`apps/web-next` UI surfaces; this workflow has no UI surface.
`BP-UAT-010`'s Playwright spec is deliberately not extended here per the
Business Process Linkage decision already made at Step 1 (business_process
left empty).

---

## Gate Result

gate_result:
  status: passed
  summary: "Impact fully analyzed. Primary surface is apps/api/src/modules/interactions/ (TelegramAdapter payload schema + sanitizer); a second, unusual non-NestJS surface is infrastructure/directus/flows-bootstrap.sh (3 request ops + their item-read lookups need field-list + branching changes to implement Finding A's per-channel split). No DB migration (outbox.payload is unstructured jsonb, confirmed by direct schema read). No API contract break (dispatchInputSchema.payload is already an open z.record bag). Security review flagged for the sanitizer's escape-before-strip ordering and inline-button URL sourcing. Test scope splits cleanly into unit/integration (existing interactions-telegram-adapter.spec.ts baseline extends naturally) versus flow-JSON verification (no unit-test precedent exists for flows-bootstrap.sh changes anywhere in .copilot/tasks/completed/; closest precedent, commit da9e242, was verified by live local UAT run, not a test file — recommend the same approach here)."
  findings:
    - "flows-bootstrap.sh is a second, non-NestJS/non-TypeScript affected surface (bash + Directus flow JSON) — flagged clearly since CodeDeveloper's usual working set is apps/api. No Directus schema/collection change needed; the 3 existing item-read lookup ops (capacity_user_lookup, capacity_user_lookup_wl, promo_user_lookup) currently select only [\"email\", \"first_name\"] and need telegram_user_id + telegram_opted_out_at added to their query.fields — confirmed by direct read, not assumed."
    - "Directus flow ops have single resolve/reject FK chaining (no native conditional execution) — implementing the per-recipient Telegram-eligibility gate (Finding A option a) requires either a second op chained unconditionally after the email op, or (recommended) an exec-type JS gate op mirroring the file's own existing decide_status pattern. This is a structural detail the requirement validation doc did not fully specify and CodeDeveloper needs before starting."
    - "No DB migration needed — confirmed by direct read of apps/api/src/modules/telegram/schema.ts: outbox.payload is jsonb('payload').notNull(), fully unstructured; inline_buttons is an application-layer Zod schema addition only."
    - "No breaking API surface change — dispatchInputSchema.payload is already z.record(z.string(), z.unknown()), an open bag; /v1/internal/interactions/dispatch's own contract does not change shape."
    - "Security review must examine escape-before-strip ordering in the new sanitizer (user-controlled event titles/names must be HTML-escaped before allowlisted-tag wrapping, matching event-reminders.service.ts's existing escapeHtml() pattern) and confirm inline-button event URLs are sourced from trusted Directus item-read output (event_lookup.id / promo_load_event.id), not any user-settable field."
    - "No unit-test precedent exists anywhere in .copilot/tasks/completed/ for verifying a flows-bootstrap.sh change; the closest real precedent (commit da9e242, ISS-UAT-010-3) was verified via a live local UAT run against the Directus container, not a test file — recommend TestDesigner adopt the same manual/local-run verification approach for AC-5 through AC-8 rather than inventing Directus-flow unit-test infrastructure that doesn't exist elsewhere in this codebase."
