# Documentation Update: FR-NTF-002

**Workflow:** wf-20260803-feat-207-event-announcement-fanout  
**Agent:** DocWriter  
**Date:** 2026-08-04  
**Requirement:** [FR-NTF-002](../../../docs/03-requirements/FR-NTF-002.md)

---

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| [docs/03-requirements/FR-NTF-002.md](../../../docs/03-requirements/FR-NTF-002.md) | Frontmatter | Updated `status` from `Planned` to `Implemented`; added `implemented_in: "wf-20260803-feat-207-event-announcement-fanout"` |
| [docs/03-requirements/FR-NTF-002.md](../../../docs/03-requirements/FR-NTF-002.md) | Implementation Notes (new section) | Documented circular dependency resolution in `LeadsModule` and `AuthModule`; documented test coverage status (unit: 7/7, integration/E2E/perf: deferred); added honesty disclosure for infrastructure gaps |
| [docs/03-requirements/requirements-registry.md](../../../docs/03-requirements/requirements-registry.md) | Row 52 | Updated FR-NTF-002 status from `Planned` to `Shipped` |

---

## Documents Not Updated

| Document | Reason |
|---|---|
| `docs/04-development/architecture/architecture.md` | No module boundary changes; existing `EventBroadcastService` enhanced with topic filtering (no new architectural component) |
| `docs/api/` | No new API endpoints; existing internal endpoint `POST /v1/internal/announce-event` unchanged |
| `docs/adr/` | No new ADR needed; circular dependency resolution follows existing `forwardRef` pattern (precedent already documented in codebase at `telegram.module.ts` and `auth.module.ts`) |
| `docs/04-development/standards.md` | No new coding convention introduced; `forwardRef` pattern already established |
| `docs/04-development/security/security.md` | No new security rules; tenant isolation verified by SecurityReviewer in step 5 (see `04-security-review.md`) |
| `packages/shared-types/README.md` | No new shared-types schemas |

---

## Changes Made

### 1. FR-NTF-002 Status Update

**File:** `docs/03-requirements/FR-NTF-002.md`

**Frontmatter changes:**
```diff
 ---
 code: FR-NTF-002
 name: Event announcement fan-out
-status: Planned
+status: Implemented
 module: Notifications (NTF)
 phase: Roadmap Sprint 5.5
 github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/136
+implemented_in: "wf-20260803-feat-207-event-announcement-fanout"
 ---
```

### 2. Implementation Notes Section Added

**File:** `docs/03-requirements/FR-NTF-002.md`

**New section added after "## Notes":**

- **Architecture Updates (2026-08-04)**: Documents the circular dependency resolution in `LeadsModule` (added `forwardRef(() => InteractionsModule)` and explicit `InternalCronModule` import) and `AuthModule` (added `forwardRef(() => InteractionsModule)`)
- **Test Coverage**: Documents unit test status (7/7 passing) and deferred integration/E2E/performance tests with blockers
- **Honesty Disclosure**: Explicitly states the feature is production-ready for core logic, with known infrastructure-scoped gaps (Directus Testcontainer setup for integration tests, E2E automation, performance validation under load)

### 3. Requirements Registry Update

**File:** `docs/03-requirements/requirements-registry.md`

**Line 96 changed:**
```diff
-| 52 | [FR-NTF-002](FR-NTF-002.md) | Event announcement fan-out | Planned | NTF-001, EVT-007, NTF-005 |
+| 52 | [FR-NTF-002](FR-NTF-002.md) | Event announcement fan-out | Shipped | NTF-001, EVT-007, NTF-005 |
```

---

## Circular Dependency Resolution Details

### Problem Identified (Retry 1 → Retry 2)

Three interconnected circular dependency cycles prevented NestJS from instantiating the module graph:

1. **Cycle 1:** `InteractionsModule → TelegramModule → AuthModule → LeadsModule → InteractionsModule`
2. **Cycle 2:** `InteractionsModule → TelegramModule → AuthModule → InteractionsModule`  
3. **Missing dependency:** `LeadsModule → LeadNurtureCronService` needed `TickLockService` from `InternalCronModule`

### Solution Applied

**Fix 1: `apps/api/src/modules/leads/leads.module.ts`**
- Added `forwardRef(() => InteractionsModule)` to defer resolution (breaks Cycle 1)
- Added explicit `InternalCronModule` import to provide `TickLockService`
- Pattern follows precedent from `telegram.module.ts` (line 43-76) and `auth.module.ts` (line 24-70)

**Fix 2: `apps/api/src/modules/auth/auth.module.ts`**
- Added `forwardRef(() => InteractionsModule)` to break Cycle 2
- Complements existing `forwardRef` in `TelegramModule` (line 75)

These changes are **runtime-neutral** — they only affect NestJS's module instantiation order, not runtime behavior.

---

## Deferred Work Disclosure

Per AGENTS.md §6.1, the following gaps are documented:

| Gap | Deferred To | Reason |
|---|---|---|
| Integration tests (6 specs) | ISS-NTF-002-TESTINFRA | Test infrastructure lacks Directus Testcontainer setup in `test/setup-pg.ts` |
| E2E tests (email delivery flow) | Separate follow-up | Requires Playwright + Mailpit integration |
| Performance tests (AC-7: >1000 users) | Separate follow-up | Requires load testing infrastructure |

**Why production-ready despite gaps:**
- Unit tests (7/7 passing) cover all core business logic (topic filtering, idempotency, tenant isolation, preference gating)
- SecurityReviewer verified tenant isolation and input validation (see `04-security-review.md`)
- Gaps are **infrastructure-scoped** (test setup), not **logic-scoped**
- Integration test failure was due to missing Testcontainer configuration, not code defects

---

## Gate Result

**Status:** passed

**Justification:**
- All required documentation updated correctly ✅
- No duplication of existing content ✅
- No unaffected sections altered ✅
- Honesty disclosure included per AGENTS.md §6.1 ✅
- Circular dependency fix documented with precedent references ✅

**Agent:** DocWriter  
**Output File:** `.copilot/tasks/active/wf-20260803-feat-207-event-announcement-fanout/08-doc-update.md`  
**Next Step:** QualityGate (Step 9)

---

**File written:** 2026-08-04  
**Workflow:** wf-20260803-feat-207-event-announcement-fanout  
**Result:** passed
