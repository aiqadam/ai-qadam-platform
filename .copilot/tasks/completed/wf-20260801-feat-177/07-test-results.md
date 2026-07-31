# Step 8: Test Execution — FR-BOT-002 PR 4/6 (`/leaderboard`)

## Execution order (per `requirement-development.md` Step 8)

1. `pnpm --filter api exec tsc --noEmit -p tsconfig.json` — **clean**, no errors.
2. `pnpm biome check` on all 4 changed/new API files — **clean**, no fixes needed.
3. `pnpm --filter api exec vitest run` (full suite) — **1447/1448 pass**.
   The 1 failure (`test/users.spec.ts:65`,
   `UsersService.upsertByAuthentikSubject > updates email + displayName +
   lastLoginAt...`, a `getTime()` clock-race assertion) is the same
   pre-existing, already-documented flake independently confirmed
   untouched by PR 1 (`wf-20260731-feat-174`), PR 2
   (`wf-20260801-feat-175`), and PR 3 (`wf-20260801-feat-176`)'s own
   diffs. Confirmed untouched by THIS PR's diff too:
   `git diff --stat -- apps/api/test/users.spec.ts apps/api/src/modules/users/`
   returns empty output — this PR touches neither file.
4. `./.venv/Scripts/ruff.exe check` + `ruff format --check` on
   `apps/bot/src apps/bot/tests` — clean after one mechanical auto-fix
   (import sort + one line-length wrap).
5. `./.venv/Scripts/python.exe -m pytest tests/ -q` — **124/124 pass**
   (up from 111 pre-existing; 13 new: 5 in `test_api_client_leaderboard.py`,
   8 in `test_leaderboard_handler.py`; 2 modified files —
   `test_help_handler.py`, `test_main_wiring.py` — updated assertions,
   no new/removed test count from those two).

`INTEGRATION_TEST=1 pnpm test:integration` — not run as a separate step:
this PR adds no new Directus query (reuses `leaderboard()` and
`resolveUserIdFromDirectusId()` unchanged), so there is no new
Testcontainers-level integration surface beyond what `points-directus.spec.ts`
(a Testcontainers-backed Postgres suite) already exercises and which
already passed as part of the full `vitest run` above (that file uses
`inject('TEST_DATABASE_URL')`, i.e. it IS the integration layer for this
service, and it ran clean in the full-suite pass).

## Infrastructure pre-flight (AGENTS.md §6.1 / orchestrator.md)

```
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep aiqadam
```
All required containers already up and healthy (37h uptime): postgres,
directus, authentik-server/worker, redis, mailpit. No `docker compose up`
needed.

