# Step 8 — Test Results: ISS-USR-REG-001

> Output for: `.copilot/tasks/active/wf-20260718-fix-122/07-test-results.md`
> Agent: TestRunner
> Workflow: wf-20260718-fix-122 (issue-resolution)

---

## Honesty correction to `06-test-design.md`

`06-test-design.md`'s "Full apps/api suite re-run" claim of **99 files /
1275 tests, all passing, zero regressions** is not the reliably reproducible
state of this suite. I independently ran the full `apps/api` suite twice in
this session:

- **Run 1**: 99 files / 1275 tests — all passed.
- **Run 2**: 98 files / 1274 tests passed, **1 file / 1 test failed** —
  `test/users.spec.ts:65`, `UsersService.upsertByAuthentikSubject > updates
  email + displayName + lastLoginAt for an existing subject (no duplicate
  row)`: `AssertionError: expected 1784374509807 to be greater than
  1784374509901`.
- I then ran `test/users.spec.ts` **in isolation** a third time: it failed
  again, same assertion, same shape (`expect(second.lastLoginAt.getTime())
  .toBeGreaterThan(firstLogin.getTime())`).

This is a genuine, reproducible-on-a-fraction-of-runs race condition: the
test writes two rows in quick succession and asserts the second
`lastLoginAt` timestamp is strictly greater than the first, but the
underlying clock reads (JS `Date.now()` and/or Postgres `now()`, not
determined further here) can tie or invert at sub-2ms resolution. TestDesigner's
own single run happened to land on the passing side of that race — this is
consistent with, not contradictory to, a non-deterministic bug. I am
reporting the true, reproducible state rather than the lucky one.

**This file (`apps/api/test/users.spec.ts`) is untouched by this workflow**
— confirmed via `git status --short` / `git diff --name-only`: the full
changed-file list for this branch is `auth.controller.ts`, `auth.module.ts`,
`telegram.module.ts`, `registration.service.ts`, `password-schema.ts`,
`registration-service.spec.ts`, `SignUpForm.tsx`, `sign-up.astro`,
`customer/index.ts`, plus `.copilot/` workflow artifacts — no `users.spec.ts`
or anything in its dependency path.

**This is already a known, tracked issue.** `.copilot/context/workspace-state.md`
line 51 names the queued follow-up workflow explicitly:

> `wf-20260704-fix-096-pre-existing-api-test-flakes` — owns 3 apps/api
> test-design bugs unmasked by `wf-20260704-fix-095` (`users.spec.ts:65`
> timestamp race; `telegram-auth-controller.spec.ts:161` reflect-metadata;
> `port-guard.spec.ts` cases 4+8 Linux-only mocks).

That follow-up was queued 2026-07-04 and, based on everything visible in
this session's context (no completed/archived workflow directory for it,
no registry entry marking it resolved), has never actually been executed —
this bug has been sitting there for two weeks. It is not this PR's job to
fix it, and per this agent's own diagnosis table (Failure Type →
Classification) a pre-existing, unrelated, already-tracked flake does not
block this gate. It is reported here in full so the gate result is honest
rather than a repeat of the same "got lucky on timing" claim.

---

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| apps/api unit+integration (`vitest run`, `vitest.config.ts`, Testcontainers Postgres) — run 1 | 1275 | 1275 | 0 | 0 |
| apps/api unit+integration (`vitest run`, `vitest.config.ts`, Testcontainers Postgres) — run 2 | 1275 | 1274 | 1 | 0 |
| apps/api `test/users.spec.ts` in isolation (3rd confirmation run) | 22 | 21 | 1 | 0 |
| apps/api `test/registration-service.spec.ts` in isolation (new spec, this PR) | 8 | 8 | 0 | 0 |
| apps/api Testcontainers-backed integration specs directly (`checkin.integration.spec.ts`, `members-onboarding.integration.spec.ts`) | 29 | 29 | 0 | 0 |
| apps/web-next (`vitest run`) | 923 | 923 | 0 | 0 |

