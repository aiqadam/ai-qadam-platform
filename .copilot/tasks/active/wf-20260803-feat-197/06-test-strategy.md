# Test Strategy — FEAT-NTF-004 (Telegram notification adapter gap-fill)

Workflow: `wf-20260803-feat-197`

## Requirement

**FEAT-NTF-004** (reuses `FR-NTF-004`'s code — correction + gap-fill of an
already-shipped `TelegramAdapter`, ADR-0034). Per
`01-requirement-validation.md` / `02-impact-analysis.md` / `03-code-summary.md`:

1. `inline_buttons` passthrough from `TelegramAdapter.send()`'s payload into
   the `tg.dispatch.v1` envelope's `payload.template.inline_buttons` (was
   hardcoded `null`) — plus, added in retry 1, `.max()` bounds on button
   `text`/`url` and both array dimensions (security MAJOR-1 fix).
2. A Telegram-safe-HTML allowlist sanitizer (`telegram-html-sanitizer.ts`,
   new file, `ALLOWED_TAGS = ['b','i','u','s','a','code','pre']`), applied to
   `text` inside `TelegramAdapter.send()` before the envelope is built.
3. Telegram-channel dispatch added to the 3 registration Directus flows
   (`capacity_email_confirmed`, `capacity_email_waitlisted`,
   `promo_email_promoted`) in `infrastructure/directus/flows-bootstrap.sh`,
   alongside (never replacing) existing email dispatch, via Finding A option
   (a) — a Directus-flow-side per-channel dispatch split using new
   exec-type gate ops.
4. `events.controller.ts`'s `patchEventSchema.title` gained a
   `.regex(/^[^"\\]*$/)` guard (security MAJOR-2 fix, retry 1) — unrelated
   to Telegram mechanically, but in-diff because it protects the same
   Directus-Liquid-JSON-body construction the new Telegram flow ops rely on.
5. FR-NTF-004.md's doc correction (AC-10) — **Step 9/DocWriter's job, out of
   scope for this test strategy** (noted per task instructions, not mapped
   to any test below).

Verification boundary (carried forward from requirement validation, binding
on this strategy too): `TelegramAdapter.send()` returns `'sent'` once the
envelope is durably written to the Postgres outbox. Nothing in this
workflow's diff — and therefore nothing in this test strategy — can observe
or assert "a Telegram DM arrived on a phone." AC-5 through AC-8 are written
and tested against outbox/`interaction_deliveries` state only.

---

## Rubric Score

Scored against each row of the Test Tier Decision Rubric honestly, per
component, because this change is not homogeneous — it spans a pure
function, a schema/payload extension, and a non-NestJS config surface with
no unit-test harness.

| Criterion | Points | Applies? | Reasoning |
|---|---|---|---|
| Touches tenant-scoped data | +2 | **Partial (+1, rounded down to N/A for scoring)** | `TelegramAdapter.send()` reads `recipient.tenant` (already-resolved, passed in) and writes it into the envelope's `meta.tenant`/`target.tenant` — it does not *query* tenant-scoped data itself (`resolveRecipients()`, the actual tenant-scoped query, is unchanged, confirmed by security review INV-1/INV-5). Scoring this +2 would overstate the change; scoring 0 would understate that tenant data does flow through the adapter. Not counted toward the numeric total below — flagged qualitatively instead, consistent with the security review's own INV-1 "parity, not regression" framing. |
| New API endpoint | +2 | **No** | Confirmed by impact analysis: `/v1/internal/interactions/dispatch`'s own contract (`dispatchInputSchema`) is unchanged; `payload` was already an open `z.record` bag. No new route, no new controller method. |
| Business rule with edge cases | +2 | **Yes** | Telegram eligibility gating (`telegram_user_id` set + `telegram_opted_out_at` null) has real, enumerable edge cases: opted-out, never-linked, malformed/zero chat_id — exactly the class of rule this rubric row targets (comparable to capacity/waitlist logic). `checkPolicy()` in `telegram-adapter.ts` (already has 3 existing unit tests) plus the new per-recipient Telegram-eligibility gate added to the 3 Directus flows (AC-5–AC-8) both fall in this row. |
| Cross-module service call | +1 | **Yes** | The 3 Directus flow ops → `POST /v1/internal/interactions/dispatch` call is explicitly flagged by the impact analysis as "a genuine cross-module call across a config/code boundary" — config (Directus flow JSON) calling into NestJS over HTTP. Counts once. |
| New database query | +1 | **No** | Confirmed no new query pattern: the 3 lookup ops add 2 field names to an *existing* item-read against `directus_users` (same collection, same mechanism) — not a new query. `outbox.payload` write is the existing `OutboxPublisher.publish()` call, unchanged. |
| Pure function / utility | 0 | **Yes** | `sanitizeTelegramHtml()` (`telegram-html-sanitizer.ts`) is a textbook pure function — no I/O, no DB, no injected dependencies, deterministic output for a given input. Scores 0 on this rubric by definition, but "scores 0" is not the same as "needs no tests" — Process step 2 requires unit tests for every public function regardless of rubric score, and a pure function with zero dependencies is in fact the *cheapest, highest-value* unit test target in this entire diff. Its 0-point rubric score reflects that it does not by itself push the change toward Integration/E2E tiers — not that it's exempt from thorough coverage. |

