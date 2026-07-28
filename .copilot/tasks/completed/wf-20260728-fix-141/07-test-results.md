# Step 8: Execute Tests — wf-20260728-fix-141

## Targeted suite

```
pnpm exec vitest run test/me-profile-service.spec.ts \
  test/members-onboarding.service.spec.ts \
  test/members-onboarding.integration.spec.ts \
  test/referrals-service.spec.ts
```
Result: **77/77 passing.**

## Full apps/api suite (Testcontainers)

```
pnpm test
```
Result: **1293/1294 passing.** The single failure,
`test/users.spec.ts:65` (`UsersService.upsertByAuthentikSubject` —
timestamp-race test-design bug), is confirmed pre-existing and unrelated:

```
git diff --stat main -- apps/api/test/users.spec.ts apps/api/src/modules/users/
```
returns empty (no diff touches this file or module). This flake is
already tracked by the queued follow-up
`wf-20260704-fix-096-pre-existing-api-test-flakes`
(`.copilot/issues/registry.md` — `ISS-TEST-WEB-001` resolution notes list
this exact test as one of 3 pre-existing flakes unmasked by an earlier,
unrelated fix).

## Fail-before / pass-after verification

```
git stash push -- apps/api/src/modules/me-profile/me-profile.service.ts
pnpm exec vitest run test/me-profile-service.spec.ts   # 15/27 fail
git stash pop
pnpm exec vitest run test/me-profile-service.spec.ts   # 27/27 pass
```

Confirms the regression tests genuinely exercise the fix, not just
compile against it.

## Type checking and linting

- `pnpm exec tsc --noEmit` (apps/api): clean.
- `pnpm exec biome check` on all changed files: clean, no fixes applied.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "77/77 targeted, 1293/1294 full suite (1 pre-existing unrelated flake, confirmed absent from diff). Fail-before/pass-after verified live. tsc + biome clean."
```
