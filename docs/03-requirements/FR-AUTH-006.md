---
code: FR-AUTH-006
name: Temporary account upgrade (Telegram-only → full member)
status: Planned
module: Auth (AUTH)
phase: Roadmap Sprint 6
---

## Description

A member who signed up via the Telegram bot has a "temporary" account: they can register for events but cannot appear on the leaderboard or edit their profile. When they verify an email address, the account is upgraded to a full member account, gamification unlocks, and past attended events retroactively award points.

## Users

Members with `is_temporary=true` accounts (Telegram-only sign-up).

## Functional scope

1. **Temp account state** — Authentik users created via bot `/start` have `attributes.is_temporary=true`. These users can register for events but are excluded from leaderboard and public profiles.
2. **Upgrade prompt** — Bot prompts the user to upgrade at the first "earn-points" moment (e.g., event attended). Message: "To collect points and join the leaderboard, share your email — we'll send a verification link. Type /upgrade."
3. **Upgrade command** — `/upgrade` in bot → bot calls `POST /v1/internal/telegram/upgrade-temp` with `{ telegram_id }` → API triggers Authentik Email stage → user receives magic link.
4. **Email verification** — User clicks magic link → Authentik Email stage verifies → API hook fires to: (a) set `is_temporary=false`, (b) set the real email on the Authentik user (replaces `tg<id>@telegram.local`), (c) trigger retroactive points backfill.
5. **Retroactive points backfill** — On upgrade, `GamificationService` queries all `registrations` where `status=checked_in` for this user and awards points for each as if they were just earned now.
6. **CRM sync** — On upgrade, the Twenty contact is updated to replace the synthetic email with the real one and remove the `temp_telegram` tag.

## Acceptance criteria

- [ ] A temp user who types `/upgrade` in the bot receives a magic-link email at the address they provide.
- [ ] Completing the magic-link flow sets `is_temporary=false` on the Authentik user.
- [ ] After upgrade, the user's points from past attended events appear on the leaderboard.
- [ ] After upgrade, the user can edit their profile on the web.
- [ ] After upgrade, the user appears on the per-country leaderboard.
- [ ] The synthetic email `tg<id>@telegram.local` is replaced with the real email in Authentik and Directus.
- [ ] A user who attempts `/upgrade` with an email already used by another account receives an error instructing them to use a different email or sign in with that email and link Telegram (FR-AUTH-005).

## Notes

- Depends on FR-AUTH-004 (magic-link) for the email verification step.
- Depends on FR-GAM-001 (points) for the retroactive backfill.
- The synthetic email `tg<id>@telegram.local` is a workaround for Authentik's unique-email constraint. The replace must be atomic to avoid constraint violations.