**Numeric total: 2 (business rule) + 1 (cross-module call) = 3.**

**Score < 4 → Unit tests are the rubric-mandated floor.**

However, the rubric's numeric gate is not the whole story here, and I am not
applying it mechanically:

- **The existing baseline file (`interactions-telegram-adapter.spec.ts`)
  already runs against a real Testcontainers Postgres**, not a mock DB
  (confirmed: `inject('TEST_DATABASE_URL')`, real `drizzle`/`postgres`
  client, real `OutboxPublisher`, real `db.select().from(outbox)`
  assertions). This is already an integration-flavored suite by
  construction, regardless of what the rubric's numeric score would imply
  in isolation — a rubric score of 3 does not mean "downgrade this file to
  mocks"; it means "no *new* Testcontainers surface is required beyond
  extending what's already there." Required Test Levels below reflects
  this: Integration is already in play for AC-1–AC-4, not because the
  score crossed 4, but because that's the existing, correct level for this
  file and new tests belong in it, following its established pattern.
- **AC-5 through AC-8 cannot be scored onto the Unit/Integration/E2E ladder
  at all** — the rubric assumes a NestJS/TypeScript-testable surface,
  and `flows-bootstrap.sh`/Directus flow JSON is neither. No numeric score
  changes that fact. This is called out explicitly in its own section below
  rather than forced into a tier the rubric wasn't built to describe.
- **E2E is not triggered** (would need ≥6) and is not applicable regardless
  — per impact analysis, `apps/e2e` targets `apps/web`/`apps/web-next` UI
  surfaces; this workflow has no UI surface at all.

---

## Required Test Levels

- [x] **Unit** — required (rubric floor; also the correct level for the
      pure sanitizer function and the schema-bound validation logic)
- [x] **Integration (Testcontainers)** — required, but as an *extension* of
      the already-integration-flavored existing file
      (`interactions-telegram-adapter.spec.ts`), not a new harness. AC-1
      through AC-4 land here.
- [ ] **E2E (Playwright)** — not applicable. No UI surface; rubric score
      (3) is also well under the E2E threshold (≥6).
- **Non-standard fourth tier, named explicitly because the rubric has no
  row for it:** **Live-local-run verification** — required for AC-5
  through AC-8 (and partially AC-9). Executed by Orchestrator/TestRunner at
  Step 8 against a live local Directus + Postgres stack, **not** a Vitest
  suite. See dedicated section below. This is not an "Integration" tier
  test in the Testcontainers sense — it exercises Directus flow JSON, which
  runs inside the Directus container, not inside the NestJS test process,
  and there is no harness anywhere in this codebase that spins up Directus
  flows programmatically for assertions.

---

## Unit Test Plan

All new tests below are **additions** to existing files unless marked
"NEW FILE." None duplicate an existing test — verified by reading
`interactions-telegram-adapter.spec.ts` in full first (see Coverage
Baseline note per section).

### Coverage baseline already present (do NOT duplicate)

`interactions-telegram-adapter.spec.ts` already covers, exactly as written
today — TestDesigner must not re-write these, only add net-new `describe`
blocks alongside them:
- Policy gates: no `telegram_user_id`, opted-out, no tenant (3 tests).
- Payload validation: empty `text`, `text` over 4096 chars, bad
  `parse_mode` (3 tests).
- Happy path: envelope shape/fields, fresh `envelope_id` per call, outbox
  publish failure surfacing (3 tests).
- **Zero existing references to `inline_buttons`** anywhere in this file
  (confirmed by direct read — grep-confirmed in code summary too) — so
  every `inline_buttons`-related test below is wholly new, no risk of
  collision/duplication.

### `telegram-html-sanitizer.ts` (NEW FILE — no test file exists yet)

TestDesigner should create `apps/api/test/telegram-html-sanitizer.spec.ts`
per standards.md §"One file per source file, same name + `.test.ts`" (this
codebase's convention uses `.spec.ts`, matching every existing file in
`apps/api/test/`). This is a pure function with zero dependencies — no
Testcontainers, no mocks, no DI — the cheapest and most thorough unit
coverage in this entire diff, and it must be thorough precisely because it
is a security-relevant defense-in-depth backstop (per security review's
finding 1/2 discussion).

