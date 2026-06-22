# Telegram outbox → notifier delivery contract

**Status:** Active · **Owner:** platform/api · **Related:** [ADR-0034](../../adr/0034-telegram-bot-and-sender.md), [#468](https://github.com/viktordrukker/aiqadam/issues/468)

This document is the authoritative answer to the two delivery-integrity questions
raised by the bot self-service audit ([#468](https://github.com/viktordrukker/aiqadam/issues/468)).
It exists so neither side has to re-derive the contract from code.

## The two delivery stages

There are **two independent hops**, and "at-least-once" applies to the first one only:

```
 (A) producer writes envelope ─┐
     in the SAME Postgres tx    │   outbox-relay.service.ts            notifier (bot repo)
     as the state change        ▼   (poll 500ms, FOR UPDATE SKIP       streams.py / main.py
  ┌──────────────┐   publish  ┌─────────┐  XADD   ┌───────────────┐  XREADGROUP  ┌──────────┐
  │ outbox table │──────────▶ │  relay  │────────▶│ Redis Stream  │────────────▶ │ notifier │──▶ Telegram
  └──────────────┘            └─────────┘         │ tg.dispatch.v1│              └──────────┘
        stage A: at-least-once to the Stream            └───────────────┘     stage B: at-least-once to Telegram
```

- **Stage A (platform):** `OutboxRelayService` SELECTs unpublished `outbox` rows, `XADD`s
  each to `tg.dispatch.v1`, then sets `published_at`. On `XADD` failure the row stays
  unpublished (`attempts++`, `last_error` set) and is retried next tick. This is the
  transactional-outbox guarantee: **at-least-once delivery to the Stream.**
- **Stage B (bot):** the notifier consumes the Stream via a consumer group, sends the
  Telegram message, and audits via `POST /v1/telegram/audit`. At-least-once delivery to
  Telegram is **the consumer's responsibility** (Redis Streams `XPENDING`/`XAUTOCLAIM`),
  not the platform's.

## Q1 — Does the outbox relay re-drive un-acked / failed dispatches? **No.**

`OutboxRelayService` ([`outbox-relay.service.ts`](../../../apps/api/src/modules/telegram/outbox-relay.service.ts))
operates **only on stage A**. Once a row is `published_at` (successfully `XADD`ed), the
relay never touches it again. The relay has **zero knowledge of Telegram delivery
outcomes** — it does not read the Stream, the consumer group, the PEL, or `tg_send_log`.

Therefore the comment in the bot's `notifier/main.py` retry branch —
*"the AI Qadam side re-emits on its own schedule via the outbox relay"* — is **incorrect**.
Nothing on the platform re-emits a stream entry the notifier has already consumed. If the
notifier `XACK`s a retry-exhausted entry, **that reminder is permanently lost.**

**Required bot-side change (the "no" branch of #468):** on `outcome == "retry"`, do **not**
`XACK`. Leave the entry pending so `XAUTOCLAIM` (or `XPENDING` + `XCLAIM`) re-delivers it to
a live consumer. Bound it with the envelope's `max_retries` and `expires_at`; on terminal
exhaustion, route to a DLQ rather than silently `XACK`-and-drop.

> The only relay-induced duplicate is the rare "`XADD` succeeded but the `published_at`
> `UPDATE` rolled back" case: next tick re-`XADD`s the **same** envelope (identical
> `envelope.id` **and** `delivery_key`, new stream-entry id). Both dedupe keys catch it.

## Q2 — Is `delivery_key` stable across re-emits? **Yes for the relay; per-producer for producers.**

- **Across relay re-emits:** the relay re-`XADD`s the stored payload **verbatim**, so both
  `envelope.id` and `delivery_key` are preserved. **The relay never mints a fresh
  `envelope.id`.** So a "fresh envelope id for the same logical message" can only come from
  a **producer** re-emit, never the relay.
- **Across producer re-emits**, `delivery_key` stability is per-producer:

  | Producer | `delivery_key` | Stable across producer re-emit? |
  |---|---|---|
  | Broadcasts (`tg-broadcasts-sender.service.ts`) | `bdc:<broadcast_id>:<tg_user_id>` | ✅ yes (semantic) |
  | Registration-confirmed (`telegram-registrations.service.ts`) | `regconf:<registration_id>` | ✅ yes (semantic) — **since #468** |
  | Interactions adapter (`interactions/channels/telegram-adapter.ts`) | `= envelope.id` (fresh UUID) | ❌ no — **tracked follow-up** |

**Conclusion: it is safe for the notifier to dedupe on `delivery_key`.** It is always at
least as unique as `envelope.id`, and for the broadcast + registration-confirmed producers
it is *strictly better* — it collapses a producer re-emit (the case `envelope.id` dedupe
misses) into a single send.

The one remaining `= envelope.id` producer is the generic interactions adapter, because a
stable key there needs the `interaction_id` plumbed into `ChannelAdapter.send()` (it isn't
in that signature today). Until that lands, deduping on `delivery_key` for interactions is
**no worse** than the current `envelope.id` dedupe. Tracked as a follow-up on #468.

## What changed in this PR (platform side of #468)

- Registration-confirmed `delivery_key` is now `regconf:<registration_id>` (was the
  envelope id), making it stable + semantic — so the notifier's `delivery_key` dedupe
  protects it against a future confirmation-backfill cron re-emit.
- This document, answering Q1/Q2 so the bot team can land the dedupe + ACK fixes.

## Required bot-side changes (so #468 can close)

1. Switch the pre-send dedupe from `str(envelope.id)` to `payload.delivery_key`
   (`notifier/main.py` / `streams.py`).
2. Stop `XACK`-ing on `outcome == "retry"`; rely on `XAUTOCLAIM` for redelivery, bounded by
   `max_retries` / `expires_at`, with a DLQ on terminal exhaustion.
3. Add the end-to-end smoke: one envelope → exactly one Telegram arrival + one
   `tg_send_log` row; a forced-fail entry is recovered, not lost.
