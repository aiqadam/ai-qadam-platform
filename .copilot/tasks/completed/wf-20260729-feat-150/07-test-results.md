# Step 8 — Test Execution Results: FR-ADM-011

## Execution Order (per requirement-development.md Step 8)

### 1. `pnpm --filter api typecheck`

```
0 errors
```
**Pass.**

### 1b. `pnpm --filter web-next typecheck`

```
Result (243 files):
- 0 errors
- 0 warnings
- 41 hints
```
**Pass.** (Hints are pre-existing `FormEvent`-deprecation notices across
the repo, unrelated to this PR — same pattern present before this change
in `InvitesList.tsx`/`SponsorForm.tsx`/etc.)

### 2. `pnpm biome check .` (scoped to the 17 changed files)

```
Checked 17 files in 9ms. No fixes applied.
```
**Pass. Clean formatter/lint check.**

### 3. `pnpm --filter api test` (full suite)

```
Test Files  1 failed | 102 passed (103)
     Tests  1 failed | 1349 passed (1350)
```

**1 pre-existing failure, unrelated to this PR:**
`test/users.spec.ts:65` — `UsersService.upsertByAuthentikSubject >
updates email + displayName + lastLoginAt for an existing subject`
fails on a timestamp-ordering race (`expected 1785287235226 to be
greater than 1785287235282`). This is a documented, already-tracked
flake — `.copilot/context/workspace-state.md` "Queued follow-up
workflows" names it explicitly:
`wf-20260704-fix-096-pre-existing-api-test-flakes — 3 apps/api
test-design bugs unmasked by wf-20260704-fix-095 (users.spec.ts:65
timestamp race; ...)`. Confirmed unrelated to `admin-invites`/
`admin-user-roles`/`authentik.client`/`roles.ts` — the failing test
touches `UsersService`, a different module this workflow does not
modify, and the failure mode (a `Date.now()` ordering race in a fast
test run) is exactly as described in the pre-existing tracking entry.

All 87 new/modified tests in this PR's own scope pass:
- `admin-user-roles-service.spec.ts`: 24/24
- `admin-user-roles-controller.spec.ts`: 12/12
- `authentik-client.spec.ts` (2 new + all pre-existing): pass
- `admin-bootstrap.service.spec.ts` (fixture updated, all 20 pre-existing assertions unchanged in intent): 20/20

**Pass, with the one pre-existing/tracked flake excluded per
AGENTS.md §6.2 override policy (pre-existing on `origin/main`, this
PR's diff does not touch `users.spec.ts` or `UsersService`).**

### 3b. `pnpm --filter web-next test` (full suite)

```
Test Files  35 passed (35)
     Tests  946 passed (946)
```
**Pass. Zero failures.** Includes the new `roles.test.ts` (14/14).

### 4. `pnpm --filter api build`

```
> nest build
(exit 0, no errors)
```
**Pass.**

### Integration tests (Testcontainers)

N/A for this feature — no Postgres/Redis schema touched. Per
`06-test-strategy.md`, the rubric's integration-tier requirement is
satisfied by the hand-mocked `AuthentikClient`/`AuditEventsService` unit
coverage instead (no Testcontainers-Authentik double exists in this
repo). The full `pnpm --filter api test` run above already includes
every Testcontainers-backed integration test in the repo (for OTHER
modules) — none of them touch the files this PR changes, and none
failed.

## Infrastructure Pre-Flight

Not applicable — this workflow's tests are all unit-level (hand-mocked
`AuthentikClient`), consistent with `06-test-strategy.md`'s determination
that no live infrastructure (Docker/Authentik/Postgres) is required to
verify this PR's own test suite. Live-Authentik verification is
performed at Step 13 via `BP-UAT-021` against the local dev stack, which
DOES require infrastructure pre-flight — that pre-flight will be
performed at Step 13, not here.

## Gate Result

gate_result:
  status: passed
  summary: "Typecheck clean on both packages (0 errors), Biome clean on all 17 changed files, api build succeeds. Full api suite: 1349/1350 pass, the 1 failure is a pre-existing, already-tracked flake in an unrelated module (users.spec.ts, queued as wf-20260704-fix-096-pre-existing-api-test-flakes) not touched by this PR's diff. Full web-next suite: 946/946 pass. All 87 new/modified tests specific to this PR pass."
  findings:
    - "Pre-existing test failure test/users.spec.ts:65 is unrelated to this PR's diff (different module, already tracked in workspace-state.md's queued follow-up list) — proceeding per AGENTS.md 6.2/6.3's pre-existing-failure handling, not blocking this workflow."
