# Test Results — FEAT-NTF-004 (Telegram notification adapter gap-fill)

Workflow: `wf-20260803-feat-197`

---

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit + Integration (`pnpm test`, full monorepo, all 4 packages) | 1587 (api) + web-next/e2e/other packages (cached, unaffected by this diff) | 1587 (api), all others cached-green | 0 | 0 |
| Targeted (3 files touched by this workflow, verbose re-run) | 50 | 50 | 0 | 0 |
| Live-local-run verification (AC-5–AC-8, non-Vitest tier) | 4 scenarios (AC-5, AC-6, AC-7, AC-8) + AC-9 live component | 4/4 | 0 | 0 |

No separate `test:integration` command exists anywhere in this repo (root `package.json` and `apps/api/package.json` both checked, plus a repo-wide grep for `test:integration` in any `package.json` — zero matches). The existing `interactions-telegram-adapter.spec.ts` runs its 2 real-Testcontainers-Postgres integration tests as part of the normal `pnpm test` (vitest run) command, exactly as the test design states — confirmed by watching its stdout during the full run (`injected env`/Postgres container startup logs interleaved with the rest of the suite, no separate invocation needed).

---

## Type Check

`pnpm typecheck` (turbo, all 4 workspace packages) — **clean, 0 errors** (`@aiqadam/web-next` reported "0 errors, 0 warnings, 43 hints" — hints are pre-existing unused-var/deprecated-API notices unrelated to this diff; `api`, `web`, `e2e` packages all passed silently/cached).

---

## Lint / Format Check

**Scoped to this workflow's actual diff: clean.**

```
pnpm biome check apps/api/src/modules/interactions/channels/telegram-adapter.ts \
  apps/api/src/modules/interactions/channels/telegram-html-sanitizer.ts \
  apps/api/src/modules/workspace/events.controller.ts \
  apps/api/test/interactions-telegram-adapter.spec.ts \
  apps/api/test/events-controller.spec.ts \
  apps/api/test/telegram-html-sanitizer.spec.ts
→ Checked 6 files in 6ms. No fixes applied.
```

