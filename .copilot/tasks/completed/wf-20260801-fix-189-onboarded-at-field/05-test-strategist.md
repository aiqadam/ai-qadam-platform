# 05 — Test Strategist — wf-20260801-fix-189

## Test surface

This is a **schema-only fix** (no application code, no API surface).
The test surface is therefore:

1. **Live Directus schema** — `/fields/directus_users` after `bootstrap.sh`
   re-run shows `onboarded_at` present with the right shape.
2. **Idempotency** — re-running `bootstrap.sh` does not error and does not
   modify the field (skip-on-existence path).
3. **End-to-end write** — Directus `PATCH /users/{id}` with body
   `{onboarded_at: "..."}` succeeds and the value persists.
4. **End-to-end read** — `GET /users/{id}?fields=onboarded_at` returns
   the value.
5. **App code unit tests** — existing
   `apps/api/test/me-profile-service.spec.ts` cases for `setOnboardedAt`
   / `getOnboardedAt` / `toProfile.onboarded_at` continue to pass
   (these tests don't depend on real schema; they mock the client).

## Test pyramid

- **Unit tests**: 0 new (existing `apps/api` tests pin the contract —
  see §6 below).
- **Integration tests (Testcontainers)**: N/A for this workflow.
  Directus schema is provisioned by `bootstrap.sh`, not by Testcontainers.
- **Live curl probes (Steps 7.x)**: 5 probes — see below.

## Live curl test plan

| # | Test | Pass criterion |
|---|---|---|
| 1 | `GET /fields/directus_users` — does `onboarded_at` exist after first bootstrap re-run? | Field present in `.data[].field` list. |
| 2 | `GET /fields/directus_users/onboarded_at` — full schema of new field | `type=timestamp`, `schema.is_nullable=true`, `meta.interface=datetime`, `meta.readonly=true`. |
| 3 | Idempotency: re-run `bash infrastructure/directus/bootstrap.sh` | Exits 0; no field-delta (re-GET schema shows same field, no diff). |
| 4 | `PATCH /users/{id}` body `{onboarded_at: "2026-08-01T..."}` | 200 OK; subsequent `GET /users/{id}` shows `onboarded_at` populated. |
| 5 | `GET /users/{id}?fields=onboarded_at` after write | Returns the ISO timestamp string. |

## Why not run `apps/api` vitest

The existing 4 test files (`me-profile-service.spec.ts`, etc.) for
`onboarded_at` paths run against a mocked `DirectusClient` and pass
today regardless of schema state — they don't validate real Directus
behavior. Running them adds zero evidence about this fix. Vitest
typecheck / unit suite will still be checked at the CI level.

## Why not Testcontainers

Testcontainers is for `apps/api` integration tests against a fresh
Postgres+Directus stack — overkill for a single-column schema addition.
The bootstrap.sh script itself is the integration-test surface; running
it against the live local Directus is the equivalent of an integration
test for this change.