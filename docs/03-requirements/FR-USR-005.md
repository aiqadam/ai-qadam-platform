---
code: FR-USR-005
name: Referral program (/me/referrals)
status: Shipped
module: Users (USR)
phase: Phase 1 (V1) / Rebuild Phase 3 (V2, Not Started)
---

## Description

Members get a personal referral code they can share. When someone signs up or registers for an event via a referral link, the referrer earns attribution credit. A "Brought a Friend" badge is awarded when a referred contact attends their first event.

## Users

Members.

## Functional scope

1. **Referral code issuance** — `POST /v1/referrals/issue` (idempotent): mints a 6-character alphanumeric code for the user. Returns the same code on repeat calls.
2. **Share URL** — The referral link is `https://uz.aiqadam.org/events?ref=<code>` (or any URL with `?ref=<code>`). Web displays the link + a copy button.
3. **Attribution capture** — When any page loads with `?ref=<code>`, client-side JS calls `POST /v1/referrals/resolve` to map the code to a `ref_owner_user_id`, stored in an `aiqadam-ref-owner` cookie (90 days, SameSite=Lax).
4. **Attribution on registration** — When a user registers for an event (FR-REG-001), the `referredBy` field (from the cookie) is sent and stored on the registration row.
5. **Referral stats** — `GET /v1/referrals/mine` returns the code + total attributed signups. `GET /v1/referrals/mine/stats` returns: sign-ups attributed, events attended by referred users. Stats panel shown only when count ≥ 1.
6. **"Brought a Friend" badge** — Awarded to the referrer the first time a referred contact attends an event (`checked_in` status). One-time badge (see FR-GAM-002).
7. **Share URL on event pages** — On `/events/[id]`, the `EventShareButtons` component embeds `?ref=<code>` in share links when the user is signed in (best-effort: renders plain links first, swaps to ref links when auth resolves).

## Acceptance criteria

- [ ] `POST /v1/referrals/issue` twice returns the same code both times.
- [ ] Visiting an event URL with `?ref=<code>` sets the `aiqadam-ref-owner` cookie.
- [ ] Registering for an event while the ref cookie is set records `referredBy` on the registration.
- [ ] `/me/referrals` shows zero stats until at least one person has signed up via the referral link.
- [ ] When a referred user attends their first event, the referrer's stats update and the "Brought a Friend" badge is awarded.
- [ ] `POST /v1/referrals/resolve` with an unknown code returns `404`.

## Notes

- V2 (web-next): not started (M3.2 milestone).
- Attribution cookies coexist with UTM attribution cookies (see `lib/attribution.ts` in FR-USR cross-cutting notes in `web-v1-feature-surface.md`).
