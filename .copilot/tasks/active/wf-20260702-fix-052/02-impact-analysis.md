# Step 2 — Impact Analysis (wf-20260702-fix-052, ISS-CI-002)

## Validated Requirement

ISS-CI-002: `pnpm audit --prod --audit-level=high` blocks every PR to
`main` because `apps/api > nodemailer@6.10.1` carries two unpatched
high-severity CVEs (GHSA-rcmh-qjqh-p98v DoS in addressparser;
GHSA-p6gq-j5cr-w38f SSRF via raw message option). Both CVEs are
patched in `nodemailer@7.0.11` and later. Storybook rolldown build
failure is **not** a blocker (job has `continue-on-error: true`).

## Affected Layers

| Layer | Affected? | Detail |
|---|---|---|
| API (NestJS) | ✅ | `apps/api/src/modules/email/email.service.ts` imports `nodemailer`'s `createTransport` and `Transporter`. Single production caller. |
| DB Schema | ❌ | No entity changes. |
| Shared Types | ❌ | No new Zod schemas needed. |
| Frontend (`apps/web`, `apps/web-next`) | ❌ | No frontend usage of nodemailer. |
| Bot (`apps/bot`) | ❌ | No bot usage. |
| Workers (`apps/workers`) | ❌ | No workers usage. |
| Storybook (`apps/storybook`) | ❌ | No nodemailer usage. Out of scope. |
| Build / CI | ✅ | `.github/workflows/supply-chain.yml` runs `pnpm audit --prod --audit-level=high` (no `continue-on-error`) — this is the merge gate that fails. |
| `apps/api` package.json | ✅ | Bump `nodemailer: ^6.9.16` → `^7.0.11`; bump `@types/nodemailer: ^6.4.24` → compatible range. |
| Lockfile (`pnpm-lock.yaml`) | ✅ | Auto-refreshed by `pnpm install`. |

## API Surface Changes

None. The email service's public surface
(`send(message: EmailMessage)`, `getProvider()`, `getMode()`) is
unchanged. The internal `createTransport` / `sendMail` calls are
preserved by nodemailer 7.x.

## Cross-Module Calls

None introduced; none removed. `EmailService` continues to be the only
caller of nodemailer in `apps/api`.

## Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| Nodemailer 6 → 7 is a MAJOR version bump | medium | Code usage is minimal: `createTransport({...})` and `transporter.sendMail({...})`. Both APIs are preserved in 7.x per upstream changelog. We re-run the unit tests after the bump. |
| `@types/nodemailer` may not cover 7.x typings | low | `@types/nodemailer` 6.4.x is the only published major; we keep it (it ships ambient types that are API-shape compatible across 6.x and 7.x). If typecheck fails, we add a single-line `@ts-expect-error` with reason. |
| Lockfile drift (other transitive deps) | low | We run `pnpm install --lockfile-only` first to preview; if the diff is bounded to nodemailer + its transitives, we accept it. |
| Storybook job remains advisory — but issue file implies it should be fixed | low | Documented in `01-issue-lookup.md` as out-of-scope. The issue file's "Proposed resolution" line "(future) Investigate rolldown" matches this. |
| Other `pnpm audit` findings (3 low, 8 moderate) | low | Audit gate is `--audit-level=high`. Low + moderate do not block. The issue's Honesty disclosure mentions only high findings as blockers. We re-verify post-upgrade that no new HIGH findings appeared. |

## Test Scope

| Test type | Needed? | What it covers |
|---|---|---|
| Unit (Vitest) | ✅ | `apps/api/test/email-service-mode.spec.ts` + `email-service-smtp.spec.ts` mock nodemailer; will run unchanged. Re-run proves the API surface still typechecks. |
| Integration (Testcontainers) | ❌ | Email service has no DB integration. |
| E2E (Playwright) | ❌ | Email service is not exercised by E2E — `BP-UAT-013` Step 003 covers Mailpit reception but that lives in a different UAT workflow (already shipped). |
| Bats (`scripts/tests/`) | ✅ | Re-run `scripts/tests/audit-nodemailer-version.bats` (new — see Step 6) to assert that no production dependency below `7.0.11` is present. |
| `pnpm audit --prod --audit-level=high` exit code | ✅ | Direct AC: must exit 0 after upgrade. |

## Affected Files

| File | Change |
|---|---|
| `apps/api/package.json` | Bump `nodemailer ^6.9.16` → `^7.0.11` (and `@types/nodemailer` if needed) |
| `pnpm-lock.yaml` | Auto-refreshed by `pnpm install` |
| `scripts/tests/audit-nodemailer-version.bats` (NEW) | Regression test asserting resolved nodemailer ≥ 7.0.11 |
| `.copilot/issues/ISS-CI-002.md` | Status flip `open` → `resolved` (Step 9) |
| `.copilot/issues/registry.md` | Status column flip to `resolved` (Step 9) |

No new shared-types, no new env vars, no DB migrations, no docker-compose
changes.

## Architecture Rule Risks

- **No cross-module / cross-schema queries introduced.** The change is
  strictly inside `apps/api` and the package.json contract.
- **No new external dependencies.** `nodemailer@7.0.11` is a published
  version of the same package, by the same author (nodemailer.js).
  License is MIT (unchanged).
- **No tenant-isolation regression.** Email service is not tenant-scoped.
- **No new auth surface.** No login flows touched.

## Open Question for Step 3

No DB migrations. Step 3 (DBMigrationAuthor) is **skipped** — `expects:
false` is implied by the workflow definition. This is the same pattern
ISS-UAT-013-7 (wf-20260629-fix-034) used.

## Gate Result

gate_result:
  status: passed
  summary: "Impact is narrowly scoped to apps/api/package.json + lockfile + a new regression test; no DB / API / frontend changes."
  findings:
    - "Single file in apps/api uses nodemailer: apps/api/src/modules/email/email.service.ts. Public surface unchanged."
    - "Storybook rolldown is out-of-scope (continue-on-error: true on the job); issue file's 'Proposed resolution' line confirms deferral."
    - "DB migration step is skipped (no entity changes)."
    - "Risk: nodemailer 6 → 7 is a major bump; usage is minimal (`createTransport`, `sendMail` only)."