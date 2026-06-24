# ISS-CI-001 — Pre-existing CI failures block all PRs to main

| Field | Value |
|---|---|
| ID | ISS-CI-001 |
| Severity | blocker |
| Module | ci / infrastructure |
| Status | open |
| Reported | 2026-06-24 |
| Workflow | _(to be spawned — `wf-20260624-fix-20`)_ |
| Reporter | PR #35 (FR-MIG-024) CI runs on 2026-06-24 reported the failures. |

## Symptom

Three CI checks on `main` consistently fail with **pre-existing** violations
that are not introduced by any current PR. Every PR that touches `apps/web-next/`,
the lockfile, or runs `pnpm audit` will trip the same checks.

Verified counts via local reproduction on `main` @ `e5088b9` (post PR #35 merge):

| Check | Failures | Sample files (excerpt) |
|---|---|---|
| `architecture-check` (ADR-0038) | **25 violations** across 23 files | `apps/web-next/src/pages/me/index.astro`, `apps/web-next/src/pages/leads/verified.astro`, `apps/web-next/src/blocks/workspace/FormBuilder.tsx`, `apps/web-next/src/blocks/checkin/CheckinOperator.tsx`, `apps/web-next/src/blocks/workspace/TgBroadcastComposer.tsx`, `apps/web-next/src/blocks/customer/CsatForm.tsx`, `apps/web-next/src/pages/press.astro` |
| `pnpm biome check` (1.9.4) | **20,432 errors** across 571 files | Most (~95%) in `apps/e2e/playwright-report/**` (generated artifact, not ignored); ~150 in real source across `apps/api/test/**`, `apps/e2e/tests/**`, `apps/web-next/src/blocks/**` |
| `pnpm audit --prod` | **2 high-severity CVEs** | `yaml@<2.8.3` (stack overflow via deeply nested flow sequences, CVE-pending); `astro@5.x` (server-islands POST handler unbounded body DoS) |

### Why this is a blocker

- Every future `pnpm arch:check` run in CI exits non-zero.
- Every future `pnpm biome check` in CI exits non-zero.
- Every future `pnpm audit` run blocks PRs with high/critical vulns.
- The checks run on the **full tree**, not the PR diff, so a clean PR cannot
  unblock itself by being merged.

### Root cause

Three historical drifts:

1. **arch-check was added to CI after most `apps/web-next/src/pages/**` were
   created** — the rule "pages must carry `// @generated-from gen:page`
   marker" (ADR-0038 §Locks #3) postdates the existing 17 pages.
2. **Biome config doesn't ignore `apps/e2e/playwright-report/**`** even though
   the project ignores `storybook-static/**` (a structurally similar generated
   artifact). The Playwright HTML/JS reports were never excluded when biome
   was first adopted.
3. **Dependency upgrades lag upstream CVEs** — the platform depends on
   `yaml@<2.8.3` and `astro@5.x`, both of which have public high-severity
   advisories that require dep upgrades (with potential breaking changes).

## Reproduction

```bash
git checkout main && git pull
pnpm install --frozen-lockfile
pnpm arch:check                         # → 25 violations
pnpm biome check --reporter=summary     # → 20432 errors, 880 warnings
pnpm audit --prod                       # → 2 high-severity advisories
```

## Proposed resolution

**Split into 5–10 small PRs (AGENTS.md §4: max 400 lines / 5 files per PR).**

| # | PR | Scope | Files | Lines |
|---|---|---|---|---|
| 1 | `chore(ci): ignore generated artifact paths in biome + arch-check` | Add `playwright-report/**`, `.astro/**`, etc. to ignore lists | 2 | ~10 |
| 2 | `fix(arch): add @generated-from markers to 17 existing pages` | Add retro-marker to existing pages | 17 | ~17 |
| 3 | `fix(arch): remove inline styles from 4 pre-existing files` | Replace `style=` with design-system tokens | 4 | ~10 |
| 4 | `refactor(blocks): wrap interactive islands in IslandRoot` | M0-fix-B guard | varies | ~20 |
| 5 | `refactor(blocks): move raw-fetch + lib/api-* imports to L1 hooks` | ADR-0038 §Locks #1, #2 | 2 | ~30 |
| 6 | `chore(deps): upgrade yaml to ≥2.8.3` | Patch CVE | 1 | ~1 |
| 7 | `chore(deps): upgrade astro to patched version` | Patch DoS | varies | varies |
| 8 | `style(biome): auto-fix --write on remaining ~150 errors` | Fixable lint errors | varies | ~150 |
| 9 | `chore(biome): manual fixes for non-fixable rules` | Hand-fix remaining | varies | ~100 |

### Sequencing

- PR #1 is the highest-leverage change (drops Biome noise from 20,432 → ~150).
- PRs #2–#5 unblock `architecture-check`.
- PRs #6–#7 unblock `pnpm audit` (and may introduce minor regressions —
  test on staging).
- PRs #8–#9 are housekeeping; can land last or skip.

### Estimated effort

- PRs #1, #6, #7: ~30 minutes each (config-only or dep bump)
- PRs #2, #3, #4, #5: ~1–2 hours each (touches pre-existing code; needs care)
- PRs #8, #9: ~2–4 hours combined

**Total: 1–2 working days across ~1–2 calendar weeks** (the workflows need
review, the dep upgrades need staging validation).

## Out of scope

- The architectural violations on `apps/web-next/src/pages/press.astro:178`
  (inline style) predate the introduction of design tokens; the fix requires
  designing a new token for the press page's responsive variant. Captured as
  follow-up in `FR-DS-007` (to be created) if the inline-style replacement
  surfaces a missing token.
- The Playwright test runs themselves (i.e., fixing the e2e tests to not
  generate ~20k lines of lint errors) — these are generated artifacts and
  should be ignored at the linter level, not fixed at the test level.

## Regression prevention

After all 9 PRs land, the CI gates will:
1. arch:check will pass on `main` with zero violations.
2. Biome check will pass on `main` with zero errors (after the ignore-list PR).
3. `pnpm audit` will be clean until the next CVE lands; add a weekly
   cron job (`pnpm audit --prod --json > audit-weekly.json`) to catch
   new advisories.

Consider adding **branch protection rules** on `main` requiring these 3
checks to pass before merge — currently the rules appear to allow merge
despite `UNSTABLE` state (PR #35 was merged while CI was still failing).

## References

- `tools/architecture-check.ts` — ADR-0038 lock implementation
- `biome.json` — biome lint config
- `tools/gen/page.ts` — generator that emits `@generated-from` markers
- `.copilot/issues/ISS-PREEX-001.md` — previous cleanup issue (resolved 2026-06-23)