| Target | Happy Path | Failure / Edge Paths |
|---|---|---|
| `sanitizeTelegramHtml()` — allowlisted tags preserved individually | Each of the 7 allowlisted tags tested in its own case: `<b>x</b>` → unchanged, `<i>x</i>` → unchanged, `<u>x</u>` → unchanged, `<s>x</s>` → unchanged, `<a href="...">x</a>` → unchanged (including the `href` attribute preserved verbatim), `<code>x</code>` → unchanged, `<pre>x</pre>` → unchanged | N/A (happy path only for this row) |
| `sanitizeTelegramHtml()` — nested allowlisted tag combinations | At minimum: `<b><i>x</i></b>` (2-deep proper nesting) preserved unchanged; `<b><i><u>x</u></i></b>` (3-deep) preserved unchanged; `<a href="...">​<b>x</b></a>` (link wrapping bold) preserved unchanged; sibling (non-nested) allowlisted tags in sequence, e.g. `<b>x</b> and <i>y</i>`, both preserved | N/A (happy path only for this row) |
| `sanitizeTelegramHtml()` — disallowed tags stripped, content preserved | `<script>alert(1)</script>` → tag removed, and per the docstring's stated behavior confirm whether inner content (`alert(1)`) is preserved as plain text (matches "preserving the text content that was between them") or dropped — write the assertion against the actual documented/implemented behavior, do not assume; same for `<div>x</div>` → `x` (content kept, tag stripped), `<img src="x">` (self-closing, no closing pair — confirm it's stripped cleanly with no dangling artifact) | Case-insensitive variants: `<SCRIPT>x</SCRIPT>`, `<ScRiPt>x</script>`, `<DIV>x</DIV>` — all must strip identically to their lowercase form (the sanitizer's `TAG_PATTERN` is documented as case-insensitive on tag-name capture; `isAllowedTag()` lowercases before the allowlist check) |
| `sanitizeTelegramHtml()` — self-closing tags | `<br/>`, `<img src="x"/>` (disallowed, self-closing) → stripped cleanly, no leftover `/`; confirm a *self-closing allowlisted-name* tag if constructible (e.g. hypothetical `<b/>`) does not require pairing (per `isSelfClosing` skip-pairing logic in `findTagsToStrip`) | — |
| `sanitizeTelegramHtml()` — cross-nested malformed pairs (the exact docstring example) | — | **Exact case from the module docstring**: `<b>bold <i>text</b></i>` — assert against the documented behavior precisely: closing `</b>` while `<i>` is the innermost open tag triggers the "cross-nested" branch in `findTagsToStrip` (mismatch found deeper in stack → strip everything from the opener's depth to top, including both `<b>` and `<i>` and their closes) — assert the final output strips BOTH tag pairs (not just one), leaving only `bold text` as plain text. This is the single most important test in the file: it's the named example in the source docstring and exercises the one branch (`openerDepth !== -1` cross-nest path) most likely to be wrong if TestDesigner doesn't trace the stack logic carefully. |
| `sanitizeTelegramHtml()` — stray/unmatched closing tag | `<b>x</b></b>` (extra stray `</b>` with no matching opener anywhere on the stack) → the stray closer hits the `openerDepth === -1` branch (strip the stray tag only; the earlier well-formed `<b>x</b>` pair is unaffected since it already closed before the stray tag is encountered) | — |
| `sanitizeTelegramHtml()` — unclosed tag at end of string | `<b>bold text` (opening tag with no closing tag anywhere before the string ends) → hits the "anything left open at the end of the string" branch in `findTagsToStrip` — assert the `<b>` opening tag is stripped, leaving `bold text` as plain text, not left dangling as literal `<b>bold text` | Also test an allowlisted tag left open when a *later, different* allowlisted tag closes properly, e.g. `<b>bold <i>italic</i>` (only `<b>` unclosed) — assert only `<b>` is stripped, `<i>italic</i>` survives intact |
| `sanitizeTelegramHtml()` — degenerate inputs | Empty string `''` → returns `''` unchanged; string with no tags at all (`'plain text, no markup here.'`) → returned byte-identical, confirms the function is a true no-op when there's nothing to strip | — |
| `sanitizeTelegramHtml()` — AC-4 regression: byte-identical passthrough of the real reminder body | **Critical: do not hand-type an approximation.** `telegramHtmlBody()` in `event-reminders.service.ts` is a **module-private, non-exported function** (confirmed by direct read — only `routeRecipients`, `isOptedInToReminders`, and `buildReminderPayload` are exported; `telegramHtmlBody` itself has no `export` keyword). TestDesigner therefore **cannot** `import { telegramHtmlBody }` directly. Two compliant options, in order of preference: **(a)** call the exported `buildReminderPayload(event, kind, 'telegram')` for each of the 3 `ReminderKind` values (`reminder_day_before`, `reminder_hour_before`, `reminder_morning_of`) with a representative `EventRow` fixture, extract `.text` from its return value (this *is* `telegramHtmlBody()`'s real output — `buildReminderPayload` calls it directly and returns it verbatim as the `text` field, confirmed at line 346 of `event-reminders.service.ts`), and assert `sanitizeTelegramHtml(payload.text) === payload.text` for all 3 kinds; **(b)** if TestDesigner judges the `EventRow`/date-formatting setup too heavy for this file, import `buildReminderPayload` directly from `event-reminders.service.ts` (already exported, no new export needed) into the sanitizer's own spec file — this is still "importing the real function's output," not a hand-typed approximation, and satisfies the task's explicit instruction either way. **Do not** re-derive the HTML string by reading the template literals in `telegramHtmlBody`'s source and typing out what you believe the output looks like — that duplicates the source instead of testing it, and silently drifts if the template ever changes. | — |

**Sanitizer coverage note on `escapeHtml()`:** `event-reminders.service.ts`'s
own `escapeHtml()` (also non-exported) runs *before* `telegramHtmlBody()`
assembles the string, so by the time `sanitizeTelegramHtml()` receives the
AC-4 fixture, any `&`/`<`/`>` in the title/venue/time strings is already
entity-escaped (`&amp;`/`&lt;`/`&gt;`) — meaning a title containing a
literal `<` arrives at the sanitizer as `&lt;`, not as a real tag, and so
cannot trigger a false-positive strip. TestDesigner does not need a separate
test proving this interaction — it falls out naturally from testing (a)/(b)
above with a title fixture that includes an ampersand or angle bracket
(recommend using a title like `AI & Data: <intro>` in the `EventRow` fixture
for this specific test, to make the escaping-then-passthrough interaction
visible in the assertion rather than accidentally untested by an
all-alphanumeric fixture).

### `interactions-telegram-adapter.spec.ts` — `inline_buttons` passthrough (AC-1/AC-2)

New `describe('TelegramAdapter — inline_buttons', ...)` block, following the
file's existing `recipient()`/`db.select().from(outbox)` assertion style.

| Target | Happy Path | Failure Paths |
|---|---|---|
| `TelegramAdapter.send()` with a valid `inline_buttons` array | Payload `{ text: 'hi', inline_buttons: [[{ text: 'Open event page', url: 'https://aiqadam.org/events/abc' }]] }` → `res.state === 'sent'`; query the outbox row and assert `payload.payload.template.inline_buttons` **equals** the input array exactly (not just truthy) — mirrors the file's existing `inner.template.text`/`inner.template.parse_mode` assertion pattern | — |
| `TelegramAdapter.send()` with `inline_buttons` omitted | Payload `{ text: 'hi' }` (no `inline_buttons` key at all) → `res.state === 'sent'`; assert `payload.payload.template.inline_buttons === null` (the existing hardcoded-default behavior, now reached via `parsed.data.inline_buttons ?? null` instead of a literal — AC-2's backward-compat guarantee) | — |

### `interactions-telegram-adapter.spec.ts` — `inline_buttons` size/format bounds (MAJOR-1 fix)

Same new `describe` block (or a sibling one, TestDesigner's call on
grouping) — these assert `res.state === 'failed'` with a payload-invalid
`failureReason`, matching the existing style of the file's "payload
validation" describe block (`/payload invalid/i` on `failureReason`).

| Target | Happy Path | Failure Paths |
|---|---|---|
| Row-count bound (`.max(10)` outer array) | (Happy path already covered above — 1 row passes) | 11 rows (each a single valid button) → `state: 'failed'`, `failureReason` matches `/payload invalid/i` |
| Buttons-per-row bound (`.max(10)` inner array) | — | A single row containing 11 buttons → `state: 'failed'`, same match |
| Button `text` length bound (`.max(64)`) | A 64-char label passes (boundary-exact case, recommended in addition to the failure case, to prove the bound is inclusive not off-by-one) | A 65-char label → `state: 'failed'` |
| Button `url` length bound (`.max(2048)`) | — | A well-formed but 2049+-char URL → `state: 'failed'` |
| Button `url` format validation (`.url()`) | — | A malformed, non-URL string (e.g. `'not-a-url'` or `'javascript:alert(1)'` — the latter worth including specifically since it's the classic scheme-smuggling probe even though Zod's `.url()` check is what's actually being tested here, not a sanitizer concern) → `state: 'failed'` |

---

## Integration Test Plan

The existing `interactions-telegram-adapter.spec.ts` pattern (real Postgres
via Testcontainers, asserting actual `outbox` table rows) **is** the
integration level for this workflow — all rows below are additions to that
one file, not a new integration surface.

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| `inline_buttons` passthrough end-to-end into a durably-written outbox row | Testcontainers Postgres (existing `TEST_DATABASE_URL` fixture, existing `OutboxPublisher`) | Outbox row exists (`db.select().from(outbox)`), `payload.payload.template.inline_buttons` deep-equals the caller's input array, `res.state === 'sent'` — this is the AC-1 integration-level proof that the fix reaches all the way to durable storage, not just that the Zod schema parses correctly in isolation |
| `inline_buttons` omitted stays `null` end-to-end | Same | Outbox row's `inline_buttons` field is `null`, not `undefined` and not absent from the JSON — confirms the `?? null` coalescing survives JSON serialization into `jsonb` |
| Sanitized `text` is what actually lands in the outbox (not just what the pure function returns in isolation) | Same | Send a payload containing a disallowed tag (e.g. `<div>hi</div>`) through the full `adapter.send()` path; assert the outbox row's `payload.payload.template.text` is the *sanitized* string, not the raw input — this is the integration-level complement to the sanitizer's own unit tests, proving the sanitizer call is actually wired into the adapter's real code path (not just unit-tested in isolation while a wiring bug goes unnoticed) |
| Oversized `inline_buttons` never reaches the outbox | Same | Send an 11-row `inline_buttons` payload; assert `res.state === 'failed'` **and** `db.select().from(outbox)` returns 0 new rows (confirms the rejection happens before any write, not a partial/rolled-back write — matches the file's existing pattern of asserting row-count on failure paths, e.g. the "no tenant" policy-gate test) |

---

## Directus Flow JSON Changes (AC-5–AC-8) — Not Unit-Testable; Live-Local-Run Verification Required

**This is not a gap TestDesigner should paper over with an invented Vitest
suite.** Per the impact analysis (independently confirmed by re-checking
`.copilot/tasks/completed/` myself — no prior workflow anywhere in this
repo's history has unit-tested a `flows-bootstrap.sh` change; the closest
precedent, commit `da9e242`/`ISS-UAT-010-3`, fixed two flow-config bugs that
were *only* discoverable by running local UAT and observing the actual
email/DM fail to arrive) — there is no Directus-flow-execution harness
anywhere in this codebase, and building one is out of scope for this
workflow. A Vitest file that "tests" flow JSON by, say, parsing the bash
script's heredocs and asserting on the JSON shape would **not** exercise
Directus's actual flow engine (its `resolve`/`reject` chaining, its Liquid
template rendering, its `exec`-op sandboxed JS execution) and would create
false confidence — it tests that the bash script produces syntactically
valid JSON, which `code-summary.md` already did by hand (31 heredoc blocks
JSON-validated, 3-stage escaping trace) at Step 4, not that the flow
*behaves* correctly when Directus actually runs it.

**Verification level: Live-local-run, executed by Orchestrator/TestRunner
at Step 8** against a live local Directus + Postgres stack (per AGENTS.md
§6.1's obligation to bring up missing infrastructure rather than defer, and
per this task's explicit instruction not to invent a fake harness).

Concrete steps TestRunner/Orchestrator should follow:

1. Bring up the local stack (`docker compose up -d` for Directus + Postgres
   + any dependent services) if not already running; `curl -fsS` each
   required service as a pre-flight check per AGENTS.md §6.1.
2. Re-run `infrastructure/directus/flows-bootstrap.sh` against the local
   Directus instance. Confirms: (a) the script is syntactically valid bash
   (`bash -n` already checked at Step 4, but this is the live-execution
   confirmation), (b) every `upsert` call succeeds against the real
   Directus REST API (a JSON/schema mismatch would surface here as a
   non-2xx response), (c) the idempotent design holds — re-running should
   be a safe no-op for the 28 pre-existing ops and an update-in-place for
   the newly added/modified ones.
3. Seed (or reuse/extend an ad-hoc local test user, per the impact
   analysis's explicit note that extending the formal `BP-UAT-010.json`
   fixture is deferred, not required here) one `directus_users` row with a
   non-null `telegram_user_id` and null `telegram_opted_out_at` — a
   Telegram-eligible test member.
4. Trigger each of the 3 flows against that member:
   - Create a registration under capacity → exercises
     `capacity_email_confirmed` + the new `capacity_telegram_gate` /
     `capacity_telegram_confirmed` ops (**AC-5**).
   - Create a registration over capacity → exercises
     `capacity_email_waitlisted` + `capacity_telegram_gate_wl` /
     `capacity_telegram_waitlisted` (**AC-6**).
   - Promote that member from waitlist → exercises `promo_email_promoted`
     + `promo_telegram_gate` / `promo_telegram_promoted` (**AC-7**).
5. For each trigger, query directly (via Directus API or a direct Postgres
   read against the relevant schema):
   - An `interaction_deliveries` row with `channel='telegram'` and
     `state='sent'` exists for that user/event (AC-5/AC-6/AC-7's core
     assertion).
   - The corresponding `outbox` row's
     `payload.payload.template.inline_buttons` contains the expected
     single "Open event page" button (AC-5 and AC-7 only — **AC-6
     explicitly has no button**, per the code summary's confirmed decision
     to mirror the buttonless `registration-waitlisted` email template; the
     live-run check for AC-6 must assert `inline_buttons` is absent/empty,
     not assert a button that was deliberately not built).
   - The existing email delivery row is unaffected — same content/shape as
     before this workflow (AC-9's live-verification component).
6. Repeat step 3–5's trigger set with a **second** seed user who has
   `telegram_user_id = null` (never linked): confirm the email delivery row
   still appears exactly as before, and confirm **no**
   `interaction_deliveries` row with `channel='telegram'` is created for
   that user for that event (**AC-8** — the negative case; the Telegram
   branch must be *skipped*, not *attempted-and-failed*, so also confirm no
   `outbox` row with `state` indicating a failed Telegram send exists for
   this user — a genuinely skipped gate produces zero rows, not an error
   row).
7. (Recommended, not an AC on its own, but directly relevant given security
   review MAJOR-2's residual note) While the stack is up for this
   verification anyway, TestRunner/Orchestrator should also try registering
   with an event titled with an embedded `"` character via the now-guarded
   `PATCH /v1/workspace/events/:id` endpoint — confirm the request is
   rejected with the new regex's error message (this is a cheap unit-test
   candidate too, see Note below, but also directly informs whether the
   security review's flagged live-verification recommendation for the
   *pre-existing* Directus-direct-creation path is still an open risk).

**This entire section maps to AC-5, AC-6, AC-7, AC-8, and the live-run
component of AC-9** — none of these five ACs get a Vitest test; all five
get exactly this live-local-run procedure instead.

---

## `events.controller.ts` Title Regex Guard (MAJOR-2 fix) — Coverage Gap Flagged, Not Silently Patched

**Checked directly, per this task's instruction to check before assuming:**
no test file anywhere in `apps/api/test/` instantiates `EventsController` or
exercises `patchEventSchema`. Confirmed by:
- `events-service.spec.ts` (the only `*events*` spec that looks adjacent)
  calls `EventsService.patch()` **directly at the service layer** — it
  never imports `EventsController` or `patchEventSchema`, and therefore
  cannot exercise Zod-boundary validation (including the new title regex)
  regardless of what fixture titles it uses.
- `checkin-events.controller.spec.ts` is a false-positive name match — it
  tests `CheckinEventsController` (a different controller, in
  `apps/registrations/`), confirmed by direct read of its imports.
- No `events.controller.spec.ts` (or any-cased equivalent) exists.

**This is a genuine, real gap: the new title regex has zero test coverage
today, and there is no existing controller-test file for TestDesigner to
extend — one must be created.**

TestDesigner should create `apps/api/test/events-controller.spec.ts`
(NEW FILE), instantiating `EventsController` directly with a mocked
`EventsService`/`EventSpeakersService` (same pattern `events-service.spec.ts`
uses for mocking `DirectusClient` — a lightweight hand-rolled fake, no
Testcontainers needed since this schema-validation logic has no DB
dependency of its own). Minimum required cases:

| Target | Happy Path | Failure Paths |
|---|---|---|
| `EventsController.patch()` — `patchEventSchema.title` regex guard | A title with no `"`/`\` (e.g. `'AI Qadam Meetup'`) → `EventsService.patch()` is called, 200-equivalent response returned | A title containing a literal `"` (e.g. `'Meetup: "AI in Practice"'`) → `BadRequestException` thrown before `EventsService.patch()` is ever called (assert the mocked service's `patch` was NOT invoked, matching the file's existing `patchEventSchema.safeParse` → `throw new BadRequestException(parsed.error.flatten())` short-circuit); same for a title containing a literal `\` (e.g. `'Back\\slash'`) |
| `patchEventSchema.title` — boundary/compat checks | `title` omitted entirely from the PATCH body → schema's `.optional()` allows it through unchanged (confirms the regex guard didn't accidentally make `title` required) | A 200-char title (the existing `.max(200)` boundary) with no `"`/`\` still passes — confirms the new `.regex()` doesn't interact badly with the pre-existing `.max(200)` in the Zod chain ordering |

This is scoped narrowly to the regex guard itself (the one thing this
workflow's diff actually changed in this controller) — TestDesigner should
not use this as license to backfill full `EventsController` coverage for
routes this workflow didn't touch (`list`, `detail`,
`regenerate-social-card`, `upsertFollowup`); that's a separate, pre-existing
gap outside this workflow's scope.

---

## E2E Test Plan

None. No Playwright flow applies.

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| — | — | Not applicable — no UI surface in this workflow's diff (confirmed by impact analysis: no `apps/web`/`apps/web-next` file touched); rubric score (3) is also well under the E2E threshold (≥6). `BP-UAT-010`'s Playwright spec is deliberately not extended, per the Business Process Linkage decision already made and documented at Step 1 (`business_process: []`). |

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (inline_buttons passthrough) | Unit + Integration | New `describe` block in `interactions-telegram-adapter.spec.ts`: valid `inline_buttons` array passed in → envelope's `template.inline_buttons` equals input, outbox row durably written, `state: 'sent'`. |
| AC-2 (inline_buttons omitted stays backward-compatible) | Unit + Integration | Same file: payload with no `inline_buttons` key → envelope's `template.inline_buttons === null`, `state: 'sent'`, no regression to existing callers. |
| AC-3 (sanitizer strips unsupported tags) | Unit | `telegram-html-sanitizer.spec.ts` (new file): disallowed-tag stripping cases (script/div/img, case variants), cross-nested malformed pairs, stray/unclosed tags — full enumeration in Unit Test Plan above. Also indirectly covered at integration level by the "sanitized text lands in outbox" Integration Test Plan row, proving the sanitizer is actually wired in, not just correct in isolation. |
| AC-4 (sanitizer preserves allowlisted tags + existing reminder body byte-identical) | Unit | Same new file: each allowlisted tag preserved individually + in combination; AC-4's own regression case via `buildReminderPayload(event, kind, 'telegram').text` for all 3 `ReminderKind` values passed through `sanitizeTelegramHtml()` and asserted byte-identical — **must** use the real exported function's output, not a hand-typed approximation (see Unit Test Plan note on `telegramHtmlBody` being non-exported). |
| AC-5 (registration-confirmed reaches Telegram) | **Live-local-run** (no Vitest) | Step 1–5 of the Directus Flow JSON verification procedure above: seed Telegram-eligible user, trigger under-capacity registration, query `interaction_deliveries`/`outbox` directly for the `channel='telegram'` row + "Open event page" button. |
| AC-6 (registration-waitlisted reaches Telegram) | **Live-local-run** (no Vitest) | Same procedure, over-capacity trigger; note AC-6 has **no button** by design (email-template parity) — the live-run assertion must confirm absence of `inline_buttons`, not presence. |
| AC-7 (registration-promoted-from-waitlist reaches Telegram) | **Live-local-run** (no Vitest) | Same procedure, promotion trigger; button present, mirrors AC-5. |
| AC-8 (Telegram-ineligible recipients still get email; no failure) | **Live-local-run** (no Vitest) | Step 6 of the procedure: seed a non-Telegram-linked user, trigger all 3 flows, confirm email delivery unaffected and zero `channel='telegram'` rows (skipped, not attempted-and-failed) for that user. |
| AC-9 (email channel unaffected / no regression) | Static diff inspection (partial) + **Live-local-run** (for the full claim) | Static: confirmed by direct read (this strategy + all prior gate artifacts) that the 3 existing email ops' own request bodies are untouched beyond `query.fields`/`resolve`-chaining edits — no email `body`/`template` content changed. This is necessary but not sufficient: the full "email delivery unchanged" claim also depends on the live-local-run's steps 4–6 observing the actual email row alongside each Telegram trigger, exactly as AC-5/6/7/8 already require — no separate live-run pass needed, AC-9's live component rides along with those same triggers. |
| AC-10 (FR-NTF-004.md doc correction) | **Out of scope for this test strategy** | Step 9/DocWriter's responsibility — a documentation-content check, not a test target. Not mapped to any test level here per explicit task instruction. |
| (MAJOR-1 fix) inline_buttons size/format bounds | Unit + Integration | `interactions-telegram-adapter.spec.ts`: oversized row count (11), oversized buttons-per-row (11), over-length `text` (65 chars, plus a 64-char boundary-exact happy-path case), over-length `url` (2049+ chars), malformed `url` (not a valid URL) — all assert `state: 'failed'` + zero new outbox rows. |
| (MAJOR-2 fix) `patchEventSchema.title` regex guard | Unit (new file required) | New `events-controller.spec.ts`: title containing `"` or `\` → `BadRequestException`, service never called; title without either character → passes through; `title` omitted → still optional; 200-char boundary still passes. Flagged as a genuine pre-existing gap (no controller test file existed) that TestDesigner must fill, not route around. |

---

## Known Non-Test Items (Explicitly Not This Strategy's Job)

- **AC-10 / FR-NTF-004.md correction** — DocWriter, Step 9. Not a test.
- **The Python notifier's actual `sendMessage`/inline-keyboard rendering**
  — out of this workflow's diff entirely (per handoff + code summary Known
  Limitations); no test in this strategy claims to verify it. The
  live-local-run procedure's assertions stop at the outbox/
  `interaction_deliveries` boundary, exactly matching the workflow's own
  stated verification limit.
- **The self-disclosed sanitizer residual gap** (a well-formed `<a
  href="evil">` inside an event title survives `sanitizeTelegramHtml()`
  unchanged) — security review judged this an accepted Phase-1 residual
  risk, not a defect to test against. No test in this strategy asserts the
  sanitizer rejects or escapes such a title; doing so would contradict the
  security review's own accepted-risk disposition. Recommended for a
  documentation note at Step 9, not a test.
- **`BP-UAT-010` Playwright extension** for a Telegram-linked fixture —
  explicitly deferred as a named follow-up per the requirement validation's
  Business Process Linkage decision; not built here, not part of this
  strategy.
- **Full `EventsController` coverage** beyond the title regex guard (i.e.,
  `list`/`detail`/`regenerate-social-card`/`upsertFollowup`) — pre-existing
  gap, out of this workflow's scope; only the regex guard this workflow
  actually added gets a test.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Full test strategy produced for FEAT-NTF-004. Rubric scored honestly per-criterion: business-rule edge cases (+2, Telegram eligibility gating) + cross-module call (+1, Directus flow -> internal API) = 3, under the Integration/E2E numeric thresholds — but Integration tier is still required because the existing interactions-telegram-adapter.spec.ts baseline already runs against real Testcontainers Postgres by construction, and new AC-1..AC-4 tests extend that file rather than triggering a new tier. Pure-function sanitizer scores 0 on the rubric by definition but gets the most thorough unit coverage in the diff (new telegram-html-sanitizer.spec.ts) because a 0 rubric score means 'does not push toward Integration/E2E', not 'skip testing' — Process step 2 mandates unit coverage for every public function regardless of score. AC-5 through AC-8 (Directus flow changes) are explicitly mapped to a named non-standard 'live-local-run verification' tier, executed by Orchestrator/TestRunner at Step 8 against a live local Directus+Postgres stack -- not invented as a fake Vitest suite, per the impact analysis's confirmed finding that no flows-bootstrap.sh change has ever been unit-tested anywhere in this codebase's history. A genuine, previously-unflagged-as-a-test-gap issue was found and addressed: no test file anywhere exercises EventsController/patchEventSchema (events-service.spec.ts bypasses the controller entirely, calling EventsService.patch() directly; checkin-events.controller.spec.ts is an unrelated controller) -- a new events-controller.spec.ts is specified to cover the MAJOR-2 title-regex fix, since retrofitting a coverage gap discovered while implementing a real new validation rule is the correct call, not silently accepting zero coverage for shipped-and-security-reviewed logic. All 10 formal ACs plus both retry-1 security fixes are mapped to at least one test or verification method; AC-10 is explicitly and correctly excluded as DocWriter's Step 9 responsibility, not silently dropped."
  findings:
    - "Rubric scored per-criterion, not just a single number: +2 business-rule-edge-cases (Telegram eligibility: opted-out / never-linked / malformed chat_id), +1 cross-module-call (Directus flow op -> POST /v1/internal/interactions/dispatch), 0 for the new pure-function sanitizer (correctly scored 0 per the rubric's own row, but flagged explicitly that 0-score does not mean skip-testing), tenant-scoped-data row scored qualitatively as parity-not-new-query rather than a blind +2, since TelegramAdapter reads an already-resolved recipient.tenant rather than querying tenant-scoped data itself. Total = 3, under the Integration(>=4)/E2E(>=6) numeric thresholds."
    - "Integration tier required despite the sub-4 score, because interactions-telegram-adapter.spec.ts is already a real-Testcontainers-Postgres suite by construction (not a mock DB) -- new AC-1/AC-2/MAJOR-1-bounds tests are additions to that existing tier, not a new one triggered by crossing a numeric threshold."
    - "AC-5 through AC-8 (and AC-9's live component) are NOT mapped to Vitest at all -- mapped instead to a live-local-run verification procedure (7 concrete steps specified: bring up stack, re-run flows-bootstrap.sh, seed a Telegram-eligible test user + a non-eligible one, trigger all 3 flows for both, query interaction_deliveries/outbox directly for each). This is deliberate and matches the impact analysis's own confirmed research (no flows-bootstrap.sh change has ever had a unit test anywhere in .copilot/tasks/completed/; closest precedent commit da9e242 was a live-UAT-discovered fix, not a test file). AC-6 explicitly gets no inline_buttons assertion (by design, mirrors the buttonless waitlisted email template) -- flagged so TestRunner doesn't mistakenly treat a missing button as a bug during live verification."
    - "sanitizeTelegramHtml() unit test plan enumerates: each of the 7 allowlisted tags individually, nested/combined allowlisted tags, disallowed-tag stripping including case variants (<SCRIPT>/<ScRiPt>), self-closing tags, the exact cross-nested docstring example (<b>bold <i>text</b></i>) with the precise expected output derived from tracing findTagsToStrip's stack logic, a stray unmatched closing tag, an unclosed tag at end-of-string, empty-string input, no-tags-at-all input, and the AC-4 regression case explicitly instructed to use buildReminderPayload()'s real exported output (since telegramHtmlBody() itself is module-private/non-exported, confirmed by direct read) rather than a hand-typed approximation."
    - "Genuine, real coverage gap found and addressed, not routed around: no test file anywhere in apps/api/test/ exercises EventsController or patchEventSchema -- confirmed events-service.spec.ts calls EventsService.patch() directly (bypassing the controller/schema layer entirely) and checkin-events.controller.spec.ts is an unrelated controller (CheckinEventsController), verified by reading both files' imports directly rather than trusting the filename. A new events-controller.spec.ts is specified, scoped narrowly to the new title-regex guard only (not backfilling full EventsController coverage for untouched routes, which remains a separate pre-existing gap outside this workflow)."
    - "AC-10 (FR-NTF-004.md doc correction) explicitly excluded from this strategy as DocWriter's Step 9 responsibility, per task instruction -- listed in the AC mapping table with an explicit out-of-scope note rather than silently omitted, so its absence from test coverage isn't mistaken for an oversight."
```
