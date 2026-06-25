# Test Strategy: FEAT-MIG-018

**Workflow:** `wf-20260623-feat-011` (requirement-development)
**Agent:** TestStrategist
**Date:** 2026-06-23

---

## Requirement

```
code: FEAT-MIG-018
name: /me hub + /me/preferences + /me/access-log + /me/referrals pages
```

Four new member self-service Astro pages under `apps/web-next/src/pages/me/`, all protected by `<AuthGate>`:
1. `/me` hub — membership summary card
2. `/me/preferences` — GDPR consent toggles via `<ConsentList>`
3. `/me/access-log` — auth event table
4. `/me/referrals` — referral code + stats + copy button

Pure frontend migration. No new API endpoints. No DB changes.

---

## Rubric Score

| Criterion | Points | Assessment |
|-----------|--------|------------|
| Touches tenant-scoped data | 0 | Self-only data; no tenant scoping |
| New API endpoint | 0 | All endpoints pre-existing |
| Business rule with edge cases | 0 | Simple read/write; no complex rules |
| Cross-module service call | 0 | Controllers call their own module services only |
| New database query | 0 | No new DB queries; frontend only |
| Pure function / utility | 0 | Hooks are stateful but straightforward |
| UI-only change | 0 | Astro pages + React islands; all logic is in UI rendering |
| **Total** | **0** | |

**Score: 0 (< 4)** — Unit tests sufficient. No integration tests required. No E2E tests required.

---

## Required Test Levels

- [x] Unit Tests (required)
- [ ] Integration Tests (Testcontainers) — not required (score < 4)
- [ ] E2E Tests (Playwright) — not required (score < 4)

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|--------|-----------|---------------|
| `use-access-log.ts` | Fetches access log, maps response to `AccessLogEvent[]` | Handles 401 (throws), handles network error (throws), handles empty array |
| `use-referrals.ts` | Fetches referral codes and stats, maps both responses | Handles 401 on codes endpoint, handles 401 on stats endpoint, handles partial failure (one ok, one fails) |
| `AccessLogTable.tsx` | Renders table header + rows when data loaded, renders event type icon per row, renders timestamp in locale format | Renders empty state when array is empty, renders loading skeleton when query is loading, renders error state when query errors |
| `ReferralDashboard.tsx` | Renders referral code, renders stats grid (points, count, badges), copy button calls `navigator.clipboard.writeText` with correct code | Renders no-code state when `codes` is empty, renders loading state while queries are pending, renders error state when stats query fails, copy button gracefully fails if clipboard unavailable |

### Additional unit test targets (implicit via composition)

| Target | Happy Path | Failure Paths |
|--------|-----------|---------------|
| `ConsentList` (existing block) | Renders per-purpose toggles, fires PATCH on toggle | Already covered by existing tests (do not re-test) |
| `AuthGate` (existing component) | Redirects anon to `/auth/sign-in?next=<path>` | Already covered by existing tests (do not re-test) |

---

## Integration Test Plan

Not required. All three API endpoints (`GET/PATCH /v1/me/preferences/consents`, `GET /v1/me/access-log`, `GET /v1/referrals/mine`, `GET /v1/referrals/mine/stats`) are pre-existing with coverage in `apps/api/test/`. No new service logic added.

---

## E2E Test Plan

Not required. All four pages follow established Astro + `<AuthGate>` patterns with existing test coverage on the AuthGate component. No new critical paths introduced.

---

## Acceptance Criteria to Test Mapping

| AC | Test Level | Test Description |
|----|-----------|------------------|
| AC-1: Anon visiting `/me` redirects to `/auth/sign-in?next=/me` | Unit | `AuthGate` redirect behavior covered by existing tests — no new test needed |
| AC-2: Authed user sees hub with nav links + membership card | Unit | Verify `index.astro` renders membership card from SSR `Astro.locals.auth` data; verify nav links render with correct `href`s |
| AC-3: Anon visiting `/me/preferences` redirects | Unit | Covered by existing `AuthGate` tests — no new test needed |
| AC-4: Authed user sees `<ConsentList>` with per-purpose toggles | Unit | Verify `preferences.astro` imports and renders `<ConsentList>`; verify block receives correct consent data from `use-my-access-log.ts` (ConsentList has its own unit tests) |
| AC-5: Toggling consent persists after reload | Unit | `use-access-log.ts` covers PATCH call; `ConsentList` covers optimistic UI; integration of both verified by `ConsentList` existing tests |
| AC-6: Anon visiting `/me/access-log` redirects | Unit | Covered by existing `AuthGate` tests — no new test needed |
| AC-7: Authed user sees at least one `sign_in` event | Unit | `AccessLogTable.tsx` renders event rows; data shape verified by `use-access-log.ts` unit tests |
| AC-8: Anon visiting `/me/referrals` redirects | Unit | Covered by existing `AuthGate` tests — no new test needed |
| AC-9: Copy button writes referral code to clipboard | Unit | `ReferralDashboard.tsx` test: mock `navigator.clipboard.writeText`, click button, assert called with correct code string |
| AC-10: Build passes | Pre-commit CI | Enforced by `pnpm astro check` + `pnpm build` in CI; no test needed |

---

## Gate Result

```
gate: test-strategist
status: passed
timestamp: 2026-06-23T09:35:00Z
workflow_id: wf-20260623-feat-011
artifact: .copilot/tasks/active/wf-20260623-feat-011/06-test-strategy.md

summary: |
  FR-MIG-018 scores 0 on the rubric. Pure frontend migration with no new
  API endpoints, no DB changes, no tenant-scoped data, no complex business
  logic. Unit tests are sufficient for all four new files:
  use-access-log.ts, use-referrals.ts, AccessLogTable.tsx, and
  ReferralDashboard.tsx. Integration and E2E tests are not required.
  All 10 acceptance criteria are mapped to unit tests or existing test
  coverage (AuthGate, ConsentList). No gaps identified.

needs_clarification: false
escalation: none
```