---
code: FR-NTF-004
name: Telegram notification channel adapter
status: Implemented
module: Notifications (NTF)
phase: Roadmap Sprint 6
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/142
business_process: —
---

## Description

The notification dispatcher (FR-NTF-001) gains a Telegram channel adapter. This enables all transactional notifications — registration confirmation, reminders, promotions, event announcements — to be delivered as Telegram DMs in addition to email. The NestJS API sends directly to the Telegram Bot API; the bot service handles only inbound commands.

> **2026-08-03 correction (wf-20260803-feat-197):** the functional-scope
> text above and below (unchanged since this FR was originally written)
> describes an architecture that predates [ADR-0034](../adr/0034-telegram-bot-and-sender.md)
> (Accepted, 2026-07-31) and was never reconciled with it — same
> disposition class as [FR-CRM-002](FR-CRM-002.md)'s correction against
> ADR-0033, except this FR is being genuinely shipped, not dropped. No
> FR-NTF-004 code existed before this correction; the text below was
> corrected to match the real, already-shipped design **before** this
> workflow wrote anything, so nothing was ever built against the stale
> description. Three concrete mismatches, now fixed in place (§Functional
> scope items 1, 2, 5–7, AC-6, and §Notes): (a) the NestJS API does
> **not** call the Telegram Bot API directly — `TelegramAdapter` writes a
> `tg.dispatch.v1` envelope to a Postgres outbox; a relay `XADD`s it to
> Redis Streams; a separate Python **notifier** process (the `apps/bot`
> submodule) is the only thing that calls `sendMessage`; (b) eligibility
> is gated on `directus_users.telegram_user_id` / `telegram_opted_out_at`,
> never an Authentik `attributes.telegram_id` field, which does not exist
> anywhere in the codebase; (c) rate limiting is the notifier's own
> concern, not "the existing BullMQ outbox/dispatcher rate limiter" — per
> ADR-0034's Risks table, "BullMQ stays for internal NestJS jobs; Streams
> is for cross-language / cross-service." This workflow
> (`wf-20260803-feat-197`) both corrects this text and gap-fills the real,
> shipped `TelegramAdapter` (inline-button passthrough, a Telegram-safe-HTML
> sanitizer, and Telegram dispatch for the three registration flows) — see
> the implementation note at the end of §Notes for where the code lives.

## Users

Members with linked Telegram accounts (`directus_users.telegram_user_id` set) who have not opted out (`telegram_opted_out_at` is null).

## Functional scope

1. **Channel adapter** — `TelegramAdapter` (`apps/api/src/modules/interactions/channels/telegram-adapter.ts`), an `InteractionsService`/`ChannelAdapter` implementation. Lookup path: `userId → directus_users.telegram_user_id → tg.dispatch.v1 envelope → Postgres outbox → Redis Streams → Python notifier → Telegram Bot API sendMessage`. The adapter's own `send()` returns `state: 'sent'` once the envelope is durably written to the outbox — that is the boundary this FR's own code can observe and verify; delivery beyond the outbox is the notifier's concern (see Notes).
2. **Eligibility check** — Before dispatching: the recipient must have `directus_users.telegram_user_id` set AND `telegram_opted_out_at` must be null (opt-out, not opt-in — presence of the ID plus absence of the opt-out timestamp is "eligible"). `InteractionsService.resolveRecipients()` performs this check for every Telegram-bound recipient; when ineligible, the Telegram branch is skipped cleanly (no delivery row, no error) while other channels (e.g. email) proceed unaffected.
3. **Message rendering** — Templates rendered as Telegram-safe HTML subset: `<b>`, `<i>`, `<u>`, `<s>`, `<a>`, `<code>`, `<pre>`. Unsupported tags are stripped (not escaped-and-shown, not rejected) by `sanitizeTelegramHtml()`, applied inside `TelegramAdapter.send()` before the envelope is built, so every caller gets the guarantee uniformly.
4. **Inline buttons** — Key notification types include an inline keyboard button:
   - Registration confirmed: `[Open event page]`
   - Reminder: `[View event]`, `[Check in]` (on event day)
   - Promotion from waitlist: `[Open event page]`
   - Registration waitlisted: no button (mirrors the buttonless waitlisted email template).
