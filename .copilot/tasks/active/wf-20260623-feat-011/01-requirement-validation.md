# Requirement Validation: FR-MIG-018

**Workflow:** `wf-20260623-feat-011` (requirement-development)
**Agent:** RequirementAnalyst
**Date:** 2026-06-23

---

## Raw Input

```markdown
code: FR-MIG-018
name: /me hub + /me/preferences + /me/access-log + /me/referrals
status: Not Started
module: Migration (MIG)
phase: Rebuild M3

## Functional scope
1. `pages/me/index.astro` (`/me` hub) — links to profile, preferences, access log, referrals; shows membership summary card.
2. `pages/me/preferences.astro` — email frequency select + per-topic opt-in toggles via `<ConsentList>`. PATCH `/v1/me/preferences`. GDPR-load-bearing.
3. `pages/me/access-log.astro` — table of recent auth events (sign-in, token refresh, sign-out) with timestamp + IP. Read-only.
4. `pages/me/referrals.astro` — member's referral code, copy button, attribution history table.
5. All pages: AuthGate (redirect to sign-in if anon).
```

---

## Analysis

### Completeness Issues Found

| # | Issue | Severity | Assumption Made |
|---|-------|----------|-----------------|
| 1 | "Membership summary card" is undefined. FR-USR-003 defines the full `/me` dashboard (avatar, next-event hero, stat cards, heatmap, badges, QR registrations, suggested events). The M3 hub must define what subset of this belongs on `/me` vs. `/me/profile`. | medium | CodeDeveloper splits into two tickets: `/me` hub = minimal nav + summary (this FR); full dashboard content ships in a follow-up MIG ticket. |
| 2 | Preferences: "email frequency select" appears in FR-MIG-018 but not in FR-USR-004 (the v1 spec). FR-USR-004 lists only per-purpose consent toggles (newsletter/sponsor_promo/speaker_promo) plus Telegram toggle and topic interests. No email-frequency setting exists in v1 or the current API (`GET/PATCH /v1/me/preferences/consents` — topics, not frequency). | medium | Email frequency select is out of scope for this FR. `<ConsentList>` already ships per-topic toggles. |
| 3 | Access log: FR-MIG-018 scope is "auth events (sign-in, token refresh, sign-out)" but FR-USR-006 also includes "profile changes, role changes, and operator access." The narrower scope is acceptable as a v2 MVP; the broader scope can be added when `/workspace/admin/audit` (FR-ADM-008) ships. | low | Access log MVP = auth events only. Extended events when FR-ADM-008 lands. |
| 4 | Referral attribution history table: `GET /v1/referrals/mine` returns `codes[]`. `GET /v1/referrals/mine/stats` returns `MyReferralStats`. Neither returns a per-user attribution history table. The v1 page (`me/referrals.astro`) likely used a different endpoint. | low | Reuse `GET /v1/referrals/mine` + `GET /v1/referrals/mine/stats` for code + stats; attribution history table deferred unless a dedicated endpoint exists or the stats array covers the need. |

### Conflicts with Existing Features

- **FR-USR-003/004/005/006** are the Phase 1 v1 specs for these same pages. FR-MIG-018 is the M3 port. No conflict — they define the target behavior. The relationship is: FR-USR-* are "what it does", FR-MIG-018 is "how we build it in v2."
- **FR-MIG-017** (sign-in redirect target) is already **Implemented** (commit 9a6bc67). Dependency satisfied.

### Architectural Feasibility

| Component | Status | Location |
|-----------|--------|----------|
| API: `GET /v1/me/preferences/consents` | exists | `apps/api/src/modules/preferences/preferences.controller.ts` |
| API: `PATCH /v1/me/preferences/consents` | exists | same controller |
| API: `GET /v1/me/access-log` | exists | `apps/api/src/modules/audit/audit-events.controller.ts` (`MeAccessLogController`) |
| API: `GET /v1/referrals/mine` | exists | `apps/api/src/modules/referrals/referrals.controller.ts` |
| API: `GET /v1/referrals/mine/stats` | exists | same controller |
| `GET /v1/me/badges` | not yet checked | needs verification by CodeDeveloper |
| Frontend: `<AuthGate>` | exists | `apps/web-next/src/blocks/common/AuthGate.astro` |
| Frontend: `<ConsentList>` | exists | `apps/web-next/src/blocks/customer/ConsentList.tsx` |
| Frontend: SSR auth bootstrap | exists | `apps/web-next/src/middleware.ts` |
| `/auth/sign-in` page | exists (FR-MIG-017) | `apps/web-next/src/pages/auth/sign-in.astro` |
| `/me/profile` page | exists | `apps/web-next/src/pages/me/profile.astro` (pattern to follow) |
| Folder convention | correct | `apps/web-next/src/pages/me/` |