**Repo-wide `pnpm biome check .` reports 84 pre-existing errors — investigated and confirmed unrelated to this workflow's diff, not a regression it introduced.** Root cause traced: all 84 errors are against minified Playwright trace-viewer bundle assets under `apps/e2e/uat-results/html-report/trace/*.js` (e.g. `snapshot.v8KI4P3m.js`, `uiMode.Ut8wwJNp.js`) — generated test-report artifacts, not source code. `apps/e2e/uat-results/` is listed in `apps/e2e/.gitignore` (confirmed via `git check-ignore -v`) but is **not** in `biome.json`'s `files.ignore` list, which only excludes the sibling `apps/e2e/playwright-report/**` and `apps/e2e/test-results/**` — a pre-existing biome-config/gitignore mismatch that predates this branch and touches zero files this workflow changed. Not routed to CodeDeveloper (out of scope for this PR's diff); flagging here for awareness in case a future workflow wants to add `apps/e2e/uat-results/**` to `biome.json`'s ignore list.

---

## Failed Tests

None.

| Test | File | Error | Classification |
|---|---|---|---|
| — | — | — | — |

---

## Flaky Tests

None tagged `@flaky`. No intermittent failures observed across the full unit/integration run or the live-local-run.

---

## Coverage

- **`telegram-html-sanitizer.spec.ts`** (new, 26 tests observed in the actual run vs. 24 planned — 2 extra from the file's own `describe` structuring, all passing): every allowlisted tag individually, nested/combined tags, disallowed-tag stripping (incl. case variants), self-closing tags, the exact cross-nested docstring example, stray/unclosed tags, degenerate inputs, and the AC-4 regression against `buildReminderPayload()`'s real output for all 3 `ReminderKind` values.
- **`interactions-telegram-adapter.spec.ts`** additions: `inline_buttons` passthrough (AC-1/AC-2), MAJOR-1 size/format bounds (row count, buttons-per-row, text length boundary both sides, URL length, malformed URL), and 2 real-Testcontainers-Postgres integration tests (sanitized text lands in outbox; oversized payload produces zero new outbox rows).
- **`events-controller.spec.ts`** (new): MAJOR-2 title-regex guard — quote/backslash rejection (service never called), no-forbidden-char passthrough, omitted-title optionality, 200-char boundary.
- **Business-logic error paths**: policy-gate skip branches (no telegram_user_id / opted-out / no tenant) were already covered pre-existing and re-verified green; new bounds-rejection paths all assert both `state: 'failed'` and zero outbox-row writes (no partial/rolled-back write).
- **Live-local-run** (see dedicated section below) is the only coverage mechanism for AC-5 through AC-8 by design — no unit-test harness exists for Directus flow JSON anywhere in this codebase's history (confirmed independently by re-checking `.copilot/tasks/completed/` myself in addition to the impact analysis's own search).

---

## Live-Local-Run Verification (AC-5 through AC-8)

### Environment state confirmed at start

- `curl http://localhost:3000/health` → `{"status":"ok",...}` — NestJS API healthy on port 3000.
- `curl http://localhost:8200/server/health` → `{"status":"ok"}` — Directus healthy on host port **8200** (not 8055 — `docker port aiqadam-directus` shows `8055/tcp -> 127.0.0.1:8200`).
- Postgres reachable directly via `docker exec aiqadam-postgres psql -U postgres -d platform`.

### Step 1 — Re-run `flows-bootstrap.sh` (idempotent bootstrap)

**Environment gap found and worked around, not a code bug**: the script's `upsert()` function invokes `python3` on the create-path (line 162) for any operation that doesn't yet exist. This Windows machine has no `python3` on PATH (`which python3` resolves to the Microsoft Store app-execution-alias stub, which fails with "Python was not found; run without arguments to install..."); only `python` (3.12, at a specific Program Files path) and `py` exist. Created a throwaway local shim (`/tmp/shim-bin/python3` → exec the real `python`) and prepended it to `PATH` for this run only — not a repo change, not committed, purely a local-session workaround for a machine-specific PATH gap. Re-ran:

```
bash infrastructure/directus/flows-bootstrap.sh
```

Result: **all ops upserted successfully, no errors**, `Done.` printed with all 3 flow URLs. Confirmed:
- 6 new Telegram ops created (`+ op capacity_telegram_waitlisted`, `+ op capacity_telegram_gate_wl`, `+ op capacity_telegram_confirmed`, `+ op capacity_telegram_gate`, `+ op promo_telegram_promoted`, `+ op promo_telegram_gate`).
- All 3 pre-existing email ops + 3 lookup ops updated in-place (`~ (updated)`) per the `query.fields`/`resolve`-chaining edits.
- Pre-existing `reg-checkin-points` flow (untouched by this workflow) round-tripped as a clean no-op update — confirms idempotency held across the whole file, not just the new ops.
- The F-S3.0 Twenty-sync flow deletion block ran without error (already absent, 404-is-fine idempotent behavior, unchanged from before this workflow).

### Step 2 — Second environment gap found: hardcoded production URL

**Root cause traced, confirmed as pre-existing architecture (not introduced by this PR), matching a documented precedent.** All 6 `request`-type ops (3 pre-existing email + 3 new Telegram) hardcode `"url": "https://uz.aiqadam.org/api/v1/internal/interactions/dispatch"` — the real production URL. Confirmed via direct container inspection:
- `docker exec aiqadam-directus nslookup uz.aiqadam.org` → resolves via real public DNS to Cloudflare IPs (104.21.34.172 / 172.67.163.78), no `/etc/hosts` override, no `extra_hosts` in docker-compose.
- `docker exec aiqadam-directus wget -qO- https://uz.aiqadam.org/api/health` → `HTTP/1.1 523` (Cloudflare "origin unreachable") — confirms outbound internet works but the real prod origin doesn't accept the request in this context.
- This exact issue was already root-caused and fixed **live-only** (not committed to the script) in commit `da9e242` (`ISS-UAT-010-3`) for the 3 pre-existing email ops: "capacity_email_confirmed and capacity_email_waitlisted both POST https://uz.aiqadam.org/... which 404s from inside the Directus container... Live-directus fix: PATCH both ops to use the local URL + a literal [token]." That commit's own message confirms this was always meant to be a live-instance-only patch, re-applied each time local verification is needed, never a change to the checked-in idempotent script (which must keep the real production URL for actual deployments).
- Also confirmed the same "off-by-default" gap `da9e242` found: `docker exec aiqadam-directus env` shows neither `FLOWS_ENV_ALLOW_LIST` nor `INTERNAL_API_TOKEN` set inside the container, so `{{ $env.INTERNAL_API_TOKEN }}` would interpolate to nothing usable — the live-only fix must inline a literal token value, exactly as documented.

**Action taken (live-instance-only, not a repo change)**: PATCHed all 6 ops' `options.url` → `http://host.docker.internal:3000/v1/internal/interactions/dispatch` (confirmed reachable via `wget` from inside the container) and their `x-internal-auth` header value → the literal `INTERNAL_API_TOKEN` value from `apps/api/.env`, via direct Directus REST API calls (not editing `flows-bootstrap.sh`). **Reverted all 6 ops back to the canonical production URL + `{{ $env.INTERNAL_API_TOKEN }}` placeholder at the end of this verification** (see Cleanup section) — confirmed by re-running `flows-bootstrap.sh` one final time afterward and reading back `capacity_telegram_confirmed`'s live config, which matched the script's source exactly.

### Step 3 — Seed fixtures

Created (all via direct Directus REST calls, IDs recorded for cleanup):
- **Event 1** (`ce2f84e7-2f94-4eb6-b25f-fba6df65abd3`, "wf197 Telegram Live-Verify Event", `capacity: 1`, `waitlist_enabled: true`) — for AC-5/6/7.
- **Event 2** (`3c79feb4-7c96-4f82-b68e-f69f2cdd746b`, "wf197 Telegram Live-Verify Event 2 (AC-8)", `capacity: 10`) — fresh capacity slot for AC-8, avoiding cross-contamination with the capacity=1 event.
- **User1** (`ad6086b1-d5ca-4ebb-81e7-a86b4660d416`, telegram-eligible: `country: "uz"`, `telegram_user_id: "555000111"`, `telegram_opted_out_at: null`).
- **User2** (`fb5c6018-8b6f-4c2c-9581-1fe39e96579c`, telegram-ineligible: `country: "uz"`, `telegram_user_id: null` — never linked).
- **User3** (`0da5f73a-1639-43f0-a130-48121dbcb3b2`, telegram-eligible: `country: "uz"`, `telegram_user_id: "555000222"`) — second eligible user, needed for the waitlist/promotion sequence.

(No pre-existing seeded user had `telegram_user_id` set — checked via `GET /users?filter={"telegram_user_id":{"_nnull":true}}` → empty — and no pre-existing user had `country` set either, which `InteractionsService.resolveRecipients()` maps directly to `tenant` (`tenant: u.country ?? null` in `interactions.service.ts` line 239) — `TelegramAdapter.checkPolicy()` requires a non-null tenant, so fresh users were required rather than reusing an existing UAT fixture.)

### Step 4/5 — Trigger flows, verify via `interaction_deliveries` + direct Postgres `outbox` reads

**AC-5 (registration-confirmed reaches Telegram):** `POST /items/registrations` for User1 on Event 1 (capacity 1, first registration → stays `registered`).
- `interaction_deliveries` filtered by `recipient_user=ad6086b1-...`: 2 rows — `channel='email', state='sent'` **and** `channel='telegram', state='sent'`.
- Direct outbox query (`docker exec aiqadam-postgres psql -d platform`): row for `chat_id=555000111`, `template.text` = `"You're registered for <b>wf197 Telegram Live-Verify Event</b>!..."` (sanitizer preserved the `<b>` tag correctly), `template.inline_buttons` = `[[{"url": "https://aiqadam.org/events/ce2f84e7-...", "text": "Open event page"}]]` — exactly the expected single-row/single-button shape. **AC-5: PASS.**

**AC-6 (registration-waitlisted reaches Telegram, no button):** `POST /items/registrations` for User3 on Event 1 (now at capacity → over-capacity path).
- Registration status confirmed flipped `registered` → `waitlisted` by the action hook (re-fetched after a 3s wait).
- `interaction_deliveries` for User3: 2 rows, `channel='email', state='sent'` + `channel='telegram', state='sent'`.
- Outbox row for `chat_id=555000222`: `template.text` = `"You're on the waitlist for <b>wf197 Telegram Live-Verify Event</b>. We'll notify you here if a spot opens up."`, `template.inline_buttons` = **`null`** — confirmed absent, exactly as designed (mirrors the buttonless waitlisted email template; the test strategy explicitly flagged this so it isn't mistaken for a bug). **AC-6: PASS.**

**AC-7 (registration-promoted-from-waitlist reaches Telegram):** `PATCH /items/registrations/<User1's reg>` → `status: "cancelled"`, freeing the one slot.
- User3's registration status confirmed flipped `waitlisted` → `registered` (promotion fired).
- `interaction_deliveries` for User3 grew from 2 to 4 rows — 2 new ones at the promotion timestamp: `channel='email', state='sent'` + `channel='telegram', state='sent'`.
- Outbox row (newest for `chat_id=555000222`): `template.text` = `"Good news — you're off the waitlist for <b>wf197 Telegram Live-Verify Event</b>!..."`, `template.inline_buttons` = `[[{"url": "https://aiqadam.org/events/ce2f84e7-...", "text": "Open event page"}]]` — button present, mirrors AC-5 exactly. **AC-7: PASS.**

**AC-8 (Telegram-ineligible recipient still gets email, no failed/attempted Telegram row):** `POST /items/registrations` for User2 (telegram_user_id=null) on Event 2 (fresh capacity, under limit).
- `interaction_deliveries` for User2: **exactly 1 row**, `channel='email', state='sent'` — zero `channel='telegram'` rows.
- Direct outbox query filtered by `target.member_id = 'fb5c6018-...'` → **0 rows**. Confirms the Telegram gate skipped cleanly (per `checkPolicy()`'s `!recipient.telegramUserId` branch) — a genuinely skipped dispatch, not an attempted-and-failed one (no error/failed-state row exists either). **AC-8: PASS.**

**AC-9 (email channel unaffected) — live component:** Observed alongside all 4 triggers above: every email delivery row shows `state='sent'` with the same shape/timing as pre-existing UAT baseline rows (subject/template unchanged, confirmed by the static diff review at Step 4/5 plus this live re-observation). No regression detected.

### Step 6 (optional, MAJOR-2 title-regex live check) — not performed live; already covered by unit tests

The test strategy's step 7 recommends also live-verifying the `patchEventSchema.title` regex guard via `PATCH /v1/workspace/events/:id`. This route requires `@UseGuards(AuthGuard)` (a real authenticated session) — establishing one purely for this optional, non-AC-mapped recommendation wasn't judged worth the setup cost, since `events-controller.spec.ts` (5/5 passing) already exercises this exact guard directly against the controller with both the quote and backslash rejection cases, the omitted-title pass-through, and the 200-char boundary. Not treated as a gap against any AC — the strategy itself frames this step as "not an AC on its own."

### Redis-flakiness diagnosis (resolved, per task's explicit ask)

**Confirmed: the residual `ECONNRESET` noise from `JtiRevocationService`/`OutboxRelayService` is real, ongoing, and NOT a blocker for AC-5 through AC-8.** Traced the code path directly:

- `TelegramAdapter.send()` (`apps/api/src/modules/interactions/channels/telegram-adapter.ts` lines 149–161) calls `this.db.transaction(async (tx) => { await this.outbox.publish(tx, {...}) })` — a direct Drizzle/Postgres transaction.
- `OutboxPublisher.publish()` (`apps/api/src/modules/telegram/outbox-publisher.service.ts`) is a pure `tx.insert(outbox).values(...).onConflictDoNothing(...)` call — **zero Redis/ioredis import or dependency anywhere in this file or this method.**
- The Redis-touching step is `outbox-relay.service.ts` (`OutboxRelayService`) — a **separate, later** process that reads already-committed outbox rows and XADDs them to Redis Streams. It runs independently of (and after) the write path `TelegramAdapter.send()` cares about.
- **Empirical confirmation**: the API log showed `ECONNRESET` errors firing continuously throughout the entire live-run window (13:07:35 through at least 13:19:27, roughly every 2–4 seconds, sampled again immediately before writing this report) — and yet all 4 live-run triggers (AC-5, AC-6, AC-7, AC-8) produced correct `state='sent'` outbox rows every single time, with no failures, no retries needed, no delay beyond the normal 2–3s action-hook chain latency.

**Classification: this is a real, pre-existing local-environment issue (Windows `localhost`→`::1` IPv6-first resolution vs. the Redis container's IPv4-only listener, per the session's earlier `REDIS_URL` fix), but it does NOT block or degrade the outbox-write path this PR's diff depends on.** It is cosmetic/background reconnect noise for the *relay* step, not a blocker for anything this workflow's ACs assert. Per the Diagnosing Failures table, if this needed to be registered at all it would be `failed-escalate` (infrastructure) — but since it demonstrably did **not** cause any AC-5–8 failure in this run, no gate failure is being raised for it. Flagging for awareness only: `OutboxRelayService`'s own downstream health (whether envelopes actually reach Redis Streams and then the Python notifier) is unverified by this PR's scope per the code summary's own stated verification boundary, and remains a good candidate for a follow-up environment-hardening ticket (fixing `REDIS_URL` resolution more permanently, e.g. via `family: 4` in the ioredis client options or a corrected `/etc/hosts` entry) — not something to block this workflow on.

### Cleanup — zero residue confirmed

All seed fixtures deleted in this order: 3 registrations → 7 `interaction_deliveries` rows → 7 `interactions` rows → 3 `outbox` rows (direct `DELETE FROM outbox WHERE envelope_id IN (...)`) → 2 test events → 3 test users. Final verification queries:
- `GET /users?filter={"email":{"_contains":"wf197"}}` → `{"data":[]}`
- `GET /items/events?filter={"slug":{"_contains":"wf197"}}` → `{"data":[]}`
- `SELECT count(*) FROM outbox` → `0`
- `SELECT count(*) FROM outbox WHERE target.member_id IN (<3 seed user ids>)` → `0` (checked before the blanket count, to be certain no seed-attributable row survived even if some unrelated row existed)

All 6 live-patched Directus operations (3 email + 3 Telegram) reverted to their canonical production URL (`https://uz.aiqadam.org/...`) and `{{ $env.INTERNAL_API_TOKEN }}` placeholder — confirmed via a final re-read of `capacity_telegram_confirmed`'s live config, then a final idempotent re-run of `flows-bootstrap.sh` which completed with `Done.` and no errors, restoring the local Directus instance to the exact state the checked-in script defines.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Full standard suite green: typecheck clean (0 errors, all 4 workspace packages), biome clean on all 6 files this workflow touched (Checked 6 files in 6ms, no fixes), full pnpm test clean (api: 122 test files / 1587 tests all passed, including the file's 2 real-Testcontainers-Postgres integration tests which run under the ordinary `pnpm test` command -- confirmed no separate test:integration script exists anywhere in the repo). Targeted re-run of the 3 files this workflow added/modified: 50/50 passed. Repo-wide `pnpm biome check .` reports 84 pre-existing errors, investigated and confirmed unrelated to this diff: all against generated Playwright trace-viewer bundles under apps/e2e/uat-results/ (gitignored per apps/e2e/.gitignore but missing from biome.json's files.ignore list) -- a pre-existing tooling-config gap, not a regression, not touched by this PR, not routed to CodeDeveloper. Live-local-run verification for AC-5 through AC-8 (owned by this agent per the test strategy's explicit non-standard tier) fully executed against the real local Directus+Postgres stack: re-ran flows-bootstrap.sh idempotently (found and worked around a machine-local python3-not-on-PATH gap via a session-only shim, not a repo change), found and fixed (live-instance-only, matching the documented da9e242/ISS-UAT-010-3 precedent) a hardcoded-production-URL gap in all 6 request ops that would have silently prevented any local verification, seeded 3 users + 2 events, triggered all 3 registration flows for both a telegram-eligible and a telegram-ineligible recipient, and directly verified via Directus API + raw Postgres reads: AC-5 (registered, telegram delivery sent, correct inline_buttons), AC-6 (waitlisted, telegram delivery sent, correctly NO inline_buttons), AC-7 (promoted, telegram delivery sent, correct inline_buttons matching AC-5), AC-8 (telegram-ineligible user gets email only, zero telegram delivery rows AND zero outbox rows -- a clean skip, not a failed attempt). AC-9's live component (email unaffected) rode along with all 4 triggers, confirmed unaffected. Resolved the open Redis-flakiness diagnosis question definitively by code trace (TelegramAdapter.send() -> OutboxPublisher.publish() is a pure Postgres transaction, zero Redis touch; only the separate, later OutboxRelayService touches Redis) AND empirical confirmation (ECONNRESET fired continuously throughout the entire live-run window with zero effect on any of the 4 triggers' outbox writes) -- classified as real, pre-existing, ongoing local-environment noise that does NOT block this PR's diff, not escalated as a gate failure since it demonstrably caused zero AC failures in this run. All seed fixtures (3 registrations, 7 interaction_deliveries rows, 7 interactions rows, 3 outbox rows, 2 events, 3 users) deleted and confirmed zero residue via re-query. All 6 live-patched Directus operations reverted to their canonical production-URL/env-var-token state, re-verified via a final idempotent flows-bootstrap.sh re-run. No code bug found anywhere in this workflow's diff -- both environment gaps found (python3 PATH, hardcoded prod URL) are pre-existing local-machine/architecture facts unrelated to and not introduced by this PR's changes, resolved via session-local workarounds without touching the repo."
  findings:
    - "Standard suite: typecheck 0 errors (4/4 packages), biome clean on the 6 files this workflow's diff touches (interactions-telegram-adapter.spec.ts, telegram-adapter.ts, telegram-html-sanitizer.ts, telegram-html-sanitizer.spec.ts, events.controller.ts, events-controller.spec.ts), pnpm test 1587/1587 passed in api package (full suite, not just the targeted 3 files), targeted re-run of the 3 touched/new spec files 50/50 passed including both real-Testcontainers integration tests."
    - "Repo-wide biome check surfaces 84 pre-existing errors against apps/e2e/uat-results/html-report/trace/*.js (minified Playwright trace-viewer bundles) -- confirmed via git check-ignore that this directory IS gitignored (apps/e2e/.gitignore) but is NOT in biome.json's files.ignore list (which only lists the sibling playwright-report/** and test-results/**), a pre-existing config gap unrelated to and untouched by this workflow. Flagged for awareness, not routed as a code-bug finding against this PR."
    - "AC-5 through AC-8 (plus AC-9's live component) verified end-to-end against the real local Directus+Postgres stack via the test strategy's 7-step procedure, all 4/4 PASS: AC-5 (under-capacity registration -> telegram delivery sent, correct single Open-event-page inline_buttons entry), AC-6 (over-capacity -> waitlisted, telegram delivery sent, correctly NO inline_buttons), AC-7 (waitlist promotion -> telegram delivery sent, inline_buttons matching AC-5), AC-8 (telegram-ineligible user -> email only, zero telegram delivery rows, zero outbox rows -- confirmed a clean skip not a failed attempt)."
    - "Two environment gaps found and worked around live (neither is a code bug in this PR's diff): (1) python3 not on this Windows machine's PATH (only the Microsoft Store alias stub), worked around with a session-local shim script, not committed; (2) all 6 Directus request ops (3 pre-existing email + 3 new Telegram) hardcode the production URL https://uz.aiqadam.org/..., unreachable for local verification -- root-caused and fixed via a live-instance-only PATCH (not a script edit) exactly matching the already-documented da9e242/ISS-UAT-010-3 precedent for the pre-existing email ops, then reverted back to canonical state after verification, re-confirmed via a final idempotent flows-bootstrap.sh re-run."
    - "Redis-flakiness diagnosis resolved definitively, as explicitly requested: traced TelegramAdapter.send() -> this.db.transaction() -> OutboxPublisher.publish() as a pure Drizzle/Postgres insert with zero Redis import anywhere in outbox-publisher.service.ts; the Redis-touching step (XADD to Streams) lives only in the separate, later OutboxRelayService. Empirically confirmed by observation: ECONNRESET fired continuously throughout the entire ~12-minute live-run window with zero impact on any of the 4 triggered flows' outbox writes, all of which succeeded on the first attempt with no retries. Classified as real, ongoing, pre-existing local-environment noise (Windows IPv6-first localhost resolution vs Redis container) that does not block this PR -- not escalated as a gate failure since it caused zero observed AC failures; flagged as a good candidate for a separate environment-hardening follow-up (e.g. ioredis family:4 option), not blocking this workflow."
    - "All seed fixtures (3 registrations, 7 interaction_deliveries, 7 interactions, 3 outbox rows, 2 events, 3 users) deleted; zero residue confirmed via direct re-query of each collection/table. All 6 live-patched Directus ops reverted to canonical (production URL + env-var token) state."
    - "No code bug found in this workflow's diff. Nothing routed to CodeDeveloper or TestDesigner."
```
