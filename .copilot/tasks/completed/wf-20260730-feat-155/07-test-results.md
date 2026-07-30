# Test Results — FR-EVT-004 (Event detail page gap-closure)

Workflow: `wf-20260730-feat-155` · Agent: TestRunner · **Re-run after Retry 2 fix**

This is a full, independent re-run of the mandatory test sequence following
CodeDeveloper's Retry 2 fix (`03-code-summary.md`'s "Retry 2 fix" section):
`apps/web-next/src/pages/events/[id].astro`'s not-found/wrong-country 404
changed from `new Response(null, { status: 404 })` to
`new Response('not_found', { status: 404 })`, to stop Astro's node-adapter
runtime from substituting its own path-echoing default error page. This run
does not take CodeDeveloper's self-report on trust — every step below
(typecheck, biome, unit suite, E2E spec, and manual curl/diff/hex
verification) was re-executed from scratch in this session.

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit (Vitest, `apps/web-next`) | 1004 | 1004 | 0 | 0 |
| Integration | — | — | — | — (no `test:integration` script/gate exists anywhere in this repo; unchanged from attempt 1 — see "Integration-tier interpretation" below) |
| E2E (Playwright, `apps/e2e/tests/smoke-event-detail-lifecycle.spec.ts`, 2 projects × 7 scenarios = 14 runs) | 14 | 6 | 0 | 8 |

**The 2 previously-failing AC-8 byte-identical-404 scenarios (chromium-desktop and chromium-mobile) now PASS.** The 4 previously-passing scenarios still pass. The 8 previously-skipped scenarios still skip, for the same documented pre-existing `apps/api` gap (not a new regression — re-confirmed this session).

## Type Check

`pnpm --filter @aiqadam/web-next typecheck` (→ `astro check`): **pass — 0 errors, 0 warnings, 41 hints**, identical to the attempt-1 baseline. Full result line: `Result (255 files): 0 errors / 0 warnings / 41 hints`. All hints are pre-existing (`FormEvent`-deprecation notices and unused-var hints) in files this workflow did not touch.

## Lint / Format Check

`pnpm biome check .` (repo-wide): unchanged from attempt 1 — reports 84 errors, all attributable to the local, untracked, gitignored `apps/e2e/uat-results/` Playwright trace-viewer bundle (confirmed pre-existing, unrelated to this diff, already documented in attempt 1 and not re-litigated here).

