# ISS-NTF-002-TESTINFRA — Directus (+ Authentik) Testcontainer infrastructure missing for `apps/api` integration tests

| Field | Value |
|---|---|
| ID | ISS-NTF-002-TESTINFRA |
| Severity | minor |
| Module | api/testing-infrastructure |
| Status | open |
| Reported | 2026-08-04 |
| Resolved | — |
| Workflow | none assigned yet |
| Reporter | wf-20260803-feat-207-event-announcement-fanout (named this issue as the deferral target without creating it) |
| Related | FR-NTF-002, ISS-CI-API-TESTS-264 |
| Business-Process | — |
| GitHub-Issue | (not yet created) |

## Symptom

`apps/api`'s only global test infrastructure (`test/setup-pg.ts`) provisions
a Testcontainers **Postgres** instance. Nothing in the repo provisions a live
**Directus** instance or a live **Authentik** (OIDC) instance for tests.

Any integration spec that builds a real Nest `TestingModule` pulling in
`DirectusModule` and/or `AuthModule` (directly, or transitively via a module
like `InteractionsModule`) fails in CI with connection errors — e.g.
`getaddrinfo ENOTFOUND placeholder.invalid` (Directus) or
`RPError: outgoing request timed out after 3500ms` during
`Issuer.discover(env.OIDC_ISSUER_URL)` (Authentik/OIDC), since CI's
placeholder env values point nowhere real.

Currently affected: `test/event-broadcast-topic-filtering.integration.spec.ts`
(skipped — see [ISS-CI-API-TESTS-264](ISS-CI-API-TESTS-264.md)). The sibling
`test/integration/*.int-spec.ts` files (`preferences-channel-toggles`,
`preferences-topic-interests`, `notifications-channel-dispatch`) currently
pass in this same CI environment — confirmed via a full local `apps/api`
suite run during ISS-CI-API-TESTS-264's investigation — but they carry the
same `// TODO: Start Testcontainers` comment and would hit the identical gap
the moment their `beforeAll` setup is completed to actually exercise a real
Directus round trip. This issue is the single tracking point for whichever
of them (or other future specs) needs that infrastructure.

## Impact

- `event-broadcast-topic-filtering.integration.spec.ts` cannot verify FR-NTF-002's
  AC-1/AC-2/AC-4/AC-5 against a real Directus + real topic-filtering fan-out —
  currently `describe.skip`'d, so it provides zero regression coverage for
  those ACs beyond the 7 already-passing unit tests.
- Every future integration spec that needs a real Directus/Authentik will hit
  the same wall unless it stays scoped to mocked dependencies.

## Root cause

No Testcontainers module for Directus (or a lightweight Directus-compatible
mock server) has been added to this repo's test tooling. Directus itself
doesn't ship an official Testcontainers module; standing one up requires
either (a) a custom Testcontainers definition that boots the Directus Docker
image with a seeded schema/snapshot, or (b) a docker-compose-based CI step
that starts the existing local dev stack's Directus + Postgres + Authentik
services before running this test file specifically (separate job/step from
the main `pnpm test`, since the rest of the suite must stay fast and
container-free).

## Acceptance criteria

- [ ] AC-1: A repeatable way to run `event-broadcast-topic-filtering.integration.spec.ts`
      (and any other Directus/Authentik-dependent integration spec) against a
      real, ephemeral Directus + Authentik instance, either via Testcontainers
      or a scoped CI job using the existing docker-compose stack.
- [ ] AC-2: `event-broadcast-topic-filtering.integration.spec.ts`'s `describe.skip`
      is removed and the suite passes in CI using that infrastructure.
- [ ] AC-3: No regression to the rest of `apps/api`'s test run time/flakiness —
      this infra must not become a prerequisite for the existing fast
      Postgres-only suite.

## Honesty disclosure

Filed as a byproduct of resolving [ISS-CI-API-TESTS-264](ISS-CI-API-TESTS-264.md)
(GitHub issue [#264](https://github.com/aiqadam/ai-qadam-platform/issues/264)),
which found this issue had been *named* as a deferral target by
`wf-20260803-feat-207-event-announcement-fanout` and `FR-NTF-002.md` but never
actually created as a tracked file — those references pointed at nothing. No
design work on the Testcontainers/CI-job approach has been done yet; AC-1's
two alternatives are both plausible and the choice is deferred to whoever
picks this up.
