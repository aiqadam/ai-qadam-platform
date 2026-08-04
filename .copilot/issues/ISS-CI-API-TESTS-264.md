# ISS-CI-API-TESTS-264 — CI: `apps/api` test suite red on main — `interactions-service.spec.ts` Directus mock gap + `event-broadcast-topic-filtering` teardown TypeError

| Field | Value |
|---|---|
| ID | ISS-CI-API-TESTS-264 |
| Severity | blocker |
| Module | api/interactions, api/testing |
| Status | resolved |
| Reported | 2026-08-04 |
| Resolved | 2026-08-04 |
| Workflow | wf-20260804-fix-211-ci-api-tests ([PR #270](https://github.com/aiqadam/ai-qadam-platform/pull/270) squash `a6954b4`) |
| Reporter | tvolodi (GitHub issue) |
| Related | FR-NTF-005, FR-NTF-002, ISS-NTF-002-TESTINFRA |
| Business-Process | — |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/264 |

## Symptom

`apps/api`'s test suite failing on every CI run against `main`, blocking
`build`/`ci`/`ci-cd` checks repo-wide for every open PR regardless of what
the PR touches (reproduced directly on `main` HEAD `c2eeac0`, and on
unrelated PR #263). Two independent failures:

1. `test/interactions-service.spec.ts` — 10 tests failing with
   `Error: Failed to resolve user ...: invalid response from Directus`
   thrown from `InteractionsService.resolveUser()`.
2. `test/event-broadcast-topic-filtering.integration.spec.ts` — `afterAll`
   throws `TypeError: Cannot read properties of undefined (reading 'close')`,
   masking the real root cause.

Full detail in the GitHub issue body.

## Root cause

**Failure 1:** FR-NTF-005 added a second Directus read to
`InteractionsService.deliverToRecipient()` — a per-recipient
`resolveUser()` call (for the master channel-toggle check) — layered on
top of the pre-existing batch `resolveRecipients()` call. The test file's
`wireDirectusUserLookup()` helper only stubbed `dx.get` once
(`mockResolvedValueOnce`) for the batch call; the second, per-recipient
call fell through to the bare `vi.fn()` with no default, resolving
`undefined` and tripping `resolveUser()`'s own defensive
`if (!res || !res.data) throw ...` guard (itself an FR-NTF-005 addition,
correctly defensive — the bug is the missing test fixture, not the
production code).

**Failure 2:** `event-broadcast-topic-filtering.integration.spec.ts`
requires a **live Directus + Authentik** — its `TestingModule` imports
`InteractionsModule`, which transitively pulls in `AuthModule`, which
discovers the OIDC issuer at bootstrap
(`Issuer.discover(env.OIDC_ISSUER_URL)`). CI provisions Testcontainers
**Postgres only** (`test/setup-pg.ts`); no Directus or Authentik container
exists anywhere in this repo's CI or test tooling — confirmed by reading
`.github/workflows/ci-cd.yml` (zero Directus/Authentik references) and
reproducing locally with the placeholder env values `vitest.config.ts` sets
(`getaddrinfo ENOTFOUND placeholder.invalid`, then, once that's fixed,
`RPError: outgoing request timed out after 3500ms` from OIDC discovery).
`beforeAll` throws before `module` is ever assigned, and the unguarded
`await module.close()` in `afterAll` then throws its own `TypeError`,
masking the real error above it. This exact deferral
(`ISS-NTF-002-TESTINFRA`) had already been *named* by
`wf-20260803-feat-207-event-announcement-fanout` and `FR-NTF-002.md` as the
follow-up for this infra gap, but the issue file itself was never created —
found and filed as part of this resolution.

## Acceptance criteria

- [x] AC-1: `test/interactions-service.spec.ts` — every `dispatch()`/
      `deliverToRecipient()` call path has a matching Directus stub for
      both the batch `resolveRecipients()` call and the per-recipient
      `resolveUser()` call; all 11 tests pass.
- [x] AC-2: `test/event-broadcast-topic-filtering.integration.spec.ts`'s
      `afterAll` no longer throws a misleading `TypeError` when `beforeAll`
      fails; the real underlying error is what surfaces.
- [x] AC-3: The suite doesn't fail the CI gate given CI has no live
      Directus/Authentik to satisfy it — `describe.skip`'d with a comment
      pointing at the new `ISS-NTF-002-TESTINFRA` tracking issue, matching
      the GitHub issue's own stated "fix direction (b)".
- [x] AC-4: Full `apps/api` suite passes except the one pre-existing,
      already-tracked flake (`ISS-USR-CLOCK-001`, `users.spec.ts` clock
      ordering) and the newly-skipped integration suite.

## Resolution

Two code changes in `apps/api`:

1. **`test/interactions-service.spec.ts`** — `wireDirectusUserLookup()` now
   stubs `dx.get` for the batch lookup **and** appends one
   `mockResolvedValueOnce({ data: user })` per user for the subsequent
   per-recipient `resolveUser()` call(s), so every existing test's fixture
   setup transparently covers both call sites without per-test changes.
   Updated the one test that asserted an exact `dx.get` call count
   (`toHaveBeenCalledTimes(1)` → `2`, documenting the real
   batch-then-per-recipient sequence).
2. **`test/event-broadcast-topic-filtering.integration.spec.ts`** —
   guarded `afterAll`'s `module.close()` with `if (module)`, so a
   `beforeAll` failure surfaces its real error instead of a masking
   `TypeError`; confirmed locally this now correctly reports
   `RPError: outgoing request timed out after 3500ms` (OIDC discovery).
   Since CI has no live Directus/Authentik to satisfy this suite even with
   that fix, marked the whole `describe` block `.skip` with a comment
   explaining why and pointing at the new `ISS-NTF-002-TESTINFRA` issue
   (created this session — previously referenced by name in
   `FR-NTF-002.md` and `wf-20260803-feat-207`'s artifacts but never
   actually filed).

Also fixed, found while working in `.copilot/issues/registry.md`: its last
3 rows had been appended in UTF-16LE while the rest of the file is UTF-8
(a prior session's `PowerShell` `Out-File`/`>>` encoding mismatch),
rendering as space-separated garbage in most viewers/tools. Repaired via
`iconv` at the exact byte offset the corruption started, verified the
recovered text matches the original content, no content changes.

**Verification:** Full local `apps/api` suite:
`Test Files 2 failed | 124 passed (126)` → after this fix,
`interactions-service.spec.ts` and `event-broadcast-topic-filtering.integration.spec.ts`
both pass/skip cleanly; only remaining failure is the pre-existing, already
tracked `ISS-USR-CLOCK-001` (`users.spec.ts`, unrelated clock-ordering
flake, out of scope here per that issue's own resolution history).

### Honesty disclosure

`ISS-NTF-002-TESTINFRA`'s own acceptance criteria (provisioning real
Directus/Authentik test infrastructure) are **not** addressed here — this
issue only stops the CI-red bleeding by skipping the one affected suite,
per the GitHub issue's own explicitly stated fix direction. Implementing
that infrastructure is out of scope for this fix and tracked separately.
