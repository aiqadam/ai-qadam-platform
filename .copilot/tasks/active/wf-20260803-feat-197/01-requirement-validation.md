# Requirement Validation — FR-NTF-004 (Telegram notification channel adapter)

Workflow: `wf-20260803-feat-197`

## Raw Input

Verbatim from `handoff.yaml.requirement_text` (summarized here; full text
preserved in the handoff file — not re-litigated):

> Implement GitHub issue #142 (FR-NTF-004) as a **gap-fill against the
> already-shipped ADR-0034 architecture**, not a literal re-read of the
> FR/issue text. A pre-workflow investigation this session found FR-NTF-004.md
> describes an architecture (NestJS → Telegram Bot API directly, BullMQ
> rate limiter, Authentik `attributes.telegram_id`, `notifications_sent`
> table) that does not exist. What's actually shipped (ADR-0034, accepted
> 2026-07-31): `TelegramAdapter` writes a `tg.dispatch.v1` envelope to a
> Postgres outbox; a relay XADDs to Redis Streams; a separate Python
> notifier (`apps/bot` submodule) is the only thing that calls the real
> Telegram Bot API. Eligibility reads `directus_users.telegram_user_id` /
> `telegram_opted_out_at`. User confirmed via `AskUserQuestion` (this
> session): **"Gap-fill the real adapter."** Four in-scope items:
>
> 1. Fix `TelegramAdapter` silently dropping `inline_buttons` from the
>    dispatch payload (envelope hardcodes `inline_buttons: null`).
> 2. Registration-confirmed / waitlisted / promoted notifications never
>    reach Telegram — 3 Directus flow ops hardcode
>    `"allowedChannels": ["email"]`. Add Telegram HTML body + inline
>    "Open event page" button content for these 3 intents, dispatch to
>    both email and Telegram.
> 3. Add a small Telegram-safe-HTML allowlist sanitizer in `TelegramAdapter`
>    (not a full HTML parser dependency).
> 4. Correct FR-NTF-004.md's text to describe the real shipped mechanism
>    (same precedent as FR-CRM-002/ADR-0033).
>
> Explicitly OUT of scope: BullMQ, NestJS calling the real Telegram Bot API
> directly, Authentik `attributes.telegram_id`, a new `notifications_sent`
> table, building the Python notifier's `sendMessage`/rate-limit code.
> FR-AUTH-005 (Telegram account linking) stays Planned/unimplemented —
> this workflow's eligibility check continues to use
> `directus_users.telegram_user_id`/`telegram_opted_out_at` exactly as
> `InteractionsService.resolveRecipients` already does.

## Analysis

### Completeness Issues Found

None that block starting. The requirement is unusually well-specified for
an incoming ticket because it is itself the output of a same-session
investigation with concrete file/line citations, all of which I
independently re-verified below (files may have shifted; they had not).
One material gap I found during re-verification, not previously flagged,
is documented as **Finding A** below — it changes how item 2 must be
implemented, not whether it's in scope.

### Conflicts with Existing Features

