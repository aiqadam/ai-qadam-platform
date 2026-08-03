# Test Design — FEAT-NTF-004 (Telegram notification adapter gap-fill)

Workflow: `wf-20260803-feat-197`

Follows `06-test-strategy.md` precisely. All new tests written and verified
GREEN before handoff (per this agent's obligation to hand off passing tests,
not tests-as-written-but-unverified — TestRunner at Step 8 re-runs the full
suite/typecheck/lint/build, not this file's target subset).

---

## Tests Written

### Unit

| File | Count / Focus | Required? |
|---|---|---|
| `apps/api/test/telegram-html-sanitizer.spec.ts` (**NEW FILE**) | 24 tests: each of the 7 allowlisted tags individually; nested/combined allowlisted tags (2-deep, 3-deep, link-wrapping-bold, siblings); disallowed-tag stripping (script/div/img + case variants `<SCRIPT>`/`<ScRiPt>`/`<DIV>`); self-closing tags (`<br/>`, `<img .../>`); the exact cross-nested docstring example `<b>bold <i>text</b></i>` (traced against `findTagsToStrip`'s stack algorithm, asserts both pairs stripped → `'bold text'`); stray unmatched closing tag; unclosed tag at end-of-string (both the simple case and the "later different tag closes properly" case); empty-string and no-tags-at-all degenerate inputs; AC-4 regression via `buildReminderPayload(event, kind, 'telegram').text` for all 3 `ReminderKind` values (`it.each`), using the real exported function's output (not a hand-typed approximation), with a title fixture (`'AI & Data: <intro>'`) that makes the escape-then-sanitize interaction visible | Yes |
| `apps/api/test/interactions-telegram-adapter.spec.ts` (additions — 2 new `describe` blocks: `inline_buttons` passthrough + size/format bounds) | 8 unit-level tests: valid array passthrough (equals input exactly), omitted stays `null`; row-count bound (11 rejected), buttons-per-row bound (11 rejected), 64-char text boundary passes, 65-char text rejected, 2049-char url rejected, malformed url (`'not-a-url'`) rejected | Yes |
| `apps/api/test/events-controller.spec.ts` (**NEW FILE**) | 6 tests: title with `"` → `BadRequestException`, `EventsService.patch` NOT called; title with `\` → same; title with neither → passes through, `patch` IS called with the parsed body; title omitted → still optional, passes; 200-char boundary title with no forbidden chars → passes | Yes |

### Integration

| File | Count / Focus | Required? |
|---|---|---|
| `apps/api/test/interactions-telegram-adapter.spec.ts` (new `describe('TelegramAdapter — sanitizer + inline_buttons integration (outbox-durable)')`) | 2 tests, real Testcontainers Postgres (existing `TEST_DATABASE_URL`/`OutboxPublisher`/`db.select().from(outbox)` fixture, extending the file's existing pattern — no new harness): sanitized text (`<div>hi</div>` → `'hi'`) actually lands in the outbox row's `payload.payload.template.text`, proving the sanitizer call is wired into the real adapter path; an 11-row oversized `inline_buttons` payload never reaches the outbox — asserts `state: 'failed'` **and** 0 new outbox rows | Yes |

(The valid-passthrough and omitted-stays-null cases also assert against real outbox rows — see the Unit table above; the strategy's Integration Test Plan table's first two rows are satisfied by those same tests since the file is integration-flavored by construction, not a separate mock-vs-real split.)

### E2E

None. No UI surface in this workflow's diff (confirmed by impact analysis). Not applicable — matches the strategy's `E2E Test Plan` (empty).

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 (inline_buttons passthrough) | `interactions-telegram-adapter.spec.ts` — `inline_buttons` passthrough describe block + integration describe block | Covered |
| AC-2 (inline_buttons omitted stays backward-compatible) | Same file — "defaults inline_buttons to null when omitted" | Covered |
| AC-3 (sanitizer strips unsupported tags) | `telegram-html-sanitizer.spec.ts` — disallowed-tag/case-variant/self-closing/cross-nested/stray/unclosed describe blocks; integration-level "writes the sanitized text ... to the outbox row" test | Covered |
| AC-4 (sanitizer preserves allowlisted tags + reminder body byte-identical) | `telegram-html-sanitizer.spec.ts` — allowlisted-tags + nested/combined describe blocks; AC-4 regression `it.each` over all 3 `ReminderKind` values via `buildReminderPayload` | Covered |
| AC-5 (registration-confirmed reaches Telegram) | **Live-local-run** (no Vitest, per strategy) | Not this agent's job — Orchestrator/TestRunner at Step 8 |
| AC-6 (registration-waitlisted reaches Telegram, no button) | **Live-local-run** (no Vitest, per strategy) | Not this agent's job — Orchestrator/TestRunner at Step 8 |
| AC-7 (registration-promoted reaches Telegram) | **Live-local-run** (no Vitest, per strategy) | Not this agent's job — Orchestrator/TestRunner at Step 8 |
| AC-8 (Telegram-ineligible recipients still get email, no failure) | **Live-local-run** (no Vitest, per strategy) | Not this agent's job — Orchestrator/TestRunner at Step 8 |
| AC-9 (email channel unaffected) | Static diff inspection (done at prior steps) + live-local-run component | Partial / not this agent's job for the live component |
| AC-10 (FR-NTF-004.md doc correction) | Out of scope for this test strategy — DocWriter, Step 9 | N/A, by design |
| (MAJOR-1 fix) inline_buttons size/format bounds | `interactions-telegram-adapter.spec.ts` — size/format bounds describe block + oversized-never-reaches-outbox integration test | Covered |
| (MAJOR-2 fix) `patchEventSchema.title` regex guard | `events-controller.spec.ts` — full describe block, new file | Covered |

---

## Known Test Gaps

- **`javascript:alert(1)` scheme-smuggling case, listed in the strategy's Unit Test Plan as "worth including," was traced and found to be a wrong test, not written as originally suggested.** Zod's `.url()` (WHATWG URL parser) validates well-formedness only, not a scheme allowlist — confirmed directly: `z.string().url().safeParse('javascript:alert(1)').success === true`. Asserting `state: 'failed'` for this input would be asserting the wrong expected value, not exercising a real gap in the MAJOR-1 fix (which was scoped to size/length bounds + basic URL well-formedness, not scheme filtering). Left a `// NOTE:` comment in `interactions-telegram-adapter.spec.ts` in place of the test explaining the trace, rather than silently dropping it or asserting an incorrect outcome. **This is not a code bug** — scheme-allowlisting was never in MAJOR-1's scope, and the button URLs both real call sites produce (`event-reminders.service.ts`, the 3 Directus flow ops) are always `https://aiqadam.org/...`, not user-controlled scheme input. If scheme restriction is ever desired, it would need a dedicated `.refine()` check, which is a new scope decision, not a bug fix — flagging for awareness, not routing back to CodeDeveloper.
- **AC-5 through AC-8 (Directus flow changes) have zero Vitest coverage, by design.** Per the strategy's explicit, well-reasoned position: no `flows-bootstrap.sh` change has ever been unit-tested in this codebase's history, and there is no Directus-flow-execution harness to exercise the real `resolve`/`reject` chaining, Liquid rendering, or `exec`-op sandboxed JS. Mapped instead to the strategy's 7-step live-local-run procedure, owned by Orchestrator/TestRunner at Step 8. Not a gap this agent can or should fill with an invented harness.
- **The self-disclosed sanitizer residual gap** (a well-formed `<a href="evil">` inside an event title survives `sanitizeTelegramHtml()` unchanged) is intentionally NOT tested as a rejection case — security review judged this an accepted Phase-1 residual risk. Asserting the sanitizer strips such input would contradict that accepted disposition.
- **No new coverage added for `EventsController.list`/`detail`/`regenerate-social-card`/`upsertFollowup`.** Explicitly out of scope per the strategy — those routes are untouched by this workflow's diff; only the title-regex guard this workflow actually added is tested.

No `it.skip` anywhere in the new/modified files. No `any` in test code (verified by grep). AAA pattern with blank lines between sections used throughout. One `describe` per class/function/behavior grouping, matching the existing file's style.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "All required tests from 06-test-strategy.md written and verified GREEN: 24 new unit tests in telegram-html-sanitizer.spec.ts (new file) covering every allowlisted-tag/disallowed-tag/self-closing/cross-nested/stray/unclosed/degenerate case plus the AC-4 regression against buildReminderPayload()'s real exported output for all 3 ReminderKind values; 10 new tests in interactions-telegram-adapter.spec.ts across 3 new describe blocks (inline_buttons passthrough, size/format bounds, sanitizer+bounds integration) extending the file's existing real-Testcontainers-Postgres pattern; 6 new tests in events-controller.spec.ts (new file) covering the MAJOR-2 title-regex guard, a genuine pre-existing coverage gap identified in the strategy and filled here. Targeted run: pnpm --filter api test -- telegram-html-sanitizer interactions-telegram-adapter events-controller -> 3 files, 50 tests, all passed. typecheck (tsc --noEmit) clean, lint (biome check .) clean (325 files, no fixes), biome check on the 3 touched/new test files directly also clean. One test-writing mistake found and corrected during the run, not a code bug: a suggested 'javascript:alert(1) button URL should fail' case was removed after tracing that Zod's .url() (WHATWG URL parser) validates well-formedness, not scheme allowlisting, and legitimately accepts that string -- documented as a Known Test Gap with the trace, not silently dropped or asserted incorrectly. AC-5..AC-8 (Directus flow changes) correctly have zero Vitest coverage per the strategy's own explicit non-standard 'live-local-run verification' tier -- not built here, owned by Orchestrator/TestRunner at Step 8. No it.skip, no any in test code, AAA pattern maintained, database never mocked in the Testcontainers-based file."
  findings:
    - "telegram-html-sanitizer.spec.ts (new): 24 tests across 9 describe blocks. The cross-nested docstring example <b>bold <i>text</b></i> was traced by hand against findTagsToStrip's stack algorithm before writing the assertion (open b -> push; open i -> push; close b hits mismatch, finds opener at depth 0, strips both b and i plus the closing </b>, truncates stack to empty; close i then has no opener anywhere -> stray, stripped too) -- confirmed final output 'bold text', matching the strategy's predicted behavior exactly."
    - "AC-4 regression test imports buildReminderPayload directly from event-reminders.service.ts (already exported) and calls it for all 3 ReminderKind values via it.each, extracting .text and asserting sanitizeTelegramHtml(text) === text (byte-identical no-op) -- per the strategy's explicit instruction not to hand-type an approximation of telegramHtmlBody()'s (non-exported) output. Fixture title 'AI & Data: <intro>' was used per the strategy's specific recommendation; an extra sanity assertion confirms the escaped form ('AI &amp; Data: &lt;intro&gt;') actually appears in the text, so the byte-identical assertion isn't vacuously true against a no-tag string."
    - "interactions-telegram-adapter.spec.ts additions: 3 new describe blocks added alongside (not replacing) the existing coverage, confirmed by re-reading the full existing file first -- zero collision with the file's pre-existing policy-gate/payload-validation/happy-path tests. MAJOR-1 bounds tests cover row count (11 rejected), buttons-per-row (11 rejected), text length (64 passes / 65 rejected -- boundary-exact both sides), url length (2049 rejected), and malformed url (rejected). Both integration-level rows from the strategy included: sanitized text lands in the outbox for real (not just unit-tested in isolation), and an oversized inline_buttons payload produces zero new outbox rows (not a partial/rolled-back write)."
    - "Found and corrected one test-writing error before handoff, not a code bug: the strategy's suggested javascript:alert(1) URL rejection case does not actually fail Zod's .url() validator (confirmed directly via a Node script: WHATWG URL parser treats it as well-formed). Removed the incorrect assertion and left an explanatory NOTE comment in the test file plus a full writeup in this file's Known Test Gaps section, rather than silently asserting a wrong expected value or quietly dropping the case with no trace."
    - "events-controller.spec.ts (new): fills the genuine, previously-confirmed gap (no test file anywhere exercised EventsController/patchEventSchema). Instantiates EventsController directly with a hand-rolled fake EventsService (matching events-service.spec.ts's own mocking style for DirectusClient), scoped narrowly to the title regex guard per the strategy's explicit instruction not to backfill full EventsController coverage for untouched routes (list/detail/regenerate-social-card/upsertFollowup)."
    - "Full validation performed beyond the targeted test command: pnpm --filter api typecheck (clean), pnpm --filter api lint / biome check . (clean, 325 files), and a direct biome check on the 3 touched/new spec files (clean). Confirmed no it.skip and no any via grep across all 3 files."
```
