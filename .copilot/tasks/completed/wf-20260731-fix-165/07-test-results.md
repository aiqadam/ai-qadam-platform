# Step 8 — Test Execution Results

No live infrastructure required for this fix (pure unit-level mock tests
against `DirectusClient`, same pattern as the rest of
`registrations-directus.spec.ts` — Testcontainers Postgres not needed for
this service, per that file's own header comment).

## Targeted

```
apps/api> pnpm exec vitest run test/registrations-directus.spec.ts
Test Files  1 passed (1)
     Tests  33 passed (33)
```

## Full suite

```
apps/api> pnpm exec vitest run
Test Files  1 failed | 102 passed (103)
     Tests  1 failed | 1355 passed (1356)
```

The 1 failure (`test/users.spec.ts:65`,
`UsersService.upsertByAuthentikSubject`) is a pre-existing timestamp
clock-race flake, already tracked in `workspace-state.md`'s queued
follow-up `wf-20260704-fix-096-pre-existing-api-test-flakes` — confirmed
unrelated by re-running in isolation (passes cleanly), and it touches a
completely different file/module than this fix.

## Static checks

```
apps/api> pnpm exec tsc --noEmit -p .        → clean
> pnpm exec biome check apps/api/src/modules/registrations/registrations-directus.service.ts
Checked 1 file. No fixes applied.
```

## Gate

`passed` → Step 9 (Registry Update). Regression test requirement met:
both new tests independently verified fail-before/pass-after against the
exact live bug from the issue's screenshot evidence.
