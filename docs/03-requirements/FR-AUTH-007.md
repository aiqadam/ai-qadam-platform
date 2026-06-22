---
code: FR-AUTH-007
name: Identity surface — linked accounts management
status: Planned
module: Auth (AUTH)
phase: Roadmap Sprint 8
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

- [ ] `/me` shows all linked authentication methods with their current state (linked/unlinked).
- [ ] Initiating a link action follows the correct OAuth/magic-link flow for that provider.
- [ ] Attempting to unlink the last method returns an error; all other methods are unlinkable.
- [ ] After linking a new provider, the panel updates to show the new linked state on next load.
- [ ] Bot `/me` shows account type (temp/full) and linked providers summary.

## Notes

- This is primarily a UI surface; the underlying linking mechanisms are in FR-AUTH-002 through FR-AUTH-005.
- Authentik's admin API is used by the NestJS API to read/modify linked sources; the web never calls Authentik directly.