**Feasibility: PASS.** All infrastructure is in place. The four new pages follow the identical composition pattern as `me/profile.astro`: Astro page shell + `<AuthGate>` + React island blocks.

---

## Formalized Requirement

**Feature identifier:** `FEAT-MIG-018`

### Cross-references

| Code | Relationship | Status |
|------|-------------|--------|
| FR-MIG-017 | Dependency: `/auth/sign-in` must exist for anon redirect | Implemented |
| FR-USR-003 | Related: `/me` dashboard content (full dashboard is out-of-scope for this FR; hub only) | Shipped (v1) |
| FR-USR-004 | Related: preferences scope (v1 source) | Shipped (v1) |
| FR-USR-005 | Related: referral program (v1 source) | Shipped (v1) |
| FR-USR-006 | Related: access log (v1 source) | Shipped (v1) |
| FR-ADM-008 | Future: operator audit log → extends access-log events beyond auth | Not Started |

### Scope statement

Build four new Astro pages under `apps/web-next/src/pages/me/`:

1. **`index.astro` (`/me`)** — minimal hub with: nav links to profile/preferences/access-log/referrals + a membership summary card (avatar, display name, role chip). No full dashboard content (deferred to a separate MIG ticket aligned with FR-USR-003 v2 port).

2. **`preferences.astro`** — wraps `<ConsentList>` (GDPR per-purpose toggles). No email-frequency control (out of scope). Endpoint: existing `GET/PATCH /v1/me/preferences/consents`.

3. **`access-log.astro`** — table of auth events from `GET /v1/me/access-log` (sign-in, token refresh, sign-out). MVP scope only. Columns: event type, timestamp, IP. Empty + error states. Deferred: profile/role-change events (FR-ADM-008).

4. **`referrals.astro`** — shows referral code from `GET /v1/referrals/mine`, stats from `GET /v1/referrals/mine/stats`, clipboard copy button. Attribution history table deferred (no dedicated endpoint in MVP).

All four: `<AuthGate>` with `next=` param propagation to `/auth/sign-in`.

---

## Acceptance Criteria (draft)

> Format: `AC-n: Given <context> when <action> then <result>`
> These are informal; TestDesigner formalizes into executable specs.

- **AC-1:** Given an anonymous user, when they visit `/me`, then they are redirected to `/auth/sign-in?next=/me`.
- **AC-2:** Given a signed-in member, when they visit `/me`, then the page renders a hub with links to profile/preferences/access-log/referrals and a membership summary card showing their avatar, display name, and role.
- **AC-3:** Given an anonymous user, when they visit `/me/preferences`, then they are redirected to `/auth/sign-in?next=/me/preferences`.
- **AC-4:** Given a signed-in member, when they visit `/me/preferences`, then the page renders the `<ConsentList>` block with per-purpose toggles.
- **AC-5:** Given a signed-in member, when they toggle a consent in `<ConsentList>`, then the UI updates optimistically and persists the new state after reload.
- **AC-6:** Given an anonymous user, when they visit `/me/access-log`, then they are redirected to `/auth/sign-in?next=/me/access-log`.
- **AC-7:** Given a signed-in member on their first session, when they visit `/me/access-log`, then the table includes at least one `sign_in` event for the current session.
- **AC-8:** Given an anonymous user, when they visit `/me/referrals`, then they are redirected to `/auth/sign-in?next=/me/referrals`.
- **AC-9:** Given a signed-in member with a referral code, when they click the copy button on `/me/referrals`, then the referral code is written to the clipboard.
- **AC-10:** `pnpm arch:check` + `pnpm astro check` + `pnpm build` pass with no errors.

---

## Gate Result

```
gate: requirement-analyst
status: passed
timestamp: 2026-06-23T08:50:00Z
workflow_id: wf-20260623-feat-011
artifact: .copilot/tasks/active/wf-20260623-feat-011/01-requirement-validation.md

summary: |
  FR-MIG-018 is feasible. All four API endpoints exist, all required
  frontend infrastructure is in place (AuthGate, ConsentList, SSR auth
  bootstrap), and the `/auth/sign-in` dependency (FR-MIG-017) is
  implemented. Four clarifications are recorded as inline assumptions:
  (1) /me hub is minimal — full dashboard deferred; (2) email-frequency
  select out of scope; (3) access-log MVP = auth events only;
  (4) attribution history table deferred. All four assumptions are
  flagged for CodeDeveloper awareness.

needs_clarification: false
escalation: none
```
