# 07 — Test Results — wf-20260801-fix-189

## Live verification: 5/5 PASS

Test surface: live Directus stack (`aiqadam-directus Up 2 days (healthy)`,
`http://localhost:8200`), running `bash infrastructure/directus/bootstrap.sh`
twice and probing the schema + write/read round-trip.

```
=== TOTALS: 5 pass, 0 fail ===
exit=0
```

## Per-test results

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | `onboarded_at` appears in `/fields/directus_users` after bootstrap | **PASS** | Field present in `.data[].field` list (jq `index()` returned a number, not null). |
| 2 | Full schema of new field matches spec | **PASS** | `type=timestamp  nullable=true  interface=datetime  readonly=true`. |
| 3 | Idempotency — re-running `bootstrap.sh` leaves the field unchanged | **PASS** | Snapshot diff of `/fields/directus_users/onboarded_at` before vs after second bootstrap run = identical. |
| 4 | `PATCH /users/{id}` body `{"onboarded_at":"2026-08-01T12:00:00.000Z"}` persists | **PASS** | Response body's `.data.onboarded_at` equals the test timestamp. |
| 5 | `GET /users/{id}?fields=onboarded_at` returns the written value | **PASS** | Read-side returns the same ISO timestamp as the write. |

Test user was a local fixture (`00848b01-3a60-48ae-ab3f-26310172e07b`,
`uat-verify-trace@example.com`). Cleanup step restored `onboarded_at`
to `null` so no production state is left dirty.

## Pre-existing warnings (NOT introduced by this PR)

The bootstrap.sh output shows:
```
⚠ Public policy not found — skipping public read for team_members.
```

This warning is unrelated to `onboarded_at`. It's from the
`wf-20260801-fix-188-public-policy-uuid-lookup` follow-up (separate
queued workflow — 8 lower public-read blocks in bootstrap.sh still use
a hardcoded UUID pin that doesn't match the real Public policy id on
local env). Not introduced by this PR, not blocking this PR.

## Apps/api test surface (skipped)

Existing apps/api tests for `onboarded_at`:
- `apps/api/test/me-profile-service.spec.ts:322-475` — 9 cases covering
  `setOnboardedAt`, `getOnboardedAt`, `toProfile.onboarded_at`, and the
  `ISS-USR-PROFILE-002` retry-without-onboarded_at fallback path. All
  pass today (they mock the Directus client — schema-agnostic).
- `apps/api/test/members-onboarding.integration.spec.ts:373` —
  `returns { onboarded: true } when onboarded_at is set`. Passes today
  for the same reason.

These tests are not re-run by this workflow because they don't depend
on real Directus schema state — they validate the API surface contract
that this schema fix unlocks. They will be re-executed by CI on the PR.

## Verdict

All 5 live verification tests PASS. Workflow proceeds to QualityGate.