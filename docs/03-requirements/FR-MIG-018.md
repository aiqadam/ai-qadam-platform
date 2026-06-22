---
code: FR-MIG-018
name: /me hub + /me/preferences + /me/access-log + /me/referrals
status: Not Started
module: Migration (MIG)
phase: Rebuild M3
---

## Description
The four member self-service pages grouped under `/me`. The hub page (`/me`) already exists in v1 as a redirect to `/me/profile`; v2 makes it a proper dashboard hub.

## Users
Signed-in members managing their own account.

## Functional scope
1. `pages/me/index.astro` (`/me` hub) — links to profile, preferences, access log, referrals; shows membership summary card.
2. `pages/me/preferences.astro` — email frequency select + per-topic opt-in toggles via `<ConsentList>`. PATCH `/v1/me/preferences`. GDPR-load-bearing.
3. `pages/me/access-log.astro` — table of recent auth events (sign-in, token refresh, sign-out) with timestamp + IP. Read-only.
4. `pages/me/referrals.astro` — member's referral code, copy button, attribution history table.
5. All pages: AuthGate (redirect to sign-in if anon).

## Acceptance criteria
- [ ] `/me` hub renders with correct membership summary.
- [ ] Saving preferences sends PATCH and persists on reload.
- [ ] Access log shows at least the current session's sign-in event.
- [ ] Referral code copy button writes to clipboard.
- [ ] All four pages redirect anon visitors to `/auth/sign-in?next=/me/...`.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/me.astro` + `me/preferences.astro` + `me/access-log.astro` + `me/referrals.astro`.
- Depends on: FR-MIG-017 (sign-in redirect target).
- `<ConsentList>` block already exists in web-next.
- Related: FR-USR-003, FR-USR-004, FR-USR-005, FR-USR-006.
