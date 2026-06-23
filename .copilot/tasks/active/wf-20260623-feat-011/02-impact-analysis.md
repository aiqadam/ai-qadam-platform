# Impact Analysis: FEAT-MIG-018

**Workflow:** `wf-20260623-feat-011` (requirement-development)
**Agent:** ImpactAnalyzer
**Date:** 2026-06-23

---

## Validated Requirement

```
code: FEAT-MIG-018
name: /me hub + /me/preferences + /me/access-log + /me/referrals pages
status: Not Started
module: Migration (MIG)
phase: Rebuild M3
```

Build four new Astro pages under `apps/web-next/src/pages/me/`, all protected by `<AuthGate>`:

1. **`index.astro` (`/me`)** — minimal hub: nav links + membership summary card (avatar, display name, role chip). Full dashboard deferred to a follow-up MIG ticket.
2. **`preferences.astro`** — wraps existing `<ConsentList>` (GDPR per-purpose toggles). Endpoint: `GET/PATCH /v1/me/preferences/consents`. No email-frequency control.
3. **`access-log.astro`** — table of auth events from `GET /v1/me/access-log`. MVP scope only (sign-in, token refresh, sign-out). No profile/role-change events.
4. **`referrals.astro`** — referral code + stats from `GET /v1/referrals/mine` + `GET /v1/referrals/mine/stats`. Attribution history table deferred.

---

## Affected Layers

### API (NestJS)

**No changes required.** All four endpoints are implemented and routed:

| Controller | Module | File |
|---|---|---|
| `PreferencesController` | `preferences` | `apps/api/src/modules/preferences/preferences.controller.ts` |
| `MeAccessLogController` | `audit` | `apps/api/src/modules/audit/audit-events.controller.ts` |
| `ReferralsController` | `referrals` | `apps/api/src/modules/referrals/referrals.controller.ts` |

The `ReferralsController` serves both `GET /v1/referrals/mine` (code list) and `GET /v1/referrals/mine/stats` (stats).

### DB Changes Required

**No.** FEAT-MIG-018 is a pure frontend migration. All data surfaces (consents, audit events, referral codes) exist in Directus already. No Drizzle schema changes, no migrations.

### Shared Types

**Changes required in `apps/web-next/src/lib/types.ts`:**

| Type | Status | Notes |
|---|---|---|
| `ConsentSummary`, `ConsentPurpose`, `CONSENT_PURPOSES` | EXISTS | Already in `types.ts` — used by `<ConsentList>` |
| `ReferralCodeView` | MISSING from frontend | Exists in `referrals.service.ts`; needs re-export to `types.ts` |
| `MyReferralStats` | MISSING from frontend | Exists in `referrals.service.ts`; needs re-export to `types.ts` |
| Access-log event shape | MISSING from frontend | `listForMe` returns `Pick<AuditEventSummary, 'id' | 'event' | 'severity' | 'target_kind' | 'ts'>` — needs a named type in `types.ts` |

### Frontend

**New files:**

| File | Type | Purpose |
|---|---|---|
| `apps/web-next/src/pages/me/index.astro` | Astro page | `/me` hub shell |
| `apps/web-next/src/pages/me/preferences.astro` | Astro page | preferences page |
| `apps/web-next/src/pages/me/access-log.astro` | Astro page | access-log page |
| `apps/web-next/src/pages/me/referrals.astro` | Astro page | referrals page |
| `apps/web-next/src/lib/use-my-access-log.ts` | TanStack Query hook | Fetches `GET /v1/me/access-log` |
| `apps/web-next/src/lib/use-my-referrals.ts` | TanStack Query hook | Fetches `GET /v1/referrals/mine` + `GET /v1/referrals/mine/stats` |
| `apps/web-next/src/blocks/customer/AccessLogTable.tsx` | React island | Auth-events table block |
| `apps/web-next/src/blocks/customer/ReferralCodeCard.tsx` | React island | Referral code + stats block |

**Existing files reused:**

| File | Reused by |
|---|---|
| `apps/web-next/src/blocks/common/AuthGate.astro` | All four pages |
| `apps/web-next/src/blocks/customer/ConsentList.tsx` | `preferences.astro` |
| `apps/web-next/src/blocks/common/EmptyState.astro` | `access-log.astro`, `referrals.astro` |
| `apps/web-next/src/pages/me/profile.astro` | Pattern template |
| `apps/web-next/src/lib/use-auth.ts` | SSR auth bootstrap |

**No Astro layout changes** — `Layout.astro` + `PageHead.astro` used identically to existing pages.

### Bot

**No changes.** Referrals are web-only in v2.

### Workers