Note on "Integration": this repo has no separate `test:integration` script
and no `INTEGRATION_TEST` env gate (confirmed via `grep -rn INTEGRATION_TEST
apps/api` and `grep test:integration package.json apps/api/package.json` —
both empty). `apps/api/vitest.config.ts` is itself the Testcontainers-backed
config (`globalSetup: ['./test/setup-pg.ts']`, real Postgres container,
`fileParallelism: false`) and `pnpm test` / `vitest run` already runs both
plain `*.spec.ts` and `*.integration.spec.ts` files together in the same
pass — there is no separate integration-tier command to invoke beyond what
Execution Summary rows 1–2 and 5 already cover. Docker was confirmed
available and running (`docker info` succeeded; `docker ps` showed a live
`testcontainers-ryuk` container plus the project's docker-compose stack:
Postgres, Directus, Authentik, Mailpit, MinIO, etc., all healthy) before any
test run — no infrastructure pre-flight gap to report.

I agree with `06-test-strategy.md`'s conclusion that this PR does not add a
new integration-tier surface: I independently confirmed `RegistrationService`
takes `AuthentikClient`, `DirectusUsersBridgeService`, `DirectusClient`, and
`InteractionsService` as constructor dependencies — all external-API-backed
services — with no direct Drizzle/`db.*` import in `registration.service.ts`.
Ran the existing Testcontainers-backed integration specs directly to confirm
nothing broke (29/29 pass) rather than skipping this tier outright.

---

## Type Check

`pnpm typecheck` (repo-wide, all 4 workspace packages) — **clean, 0 errors.**

`apps/web-next` reported 39 pre-existing hints (deprecated `React.FormEvent`
usage, a few unused-variable lints in test files) — all in files untouched
by this branch (`MembersList.tsx`, `SaveCohortModal.tsx`, `SponsorForm.tsx`,
`TgSegmentsList.tsx`, `api-ssr.test.ts`, `cms-landing-page.test.ts`,
`csat-form.test.ts`, `use-tg-broadcasts.test.ts`, `onboard.astro`) — 0
warnings, 0 errors. Matches CodeDeveloper's re-run pass ("0 errors, 0
warnings... 39 pre-existing hints").

---

## Lint / Format Check

`pnpm biome check .` (repo-wide) — **clean, 0 errors.** 2 pre-existing
warnings, confirmed by direct re-run, not just cited from prior agents:

- `apps/web-next/src/blocks/workspace/AsyncSelect.tsx:251` — "Suppression
  comment has no effect" (`suppressions/unused`)
- `apps/web-next/src/blocks/workspace/TgBroadcastComposer.tsx:478` — same
  rule

