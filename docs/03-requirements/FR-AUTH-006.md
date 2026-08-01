---
code: FR-AUTH-006
name: Temporary account upgrade (Telegram-only → full member)
status: Implemented
module: Auth (AUTH)
phase: Roadmap Sprint 6
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/139
business_process: —
---

## Description

A member who signed up via the Telegram bot has a "temporary" account: they exist
only as an Authentik user (`attributes.is_temporary=true`) with no
`platform.users`/`directus_users` row, and so cannot register for events, appear
on the leaderboard, or edit their profile. When they verify an email address, the
account is upgraded to a full member account — their first `platform.users`/
`directus_users` rows are created at that moment — and gamification unlocks going
forward.

**Correction (RequirementAnalyst validation, wf-20260801-feat-181):** the original
wording above ("they can register for events but cannot appear on the leaderboard")
is inaccurate. Tracing the registration write paths
(`RegistrationsDirectusService.register`, `TelegramAuthService.registerViaTelegram`)
shows both require an existing `platform.users` row linked to a `directus_users`
row via `DirectusUsersBridgeService` — a row that is only ever created by
`AuthController.callback()` after a **completed OIDC session**, which a
Telegram-only temp user never has. So a temp user cannot register for events
*at all* today, not merely "can register but won't earn points." This also means
"past attended events retroactively award points" describes a state that cannot
exist yet (no `registrations`/`point_awards` rows can be created under a temp
identity) — see `01-requirement-validation.md` in this FR's workflow task
directory for the full trace. The corrected framing: retroactive backfill is not a
data-reconciliation operation: it is the (already-true-by-construction) fact that
once the upgrade creates the member's first `directus_users` row, points earned
from that point forward accrue and surface normally, with no `is_temporary`
special-casing anywhere in the registrations/points code.

## Users

Members with `is_temporary=true` accounts (Telegram-only sign-up).

## Functional scope

1. **Temp account state** — Authentik users created via bot `/start` have `attributes.is_temporary=true`. These users are Authentik-only (no `platform.users`/`directus_users` row) and so cannot register for events, appear on the leaderboard, or edit a profile — see Description's correction note above.
2. **Upgrade prompt** — Bot prompts the user to upgrade at the first "earn-points" moment (e.g., event attended). Message: "To collect points and join the leaderboard, share your email — we'll send a verification link. Type /upgrade." (Bot-side implementation ships in the future FR-BOT-002 PR 6/6, out of scope for this FR — this FR ships only the API surface that command will call.)
3. **Upgrade command** — `/upgrade` in bot → bot calls `POST /v1/internal/telegram/upgrade-temp` with `{ telegramId, email }` → API triggers Authentik Email stage, scoped to the CALLER'S existing temp Authentik user (found by `telegramId`), targeting the supplied `email` → user receives magic link. (Body shape resolved by RequirementAnalyst: `email` is part of this same call, not a separate step — see `01-requirement-validation.md` point 6.)
4. **Email verification** — User clicks magic link → Authentik Email stage verifies → `AuthController.callback()`'s upgrade branch fires to: (a) set `is_temporary=false`, (b) set the real email on the Authentik user (replaces `tg<id>@telegram.local`, same Authentik `pk` — never a second account), (c) create the member's first `platform.users`/`directus_users` rows via the existing `upsertByAuthentikSubject`/`ensureLinked` machinery, using the verified email — this is what "unlocks gamification," not a separate backfill write (see point 5).
5. **Points going forward (not retroactive backfill)** — There is no historical `point_awards` data to backfill: a temp user cannot have any `registrations`/`point_awards` rows before upgrading (see Description's correction). `PointsDirectusService.leaderboard()`/`totalForUser()` already key purely on `directus_users.id` with no `is_temporary` filter, so once the upgrade creates that row (step 4c), any FUTURE registration/check-in accrues and surfaces points with zero additional code. `GamificationService` referenced in the original wording of this item does not exist in this codebase (FR-GAM-001's spec text is stale relative to what shipped — the real mechanism is the `reg-checkin-points` Directus flow + `PointsDirectusService`).
6. **Directus member record sync** — Twenty CRM is retired (ADR-0033, Accepted 2026-05-20; "member relationship management lives in the graph"). There is no separate CRM sync step: the `directus_users` row created/patched in step 4c already carries the real, verified email in place of the synthetic placeholder — that IS the modern equivalent of the original "update the CRM contact" intent.