5. **Rate limiting** — Respect Telegram Bot API's rate limit (30 messages/second globally). Per [ADR-0034](../adr/0034-telegram-bot-and-sender.md) §Q2/Q6, this is owned entirely by the separate Python **notifier** process that consumes `tg.dispatch.v1` off Redis Streams and is the only process that calls `sendMessage` — not a NestJS-side BullMQ limiter. NestJS's own responsibility ends at durably writing the envelope to the outbox.
6. **Failure handling** — If the Telegram API returns an error (user blocked the bot, chat not found), the notifier records the failure; on the NestJS side, a Telegram delivery attempt is tracked as an `interaction_deliveries` row (channel `telegram`) alongside `tg_send_log`, and a Telegram-side failure never blocks or reorders the email channel's own delivery (additive dispatch, not a fallback chain — `interactions.types.ts`'s documented Phase deferral of fallback chains stays deferred).
7. **Audit** — Every Telegram send is recorded via the existing `interaction_deliveries` collection (one row per channel per notification event) plus `tg_send_log` (the notifier's own idempotent send-log, keyed on `delivery_key`, per ADR-0034). There is no separate `notifications_sent` table for Telegram — `interaction_deliveries` + `tg_send_log` already serve this purpose and are the audit trail this FR relies on.

## Acceptance criteria

- [x] A member with `directus_users.telegram_user_id` set and `telegram_opted_out_at` null receives a Telegram delivery (envelope durably written to the outbox, `interaction_deliveries` row with `channel='telegram', state='sent'`) for registration-confirmed, registration-waitlisted, and registration-promoted-from-waitlist notifications. Live-verified against a real local Directus + Postgres stack (`wf-20260803-feat-197`, `07-test-results.md` AC-5/AC-6/AC-7) — not verified against an actual phone receiving a Telegram DM, which is outside the NestJS side's observable boundary (see Notes).
- [x] A member with `telegram_user_id` null (never linked) or `telegram_opted_out_at` set does not receive a Telegram delivery attempt — the Telegram branch is skipped cleanly (zero `interaction_deliveries`/outbox rows for that channel), and the email delivery proceeds unaffected. Live-verified (AC-8).
- [ ] A member who blocked the bot gets a failure recorded (notifier-side `tg_send_log` + audit) but the email channel is still sent. Not verifiable from this FR's NestJS-only diff — requires the notifier's own `sendMessage` failure-handling path, which is not yet fully built (see Notes).
- [x] Registration confirmation DM includes an "Open event page" inline button that deep-links to the event (`payload.template.inline_buttons`, single row/single button, live-verified).
- [ ] Sending 100 notifications does not exceed Telegram's 30/sec rate limit. Out of this FR's verifiable boundary — rate limiting is the notifier's own responsibility (Functional scope item 5) and the notifier's rate-limiting implementation is a separate, not-yet-fully-built piece (see Notes).
- [x] The bot's inbound long-polling process is not involved in outbound DM sending — but a separate Telegram-facing process **is** involved: the Python **notifier** (a distinct process from the inbound bot, per ADR-0034 §Q4's two-process split) is the only thing that calls `sendMessage`. The original wording of this AC ("the bot service is not involved... all outbound comes from the NestJS API directly") was false under the shipped design and has been corrected here.

## Notes