- **FR-NTF-004.md (current text) directly conflicts with ADR-0034 and the
  shipped code.** Confirmed by direct read:
  - §Functional scope item 1: *"Lookup path: `userId → Authentik
    attributes.telegram_id → Telegram Bot API sendMessage`"* — actual:
    `InteractionsService.resolveRecipients` (interactions.service.ts
    L218–241) reads `directus_users.telegram_user_id` /
    `telegram_opted_out_at` via Directus REST, never touches Authentik.
  - §Functional scope item 5: *"uses the existing BullMQ outbox/dispatcher
    rate limiter (per ADR-0034)"* — actual: ADR-0034 §Q2+Q6 specifies a
    **Postgres outbox + Redis Streams (`tg.dispatch.v1`) + a separate
    consumer**, explicitly stating *"BullMQ stays for internal NestJS
    jobs; Streams is for cross-language / cross-service"* (ADR-0034
    Risks table). FR-NTF-004.md's own citation of ADR-0034 for a claim
    ADR-0034 contradicts is the clearest sign the FR text predates the
    ADR and was never reconciled — same disposition class as
    FR-CRM-002/ADR-0033.
  - §Functional scope item 2 + AC-1/2: gate on Authentik
    `notification_telegram_enabled` — no such attribute or field exists
    anywhere in the codebase (grep-confirmed no hits outside FR-NTF-004.md
    itself); the real opt-out signal is `telegram_opted_out_at` (a
    timestamp, opt-out not opt-in — presence of `telegram_user_id` +
    absence of `telegram_opted_out_at` is "eligible").
  - §Notes: *"Depends on FR-AUTH-005"* for `telegram_id` — FR-AUTH-005
    (re-read, still `status: Planned`) describes a **different**
    field (`attributes.telegram_id` on Authentik), not
    `directus_users.telegram_user_id`. The dependency as stated is on a
    field that will never be populated by FR-AUTH-005 even once built —
    another symptom of the same stale-architecture problem, not a
    real blocking dependency (the real linking mechanism, whatever
    populates `directus_users.telegram_user_id` today, is out of this
    FR's scope and already working per the `event-reminders.service.ts`
    routing logic that depends on it).
  - §AC-6: *"The bot service is not involved in outbound DM sending (all
    outbound comes from the NestJS API directly)"* — actually FALSE
    under the shipped design: the Python **notifier** (not the bot's
    inbound long-poll process — a genuinely separate process per
    ADR-0034 §Q4) is the only thing that calls `sendMessage`. This AC
    as worded is unverifiable/wrong and must be rewritten.
  - This is a correction, not a new architecture proposal — ADR-0034 is
    already Accepted (2026-07-31) and shipped; nothing in this workflow
    reopens that decision.
- **No conflict with FR-NTF-001** (email dispatcher) — this workflow
  extends the existing multi-channel `InteractionsService.dispatch()` /
  `ChannelAdapter` pattern FR-NTF-001 already established; it does not
  modify FR-NTF-001's own scope.
- **No conflict with FR-AUTH-005** — confirmed still `status: Planned`,
  mechanism is Authentik-attribute-based account linking, genuinely
  separate and unbuilt. This workflow does not implement or depend on it;
  FR-NTF-004.md's Notes section correction (item 4) must remove the
  false dependency described above rather than pretend FR-AUTH-005
  unblocks anything here.

### Architectural Feasibility

All 4 scope items fit the current stack. Confirmed against the real files:

1. **inline_buttons passthrough (telegram-adapter.ts L35–39, L95–102).**
   `payloadSchema` today only declares `text` / `parse_mode` /
   `disable_web_page_preview`; the envelope's `template.inline_buttons`
   is hardcoded `null` regardless of `input.payload`. Confirmed
   `event-reminders.service.ts`'s `buildReminderPayload()` (L342–351)
   already constructs `inline_buttons: [[{ text: '📖 Details', url }]]`
   for the reminder Telegram payload today — meaning **this bug is live
   in production right now** for the already-shipped reminder feature,
   not just theoretical. Fix is additive and local to one file: extend
   `payloadSchema` with an optional `inline_buttons` field (same shape
   Telegram's API expects: `Array<Array<{text: string; url: string}>>`)
   and thread it into the envelope instead of the `null` literal.
   Architecturally trivial — no new module, no new table.

2. **Multi-channel dispatch for registration-confirmed/waitlisted/promoted.**
   Feasible, but **Finding A (below) changes the shape of the fix** from
   what the handoff text implies. Flagging before CodeDeveloper starts.

3. **Telegram-safe HTML sanitizer.** Feasible as a small allowlist
   tag-stripper (`<b> <i> <u> <s> <a> <code> <pre>`, matching
   FR-NTF-004's own §3 spec, which this workflow correctly keeps rather
   than corrects — it was accurate). Applied inside `TelegramAdapter.send()`
   before the envelope is built, so it protects every current and future
   caller (event-reminders' `telegramHtmlBody()`, and the new
   registration-flow bodies from item 2) uniformly, per the handoff's
   stated intent. No new dependency needed — a regex-based allowlist
   strip is sufficient for a fixed 7-tag set and matches the "not a full
   HTML parser dependency" instruction.

4. **FR-NTF-004.md correction.** Pure documentation change, no code
   dependency. Confirmed the FR-CRM-002 precedent (re-read): FR-CRM-002
   was marked `status: Superseded` with a `## Superseded (date)` section
   at the top explaining the correction, original text preserved below
   for history, and a `superseded_by:` frontmatter field. FR-NTF-004 is
   a different case — it is not superseded/dropped, it is being
   **corrected while remaining live** (status should become
   `Implemented`/`Shipped`-equivalent once this workflow ships, not
   `Superseded`). The closer precedent is actually **ADR-0033's pattern
   of an inline correction note** (see the "2026-07-31 update" callout
   at the top of ADR-0034 itself, correcting its own Coolify deploy-target
   claim in place) — a dated correction block, not a full supersession.
   Recommend: keep `status:` progressing normally
   (Planned → Implemented on this workflow's completion), add a dated
   correction note at the top of the Description, and rewrite
   §Functional scope items 1, 2, 5, 6 + AC-6 + Notes to match reality.

#### Finding A — `allowedChannels` is NOT a fan-out list; it's "pick channel [0] for this whole dispatch call" (blocks item 2 as literally described)

This is the one thing in the handoff's framing that does not survive
contact with the actual dispatcher code, and needs correcting before
CodeDeveloper builds against it.

`InteractionsService.dispatch()` (interactions.service.ts L66–83) calls
`pickPrimaryChannel(input.allowedChannels)` **once per `dispatch()` call**
(L72), which returns `allowedChannels[0]` (L210–216) and uses that single
channel for **every recipient** in that dispatch's audience — there is no
per-recipient channel selection and no fan-out to multiple channels within
one `dispatch()` invocation. `fallbackChain` exists in the type
(`interactions.types.ts` L61) but is explicitly documented as deferred
("primary-channel only for now; chain runs in 5.5/5").

Concretely: if the 3 Directus flow ops are changed to
`"allowedChannels": ["email", "telegram"]` as the handoff text describes
("change allowedChannels to include 'telegram' (multi-channel dispatch —
both email AND telegram...)"), the *actual* runtime effect is that
`pickPrimaryChannel` returns `"email"` (index 0) and **every** recipient
in that dispatch — including telegram-linked, opted-in members — gets
email only. Telegram-linked members get nothing extra; the bug the FR
is trying to close would remain closed on paper but not in practice.

The only pattern in this codebase that actually achieves "both email AND
telegram" is the one `event-reminders.service.ts` already uses
(`processCandidate`, L190–219): route recipients into disjoint per-channel
ID lists (`tgIds`, `emailIds`) **before** calling `dispatch()`, then call
`dispatch()` **twice** — once per channel, each with `allowedChannels:
[channel]` (single-element) and a payload built for that channel
(`buildReminderPayload(event, kind, channel)`). This produces two
`interactionId`s per event/kind (documented tradeoff at L211–218), which
is accepted precedent, not a smell.

**This does not change the item's scope** — "registration-confirmed /
waitlisted / promoted reach Telegram" is still buildable and still the
right target. It changes *how*: the fix must call
`/v1/internal/interactions/dispatch` (or the equivalent internal call)
**per eligible channel per recipient class**, not pass a two-element
`allowedChannels` array to a single call. Two structurally sound options,
either acceptable, CodeDeveloper's call:

- **(a) Directus-flow-side split** — the 3 flow ops fire the request
  against the single registering/promoted user, so there's exactly one
  recipient per event; the flow op can check `telegram_user_id` /
  `telegram_opted_out_at` itself (needs a preceding `item-read` op
  against `directus_users`, mirroring the existing `capacity_user_lookup`
  pattern) and conditionally fire a **second** POST to
  `/v1/internal/interactions/dispatch` with `allowedChannels: ["telegram"]`
  and a Telegram-shaped payload, alongside the existing (unconditional)
  `allowedChannels: ["email"]` POST. Mirrors the existing lookup-op
  wiring pattern already in `flows-bootstrap.sh` (`capacity_user_lookup`,
  `promo_user_lookup`) — no new NestJS surface required, all 3 ops are
  single-recipient so there's no batch-eligibility problem.
- **(b) NestJS-side split** — introduce a small internal helper (e.g. in
  `interactions.service.ts` or a thin wrapper the internal controller
  calls) that, given a single `userId` + a template pair (email template
  name/data, telegram text/buttons), resolves the recipient once, then
  issues the email dispatch unconditionally and the telegram dispatch
  only if `telegramUserId` is set and not opted out — pushing the
  channel-eligibility branching into TypeScript instead of Directus flow
  JS. This centralizes the "email + optionally telegram" pattern for
  reuse beyond these 3 call sites, at the cost of a new endpoint/branch
  the Directus flows would need to call instead of hitting
  `/v1/internal/interactions/dispatch` directly.

Recommend (a) as the lower-risk default: it's the smaller diff, follows
an already-proven pattern in the same file, and doesn't touch NestJS's
public internal-API surface. Not mandating it — CodeDeveloper should pick
based on actual diff size once in the file, but whichever is chosen, the
AC below is written against the **observable outcome** (a telegram
delivery row exists for eligible recipients), not the mechanism, so
either implementation satisfies it.

### Boundary this workflow can and cannot verify (stated up front, not overclaimed)

Per the handoff's explicit instruction: `TelegramAdapter.send()` returns
`state: 'sent'` once the envelope is **durably written to the Postgres
outbox** (confirmed: telegram-adapter.ts L14–21 docstring, "sent" ≠
Telegram delivery). The outbox → Redis Streams relay and the Python
notifier that actually calls Telegram's `sendMessage` are separate,
already-shipped (relay) / not-fully-built (notifier `sendMessage` logic)
processes outside this workflow's diff. **This workflow's acceptance
criteria are therefore written against outbox/envelope state, never
against "a Telegram DM arrives on a phone."** End-to-end delivery proof
is out of reach for a NestJS-only PR and is not claimed.

## Formalized Requirement

**FEAT-NTF-004** (reuses the existing `FR-NTF-004` code — this is a
correction + gap-fill of an existing Planned requirement, not a new
feature number, per the Orchestrator's own framing of this workflow as
"implement GitHub issue #142 (FR-NTF-004)").

> The already-shipped `TelegramAdapter` (ADR-0034) gains: (1) faithful
> passthrough of `inline_buttons` from adapter input to the
> `tg.dispatch.v1` envelope; (2) a small Telegram-safe-HTML allowlist
> sanitizer applied to all outbound `text` before the envelope is built;
> and (3) Telegram-channel dispatch (HTML body + "Open event page" inline
> button) added to the registration-confirmed, registration-waitlisted,
> and registration-promoted-from-waitlist notification flows, alongside
> (not replacing) their existing email dispatch, gated on the recipient's
> `directus_users.telegram_user_id` being set and `telegram_opted_out_at`
> being null — exactly the eligibility check `InteractionsService`
> already performs for other Telegram sends. `FR-NTF-004.md`'s
> architecture description is corrected to match the shipped
> outbox → Streams → notifier design (ADR-0034) in the same pass.

Cross-refs: `FR-NTF-001` (dispatcher this extends), `ADR-0034` (shipped
architecture, authoritative), `FR-CRM-002`/`ADR-0033` (doc-correction
precedent), `FR-AUTH-005` (explicitly NOT used — still Planned).

Module: **NTF** (Notifications) — matches `requirements-registry.md`
§Module Abbrev table row `Notifications | NTF`.

## Acceptance Criteria (draft)

Written against outbox/envelope state per the stated verification
boundary above — not against confirmed Telegram delivery, which this
workflow's own diff cannot prove.

- **AC-1 (inline_buttons passthrough).**
  *Given* a caller invokes `TelegramAdapter.send()` with a payload
  containing a non-empty `inline_buttons` array (shape:
  `[[{ text, url }]]`),
  *when* the adapter builds the `tg.dispatch.v1` envelope,
  *then* the envelope's `payload.template.inline_buttons` field equals
  the caller-supplied array (not `null`), and the envelope is durably
  written to the outbox (`state: 'sent'` returned).

- **AC-2 (inline_buttons omitted stays backward-compatible).**
  *Given* a caller invokes `TelegramAdapter.send()` with no
  `inline_buttons` field in the payload (existing callers, e.g. any
  payload shape predating this change),
  *when* the adapter builds the envelope,
  *then* `payload.template.inline_buttons` is `null` (unchanged default)
  and the send still succeeds — no existing caller's behavior regresses.

- **AC-3 (Telegram-safe HTML sanitizer strips unsupported tags).**
  *Given* a `text` payload containing tags outside the allowlist
  (`<b> <i> <u> <s> <a> <code> <pre>` per FR-NTF-004 §3 — e.g. `<script>`,
  `<div>`, `<img>`),
  *when* `TelegramAdapter.send()` processes the payload (any caller, not
  only the 2 touched in AC-1/AC-5),
  *then* the envelope's `payload.template.text` contains only allowlisted
  tags; disallowed tags are stripped (not escaped-and-shown, not
  rejected/failed) and the remaining allowlisted tags' content is
  preserved.

- **AC-4 (sanitizer preserves allowlisted tags + existing reminder body unaffected).**
  *Given* the existing `event-reminders.service.ts` `telegramHtmlBody()`
  output (`<b>...</b>` wrapped title, already HTML-escaped via its own
  `escapeHtml()`),
  *when* it passes through the new sanitizer,
  *then* the output is byte-identical to the input — no regression to the
  already-shipped reminder feature.

- **AC-5 (registration-confirmed reaches Telegram).**
  *Given* a member with `telegram_user_id` set and `telegram_opted_out_at`
  null registers for an event (capacity available),
  *when* the `capacity_email_confirmed` Directus flow op fires,
  *then*, in addition to the existing email delivery row, a
  `interaction_deliveries` row with `channel='telegram'` and
  `state='sent'` exists for that user for this registration event, and
  the corresponding outbox envelope's `payload.template.inline_buttons`
  contains one button labeled "Open event page" (or the FR's exact
  wording) linking to the event detail page.

- **AC-6 (registration-waitlisted reaches Telegram).**
  Same as AC-5, triggered via the `capacity_email_waitlisted` op when a
  registration is created over capacity, with waitlist-appropriate body
  text (no "Open event page" button requirement unless FR text specifies
  one for waitlist — confirm against corrected FR-NTF-004.md wording
  during implementation; email-parity template `registration-waitlisted`
  has no button today, so match that unless directed otherwise).

- **AC-7 (registration-promoted-from-waitlist reaches Telegram).**
  Same as AC-5, triggered via the `promo_email_promoted` op, with an
  "Open event page" inline button (matches FR-NTF-004's stated AC:
  *"Promotion from waitlist: `[Open event page]`"*).

- **AC-8 (Telegram-ineligible recipients still get email; no failure).**
  *Given* a member with `telegram_user_id` null (never linked) OR
  `telegram_opted_out_at` set, registers/waitlists/is promoted,
  *when* the corresponding Directus flow op fires,
  *then* the email delivery proceeds exactly as today (unchanged), and no
  `interaction_deliveries` row with `channel='telegram'` is created for
  that user for this event — the Telegram branch is skipped, not
  attempted-and-failed.

- **AC-9 (email channel is unaffected / no regression).**
  *Given* any of the 3 registration flows fires (regardless of Telegram
  eligibility),
  *when* the flow completes,
  *then* the email delivery row and its content are unchanged from
  current production behavior — this workflow is additive to email, never
  a replacement or a fallback-chain reordering (per
  `interactions.types.ts`'s documented Phase deferral of fallback chains,
  which stays deferred here).

- **AC-10 (FR-NTF-004.md corrected, not silently left stale).**
  *Given* this workflow's DocWriter step,
  *when* `FR-NTF-004.md` is reviewed,
  *then* §Functional scope items 1, 2, 5, 6, the AC-6-equivalent
  acceptance criterion, and §Notes no longer describe Authentik
  `attributes.telegram_id`, BullMQ, direct-NestJS-to-Telegram-API calls,
  or a `notifications_sent` table — they describe the outbox → Redis
  Streams (`tg.dispatch.v1`) → Python notifier design per ADR-0034, with
  an explicit, honest note that the notifier's own `sendMessage`/rate-limit
  implementation is a separately-scoped, not-yet-fully-built piece (not
  silently invented as "done" by this workflow).

## Business Process Linkage

`docs/02-business-processes/uat/registry.md` / `BP-UAT-010.md`
(Event registration flow) re-read in full.

**Decision: do NOT link `BP-UAT-010`.** Reasoning:

BP-UAT-010's own AC-3 does cover notification *dispatch* for
registration — *"A confirmation email/notification is dispatched for the
registration (verified via the local mail-catcher if running)"* — but its
Steps section (Step 003, the only step touching AC-3) and its Notes
section make clear the verification method is checking for **an email**
in the local mail-catcher (Mailpit, `localhost:8025`); there is no step,
fixture, or AC anywhere in the file that inspects Telegram delivery,
inline-button content, or HTML-tag sanitization — none of the 3 seed
fixtures include a `telegram_user_id`-linked member. This workflow's
surface (Telegram-channel content + button passthrough + sanitizer) is
genuinely outside what BP-UAT-010 as documented exercises; forcing the
link would mean claiming post-merge UAT re-verification confirmed
something it structurally cannot observe.

This is not a "no BP-UAT owns this at all" situation — it is a real,
named gap: registration confirmation now has a Telegram-content surface
with zero UAT coverage. Recommend (not building here, out of scope for
this workflow, flagging per protocol.md's "note the gap rather than
guessing a code" instruction): a follow-up could either (a) extend
BP-UAT-010 with a Telegram-linked seed fixture + a Directus-side
assertion on the `interaction_deliveries`/outbox row (since Playwright
can't observe actual Telegram delivery any more than this workflow's own
code can), or (b) file a small dedicated BP-UAT for Telegram notification
content once the notifier's `sendMessage` piece exists and Telegram
delivery becomes genuinely observable end-to-end. Neither is built as
part of this workflow. `handoff.yaml.business_process` should be set to
`[]` (empty — no link), not `BP-UAT-010`.

## GitHub Sync

Ran as the last action per instructions:

```
scripts/sync-github-project.sh --ref FR-NTF-004 --status todo \
  --title "Telegram notification channel adapter" \
  --body-file <tmp>/FR-NTF-004-body.md
```

Result: see command output below (run after this file was drafted).
Idempotent/best-effort per protocol.md — a failure here does not change
this gate's status.

## Gate Result

gate_result:
  status: passed
  summary: "FR-NTF-004's 4-item gap-fill scope is architecturally feasible against shipped ADR-0034; one real gap found and resolved (Finding A: allowedChannels does not fan out — item 2 needs a per-channel dispatch split, options given) before CodeDeveloper starts."
  findings:
    - "Confirmed FR-NTF-004.md's current text conflicts with ADR-0034 and shipped code on: lookup path (Authentik vs directus_users), rate limiting (BullMQ vs Streams), eligibility field (notification_telegram_enabled vs telegram_opted_out_at), AC-6 (bot-service-not-involved claim is false — the separate notifier process is involved), and the FR-AUTH-005 dependency (wrong field). Correction required, not optional (item 4 / AC-10)."
    - "Finding A (new, not previously flagged): InteractionsService.pickPrimaryChannel() takes allowedChannels[0] only — it does NOT fan out to multiple channels in one dispatch() call. Passing allowedChannels: ['email','telegram'] as the handoff text literally describes would silently route telegram-eligible recipients to email only. Item 2 must instead issue two separate dispatch calls (one per channel), gated per-recipient on telegram eligibility — mirrors the proven event-reminders.service.ts pattern. Two implementation options given (Directus-flow-side vs NestJS-side split); AC-5/6/7 are written against observable outcome so either satisfies them."
    - "inline_buttons bug (item 1) independently confirmed live in production today: event-reminders.service.ts buildReminderPayload() has been constructing inline_buttons since it shipped, and telegram-adapter.ts has been silently dropping them the whole time. Not a hypothetical — AC-1/AC-2 cover it directly."
    - "BP-UAT-010 reviewed in full; deliberately NOT linked (business_process: []) — its AC-3/Step-003/Notes scope is 'an email arrived in the mail-catcher,' with no fixture, step, or assertion touching Telegram content, buttons, or sanitization. Forcing the link would overclaim post-merge UAT coverage. Named the resulting coverage gap as a candidate follow-up (not built here)."
    - "Verification boundary honored: all draft ACs (AC-1 through AC-9) assert outbox/interaction_deliveries/envelope state, never 'a Telegram DM arrived on a phone' — the notifier's real sendMessage path is out of this workflow's reach per the handoff's own scoping."
