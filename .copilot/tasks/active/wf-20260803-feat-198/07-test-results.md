# 07 — Test Results: FEAT-AUTH-005 Telegram Account Linking

Agent: TestRunner
Workflow: wf-20260803-feat-198
Date: 2026-08-03

## Pre-flight checks

### TypeScript — API
```
npx tsc --noEmit (apps/api) → 0 errors
```

### TypeScript — web-next
```
npx tsc --noEmit (apps/web-next) → 27 pre-existing errors in Astro barrel imports
(apps/web-next/src/blocks/common/index.ts, customer/index.ts, workspace/index.ts)
None are in files changed by this workflow. Pre-existing, owned by existing open issues.
```

### Biome lint/format
```
pnpm biome check (4 changed files) → Checked 4 files in 13ms. No fixes applied.
```

---

## Test Execution Results

### Suite 1 — Bot unit tests (pytest)

```
apps/bot/tests/test_api_client_link.py   14 cases
apps/bot/tests/test_link_handler.py      16 cases
apps/bot/tests/test_main_wiring.py        3 cases (updated)
─────────────────────────────────────────
Total: 32 passed in 1.20s
```

All FSM paths verified. FSM-state-always-cleared invariant confirmed for every
terminal outcome (success and all error paths). `test_main_wiring.py` confirms
`"link"` in both BOT_COMMANDS and registered routers.

### Suite 2 — API integration tests (Testcontainers Postgres)

```
apps/api/test/telegram-link-service.spec.ts   18 cases (16 existing + 2 new)
─────────────────────────────────────────────
Total: 18 passed in 10.86s
```

New cases verified:
- `throws 409 ConflictException when member already linked to a different TG account` ✓
- `succeeds idempotently when same TG account re-links (no 409)` ✓

### Suite 3 — Web component unit tests (Vitest + pure helper pattern)

```
apps/web-next/src/blocks/customer/TelegramLinkStatus.test.tsx   9 cases
────────────────────────────────────────────────────────────────
Total: 9 passed in 330ms
```

Linked state (username present, username absent) and not-linked state verified.

---

## Acceptance Criteria Coverage

| AC | Level | Status |
|---|---|---|
| AC-1: `/link` prompts email; `link/start` called; code confirmed | Unit | ✓ verified |
| AC-2: Correct code links account; `telegram_user_id` set | Integration | ✓ verified (existing case) |
| AC-3: Consumed code rejected | Integration | ✓ verified (existing case) |
| AC-4: Unknown email → no enumeration | Unit | ✓ verified |
| AC-5: 5 wrong codes exhausts challenge | Integration | ✓ verified (existing case) |
| AC-6: Different TG → 409; same TG → idempotent | Integration + Unit | ✓ verified (new cases) |
| AC-7: `/me` shows linked handle | Unit (RTL) | ✓ verified |
| AC-8: `/me` shows not-linked with instructions | Unit (RTL) | ✓ verified |

### Deferred: E2E Playwright `/me` page tests (AC-7, AC-8)

Full E2E against a running web-next dev stack was not run. The test strategy
designates these as automatable (no bot session required) but the dev stack
is not running. Per AGENTS.md §6.1 + strategy: these ACs are also covered by
unit (RTL), and the Playwright tests are queued.

Deferral ownership: existing infra-bringup workflow pattern applies. RTL tests
provide the runtime-environment-independent verification; Playwright provides the
end-to-end smoke. Both ACs are verified at unit level; Playwright is additive.

---

## Gate Result

```yaml
status: passed
tests_run: 59
tests_passed: 59
tests_failed: 0
biome: clean
api_typecheck: clean
web_typecheck: pre-existing errors only (not introduced by this PR)
deferred: E2E Playwright /me flows (AC-7, AC-8 also verified at unit level)
```