- Per [ADR-0034](../adr/0034-telegram-bot-and-sender.md) (Accepted 2026-07-31, authoritative): outbound Telegram delivery is `TelegramAdapter` (NestJS) → Postgres outbox → Redis Streams (`tg.dispatch.v1`) → Python **notifier** process → Telegram Bot API. The bot's own long-poll process (inbound-only: `/start`, `/events`, `/link`, registration FSM, QR check-in, `/stop`) never sends outbound DMs; the notifier is a second, separate process sharing the same bot token (ADR-0034 §Q4).
- **Not a dependency on FR-AUTH-005.** The original text here named FR-AUTH-005 (Authentik-agnostic Telegram account linking, still `status: Planned`) as a dependency for populating `telegram_id`. That was wrong on the field name: FR-AUTH-005 would populate an Authentik attribute that this FR never reads. This FR's eligibility check already works today against `directus_users.telegram_user_id` / `telegram_opted_out_at` — exactly as `InteractionsService.resolveRecipients()` already performs for every other Telegram-bound send — independent of FR-AUTH-005 ever shipping.
- **The Python notifier's own `sendMessage`/rate-limiting implementation is a separately-scoped, not-yet-fully-built piece.** This FR's NestJS-side code can verify only that a correctly-shaped envelope reaches the outbox durably (`state: 'sent'` from `TelegramAdapter.send()`); the outbox → Streams relay is already shipped, but the notifier's real `sendMessage` call, its rate-limit enforcement, and its failure/audit write-back are not yet fully built. Confirmed live (`wf-20260803-feat-197`) that the outbox-write path itself does not depend on Redis being healthy at write time — `TelegramAdapter.send()` is a pure Postgres transaction; only the separate, later relay step touches Redis.
- **Known limitation — accepted Phase 1 residual risk:** `sanitizeTelegramHtml()` is an allowlist tag-stripper by design, not an HTML escaper. A well-formed allowlisted-tag sequence (e.g. a literal `<a href="...">...</a>`) embedded inside an operator-authored event title will survive the sanitizer unchanged, because it is indistinguishable from a legitimately template-authored tag once it's inside the string being sanitized. This is judged an acceptable Phase 1 risk (per this workflow's security review) because event titles are exclusively operator-authored via `EventsController`'s `@UseGuards(AuthGuard)`-gated PATCH endpoint — no member- or anonymous-facing path can set a title — and the incremental capability over Telegram's own auto-linkification of a plain-text URL is narrow (anchor-text/URL mismatch only). **`patchEventSchema.title`'s new `"`/`\` character-class guard (added this workflow, to prevent a title from breaking the outer JSON structure of Directus-templated request bodies) is a related but distinct protection — it blocks quote and backslash characters, not arbitrary HTML tag syntax, so it does not close this sanitizer gap.** Both gaps are tracked here rather than fixed further, since a proper fix (a Liquid-template escaping helper) was explicitly out of scope for this workflow.
- **Known limitation — the new title guard covers the operator-edit path only.** `patchEventSchema.title`'s `"`/`\` guard (previous bullet) applies to `PATCH /v1/workspace/events/:id`, the one NestJS-side path that can set an event title. It does not cover a title set directly in Directus at event-creation time (Directus's own `events.title` schema field has no character-class restriction and is outside this workflow's scope), which remains unguarded against `"`/`\` breaking the outer JSON string of the Directus-templated request bodies. Accepted as a Phase 1 residual risk alongside the sanitizer gap above, per the security review's re-review.
- **Implementation note (what shipped, `wf-20260803-feat-197`):** `TelegramAdapter` (`apps/api/src/modules/interactions/channels/telegram-adapter.ts`) now passes `inline_buttons` through into the envelope (previously hardcoded `null`) and applies `sanitizeTelegramHtml()` (`telegram-html-sanitizer.ts`, new) to outbound text. The three registration Directus flows (`capacity_email_confirmed`, `capacity_email_waitlisted`, `promo_email_promoted` in `infrastructure/directus/flows-bootstrap.sh`) each gained a Telegram-branch sibling operation, gated on the recipient's `telegram_user_id`/`telegram_opted_out_at`, dispatched additionally alongside (never replacing) the existing email op. Full trace: `.copilot/tasks/active/wf-20260803-feat-197/03-code-summary.md`.
