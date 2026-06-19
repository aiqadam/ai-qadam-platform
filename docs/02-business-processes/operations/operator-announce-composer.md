# Runbook: Operator announce composer (`/workspace/announce`)

**Audience:** country leads, super-admins, board members.
**Pre-reading:** [ADR-0033](../../adr/0033-community-member-graph.md), [interaction-architecture.md](../../04-development/architecture/interaction-architecture.md), [operator-cohort-builder.md](operator-cohort-builder.md).
**Ships:** F-S3.3 cabinet #2.

## What this cabinet does

Operator picks a saved cohort → writes subject + body → previews → sends. Backend resolves the cohort's `filter_query` to user IDs and hands off to `InteractionsService.dispatch` — same dispatcher every other notification flows through (registration confirmations, post-event CSAT, lead nurture, etc.).

The dispatcher runs per-recipient consent checks. Recipients without matching consent are silently skipped (counted as `skipped_consent` in the result). The operator sees the breakdown after send.

## Consent basis — pick correctly

| Basis | When to use | Recipient filter |
|---|---|---|
| `explicit_opt_in` (default) | Newsletters, event invites, sponsor-funded content, anything marketing-flavoured | Only members who toggled the matching `member_consents` row (purpose = events / marketing / content / etc.). Mismatched → skipped silently. |
| `operational_contract` | Service-level messages: "you're registered for event X", "your check-in code is Y" | Only existing members in active state. NOT for marketing. Misuse here = GDPR risk + spam complaints. |

**Default is `explicit_opt_in`** — the UI starts there so a misclick toward "operational" requires intent.

## Audience cap

Hard cap: **5000 recipients per dispatch** (`MembersService.MAX_DISPATCH_AUDIENCE`). If a cohort resolves to more, the dispatch is truncated and the response includes `truncated: true`. To handle larger cohorts:

1. Refine the cohort filter (add country/seniority/etc.)
2. Or split into two cohorts manually
3. Or open an issue to lift the cap once we have backpressure on Resend (current Resend tier rate-limits at 100/sec; cap matches a comfortable 60-sec window)

## Compose body — what works

Body is operator-typed text with **blank-line paragraph breaks**. The dispatcher's email adapter renders:

- Plain text version (as typed, with footer)
- HTML version (escaped + paragraph-wrapped, with inline styles + unsubscribe link)

Rich markdown (links, lists, headings) is **deferred to v1.1**. Today, write plainly. Mention URLs in plain text and let email clients auto-link them.

**Subject line** rules (per [marketing playbook §13](../marketing-and-pr-playbook.md)):
- 0–1 emoji max
- No urgency words ("LAST CHANCE!"); facts instead ("Spots fill in 48h")
- Per-city personalisation works at the cohort level (split UZ / KZ / TJ cohorts; address each by city in the subject)

## Send flow (UI)

1. Pick cohort from dropdown (member count shown inline)
2. Write subject + body
3. Pick consent basis
4. Click **Preview** — reads `current_member_count` + renders the text version
5. Click **Send** — confirmation dialog with recipient count; on accept, fires `POST /v1/workspace/announce`
6. After send: breakdown panel (sent / skipped_consent / failed / other) + `interactionId` for cross-reference in the audit log

## Triaging a failed send

When `failed` count is non-zero:

1. Open the `interactions` collection in Directus admin (engineer-only per [operators-never-touch-Directus-admin](../../.claude/projects/-home-drukker-aiqadam/memory/feedback_operators_never_touch_directus_admin.md)) — filter by `interactionId`
2. Open the `interaction_deliveries` rows for that interaction
3. `failure_reason` column shows the email adapter's error (SMTP timeout, bounced address, etc.)
4. Common causes:
   - Member email is invalid → run `directus_users.email_verified=false` for those rows and re-prompt verification
   - Resend rate-limited → wait + retry the cohort (idempotency NOT yet in place — Phase ζ work)
   - Member explicitly unsubscribed (covered by `skipped_consent`, not `failed`)

## What this cabinet does NOT do (yet)

- **Scheduling.** Sends fire immediately. Scheduled-send is a Phase ζ.5 feature (uses the existing `scheduledFor` field on dispatch input).
- **A/B testing.** Two subject-line variants on the same cohort = Sprint 5.8 marketing dashboard work.
- **Per-recipient personalization beyond {city} via cohort split.** First-name interpolation requires template variables — deferred until we have a clear UX for variable insertion.
- **Drafts.** Refresh the page = lose your draft. Persistent drafts ship in v1.1.
- **Re-send to skipped_consent recipients.** They were skipped on purpose. Asking them to opt in again is a separate (re-engagement) campaign.

## What audit trail leaves behind

After every send:

- 1 row in `interactions` (intent=`operator_announcement`, created_by=operator user id)
- N rows in `interaction_deliveries` (one per recipient, with final state)
- Plausible ops-event (TODO when S0.4 ops-events helper is wired into this path)
- Future: `audit_events` row per cohort read (S2.5 — currently a TODO marker in the code)

## Adding a new channel later

This cabinet currently sends only email. To extend to Telegram (Phase ζ.5):

1. Build the Telegram channel adapter (`apps/api/src/modules/interactions/channels/telegram-adapter.ts`)
2. Add `'telegram'` to the `allowedChannels` array in `announce.service.ts`'s `send()`
3. UI: add a channel picker to the composer (today it's email-only, hardcoded)

No schema changes needed — the dispatcher already supports a channel array.
