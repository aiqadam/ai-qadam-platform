# Step 6 — Test Strategy (wf-20260702-fix-052, ISS-CI-002)

## Requirement

ISS-CI-002: `pnpm audit --prod --audit-level=high` blocks every PR to
`main` because `apps/api > nodemailer@6.10.1` carries two unpatched
high-severity CVEs. Fix is `nodemailer ^6.9.16` → `^9.0.1`.

## Rubric Score

| Criterion | Points | Hits? |
|---|---|---|
| Touches tenant-scoped data | +2 | ❌ (no tenant data) |
| New API endpoint | +2 | ❌ (no new endpoints) |
| Business rule with edge cases | +2 | ❌ |
| Cross-module service call | +1 | ❌ |
| New database query | +1 | ❌ |
| Pure function / utility | 0 | ✅ (this change is a one-line dependency bump) |
| UI-only change (no logic) | 0 | ❌ |

**Score: 0.**

`docs/04-development/standards.md` rubric says **Score < 4 → Unit tests
sufficient**. We follow that. No Testcontainers, no Playwright.

The change is, however, **supply-chain critical** — failing `pnpm audit`
hard-blocks merges. So we add ONE extra test (regression / contract
test) outside the rubric that asserts the audit gate. This is the
"regression test" required by `.copilot/workflows/issue-resolution.md`
Step 6 ("would have failed before the fix, passes after").

## Required Test Levels

- [x] Unit (bats regression test — the only level we need)
- [ ] Integration (Testcontainers)
- [ ] E2E (Playwright)

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `pnpm list --filter @aiqadam/api nodemailer` exits 0 and reports version `>=9.0.1` | Resolves `9.0.3` (or any `>=9.0.1`) | Pre-fix: would resolve `6.10.1` — fails |
| `pnpm audit --prod --audit-level=high` exits 0 | After upgrade: 0 high-sev CVEs | Pre-fix: exit code 1 with `GHSA-rcmh-qjqh-p98v` and `GHSA-p6gq-j5cr-w38f` reported |
| `apps/api/package.json` declares `nodemailer` floor `>=9.0.1` | semver `^9.0.1` in the file | Pre-fix: `^6.9.16` — fails |
| `email.service.ts` compiles after the upgrade (API surface preserved) | `pnpm --filter @aiqadam/api typecheck` passes | Pre-fix: not relevant — typecheck passed before too. We keep this assertion as a regression guard against a future accidental API change. |

## Why bats, not vitest

The fix is at the **dependency boundary** (a `package.json` version
pin + lockfile resolution). The only meaningful regression assertion
is "what does the installed package look like, and does the audit
gate pass?" — both of which are answered by `pnpm list` and
`pnpm audit`, both of which are CLI tools. A bats test that wraps
those CLI invocations is:

1. **Hermetic** (no Testcontainers needed)
2. **Fast** (sub-second)
3. **Cross-platform** (runs on Linux CI, macOS, Windows; `pnpm list`
   and `pnpm audit` are platform-independent)
4. **Matches the existing pattern** — `scripts/tests/uat-seed.bats`,
   `scripts/tests/uat-seed-retries.bats`, etc. all use this style.

A vitest unit test would require booting the Vite SSR pipeline +
mocking the package manager, which is heavier and adds nothing
beyond what the bats assertion already proves.

## Integration Test Plan

None. The change does not introduce new database queries, business
rules, or API endpoints. The runtime API surface (`createTransport`,
`sendMail`) is exercised by the existing `email-service-mode.spec.ts`
and `email-service-smtp.spec.ts` — those specs mock nodemailer so
they don't exercise the upgraded package directly, but the typecheck
proves the runtime API is shape-compatible. A live integration test
of the SMTP path would require a live Mailpit container, which is
already exercised by the UAT-013 script (`BP-UAT-013 Step 003`) but
that lives in a different workflow and was already shipped.

## E2E Test Plan

None. No user-facing UI flows changed.

## Acceptance Criteria → Test Mapping

The issue file does not formally list ACs (it's a bug report, not a
requirement). We define the implicit ACs from the symptom and
resolution:

| AC | Test level | Test description |
|---|---|---|
| **AC-1:** Resolved nodemailer version is `>=9.0.1` in `apps/api` | Unit (bats) | `pnpm list --filter @aiqadam/api nodemailer` reports a version satisfying `>=9.0.1` |
| **AC-2:** `pnpm audit --prod --audit-level=high` exits 0 | Unit (bats) | The audit exit code is 0 and the output reports zero high-severity findings |
| **AC-3:** The two specific CVEs (GHSA-rcmh-qjqh-p98v, GHSA-p6gq-j5cr-w38f) are no longer reported | Unit (bats) | Grep audit output for both advisory IDs; neither appears |
| **AC-4:** `apps/api/package.json` declares `nodemailer: ^9.0.1` or later | Unit (bats) | Grep `apps/api/package.json` for `"nodemailer": "^9.` |
| **AC-5:** `pnpm --filter @aiqadam/api typecheck` still passes | Unit (bats) | Capture typecheck stdout; assert exit 0 and no `error TS` markers |

All five ACs are mapped. **No AC is left un-mapped.**

## Honesty disclosure (regression-test-vs-original-bug test)

`.copilot/workflows/issue-resolution.md` Step 6 says:

> The plan MUST include at least one regression test that:
> 1. **Would have failed before the fix** (documents the original bug)
> 2. **Passes after the fix**

Our AC-1 test satisfies (1) and (2):
- Before the fix: `pnpm list --filter @aiqadam/api nodemailer` would
  return `6.10.1`. The regex `^([0-9]+)\.([0-9]+)\.([0-9]+)$`
  captures `(6, 10, 1)`; the version-floor assertion `>=9.0.1` fails
  on `6.10.1 < 9.0.1`.
- After the fix: it returns `9.0.3`. The floor assertion passes.

This single test is sufficient as the canonical regression marker.

## Gate Result

gate_result:
  status: passed
  summary: "Score=0 → unit tests sufficient. Plan adds ONE bats regression test asserting installed nodemailer version ≥9.0.1 and audit exit code 0. Five implicit ACs mapped."
  findings:
    - "All five implicit ACs from the issue resolution are mapped to a single bats test file."
    - "Bats chosen over vitest because the assertion target is CLI output (pnpm list, pnpm audit), not runtime code."
    - "The existing vitest email-service specs mock nodemailer and exercise the same code paths as before; typecheck acts as the API-shape compatibility gate."
    - "Storybook rolldown root-cause is deferred (job already advisory) and does not need a new test."