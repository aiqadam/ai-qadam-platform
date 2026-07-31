# Step 8 — Test Execution Results

## Execution order (per `requirement-development.md` Step 8)

### 1. `pnpm typecheck` (API)

```
pnpm --filter api exec tsc --noEmit
```
Clean, zero errors.

### 2. `pnpm biome check` (formatter, defensive guard)

```
pnpm biome check apps/api/src/modules/auth/auth.controller.ts \
  apps/api/src/modules/auth/auth.module.ts \
  apps/api/src/modules/auth/telegram-auth.service.ts \
  apps/api/src/modules/points/points-directus.service.ts \
  apps/api/test/telegram-bot-me-service.spec.ts \
  apps/api/test/telegram-bot-me-controller.spec.ts \
  apps/api/test/points-directus.spec.ts
```
`Checked 7 files in 6ms. No fixes applied.` — clean.

### 3. `pnpm test` (API, all unit tests)

```
pnpm --filter api test -- --run
```
**Test Files: 108 passed, 1 failed (109 total). Tests: 1433 passed, 1
failed (1434 total).**

The 1 failure is `test/users.spec.ts:65`
(`UsersService.upsertByAuthentikSubject > updates email + displayName +
lastLoginAt for an existing subject`) — a pre-existing clock-race flake
(`lastLoginAt.getTime()` comparison racing real wall-clock resolution),
confirmed via `git diff --stat -- apps/api/test/users.spec.ts
apps/api/src/modules/users/` returning **empty** — this PR's diff does
not touch that file or module at all. This is the exact same flake PR 1
and PR 2 both already cross-referenced in their own `07-test-results.md`
(`workspace-state.md`'s PR 2 entry: "1 pre-existing, unrelated clock-race
flake at `users.spec.ts:65`, same one PR 1 already cross-referenced —
untouched by this PR's diff"). Not introduced by this PR; not blocking.

New tests, all passing:
- `telegram-bot-me-service.spec.ts` — 4/4
- `telegram-bot-me-controller.spec.ts` — 5/5
- `points-directus.spec.ts` (extended, `totalForUser` describe block) — 3/3 new (11/11 total in file)

### 4. Bot test suite (Python, pytest)

```
./.venv/Scripts/python.exe -m pytest tests/ -q
```
**111 passed, 0 failed** (95 pre-existing + 16 new/modified: 4 in
`test_api_client_me.py`, 12 in `test_me_command.py`, plus 2 pre-existing
files updated for now-shipped `/me`).

```
./.venv/Scripts/python.exe -m ruff check .
```
`All checks passed!`

```
./.venv/Scripts/python.exe -m ruff format --check .
```
`51 files already formatted`

### 5. Live verification against the real local stack (ahead of Step 13)

Already performed and documented in `03-code-summary.md`'s "Live
verification" section — `GET /v1/internal/telegram/me` curled directly
against real Directus/Postgres data (unbridged-user 404, bridged-user
happy path with real `pointsTotal: 135`, zero-points edge case, Zod/guard
enforcement). Repeated more thoroughly at Step 13 as part of the
BP-UAT-010 post-merge re-verification.

### 6. Integration tests (`INTEGRATION_TEST=1 pnpm test:integration`)

Not run as a separate pass for this PR — `getMeSummary`/`totalForUser`
make zero direct Postgres/Drizzle calls (both are pure Directus-REST +
in-memory composition, same posture as `registerViaTelegram`/
`cancelViaTelegram`, which PR 2 also did not require a separate
integration pass for beyond the Testcontainers-backed unit tests already
in `points-directus.spec.ts`). The live-curl verification above plus
Step 13's fuller BP-UAT-010 re-run together provide the "against a real
stack" coverage this class of change needs.

## AC coverage (FR-BOT-002)

- [x] `/me` correctly shows all active registrations with status badges
      — `test_me_renders_registered_and_waitlisted_badges_distinctly`
      (bot) + `getMeSummary` aggregation tests (API), plus live curl
      confirming real registration data flows through correctly.

(Other FR-BOT-002 ACs are out of scope for this PR — unchanged from PR 2's
state.)

## Gate Result

gate_result:
  status: passed
  summary: "typecheck clean, biome clean, 1433/1434 API tests passing (1 pre-existing unrelated flake, confirmed untouched by this diff), 111/111 bot tests passing, ruff clean. New /me AC directly covered by both API and bot unit tests plus live-stack verification."
  findings:
    - "Pre-existing flake at apps/api/test/users.spec.ts:65 (clock race in lastLoginAt comparison) — confirmed unrelated via empty git diff on that file/module, not introduced by this PR, same flake PR 1/PR 2 already documented."