**No changes.**

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/me/preferences/consents` | GET | None — already implemented | No |
| `/v1/me/preferences/consents` | PATCH | None — already implemented | No |
| `/v1/me/access-log` | GET | None — already implemented | No |
| `/v1/referrals/mine` | GET | None — already implemented | No |
| `/v1/referrals/mine/stats` | GET | None — already implemented | No |

All five endpoints use the standard `AuthGuard` (Bearer token + refresh-cookie). No new DTOs needed on the API side.

---

## Cross-Module Calls

| Caller | Called | Via | Notes |
|---|---|---|---|
| `MeAccessLogController` | `AuditEventsService.listForMe()` | Direct (same module) | Resolves local userId → directusUsersId via bridge; queries own events only |
| `ReferralsController` | `ReferralsService.listMine()` | Direct (same module) | Uses `DirectusUsersBridgeService` to resolve userId |
| `ReferralsController` | `ReferralsService.getMyStats()` | Direct (same module) | Counts point_awards + fetches member_badges via Directus |

**No cross-module service calls.** `preferences`, `audit`, and `referrals` modules are self-contained. No tenant-scoped data involved (users and audit events are global schemas per ADR-0013).

---

## Risk Flags

### Security Review Required

- **Access-log data exposure:** `MeAccessLogController.listForMe()` filters by `req.user.sub` and returns only the caller's own events. Verified in `audit-events.service.ts` lines 124-139. The return type strips `actor_email` and `payload_json` — appropriate for self-view. **No issue found.**
- **Referral code enumeration:** `GET /v1/referrals/mine` returns the caller's own codes only. `POST /v1/referrals/resolve` (public) accepts any code and returns only `ownerUserId` — no sensitive data. **No issue found.**
- **Consent mutation authorization:** `PATCH /v1/me/preferences/consents` uses `AuthGuard` and writes to the caller's own record only. **No issue found.**

### Architecture Rule Risks

**None.** All four pages follow established patterns:
- Astro SSR page shell with `<AuthGate>` wrapping content
- React island blocks hydrate with `client:load`
- TanStack Query hooks under `lib/use-*` (ADR-0038 §Locks #1 compliant)
- API client via `lib/api-client.ts` (ADR-0038 §Locks #2 compliant)
- Module boundaries respected — frontend calls only existing endpoints, no module-internal access

---

## Test Scope

### Unit Tests

| File | What to test |
|---|---|
| `apps/web-next/src/lib/use-my-access-log.ts` | Query key, response mapping, error handling |
| `apps/web-next/src/lib/use-my-referrals.ts` | Query keys for both endpoints, response mapping |
| `apps/web-next/src/blocks/customer/AccessLogTable.tsx` | Empty state, loading state, event-row rendering, sort order |
| `apps/web-next/src/blocks/customer/ReferralCodeCard.tsx` | Copy button, null stats handling |

### Integration Tests (Testcontainers)

| File | What to test |
|---|---|
| `apps/api/test/preferences-service.spec.ts` | Extend with `set()` coverage if missing |
| `apps/api/test/audit-events-service.spec.ts` | Extend with `listForMe()` coverage |
| `apps/api/test/referrals-service.spec.ts` | Extend with `listMine()` + `getMyStats()` coverage |

No new testcontainers needed — all three services already have test setup.

### E2E (Playwright)

Per AC-1 through AC-10 in the requirement validation:

| Test | Page | Behavior |
|---|---|---|
| `me-hub-redirect.spec.ts` | `/me` | Anon redirected to sign-in with `?next=` param |
| `me-hub-authenticated.spec.ts` | `/me` | Authed sees nav links + membership card |
| `me-preferences-redirect.spec.ts` | `/me/preferences` | Anon redirected to sign-in |
| `me-preferences-consent-toggle.spec.ts` | `/me/preferences` | Authed toggles consent, state persists |
| `me-access-log-redirect.spec.ts` | `/me/access-log` | Anon redirected to sign-in |
| `me-access-log-table.spec.ts` | `/me/access-log` | Authed sees auth events table with at least one sign_in |
| `me-referrals-redirect.spec.ts` | `/me/referrals` | Anon redirected to sign-in |
| `me-referrals-copy.spec.ts` | `/me/referrals` | Authed clicks copy, referral code written to clipboard |
| `me-all-pages-build.spec.ts` | All four | `pnpm astro check` + `pnpm build` pass |

---

## Gate Result

```
gate: impact-analyzer
status: passed
timestamp: 2026-06-23T09:10:00Z
workflow_id: wf-20260623-feat-011
artifact: .copilot/tasks/active/wf-20260623-feat-011/02-impact-analysis.md

summary: |
  FEAT-MIG-018 is a pure frontend migration. No API changes, no DB changes,
  no new modules. Four new Astro pages follow existing patterns
  (AuthGate + React islands + TanStack Query hooks). Shared-types additions
  are needed: ReferralCodeView, MyReferralStats, and a named type for
  access-log events — all re-exported from existing service interfaces.
  Three new hooks (use-my-access-log, use-my-referrals, use-update-consent)
  and two new React blocks (AccessLogTable, ReferralCodeCard) are required.
  Test scope: unit tests for new hooks/blocks, integration tests for the
  three services (extend existing spec files), and 9 E2E scenarios covering
  anon redirects and authed flows on all four pages. No security concerns
  identified — all three endpoints respect self-only data scoping.

needs_clarification: false
escalation: none
```