Scoped to every file this workflow added/changed (all 21 files from the code-summary's Files-Changed table plus the E2E spec, passed explicitly to `biome check` — note `.astro` files with bracket names like `[id].astro` and `.json` locale files are not matched by biome's linter glob, consistent with CodeDeveloper's own note in attempt 1): **clean — `Checked 16 files in 10ms. No fixes applied.`** No errors, no warnings.

**Dirty file list (this workflow's own files): none.**

## Integration-tier interpretation (unchanged from attempt 1)

Re-confirmed: no `test:integration` script and no `INTEGRATION_TEST` env gate exists anywhere in this repo. This workflow adds zero new Postgres/Drizzle/NestJS surface (only `apps/web-next/**` + `package.json`/`pnpm-lock.yaml` changed). The unit suite (1004/1004 passing, including `cms.test.ts`'s Directus-boundary describe blocks) remains the load-bearing regression check for this tier — same interpretation as attempt 1, not re-derived from scratch since nothing about this tier changed between attempts.

## E2E — environment setup performed this run

Re-verified the environment independently rather than assuming attempt 1's setup was still valid:

1. **Directus**: confirmed `aiqadam-directus` container healthy via `curl http://localhost:8200/server/health` → `{"status":"ok"}` (container had been up continuously; no restart needed).
2. **Rebuilt `apps/web-next`** from the current (post-fix) source: `INTERNAL_DIRECTUS_URL=http://localhost:8200 pnpm --filter @aiqadam/web-next build` — succeeded (`Server built in 2.92s` / `Complete!`; `dist/server/entry.mjs` and `dist/client/` confirmed populated afterward). The same known Windows-only libuv exit-teardown assertion (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, `src/win/async.c`) recurred on process exit — confirmed unrelated to build correctness, matches attempt 1 and CodeDeveloper's own Retry-2 build log.
3. **Started the built server** on port 4322 (`HOST=0.0.0.0 PORT=4322 INTERNAL_DIRECTUS_URL=http://localhost:8200 node ./dist/server/entry.mjs`) against the local Directus container; confirmed serving (`curl http://localhost:4322/` → `200`).
4. **`apps/api` gap re-confirmed unchanged**: `curl http://localhost:3000/v1/events` → `404` (`Cannot GET /v1/events`), same pre-existing, out-of-scope condition documented in attempt 1. Re-confirmed `apps/web-next/src/lib/api-ssr.ts`'s `fetchUpcomingEvents` is not touched by this workflow (git diff unchanged from attempt 1's finding). This is why the same 8 scenarios skip — re-verified directly this run (`curl http://localhost:4322/events | grep 'href="/events/'` returned no matches, confirming the listing page still has no discoverable event links).
5. **Local fixture data re-confirmed present**: `curl http://localhost:8200/items/events?limit=3&fields=id,title,status` returned the same 3 UZ fixture events as attempt 1 (`454474ca-de0d-4cb1-834c-06269c68b426` "UAT Past Event (UZ)", `ec32c6d3-3c99-493e-89f6-6047100521ea` "UAT Live Event (UZ)", `48d04955-fa9d-493f-927c-f678273cfe05` "UAT Future Event (UZ)") — no seeding needed, no data drift since attempt 1.
6. **Stopped the test server cleanly afterward** (`taskkill` on the listening PID; confirmed no active LISTENING socket remained on 4322, only harmless `TIME_WAIT` remnants).

## Automated E2E spec results (full re-run, not trusted from CodeDeveloper's report)

`BASE_URL=http://localhost:4322 pnpm --filter @aiqadam/e2e exec playwright test tests/smoke-event-detail-lifecycle.spec.ts --reporter=list`:

```
Running 14 tests using 2 workers

  ok  1 [chromium-desktop] › ... AC-8 › not-found and wrong-country requests are byte-identical 404 responses (383ms)
  ok  2 [chromium-desktop] › ... AC-8 › nonexistent event id returns 404 (380ms)
  -   3 [chromium-desktop] › ... AC-1/2/3 › renders a tablist with upcoming/live/finished/forum tabs (skip)
  -   4 [chromium-desktop] › ... AC-1/2/3 › ?tab=finished deep-links via SSR (skip)
  -   5 [chromium-desktop] › ... AC-1/2/3 › ?tab=nonsense falls back to default tab (skip)
  -   6 [chromium-desktop] › ... AC-4 › signed-out visitor on members_only sees sign-in gate (skip)
  ok  7 [chromium-desktop] › ... AC-7 › gated event og-card 404s regardless of auth (453ms)
  ok  8 [chromium-mobile]  › ... AC-8 › nonexistent event id returns 404 (363ms)
  -   9 [chromium-mobile]  › ... AC-1/2/3 › renders a tablist (skip)
  ok 10 [chromium-mobile]  › ... AC-8 › not-found and wrong-country requests are byte-identical 404 responses (367ms)
  -  11 [chromium-mobile]  › ... AC-1/2/3 › ?tab=finished deep-links via SSR (skip)
  -  12 [chromium-mobile]  › ... AC-1/2/3 › ?tab=nonsense falls back to default tab (skip)
  -  13 [chromium-mobile]  › ... AC-4 › signed-out visitor on members_only sees sign-in gate (skip)
  ok 14 [chromium-mobile]  › ... AC-7 › gated event og-card 404s regardless of auth (341ms)

  8 skipped
  6 passed (26.1s)
```

**The 2 previously-failing byte-identical-404 tests (line 28, both projects) now PASS.** The other 4 previously-passing tests (both AC-8's `nonexistent event id returns 404` and both AC-7 og-card tests) still pass. The 8 skips are identical in identity and cause to attempt 1's 8 skips (lifecycle-tab ×3 and members_only-gate ×1, each ×2 projects) — all due to the pre-existing, out-of-scope `apps/api` `GET /v1/events` gap, re-confirmed above, not a new or different skip cause.

## Independent manual curl/diff/hex verification (per task's explicit instruction — not just re-running the automated spec)

Performed directly against the locally built+started server, independent of Playwright:

1. **Two different nonexistent event ids:**
   - `GET /events/00000000-0000-4000-8000-000000000000` → `404 Not Found`, `content-type: text/plain;charset=UTF-8`, body `not_found` (9 bytes).
   - `GET /events/00000000-0000-4000-8000-000000000001` → `404 Not Found`, `content-type: text/plain;charset=UTF-8`, body `not_found` (9 bytes).
   - `diff` of the two response bodies: **empty (byte-identical)**. `xxd`/hex dump of both: `6e6f 745f 666f 756e 64` (`not_found`) in both, confirmed identical.

2. **Wrong-country request vs. nonexistent-id request:**
   - Real published UZ event `454474ca-de0d-4cb1-834c-06269c68b426` requested with `Host: kz.aiqadam.org` (wrong-country tenant): `404 Not Found`, body `not_found` — `diff` against the nonexistent-id body from step 1: **empty (byte-identical)**.
   - Sanity check: the same event id requested with the correct `Host: uz.aiqadam.org`: `200 OK` — confirming the 404 above is genuinely a country-mismatch effect on a real, existing event, not a broken/always-404 lookup.

This independently confirms AC-8's core security property now holds at the actual HTTP layer: a not-found id, a different not-found id, and a real event requested from the wrong country tenant are all byte-for-byte indistinguishable (`404` / 9-byte `not_found` body), closing the enumeration side-channel attempt 1 found.

## Failed Tests

None. (Attempt 1's single failure — `not-found and wrong-country requests are byte-identical 404 responses`, `apps/e2e/tests/smoke-event-detail-lifecycle.spec.ts:28` — is now passing in both projects, confirmed both via the automated spec and independently via manual curl/diff/hex comparison above.)

## Flaky Tests

None.

## Skipped Tests (E2E, environment-limited, not flaky/not gate-blocking — unchanged cause from attempt 1)

Same 8 of 14 E2E runs skip, for the same reason as attempt 1: `apps/api` has no controller serving a bare `GET /v1/events` (re-confirmed `404` this run), so `apps/web-next`'s events *listing* page has no discoverable event links for the spec's discovery step to find, triggering the suite's documented discover-or-skip convention. Re-confirmed via `git diff` that `fetchUpcomingEvents` (the function that depends on this route) remains untouched by this workflow. This is a pre-existing, out-of-scope condition for FR-EVT-004 (detail page only, not the listing page's data source) — not a new or different skip cause introduced by the Retry 2 fix.

## Coverage

- **Unit**: 1004/1004 passing, independently re-verified in this run (not trusted from CodeDeveloper's report) — identical count to both the TestDesigner baseline and attempt 1.
- **Integration** (mocked-fetch Directus-boundary tests folded into `cms.test.ts`): exercised as part of the same 1004-test run; unchanged.
- **E2E**: AC-8's core security property — previously the one failing scenario — now passes in both projects, confirmed via the automated spec AND independent manual curl/diff/hex verification against two different nonexistent ids and a real wrong-country request. AC-7 (og-card 404) still passes cleanly in both projects. AC-1/2/3/AC-4's automated E2E coverage remains blocked by the same pre-existing, out-of-scope `apps/api` gap as attempt 1 (not re-verified manually again this run since nothing about that gap or the underlying page behavior changed — attempt 1's manual spot-checks of tablist rendering, `?tab=` SSR routing, and `?tab=nonsense` fallback stand, as the Retry 2 fix touched only the 404-response-body line, not any lifecycle-tab logic).

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Independent full re-run of the mandatory test sequence after CodeDeveloper's Retry 2 fix (apps/web-next/src/pages/events/[id].astro: 404 response body changed from `null` to the literal string 'not_found', matching the sibling og-card.png.ts route's convention, to stop Astro's node-adapter runtime from substituting its own path-echoing default error page). Did not trust CodeDeveloper's self-report — re-executed every check from scratch. Typecheck: 0 errors/0 warnings/41 hints (apps/web-next), identical to baseline. Biome: repo-wide 84 errors are the same pre-existing, untracked, gitignored apps/e2e/uat-results/ bundle documented in attempt 1 (unrelated to this diff, unrelated to the fix); every file this workflow touched (21 files, scoped check) is clean — 0 errors, 0 warnings. Unit suite: 1004/1004 passing, matches TestDesigner's baseline and attempt 1 exactly. No test:integration script/gate exists anywhere in this repo (unchanged finding); zero new DB surface in this PR, so the unit suite's mocked-Directus-boundary tests remain the correct integration-tier check. E2E: rebuilt apps/web-next from the current post-fix source, started it locally on port 4322 against the already-running local Directus container, and re-ran the full smoke-event-detail-lifecycle.spec.ts. RESULT: 6 passed, 0 failed, 8 skipped (up from attempt 1's 4 passed / 2 failed / 8 skipped) — THE 2 PREVIOUSLY-FAILING AC-8 BYTE-IDENTICAL-404 SCENARIOS NOW PASS IN BOTH chromium-desktop AND chromium-mobile PROJECTS, the 4 previously-passing scenarios (2× AC-8 'nonexistent event id returns 404', 2× AC-7 og-card 404) still pass, and the same 8 scenarios skip for the identical, re-confirmed pre-existing apps/api gap (no GET /v1/events route — untouched by this workflow's diff), not a new or different cause. Independently verified beyond the automated spec, per explicit task instruction: direct curl/diff/hex comparison of two different nonexistent event ids returned byte-identical 404/`not_found` (9-byte) bodies; a real published UZ event requested with a wrong-country Host header (kz.aiqadam.org) returned the same byte-identical 404/not_found response, while the same event with the correct Host header (uz.aiqadam.org) returned 200 — confirming AC-8's byte-identical-404 security property now holds end-to-end at the actual HTTP layer, closing the country-enumeration side-channel this workflow's attempt-1 run discovered. Server started and stopped cleanly (no lingering process). No regressions found anywhere in the suite."
  findings:
    - "Fix confirmed effective (informational, not a defect): apps/web-next/src/pages/events/[id].astro's 404 response body change (null → literal 'not_found' string) closes the AC-8 byte-identical-404 gap found in attempt 1. Confirmed via automated E2E spec (2/2 previously-failing scenarios now pass in both projects) AND independent manual curl/diff/hex verification against two different nonexistent ids plus a real wrong-country request against a genuine published event (with a same-event-correct-host sanity check confirming 200 as a control). No further action needed on this item."
    - "Pre-existing, out-of-scope environment gap (non-blocking, informational, unchanged from attempt 1): apps/api still has no controller serving a bare GET /v1/events, causing the same 8 of 14 E2E runs to hit their designed test.skip fallback. Re-confirmed this run that fetchUpcomingEvents remains untouched by this workflow's diff. Repeating attempt 1's recommendation: a follow-up issue for apps/api's missing public events-listing route would let this suite's remaining 4 scenarios (lifecycle tabs ×3, members_only gate ×1) run fully automated rather than relying on manual spot-checks, for this and future workflows touching /events."
    - "Biome repo-wide 'errors' count (84), unchanged from attempt 1: entirely attributable to apps/e2e/uat-results/, a local untracked gitignored Playwright trace bundle not covered by biome.json's files.ignore list. Confirmed zero errors on every file this workflow touched (21 files, explicit scoped check). Not this workflow's responsibility to fix; the biome.json ignore-list gap recommendation from attempt 1 still stands as a low-priority follow-up."
```