## Acceptance criteria

- [x] A temp user who types `/upgrade` in the bot receives a magic-link email at the address they provide. (Bot-side `/upgrade` command itself is FR-BOT-002 PR 6/6, not yet shipped — this AC is verified for the API surface the bot command will call: `POST /v1/internal/telegram/upgrade-temp` live-verified to deliver a real Mailpit email within ~1.4s of the call.)
- [x] Completing the magic-link flow sets `is_temporary=false` on the Authentik user.
- [x] After upgrade, the member's points earned from that point forward appear on the leaderboard and via `/me` totals — there is no pre-upgrade "past attended events" case to backfill (see Description's correction; revised from the original "past attended events retroactively award points" wording).
- [x] After upgrade, the user can edit their profile on the web.
- [x] After upgrade, the user appears on the per-country leaderboard (subject to the existing `appear_on_public_leaderboard` opt-out).
- [x] The synthetic email `tg<id>@telegram.local` is replaced with the real email in Authentik and Directus.
- [x] A user who attempts `/upgrade` with an email already used by another account receives a structured error (`email_already_in_use`) instructing them to use a different email. Does NOT reference Telegram-account-linking as an alternative — FR-AUTH-005 (that feature) is `status: Planned` and unimplemented; promising it as a working option would be inaccurate.
- [x] An expired or already-consumed upgrade-intent token falls through to ordinary sign-in behavior (no `is_temporary` mutation) rather than erroring — see `01-requirement-validation.md` AC-8.

### Live verification (Orchestrator, wf-20260801-feat-181, 2026-08-01)

All ACs above verified against real local Authentik + Directus + Mailpit +
Postgres (not mocked), end-to-end, across 10 fresh temp-user round trips:
`POST upsert-temp-user` → `POST upgrade-temp` → real Mailpit email →
real headless-Chromium click through Authentik's magic-link flow → real
OIDC authorize/callback round trip → `GET /v1/auth/me` → `POST
events/:id/register` → Directus check-in (`status: attended`) → real
`point_awards` rows → real per-country leaderboard entry (rank 2, 15
points, correct email/handle). Confirmed both in Authentik (`email` field
patched, `is_temporary: false`) and Directus (`directus_users.email`
carries the real address) per this FR's own AC wording. All test fixtures
(10 Authentik users, `platform.users`/`upgrade_intents`/Directus
registrations/point_awards/directus_users rows) cleaned up afterward — no
residue. Full detail: `.copilot/tasks/completed/wf-20260801-feat-181/
07-test-results.md` (automated suite) and the workflow's final Orchestrator
report (live-verification transcript).

## Notes

- Depends on FR-AUTH-004 (magic-link, **Implemented**) for the email verification step. FR-AUTH-004 explicitly reserves the `is_temporary=false` + points-unlock item for this FR.
- Does NOT depend on FR-GAM-001's `GamificationService`/`activities` naming — that class does not exist; see Functional scope item 5.
- The synthetic email `tg<id>@telegram.local` is a workaround for Authentik's unique-email constraint. The replace must be atomic to avoid constraint violations — resolved via a check-then-single-PATCH design (reject before mutating if the target email is already in use elsewhere), not a multi-step Authentik-side transaction. See `01-requirement-validation.md` for the full mechanism, including how the upgrade flow is distinguished from an ordinary magic-link sign-in (a short-lived `upgrade_intents` token threaded through the existing OIDC `next`-redirect machinery).
- Full requirement validation, architectural trace, and formalized ACs:
  `.copilot/tasks/active/wf-20260801-feat-181/01-requirement-validation.md`.
