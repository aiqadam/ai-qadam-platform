---
code: FR-AUTH-007
name: Identity surface — linked accounts management
status: Implemented
module: Auth (AUTH)
phase: Roadmap Sprint 8
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/143
business_process: [BP-UAT-003]
---

## Description

Members can view and manage all authentication methods linked to their account from `/me`: email/password, Google, GitHub, and Telegram. They can see which are linked, add new ones, and unlink ones they no longer want (as long as at least one sign-in method remains).

## Users

Members.

## Functional scope

1. **Linked accounts panel on `/me`** — Shows icons and statuses for: Email (verified/unverified), Google (linked/@email), GitHub (linked/@handle), Telegram (linked/@username). Each row has a "Link" or "Unlink" action.
2. **Link actions** — "Link Google" → initiates OAuth flow; "Link GitHub" → same; "Link Telegram" → see FR-AUTH-005; "Add email" → triggers FR-AUTH-004 magic-link to set email on Telegram-only account.
3. **Unlink protection** — Cannot unlink the last remaining authentication method. API returns `409 Conflict` with message "You must keep at least one sign-in method."
4. **Bot `/me` parity** — Bot `/me` command shows the same account state and offers a prompt to link Telegram if not already linked (deep-link to web `/me`).

## Acceptance criteria

- [x] `/me` shows all linked authentication methods with their current state (linked/unlinked). (web `LinkedAccountsPanel`, PR #260)
- [x] Initiating a link action follows the correct OAuth/magic-link flow for that provider. (web, PR #260)
- [x] Attempting to unlink the last method returns an error; all other methods are unlinkable. (409 guard, PR #260)
- [ ] After linking a new provider, the panel updates to show the new linked state on next load. Not independently live-verified — deferred to `wf-20260804-bp-uat-022-linked-accounts-uat` (queued).
- [x] Bot `/me` shows account type (temp/full) and linked providers summary. Account type shipped in FR-BOT-002 PR 3/6; Telegram link status (the one provider the bot's identity model can read) shipped in `wf-20260804-fix-210-bot-me-telegram-link-status`. Email/Google/GitHub link state is not surfaced on the bot — those providers have no Telegram-side identity signal to read from; only the web panel shows the full 4-provider summary, matching this FR's own Notes below.

## Notes

- This is primarily a UI surface; the underlying linking mechanisms are in FR-AUTH-002 through FR-AUTH-005.
- Authentik's admin API is used by the NestJS API to read/modify linked sources; the web never calls Authentik directly.
- Bot `/me`'s "linked providers summary" (AC-5) is scoped to Telegram only: the bot resolves the caller's identity via `TelegramAuthService`, which has no read path to the caller's Email/Google/GitHub link state (that lives in Authentik's admin API, called only by the NestJS API for the web panel). A full 4-provider summary on the bot would need a new API surface, out of scope here.