Both files confirmed **not** in this branch's changed-file list (`git
status --short`) — genuinely pre-existing and unrelated, same two files
CodeDeveloper's `03-code-summary.md` and TestDesigner's `06-test-design.md`
both already flagged. No dirty/unformatted files anywhere in the 624 files
checked.

---

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| `UsersService.upsertByAuthentikSubject > updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts:65` | `AssertionError: expected <ms> to be greater than <ms>` — `expect(second.lastLoginAt.getTime()).toBeGreaterThan(firstLogin.getTime())` fails when both writes land within the same clock-resolution window | **Pre-existing, unrelated to this PR.** File not touched by this workflow. Already tracked in `.copilot/context/workspace-state.md` (line 51) as one of 3 bugs owned by follow-up workflow `wf-20260704-fix-096-pre-existing-api-test-flakes`, queued 2026-07-04, apparently never executed. Test-design bug (assertion assumes strictly-increasing timestamps at sub-2ms write intervals, which is not guaranteed) — belongs to TestDesigner on that future workflow, not CodeDeveloper on this one. |

No other failures in any suite, any run.

---

## Flaky Tests

| Test | File | Behavior observed |
|---|---|---|
| `updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts:65` | **Confirmed flaky, not a hard failure.** Passed in run 1 of the full suite; failed in run 2 of the full suite; failed again when re-run in isolation. Root cause is a timestamp-precision race, not environmental noise from this branch's changes — same file, same assertion, independent of any code touched by this PR. Not tagged `@flaky` in source (no such convention exists in this repo for unit tests); reporting here instead per this agent's failure-diagnosis table. |

No flakiness observed in any of `registration-service.spec.ts` (new, this
PR), the two Testcontainers integration specs, or the full web-next suite —
each was run and reproduced clean.

---

## Coverage

- **`RegistrationService`** (new, this PR): all 6 `describe` blocks /
  8 tests target its full behavioral surface — happy path (including the
  MAJOR-1 non-leaking `recoveryUrl` regression pin), duplicate-email
  non-leak, orphaned-account rollback (both the clean-disable and
  disable-also-fails variants), Directus-link-failure-is-non-fatal,
  email-dispatch-failure-is-non-fatal, and `deriveUsername`'s output-shape
  contract via two email variants. Confirmed passing in isolation (8/8) and
  within the full suite (both runs).
- **`password-schema.ts`** (new, this PR — `isAllOneCharacter`,
  `isCommonPassword`, `isWeakPassword`, `passwordField`): **no dedicated
  spec file exists.** This is a real, currently-uncovered gap on a
  security-relevant file introduced by this PR's retry pass (MAJOR-3 fix).
  TestDesigner's `06-test-design.md` names this as a known gap with a
  concrete follow-up recommendation (`apps/api/test/password-schema.spec.ts`
  mirroring `email-schema.spec.ts`) but did not close it in this pass. I am
  not blocking this gate on it (the task brief scoped TestDesigner's pass to
  `registration-service.spec.ts` specifically, and the function is
  exercised indirectly end-to-end through `registration-service.spec.ts`'s
  happy-path/negative tests since `registerSchema` runs before the
  controller ever calls the service) — flagging it here as a real,
  unresolved coverage gap rather than silently accepting TestDesigner's
  "known gap, not blocking" framing without independent comment.
- **`SignUpForm.tsx`'s `validate()`** (frontend, this PR): no dedicated
  test file, confirmed. The function is extracted as a pure function
  specifically to ease a future test pass (per `03-code-summary.md`), but
  as of this run it has zero direct unit coverage. Full web-next suite
  (923 tests) passing does not exercise this new file at all — confirmed
  no new test file appeared for it and no existing test imports it.
- **Auth controller / honeypot rename / password field wiring**: covered
  only transitively via `registration-service.spec.ts`'s
  black-box-through-`register()` assertions; no dedicated
  `auth-controller-register.spec.ts` exists (TestDesigner's own named gap).
- **Integration tier**: no new Postgres/Drizzle surface added by this PR
  (confirmed by direct code read of `registration.service.ts`'s
  constructor — no `db`/Drizzle import). Existing integration specs
  (`checkin.integration.spec.ts`, `members-onboarding.integration.spec.ts`)
  re-run clean, confirming no regression to the surface this PR's new
  module boundary touches (`AuthModule` → `InteractionsModule` DI edge).
- **E2E**: none written, deferred per `06-test-design.md`, candidate
  `apps/e2e/src/auth/sign-up.spec.ts`, blocked on live QA Authentik
  reachability. Not run this pass — genuinely not present, not silently
  skipped.

---

## Orchestrator follow-up (post-TestRunner)

TestRunner flagged `apps/api/src/lib/password-schema.ts` as a real,
unresolved coverage gap (only indirect coverage via
`registration-service.spec.ts`'s black-box assertions) — this is a
security-relevant file (the MAJOR-3 fix from `04-security-review.md`) and
cheap to close directly, so the Orchestrator wrote
`apps/api/test/password-schema.spec.ts` (9 tests: `isWeakPassword`'s
all-one-character + common-password-blocklist branches, `passwordField`'s
composed length+weak-password Zod schema, a custom-`minLength` case)
mirroring `email-schema.spec.ts`'s exact style. Verified directly: `npx
vitest run test/password-schema.spec.ts` → 9/9 pass; `pnpm --filter
@aiqadam/api typecheck` → clean; `pnpm biome check` on the new file → clean.
This closes the one coverage gap TestRunner judged worth closing before
merge; the remaining `Known Limitations` below (frontend `validate()` spec,
controller-level throttle spec, E2E) are unchanged and still deferred.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Full required check sequence run and independently verified, not just cited: repo-wide typecheck clean (0 errors); repo-wide biome check clean (0 errors, 2 pre-existing unrelated warnings in AsyncSelect.tsx/TgBroadcastComposer.tsx, confirmed untouched by this branch); apps/api full suite run TWICE (99f/1275t all-pass on run 1, 98f/1274t pass + 1 failure on run 2) plus a 3rd isolated confirmation run of the failing file — test/users.spec.ts:65 is a genuine, reproducible timestamp-race flake, confirmed pre-existing (file untouched by this PR) and already tracked in workspace-state.md as wf-20260704-fix-096-pre-existing-api-test-flakes (queued 2026-07-04, never executed). New registration-service.spec.ts (8 tests) passes cleanly in isolation and within both full-suite runs. Docker confirmed available and running; this repo folds its Testcontainers-backed integration tier into apps/api's single vitest.config.ts run (no separate test:integration script or INTEGRATION_TEST env gate exists) — independently re-ran the two existing *.integration.spec.ts files directly (29/29 pass), confirming no regression to the integration surface despite this PR adding no new Drizzle/Postgres access of its own (verified by direct code read of registration.service.ts's constructor dependencies: AuthentikClient/DirectusClient/DirectusUsersBridgeService/InteractionsService, all external-API-backed). apps/web-next full suite (923 tests) re-run clean, zero regressions. The one failure is classified pre-existing/unrelated per this agent's own diagnosis table and does not block this gate; it is disclosed honestly rather than reported as a false zero, matching this repo's established honest-disclosure convention for pre-existing, already-tracked failures."
  findings:
    - "CORRECTION to 06-test-design.md: its claimed '99 files / 1275 tests, all passing, zero regressions' full-suite result is not reliably reproducible. Independently re-ran the full apps/api suite twice: run 1 matched (1275/1275 pass), run 2 did not (1274/1275, 1 failure at test/users.spec.ts:65). A 3rd isolated run of that file alone reproduced the same failure. This is a genuine non-deterministic race (AssertionError: expected <ms> to be greater than <ms> on two lastLoginAt writes in quick succession), not evidence contradicting the pre-existing-bug classification -- TestDesigner's single run landed on the passing side of the same race."
    - "Confirmed via git status/git diff that apps/api/test/users.spec.ts is not among this branch's changed files -- the failure is unrelated to RegistrationService, password-schema.ts, or any file this workflow touched."
    - "Confirmed via workspace-state.md line 51 that this exact failure (users.spec.ts:65 timestamp race) is already named as one of 3 bugs owned by queued follow-up workflow wf-20260704-fix-096-pre-existing-api-test-flakes (queued 2026-07-04); no completed/archived record of that workflow exists in this session's visible context, so it appears not yet executed."
    - "This repo has no test:integration script and no INTEGRATION_TEST env var anywhere in apps/api (confirmed via grep) -- apps/api/vitest.config.ts IS the Testcontainers-backed config (globalSetup: setup-pg.ts, real Postgres container) and pnpm test / vitest run already covers both *.spec.ts and *.integration.spec.ts together. Independently re-ran the two existing integration specs directly (checkin.integration.spec.ts, members-onboarding.integration.spec.ts -- 29/29 pass) to positively confirm no regression, rather than treating '06-test-strategy.md says no new integration surface' as license to skip this tier."
    - "Docker pre-flight was not a gap: docker info succeeded and docker ps showed a live testcontainers-ryuk container plus the full project docker-compose stack already healthy before any test run began."
    - "Real, unresolved coverage gap flagged (not present in TestDesigner's framing as a blocker, and I agree it should not block this gate, but it should be visible): apps/api/src/lib/password-schema.ts (new in this PR's security retry pass) has no dedicated unit spec -- only indirect coverage via registration-service.spec.ts's black-box register() assertions."
  known_limitations:
    - "test/users.spec.ts:65 pre-existing timestamp-race flake remains unresolved -- owned by wf-20260704-fix-096-pre-existing-api-test-flakes, not this workflow. Recommend the Orchestrator confirm whether that follow-up workflow should finally be dispatched, since it has been queued and idle for two weeks."
    - "password-schema.ts has no dedicated spec file (TestDesigner's named gap, not closed in this pass)."
    - "SignUpForm.tsx's validate() has no dedicated frontend spec (TestDesigner's named gap, not closed in this pass)."
    - "auth-controller-register.spec.ts / throttler-guard register()-specific coverage does not exist (TestDesigner's named gap)."
    - "E2E sign-up flow deferred, not run this pass -- candidate apps/e2e/src/auth/sign-up.spec.ts, blocked on live QA Authentik reachability."
```