```
curl -fsS http://localhost:3000/health   -> 200 {"status":"ok",...}
curl -fsS http://localhost:8200/server/ping -> 200 "pong"
```
Local API dev process was running a stale `dist/main` build (pre-dating
this PR's code) — rebuilt (`pnpm --filter api build`) and restarted
(killed the process on port 3000, relaunched `node dist/main`) so live
verification below actually exercises this PR's new code, not a cached
build. This is the same class of "trivially reversible local dev-process
restart" AGENTS.md §16's worked example #2 explicitly says needs no
confirmation.

## Live verification — AC "a temporary user is excluded from `/leaderboard` results"

This is the concrete, live proof the task instructions required (seed a
temp user + a full user with points, confirm only the full user
appears), performed against the real local stack, not mocked:

1. **Seeded a genuine "full" member** directly in Directus: a new
   `directus_users` row (`d1ee5d46-...`, country `uz`,
   `appear_on_public_leaderboard: true`), a `point_awards` row for that
   user (250 points, well above the existing baseline ~5-140 range so
   it's unambiguous in the output), and a matching `platform.users` row
   (`directus_user_id = d1ee5d46-...`) so the caller-identity bridge
   resolves. Confirmed via direct Directus/Postgres reads before calling
   the endpoint.
2. **Seeded a genuine temp user** via the real
   `POST /v1/internal/telegram/upsert-temp-user` endpoint (the same
   route the bot's own `/start` flow calls) — required a one-time local
   `.env` addition of `TELEGRAM_BOT_TOKEN` (a placeholder, non-secret
   value; `upsertTempUser`'s `getBotToken()` guard 503s without one) per
   CLAUDE.md's dev/test `.env` exception; reverted immediately after this
   verification, API rebuilt+restarted again to confirm the revert took
   and the endpoint still works clean. Result:
   `{"authentikUserId":19,"directusUserId":null,"isNew":true}` — confirms
   in the response itself that this user has NO Directus mirror at all
   (not even a `directus_users` row, let alone a `point_awards` row).
3. **Called the real endpoint**:
   `GET /v1/internal/telegram/leaderboard?directusUserId=<full-user>&country=uz`
   with the real `x-internal-auth` header. Result:
   ```json
   {"entries":[
     {"displayName":"WF177 FullUser","points":250,"isCaller":true},
     {"displayName":"UAT Member","points":140,"isCaller":false}
   ]}
   ```
   - The seeded full user appears, ranked #1, `isCaller: true` — proves
     the caller-highlight logic (AC "the caller's row is highlighted if
     they appear") end-to-end through the real API, real Directus
     aggregate, and real Postgres bridge lookup, not just the mocked
     unit tests.
   - The temp user (telegram id `999888777`) does **not** appear
     anywhere in the result — confirmed both by absence from this
     response and by a direct Directus query
     (`GET /items/point_awards`, `GET /users`) showing zero rows for
     that identity at all. A user with zero Directus footprint
     structurally cannot appear in a query that only ever reads
     `point_awards` rows — this is the exact mechanism
     `01-requirement-validation.md`'s Architectural Feasibility section
     predicted from reading the code, now independently confirmed live.
   - **Incidental finding (not a new bug, expected behavior, worth
     recording):** the FIRST live call (before the `platform.users`
     bridge row was seeded) showed the full user's 250-point Directus
     row was ALSO silently excluded — because `leaderboard()`'s existing
     "orphan aggregate row" drop logic (pre-existing, unrelated to this
     PR) applies to ANY `point_awards` row with no matching
     `platform.users` row, not just to genuine temp users. This is
     correct, intentional, pre-existing behavior (see
     `points-directus.spec.ts`'s own `'silently drops aggregate rows for
     users not yet linked in platform.users'` test) — it means the
     exclusion mechanism is actually slightly broader than "temp users
     only," which is a safe direction to be broad in (nothing shows in a
     public leaderboard without a real platform account), not a gap.
4. **Cleanup:** deleted the seeded `point_awards` row, the seeded
   `directus_users` row, the seeded `platform.users` row, and the temp
   Authentik user (id 19) — confirmed via a final call to the endpoint
   showing the result back to the pre-seed baseline
   (`{"entries":[{"displayName":"UAT Member","points":140,"isCaller":false}]}`).

## AC-by-AC disposition

| AC | Status |
|---|---|
| `/leaderboard` shows top 10 members; caller's row highlighted if they appear | **verified** — unit tests (ordering, highlight-when-present) + live end-to-end call showing real `isCaller: true` on the seeded caller's row. |
| A temporary user is excluded from `/leaderboard` results | **verified** — live end-to-end: genuine temp user (via the real `upsert-temp-user` endpoint) confirmed absent from the real endpoint's response, cross-referenced against zero Directus rows for that identity. |
| Caller highlighted only "if they appear" (no separate out-of-top-10 rank line) | **verified** — unit test `test_render_leaderboard_no_highlight_when_caller_absent` + `'marks every entry isCaller=false when the caller does not appear'`; this is a scope decision (Step 1), not a live-testable absence-of-behavior beyond what the unit tests already cover. |
| All commands respond within 3 seconds under normal conditions | **verified (qualitative)** — the live curl round-trips above completed well under 1 second observed wall-clock; no dedicated timing harness exists for any sibling command in this FR either (same precedent PR 1-3 established). |

## Gate Result

gate_result:
  status: passed
  summary: "Full test suite green (1447/1448 API — 1 pre-existing unrelated flake, confirmed untouched by this diff; 124/124 bot). Temp-user-exclusion AC and caller-highlight AC both live-verified end-to-end against the real local stack, not just unit-tested."
  findings:
    - "Live verification required a one-time local .env addition (TELEGRAM_BOT_TOKEN placeholder) to unblock upsert-temp-user's existing getBotToken() guard — reverted immediately after use, disclosed here per CLAUDE.md's dev/test .env exception."
    - "Incidental confirmation: the pre-existing 'orphan aggregate row' drop in leaderboard() (not modified by this PR) is broader than temp-user exclusion alone — it excludes ANY point_awards row without a platform.users bridge row, which is a safe, intentional superset, not a gap."
    - "All seeded live-verification fixtures (Directus user, point_awards row, platform.users row, Authentik temp user) were cleaned up and the endpoint's output confirmed back to its pre-seed baseline."
