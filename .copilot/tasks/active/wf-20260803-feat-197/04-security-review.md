# Security Review — FEAT-NTF-004 (Telegram notification adapter gap-fill)

Workflow: `wf-20260803-feat-197`

## Code Changes Reviewed

- `apps/api/src/modules/interactions/channels/telegram-adapter.ts` (modified — `inline_buttons` passthrough + sanitizer call, full file read)
- `apps/api/src/modules/interactions/channels/telegram-html-sanitizer.ts` (new — allowlist HTML tag stripper, full file read)
- `infrastructure/directus/flows-bootstrap.sh` (modified — reviewed via `git diff main -- infrastructure/directus/flows-bootstrap.sh`, 313-line diff, all hunks read in full)
- `apps/api/src/modules/interactions/interactions.types.ts` (context — `dispatchInputSchema`, unchanged)
- `apps/api/src/modules/interactions/interactions.controller.ts` (context — `/v1/internal/interactions/dispatch` boundary, unchanged)
- `apps/api/src/modules/interactions/interactions.service.ts` (context — `resolveRecipients`, unchanged)
- `apps/api/src/modules/workspace/events.controller.ts` (context — trust-boundary check for who can set event titles)
- `apps/api/src/modules/workspace/event-reminders.service.ts` (context — reference `escapeHtml`/`telegramHtmlBody` pattern, unchanged)
- `apps/api/test/interactions-telegram-adapter.spec.ts` (context — existing test baseline, unchanged in this diff)
- `docs/04-development/security/security.md`, `AGENTS.md` §5 (baseline)

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 | Tenant isolation | PASS | `resolveRecipients()` (unchanged) still resolves `tenant: u.country ?? null` per recipient via the existing `/users?fields=...` Directus call; `TelegramAdapter.checkPolicy()` already skips recipients with no tenant. The 3 new Directus flow ops route through the same `/v1/internal/interactions/dispatch` → `InteractionsService.dispatch()` → `resolveRecipients()` path as every other caller — no new/parallel recipient-resolution code introduced. Same tenant-scoping posture as the pre-existing email ops in the same flows (parity confirmed, not a regression). |
| INV-2 | Secrets by reference | PASS | `x-internal-auth` header uses `{{ $env.INTERNAL_API_TOKEN }}` (existing pattern, unchanged literal). No new secret literal in the diff. Grepped the full diff for `password`/`secret`/`apiKey`/`token`/`Bearer` — only the pre-existing `INTERNAL_API_TOKEN` env-var reference appears, same as the 3 sibling email ops. |
| INV-3 | Auth at controller level | PASS (no controller change) | `InteractionsController.dispatch()` is unchanged and already `@UseGuards(InternalAuthGuard)` at the controller level. `EventsController` (checked as the trust-boundary source for event titles) is `@UseGuards(AuthGuard)` at controller level, confirming event-title authorship is gated to authenticated operators, not open to anonymous/member input (see BLOCKER/MAJOR discussion below). No new controller method added by this PR. |
| INV-4 | Validation at boundaries | MAJOR finding | `dispatchInputSchema.payload` is `z.record(z.string(), z.unknown())` (pre-existing, unchanged, open bag) — the real boundary validation for Telegram-specific shape happens downstream in `TelegramAdapter.send()`'s local `payloadSchema.safeParse()`, which does run before any envelope is built. However, the new `inline_buttons` field (`inlineButtonsSchema = z.array(z.array(inlineButtonSchema))`) has **no `.max()` bound** on either array dimension, and `inlineButtonSchema.text`/`.url` have only `.min(1)`, no `.max()` — unlike the sibling `text` field two lines above it, which has `.min(1).max(4096)`. An oversized `inline_buttons` array (many rows/buttons, or very long `url`/`text` strings) would pass Zod validation as currently written and reach the outbox's unstructured `jsonb` column, then get XADD'd to Redis Streams and handed to the Python notifier, which would then hit Telegram Bot API's own hard limits (`sendMessage`'s `reply_markup` has real, undocumented-in-this-repo size ceilings) and fail at that much-later, harder-to-debug stage instead of failing fast at the boundary with a clear `400`. See MAJOR-1 below. |
| INV-5 | No cross-schema queries | PASS | The 3 lookup-op field extensions (`telegram_user_id`, `telegram_opted_out_at`) are additions to existing Directus item-read ops against `directus_users` — same collection, same query mechanism, not a new query pattern or a raw-SQL cross-schema reach. Confirmed no join introduced. |
| INV-6 | Rate limiting | N/A | No new public endpoint introduced. `/v1/internal/interactions/dispatch` is internal-auth-gated (not public), unchanged by this PR. |
| INV-7 | CSRF protection | N/A | No new browser-initiated state-changing endpoint. The new Directus flow ops call an internal, non-browser, header-authenticated endpoint (server-to-server), same pattern as the existing email ops. |
| INV-8 | No `dangerouslySetInnerHTML` | PASS | Zero occurrences in the diff. No frontend surface touched at all (confirmed by impact analysis and by absence of any `apps/web`/`apps/web-next` file in the diff). |
| INV-9 | No N+1 queries | PASS | No new query-in-a-loop. `TelegramAdapter.send()` is a single-recipient method called once per delivery by the (unchanged) dispatch loop, same as before this PR. The 3 new Directus lookup-op field extensions add columns to an existing single item-read, not an additional query. |
| INV-10 | Drizzle parameterization | PASS | No new `sql\`...\`` template or `db.execute()` call introduced. `OutboxPublisher.publish()` call site is unchanged; the envelope object is passed as a structured value (Drizzle's query builder handles jsonb serialization), no string concatenation into a query. |
| INV-11 | HttpOnly tokens (web) | N/A | No web/frontend token handling touched by this PR. |

---

## Detailed Findings Discussion

### 1. Escape-before-strip ordering (impact-analysis flag) — RESOLVED, not a finding

Traced the actual data flow rather than trusting the framing at face value. `event_lookup.title` / `promo_load_event.title` land in the 3 new Telegram request bodies only inside `<b>{{ event_lookup.title }}</b>` textContent position (confirmed by direct reading of all 3 new `request`-type op bodies in the diff), never inside an `<a href="...">` attribute — the only dynamic attribute content is `{{ event_lookup.id }}` / `{{ promo_load_event.id }}`, both trusted Directus item-read output (UUID primary keys), not user-settable. This closes the narrower **attribute-injection** vector (a title breaking out of an `href=` string) cleanly. It does **not** close the **"title contains its own complete allowlisted tag"** vector — see item 2 below, which is the residual gap CodeDeveloper self-disclosed. This is expected: Directus Liquid templates have no native escaping primitive, and building one was explicitly out of scope per the requirement doc. `TelegramAdapter.sanitizeTelegramHtml()` itself is correctly positioned as a defense-in-depth backstop applied to `text` before the envelope is built (confirmed at `telegram-adapter.ts:91`, after `payloadSchema.safeParse` and before envelope construction) — every caller gets it uniformly, matching the FR's stated intent.

### 2. The self-disclosed residual gap — judgment call: ACCEPTABLE RESIDUAL RISK, not a BLOCKER or MAJOR

**Question:** can an organizer-authored event title containing literal `<a href="https://evil.com">click me</a>` survive `sanitizeTelegramHtml()` and reach a member's Telegram DM as a real clickable link?

**Yes, mechanically** — confirmed by reading `telegram-html-sanitizer.ts` in full: a well-formed, properly-nested `<a href="...">...</a>` pair is indistinguishable from a legitimately template-authored one once both are already inside the same string being tokenized by `TAG_PATTERN`/`findTagsToStrip`. This is not a bug in the sanitizer's logic — it is operating exactly as designed (strip disallowed tags, preserve well-formed allowlisted ones), and the FR explicitly scopes it as strip-only, not an escaper.

**Trust boundary, verified independently (not deferred to CodeDeveloper's framing):**
- `EventsController` (`apps/api/src/modules/workspace/events.controller.ts`) is `@Controller('v1/workspace/events')` + `@UseGuards(AuthGuard)` at the class level — every method requires an authenticated session. The file's own header comment states: "F-S3.4 — operator event control panel API... every authenticated operator sees every event today." `patchEventSchema.title` is `z.string().trim().min(1).max(200).optional()` — no HTML/tag restriction, but also no path for an anonymous visitor or a plain `member`-role registrant to set or influence this field. I searched for any member-facing/public event-creation or event-suggestion path elsewhere in the codebase (registration endpoints, forms module, CRM) and found none — event `title` is exclusively operator-authored via this one authenticated controller.
- Directus's own `events.title` field (from `infrastructure/directus/bootstrap.sh`) is a plain `string`/`max_length:200` column with no character-class restriction — consistent with the NestJS-side schema, and also only writable by roles with access to the Directus events collection (operators), not by end users.
- **Conclusion: this is genuinely operator-only, not member-submittable.** The attacker in this scenario would have to be an organizer/operator deliberately crafting a phishing link as the title of an event they themselves are creating.

**Independent judgment on exposure, not just accepting CodeDeveloper's framing:** An organizer malicious enough to plant `<a href="evil">` in their own event's title already has a strictly easier attack available to them with zero HTML knowledge required — they can simply put the bare URL (`https://evil.com — click here`) directly in the plain-text title, or in the `description` field (max 20000 chars, completely free text, not touched by any sanitizer in this PR's scope at all). Telegram's Bot API auto-linkifies bare URLs in message text regardless of `parse_mode`, so a plain-text phishing URL in a title is delivered as a clickable link to the same registrants either way. The HTML-tag vector does add one narrow capability the plain-text vector doesn't: **link text that doesn't visually match the URL** (e.g. displaying "Official event details" while linking to `evil.com`) — a classic phishing anchor-text mismatch that a bare auto-linkified URL cannot achieve (Telegram would render the raw URL as its own visible link text). This is a real, if marginal, incremental capability over "no sanitizer at all," not zero incremental risk as a purely-equivalent framing would suggest.

Weighing this: the attacker is already trusted with operator-level event-authoring access (a `member`/`speaker` cannot reach this path); the blast radius is limited to that operator's own event's own registrants (not cross-tenant, not platform-wide); the organizer's identity and the event are both visible/attributable in-app (this isn't anonymous abuse); and the incremental capability (anchor-text mismatch) over the already-available plain-text-URL vector is real but narrow. This reads as a **Phase 1 acceptable residual risk**, not a BLOCKER (no cross-tenant/cross-privilege escalation, no unauthenticated attacker path) and not quite a MAJOR either, since fixing it properly requires the explicitly-out-of-scope Liquid-escaping helper — pushing back on an architectural boundary the requirement doc already closed, which is not this review's role. Recommend it be captured as a named, tracked residual risk (e.g. a short ADR note or a `docs/03-requirements/FR-NTF-004.md` "Known limitations" line per item 4/DocWriter) rather than a code-blocking finding, so it isn't lost — flagging as a documentation follow-up, not a security gate failure.

### 3. Directus flow JSON `\\n\\n` doubled-escaping fix — correctness fix, with one adjacent (pre-existing, shared) finding

Confirmed by reading the diff: the `\\n\\n` doubled-escaping change is scoped correctly to the 3 *new* Telegram request bodies only, because only those bodies contain a literal `\n` at all (email ops use structured `template`+`data` payloads with no raw text/newlines in their JSON). This is a correctness fix for a self-inflicted bug in this PR's own new content, not a fix to pre-existing code — verified the pre-existing email ops are untouched beyond their `query.fields`/`resolve` edits, consistent with the code summary's own claim.

**The distinct, adjacent question asked**: could `event_lookup.title` containing a literal `"` or `\` break out of the JSON string in `"text": "...{{ event_lookup.title }}..."` before the sanitizer even runs? **Yes, mechanically, and this is a genuine, exploitable gap** — but it is **pre-existing and shared with the email ops**, not new or unique to this PR. Confirmed: `events.title` (Directus schema, `infrastructure/directus/bootstrap.sh`) is an unrestricted `string(200)` field, and the existing (untouched) email ops already interpolate the identical `{{ event_lookup.title }}` / `{{ promo_load_event.title }}` raw into their own JSON bodies (`"eventTitle": "{{ event_lookup.title }}"`) with the exact same lack of Liquid-side escaping. An event title containing `"` would break both the old email op's JSON and the new Telegram op's JSON identically — this is not a regression introduced by this PR, and holding this PR to a stricter bar than the code it extends would be inconsistent. That said, it **is** a real gap worth flagging explicitly (not silently passing over it just because it's shared): a malformed request body reaching Directus's HTTP client could either fail cleanly (Directus's own JSON serialization of the templated string typically re-escapes at render time in most Directus/Liquid-flow implementations, which would likely neutralize this in practice, but this was **not verified end-to-end against a live Directus instance** in this review or, per the code summary, in CodeDeveloper's own 3-stage trace, which covered the newline-escaping question but not this quote-escaping question). Recommend a MAJOR-adjacent note captured as a shared follow-up (see MAJOR-2), not blocking this PR, since it's parity with existing, already-shipped, already-accepted-risk code — but it should not be left permanently undocumented either.

### 4. Exec-gate `throw new Error(...)` pattern — confirmed safe, no new risk

Read all 6 exec-type ops in the full diff plus the 3 pre-existing reference ops (`decide_status` line 468, `promo_gate` line 799, `checkin_gate` line 969). All 6 new gate ops (`capacity_telegram_gate`, `capacity_telegram_gate_wl`, `promo_telegram_gate`) follow the identical structure: `throw new Error('not-telegram-eligible')` — a static, literal string, containing no interpolated data (no `user.email`, no `tgId`, no request/trigger payload content). This matches the pre-existing pattern exactly (`throw new Error('not-a-cancel')`, `throw new Error('not-a-checkin')`, etc. — all static literals). Confirmed: this is the established, safe pattern, not a new risk. No sensitive data (telegram IDs, emails, opt-out timestamps) is ever placed into a thrown error message that might later surface in Directus flow-run logs.

### 5. INV-1 tenant isolation — confirmed parity, no regression

Already covered in the table above. `interactions.service.ts` (including `resolveRecipients()`) is completely unchanged by this PR (confirmed via the impact analysis's own claim and independently verified no hunk in this file appears in `git diff main`). The 3 new Directus flow ops don't bypass `InteractionsService.dispatch()` — they call the exact same `/v1/internal/interactions/dispatch` endpoint as the pre-existing email ops, so tenant-scoping posture is byte-for-byte identical between old and new ops. No regression, no new gap.

---

### BLOCKER Findings

None.

### MAJOR Findings

**MAJOR-1 — `inline_buttons` has no size/length bound in `payloadSchema`, unlike its sibling `text` field.**

- File: `apps/api/src/modules/interactions/channels/telegram-adapter.ts`
- Lines: 35–52 (`inlineButtonSchema`, `inlineButtonsSchema`, `payloadSchema`)
- Finding: `inlineButtonSchema` declares `text: z.string().min(1)` and `url: z.string().min(1)` with no `.max()`, and `inlineButtonsSchema = z.array(z.array(inlineButtonSchema))` has no `.max()` on either array dimension (rows or buttons-per-row). This is inconsistent with the immediately-adjacent `text` field in the same `payloadSchema`, which correctly bounds itself (`z.string().min(1).max(4096)`). An oversized `inline_buttons` payload (e.g. hundreds of rows, or multi-megabyte `url`/`text` strings) currently passes Zod validation unchanged, gets written into the `outbox.payload` jsonb column (unstructured, no DB-level constraint either), gets XADD'd to Redis Streams, and only fails much later at the Python notifier / Telegram Bot API layer — outside this PR's visibility and testable boundary, and with a much worse failure mode (either a hard-to-diagnose downstream Telegram API rejection, or, in the worst case, a large jsonb row bloating the outbox table / the Redis Stream if this is called at any kind of volume).
- Suggested fix: add reasonable bounds matching Telegram Bot API's own real limits, e.g. `text: z.string().min(1).max(64)` (Telegram inline-button label practical limit), `url: z.string().min(1).max(2048).url()`, and cap the array with `.max(10)` rows / a similar per-row cap (Telegram's `InlineKeyboardMarkup` doesn't have a hard documented row cap but a small practical bound like `.max(10)` on both dimensions is a reasonable, cheap guard consistent with this codebase's existing "every string field has a max length" rule in `security.md`'s Input Validation section). This is a small, mechanical fix squarely within `payloadSchema`'s existing style — no architectural change needed.
- Retriable: yes, straightforward for CodeDeveloper to add.

**MAJOR-2 — Unescaped `"`/`\` in `event_lookup.title` could break the outer JSON string in Directus request-op bodies (pre-existing, shared with email ops — not a regression, but undocumented and unverified end-to-end).**

- File: `infrastructure/directus/flows-bootstrap.sh`
- Lines: 246, 381, 595 (new Telegram bodies) — and, identically, the pre-existing email op bodies at the `eventTitle` interpolation sites (e.g. line ~434's `capacity_email_confirmed` body, unchanged by this PR).
- Finding: `events.title` (Directus schema) is an unrestricted `string(200)` field with no character-class validation. If an operator sets a title containing a literal `"` (e.g. `Meetup: "AI in Practice"`) or a trailing `\`, Directus's Liquid-style `{{ event_lookup.title }}` substitution inserts the raw character into the JSON string literal (`"text": "...{{ event_lookup.title }}..."`) with no escaping step, which could break the intended JSON structure of the rendered request body sent to `/v1/internal/interactions/dispatch`. This risk is **identical and pre-existing** on the untouched email ops (same interpolation pattern, same lack of escaping) — this PR does not introduce a new instance of the pattern, it extends an existing one to a second body shape. Because it's shared with already-shipped, already-accepted code, this is **not a blocker for this PR** and should not be held to a stricter bar than the code it extends. However: (a) it was not verified end-to-end against a live Directus instance whether Directus's own JSON-templating engine re-escapes at render time (which would neutralize this in practice) — the code summary's own 3-stage trace covered only the newline-doubling question, not this quote-escaping question; (b) it is currently undocumented as a known/accepted risk anywhere. Recommend: verify empirically against local Directus during the live-local-run verification already planned for AC-5–AC-8 (send a test registration for an event titled with an embedded `"`), and if the raw-break risk is confirmed, either fix at the Directus-template-authoring layer (a per-title `"` rejection at the `EventsController.patchEventSchema` level, e.g. disallow `"` and `\` in titles — cheap, low-blast-radius) or explicitly document it as an accepted Phase-1 risk in `security.md`'s "out of scope for Phase 1" section or a short ADR note. Flagging as MAJOR because it's a genuine, currently-unverified gap, not because this PR is the one that must fix it — CodeDeveloper or Orchestrator can decide whether the fix lands in this PR (cheap: add `.regex(/^[^"\\]*$/)`-style guard to `patchEventSchema.title`) or as a tracked follow-up issue.
- Retriable: yes, if fixed at `patchEventSchema` (small, contained change); otherwise appropriate as a named follow-up issue rather than blocking this PR, since it's parity with existing accepted-risk code.

---

## Gate Result

```yaml
gate_result:
  status: failed-retry
  summary: "No BLOCKER findings — architecture and trust-boundary reasoning both hold (event titles are operator-only per EventsController's class-level AuthGuard, confirmed by direct read; no member/anonymous path to set event content anywhere in the codebase; the self-disclosed sanitizer gap is judged an acceptable, narrow, Phase-1 residual risk given that scope, not a blocker). Two MAJOR findings are retriable by CodeDeveloper: (1) inline_buttons lacks size/length bounds in payloadSchema unlike its sibling text field, allowing an oversized array to reach the outbox unvalidated; (2) unescaped double-quote/backslash characters in event_lookup.title could break the outer JSON string in the new (and pre-existing, shared) Directus request-op bodies — not a regression, but currently unverified end-to-end and undocumented as an accepted risk. All 11 invariants reviewed; INV-1/2/3/5/8/9/10 pass cleanly, INV-6/7/11 not applicable (no new public/browser-facing endpoint), INV-4 is the source of both MAJOR findings."
  findings:
    - "MAJOR-1: apps/api/src/modules/interactions/channels/telegram-adapter.ts lines 35-52 — inlineButtonSchema/inlineButtonsSchema have no .max() bound on text/url string length or array dimensions, unlike the adjacent text field's .min(1).max(4096). Add bounds (e.g. text.max(64), url.max(2048).url(), array .max(10) per dimension) so an oversized inline_buttons payload fails fast with a 400-equivalent adapter response instead of reaching the outbox jsonb column and failing much later at the Telegram Bot API layer."
    - "MAJOR-2: infrastructure/directus/flows-bootstrap.sh lines 246/381/595 (new) and the pre-existing sibling email-op bodies — event_lookup.title/promo_load_event.title are interpolated raw into a JSON string via Directus Liquid templating with no escaping primitive; a title containing a literal double-quote or backslash could break the outer JSON structure of the rendered HTTP request body. This is pre-existing and shared with the untouched email ops (not a regression introduced by this PR), so it does not block this PR alone, but it is currently unverified end-to-end (Directus's own render-time re-escaping behavior was not empirically confirmed) and undocumented as an accepted risk. Recommend verifying during the already-planned live-local-run AC-5..AC-8 verification, and either adding a cheap title character-class guard to EventsController's patchEventSchema.title or explicitly documenting this as an accepted Phase-1 risk."
    - "Residual (non-blocking, documentation follow-up only): the self-disclosed sanitizer gap (a well-formed <a href=\"evil\"> inside an event title survives sanitizeTelegramHtml unchanged) is judged an acceptable Phase-1 residual risk after independently verifying event titles are exclusively operator-authored (EventsController is @UseGuards(AuthGuard) at class level, no member/anonymous event-content path exists anywhere in the codebase) and that the incremental capability over a plain-text phishing URL (which Telegram auto-linkifies regardless) is narrow (anchor-text/URL mismatch only). Recommend capturing this as a named line in FR-NTF-004.md's corrected doc (Step 9/DocWriter) rather than re-opening the out-of-scope Liquid-escaping-helper question in this PR."
    - "INV-1 tenant isolation confirmed at parity with pre-existing email ops — interactions.service.ts/resolveRecipients() completely unchanged by this PR; new Telegram flow ops route through the identical dispatch() path, no new/parallel recipient-resolution code."
    - "Exec-gate throw new Error(...) pattern (capacity_telegram_gate, capacity_telegram_gate_wl, promo_telegram_gate) confirmed to match the established decide_status/promo_gate/checkin_gate precedent exactly — static literal error strings only, no interpolated user data, no new risk introduced."
```

---

## Re-Review (Retry 1 Verification)

Independently verified, not taken on the code summary's word. Read both changed
files in full at their current (uncommitted working-tree) state, ran
`git diff --stat` to confirm the diffs are real and match what was read, and
re-ran the targeted test suite myself rather than trusting the reported count.

### Code Changes Reviewed (this pass)

- `apps/api/src/modules/interactions/channels/telegram-adapter.ts` (full file
  re-read, current state — not a diff-only skim)
- `apps/api/src/modules/workspace/events.controller.ts` (full file re-read,
  current state)
- `apps/api/src/modules/workspace/tg-broadcasts.controller.ts` (full file
  read, for the precedent comparison requested — `buttonSchema`,
  `createSchema`, `updateSchema`)
- `apps/api/src/modules/workspace/events.service.ts` (`PatchEventInput`
  interface, to confirm the schema/service boundary has exactly one shape)
- `apps/api/src/modules/telegram/telegram-events.service.ts`,
  `telegram-speakers.service.ts` (grepped for any `events.title` write path —
  both are read-only on `title`)
- `apps/api/src/modules/workspace/event-speakers.controller.ts` (its one
  `@Post()` route checked — does not touch `title`)
- `infrastructure/directus/bootstrap.sh` (line 445 — `events.title` schema
  definition, confirmed `max_length:200`, no character-class restriction,
  independent of the NestJS-side regex)
- `apps/api/src/modules/workspace/event-reminders.service.ts` (existing
  `inline_buttons` call site, to confirm it still passes the new bounds)
- Ran `pnpm test -- interactions-telegram-adapter events-service` myself
  (not just read the reported result)

### MAJOR-1 verification — RESOLVED, confirmed by direct read

`telegram-adapter.ts` lines 44–55, current state:

```ts
const inlineButtonSchema = z.object({
  text: z.string().min(1).max(64),
  url: z.string().min(1).max(2048).url(),
});
const inlineButtonsSchema = z.array(z.array(inlineButtonSchema).max(10)).max(10);
```

Both dimensions of the 2D array are bounded (`.max(10)` on the inner row array
and `.max(10)` on the outer array), and both leaf fields are bounded
(`text.max(64)`, `url.max(2048)` plus `.url()` format validation, which is a
strict improvement over the pre-fix state — a malformed URL now fails fast at
the adapter boundary instead of silently reaching the outbox). This directly
closes the gap I flagged in the prior pass (unbounded array + unbounded
strings on `text`/`url`). **MAJOR-1 is resolved.**

Traced the one real caller (`event-reminders.service.ts` line 349:
`inline_buttons: [[{ text: '📖 Details', url }]]` — 1 row, 1 button, 9-char
label) and confirmed it still passes: unaffected by the new bounds, no
regression.

**Aside on the `tg-broadcasts.controller.ts` precedent (not a new finding):**
confirmed by direct read, lines 56–61 and 66/70/80: that file's `buttonSchema`
uses `label.max(64)` (not `text` — different field name for the same
concept) and `url.max(2048)`, matching the new `inlineButtonSchema`'s
character bounds exactly. But its array bound is a **flat** `z.array(buttonSchema).max(8)`
(line 56 comment: "Inline-button cap is 8 (Telegram limit)") — a single-column
list capped at the real documented Telegram limit, not a 2D grid. The new
`inlineButtonsSchema` in `telegram-adapter.ts` is a 2D grid (`rows x
buttons-per-row`) capped at `.max(10)` per dimension, which is a different
shape entirely (rows of buttons vs. a flat list of buttons) and, if ever
filled to its max (10x10 = 100 buttons across 10 rows), is far more
permissive in aggregate than the 8-button flat cap. This is a genuine
terminology/precedent inconsistency (`text` vs `label`; two different
"what does Telegram actually allow" answers living in the same codebase)
but I agree with the code summary's own judgment call here: it does not rise
to a new MAJOR. Reasoning, independently arrived at: (1) the two schemas
gate structurally different call sites — `tg-broadcasts` is an
operator-composed flat broadcast body, `telegram-adapter`'s is a
programmatic/templated single-notification body; (2) both of today's real
`telegram-adapter` callers use exactly 1 row / 1 button, nowhere near either
cap; (3) Telegram's Bot API has no documented hard per-dimension cap on
`inline_keyboard`, so `.max(10)` per dimension is a self-imposed guard, not a
correctness bound, same as the pre-existing `.max(8)` is self-imposed rather
than a cited API error code. Recommend (non-blocking, doc/follow-up only): a
short comment cross-reference between the two schemas, or a shared constant,
so a future reader doesn't have to independently discover there are two
different Telegram-button-array conventions in this codebase. Not filing
this as a MAJOR or BLOCKER.

### MAJOR-2 verification — RESOLVED, confirmed by direct read

`events.controller.ts` lines 47–51, current state:

```ts
const TITLE_SAFE_CHARS = /^[^"\\]*$/;
const TITLE_SAFE_MESSAGE = 'Title cannot contain a quote (") or backslash (\\) character.';

const patchEventSchema = z.object({
  title: z.string().trim().min(1).max(200).regex(TITLE_SAFE_CHARS, TITLE_SAFE_MESSAGE).optional(),
  ...
```

The regex `^[^"\\]*$` correctly rejects any string containing `"` or `\`
(character class negation over the whole string, anchored both ends) and
carries a clear, specific error message. `.trim()` runs before `.regex()` in
the chain, which is immaterial here since trimming whitespace cannot
introduce or remove a `"`/`\` character. `.optional()` is preserved after the
regex, so an omitted `title` in a PATCH body still skips validation
entirely (AC/backward-compat preserved) — confirmed this doesn't change
PATCH's partial-update semantics for callers that don't touch `title`.
**MAJOR-2 is resolved for the one schema that exists.**

**Independent verification of the "no other path" claim (not trusted at face
value):**

- Grepped `apps/api/src` broadly for any `events.title`-adjacent write path
  and for every `@Post(...)` route under `modules/workspace`. Confirmed
  `EventsController` has exactly the routes visible in the file (`list`,
  `detail`, `patch`, `regenerate-social-card`, `upsertFollowup`) — **no
  `@Post()` create-event route exists anywhere in the controller.**
- Checked `events.service.ts`'s `PatchEventInput` interface (lines 224–235)
  — it mirrors `patchEventSchema` field-for-field, confirming there is
  exactly one shape flowing from HTTP boundary to service, not a second,
  looser shape used internally.
- Checked `telegram-events.service.ts` and `telegram-speakers.service.ts`
  (the two other services touching `title`-shaped data near the Telegram
  surface) — both are **read-only** on `title` (Directus `fields=` query
  strings and response-mapping code, e.g. `out.push({ name, title:
  speakerTitle(row) })`), no write call.
- Checked `event-speakers.controller.ts`'s one `@Post()` route — does not
  reference `title` at all.
- Checked `infrastructure/directus/bootstrap.sh` line 445 — the Directus
  `events` collection's own `title` field is `string`, `max_length:200`,
  `is_nullable:false`, with **no character-class restriction** at the
  Directus schema level. This confirms the code summary's claim: Directus's
  own admin UI / API remains a route to a title containing `"`/`\` that
  bypasses the new NestJS-side regex entirely — but this is the
  **pre-existing, explicitly out-of-scope** direct-Directus-write path
  (event creation happens in Directus, not via a NestJS create endpoint,
  and touching Directus's own field-level validation is outside this
  workflow's stated boundary per the handoff). This is the same caveat the
  code summary itself names ("that create path is unchanged by this fix").

**Conclusion on MAJOR-2:** the fix closes the gap for the **operator-edit**
path (`PATCH /v1/workspace/events/:id`), which is the path this PR's own
new Telegram-dispatch flows are triggered from (registration
confirmed/waitlisted/promoted — all keyed off an event that already exists
and was most recently edited, if at all, via this one PATCH endpoint). It
does **not** close the gap for a title set directly in Directus at
event-creation time and never subsequently edited via the NestJS PATCH
endpoint — that residual path was correctly identified by the code summary
and is consistent with the review's own MAJOR-2 framing last pass ("this is
pre-existing and shared with the email ops... not a regression introduced
by this PR"). Given the fix was scoped and accepted last pass as
"cheap, contained, retriable — CodeDeveloper or Orchestrator can decide
whether the fix lands in this PR... or as a tracked follow-up issue," and
the fix that *did* land closes the more common, more likely-to-be-hit path
(operator edits, which is how event content most often changes after
initial creation) without overclaiming to have closed the
Directus-direct-authoring path — I judge this an acceptable resolution of
MAJOR-2, not a reopened finding. Recommend (should be captured by
DocWriter at Step 9, same as the sanitizer residual risk from the prior
pass): a named line noting event titles set directly in Directus at
creation time (bypassing the NestJS PATCH endpoint) remain unguarded
against `"`/`\`, as an accepted Phase-1 residual risk alongside the
sanitizer gap.

### Fresh Invariant Check Results (INV-1 through INV-11, re-run in full)

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 | Tenant isolation | PASS | Unchanged from prior pass — neither retry-1 file touches recipient resolution or tenant scoping. `resolveRecipients()`/`checkPolicy()` untouched by this retry. |
| INV-2 | Secrets by reference | PASS | Grepped both changed files for `password`/`secret`/`apiKey`/`token`/`Bearer` literals — zero matches. The new regex/error-message strings and Zod bound literals introduce no secret material. |
| INV-3 | Auth at controller level | PASS | `EventsController` remains `@Controller('v1/workspace/events')` + `@UseGuards(AuthGuard)` at class level, unchanged by this retry — the new regex lives inside the existing `patchEventSchema`, not a new controller method. No new controller/route added by either retry-1 file. |
| INV-4 | Validation at boundaries | PASS (was MAJOR, now resolved) | Both MAJOR-1 and MAJOR-2 were INV-4 gaps (missing bounds, missing character-class guard). Both are now closed at their respective boundaries — `payloadSchema`/`inlineButtonsSchema` in the adapter, `patchEventSchema.title` in the controller. Confirmed by direct code read (not just the code summary's claim) in both cases above. |
| INV-5 | No cross-schema queries | PASS | Neither retry-1 change touches a query at all — both are pure Zod schema edits (added `.max()`/`.url()` bounds; added a `.regex()` guard). No new query surface introduced. |
| INV-6 | Rate limiting | N/A | No new endpoint introduced by the retry. Unchanged from prior pass. |
| INV-7 | CSRF protection | N/A | No new browser-initiated state-changing endpoint. `PATCH /v1/workspace/events/:id` already existed pre-retry; the retry only tightens its body schema. |
| INV-8 | No `dangerouslySetInnerHTML` | PASS | Zero occurrences in either changed file. No frontend surface touched. |
| INV-9 | No N+1 queries | PASS | No query-in-a-loop introduced or affected by either change — both are schema-only edits with no new query code. |
| INV-10 | Drizzle parameterization | PASS | No new `sql\`...\`` template or `db.execute()` call in either file. Unchanged. |
| INV-11 | HttpOnly tokens (web) | N/A | No web/frontend token handling touched. |

Confirms the task brief's own expectation: nothing regressed as a side
effect of the retry's changes, and the only invariant whose *result* changed
from the prior pass is INV-4 (MAJOR → PASS, both findings fixed). All other
invariants are unchanged in outcome from the original review.

### Test verification (re-run independently, not trusted from the code summary)

Ran `pnpm test -- interactions-telegram-adapter events-service` myself from
`apps/api`:

```
Test Files  4 passed (4)
     Tests  108 passed (108)
```

Matches the code summary's reported count exactly. `git diff --stat` against
`HEAD` for both changed files confirms real, non-trivial diffs
(`telegram-adapter.ts`: +41/-3 lines; `events.controller.ts`: +12/-1 lines)
consistent with what was read and reviewed above — not a stale or
already-reverted change.

### New findings

None. No new BLOCKER or MAJOR findings introduced by the retry.

### Non-blocking notes carried forward / newly surfaced this pass

1. (Carried forward, unchanged) The self-disclosed sanitizer gap — a
   well-formed `<a href="evil">` inside an event title survives
   `sanitizeTelegramHtml()` — remains an accepted Phase-1 residual risk,
   not touched by this retry, reserved for DocWriter at Step 9.
2. (Newly surfaced this pass, non-blocking) MAJOR-2's fix closes the
   operator-PATCH path but not the Directus-direct-creation path for event
   titles — consistent with the original MAJOR-2 framing as "pre-existing,
   shared, not a regression," and an acceptable scope boundary for this PR,
   but should be named explicitly (not silently dropped) in the same
   Step 9 documentation pass as note 1.
3. (Newly surfaced this pass, non-blocking, informational only per the
   task's own framing) `tg-broadcasts.controller.ts`'s `buttonSchema` uses
   `label`/`.max(8)` flat-array-at-the-real-Telegram-limit, while the new
   `inlineButtonSchema` uses `text`/`.max(10)` per dimension of a 2D grid.
   Different shapes for structurally different call sites; not a
   correctness bug, just a naming/precedent inconsistency worth a
   cross-reference comment if convenient, not worth blocking or retrying
   over.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Re-review of retry 1 confirms both MAJOR findings from the original security review are genuinely resolved, verified by direct reading of the current code (not by trusting the code summary's claims). MAJOR-1: inlineButtonSchema/inlineButtonsSchema in telegram-adapter.ts now have .max(64) on text, .max(2048)+.url() on url, and .max(10) on both array dimensions — confirmed present at lines 44-55 of the current file, and confirmed the one real caller (event-reminders.service.ts) still passes the new bounds. MAJOR-2: patchEventSchema.title in events.controller.ts now has a .regex(/^[^\"\\\\]*$/) guard rejecting quote/backslash characters, confirmed present at lines 47-51. Independently verified (not trusted from the code summary) that no other NestJS-side path can set an event title: EventsController has no @Post() create route (only list/detail/patch/regenerate-social-card/upsertFollowup), events.service.ts's PatchEventInput mirrors patchEventSchema exactly (one shape, one path), and telegram-events.service.ts/telegram-speakers.service.ts are read-only on title. The one residual gap — Directus-direct event creation bypasses this NestJS regex entirely — is real but was already correctly scoped as pre-existing/shared/out-of-scope by the original MAJOR-2 finding, not a reopened gap. Re-ran the full INV-1..INV-11 checklist fresh: all invariants pass or are N/A; INV-4 is the only invariant whose result changed from the prior pass (MAJOR -> PASS). Ran the test suite independently (not just read the reported count): 4 files, 108 tests, all passed, matching the code summary's claim. No new BLOCKER or MAJOR findings. One minor, non-blocking naming/precedent inconsistency noted between telegram-adapter.ts's inlineButtonSchema (text/.max(10) per 2D dimension) and tg-broadcasts.controller.ts's older buttonSchema (label/.max(8) flat, matching Telegram's real documented limit) — informational only, not a finding, per the task's own guidance that this is a nice-to-know rather than a blocker."
  findings: []
```
