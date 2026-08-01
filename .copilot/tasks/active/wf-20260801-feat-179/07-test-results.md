# 07 — Test Results: FR-AUTH-004 (Magic-link authentication)

Executed directly by the Orchestrator (terminal access), per
`.copilot/agents/test-runner.md`'s execution order, against the real
local infrastructure — Authentik, Mailpit, Postgres, Directus, and the
API were already running and pre-flight-confirmed healthy at workflow
start; `apps/web-next` was brought up fresh for this step (see
Infrastructure Pre-Flight below).

## Infrastructure Pre-Flight

```
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep aiqadam
```
All required containers already `Up ... (healthy)`:
`aiqadam-authentik-server`, `aiqadam-authentik-worker`, `aiqadam-postgres`,
`aiqadam-directus`, `aiqadam-mailpit`, `aiqadam-redis`, plus others
unrelated to this FR.

Pre-flight curl (all 200 before proceeding):
- `http://localhost:9000/if/flow/default-authentication-flow/` → 200 (Authentik)
- `http://localhost:8025` → 200 (Mailpit)
- `http://localhost:3000/health` → 200 (API, already running)
- `http://localhost:4322` → 200 (web-next — brought up fresh this step;
  `astro dev` auto-selected 4322 since 4321 was free but the project's
  own `astro.config.mjs` pins `server.port: 4322` by design, see that
  file's own comment: "Port 4322 (web-next) avoids collision with
  apps/web's 4321")

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit (`apps/api` vitest, full repo suite) | 1497 | 1496 | 1 (pre-existing, unrelated) | 0 |
| Unit (this workflow's 4 new/modified files, isolated run) | 45 | 45 | 0 | 0 |
| Integration (controller-level, mocked collaborators — this repo's convention for non-DB-touching AuthModule routes, confirmed by TestDesigner's research into `telegram-auth-controller.spec.ts`) | included in the 45 above | — | — | — |
| E2E (Playwright, `magic-link-form-submission.spec.ts`, both projects) | 2 | 2 | 0 | 0 |

## Type Check

`pnpm --filter api typecheck` → clean, 0 errors.
`pnpm --filter web-next typecheck` (`astro check`) → 0 errors, 0 warnings, 43 pre-existing hints in files untouched by this workflow.

## Lint / Format Check

`pnpm biome check .` (apps/api) → "Checked 316 files in 98ms. No fixes applied." Clean.
Biome was already run with `--write` during each commit's pre-commit hook (`lint-staged`) throughout this workflow — no dirty files at any commit.

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| `updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts` | `AssertionError: expected <ts1> to be greater than <ts2>` — a clock-resolution race in a `Date.now()`-based monotonicity assertion | **Pre-existing, confirmed independently** — reproduced identically on a `git stash`-clean tree (i.e. with none of this workflow's changes applied), file is untouched by this workflow's diff. This exact flake is documented repeatedly across prior workflow history in `.copilot/context/workspace-state.md` (e.g. `wf-20260801-feat-177`, `wf-20260801-feat-176`, `wf-20260731-feat-174`, and many earlier ones) as an already-known, already-tracked timing flake unrelated to any single feature. Not a code-bug introduced here; no action taken. |

One additional test file (`telegram-admin-status-service.spec.ts`) has a documented sibling clock-flake in the same history but did NOT fail on this run's execution (timing-dependent, intermittent) — noted for completeness, not counted as a failure since it passed.

## Flaky Tests

None newly introduced by this workflow. The one environment-level flake
hit during E2E investigation (see below) was diagnosed and resolved, not
worked around.

### Investigation note: initial Playwright E2E failures were an environment issue, not a code or test-authoring bug

On first run, both `magic-link-form-submission.spec.ts` projects
(chromium-desktop, chromium-mobile) failed with
`page.waitForResponse: Test timeout of 30000ms exceeded` waiting for
`POST /api/v1/auth/magic-link`. Root-caused via a standalone debug script
with full console/network tracing (not just re-running blindly): the
React island never hydrated —
`[astro-island] Error hydrating /src/blocks/customer/index.ts TypeError:
Failed to fetch dynamically imported module`, preceded by several
`504 Outdated Optimize Dep` responses on Vite-bundled dependency chunks
(`lucide-react.js`, `@tanstack/react-query.js`, `clsx.js`,
`tailwind-merge.js`, `class-variance-authority.js`, two `@radix-ui/*`
chunks). This is Vite's dev-server dependency-optimization cache going
stale relative to the currently-running module graph — a known class of
Vite dev-server issue, unrelated to `MagicLinkForm.tsx`'s own code (the
submit button was correctly still `disabled` because `phase` state was
never reachable — the component literally never finished loading client-
side). Confirmed the fix, not just guessed: stopped the dev server
(`astro dev stop`), deleted `apps/web-next/node_modules/.vite` (the stale
optimize-dep cache directory), restarted the dev server fresh (forces
Vite to re-run its dependency pre-bundling step), and re-ran — both
projects passed cleanly on the very next attempt, no retries needed
(3.6s each). This is a local dev-loop restart with zero revert cost per
AGENTS.md §16's own worked example ("a local dev process I didn't
start is running stale code — should I rebuild and restart it?" is
explicitly listed as a case that should NOT require asking) — handled
directly rather than pausing.

## Coverage

Not separately measured via `--coverage` for this step (the existing
1496/1497-passing full-suite run plus the 45 new/modified tests already
demonstrate the required happy-path + all distinct failure-path coverage
per `06-test-design.md`'s own Self-Check — 18 tests for
`MagicLinkService.requestMagicLink()`'s 7 branches, 8 controller tests
including the anti-enumeration regression, 2 `AuthentikClient` tests, 2
`callback()` funnel-regression tests). No new business logic is left
untested — `06-test-design.md`'s own Acceptance Criteria Coverage table
already maps every AC to either an automated test or an explicitly-scoped
live-UAT-only item (see Step 8/13 below).

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Full test suite executed against real local infrastructure (Authentik/Mailpit/Postgres/Directus already healthy; web-next freshly started for this step). Type-check and biome clean on both apps/api and apps/web-next. 1496/1497 apps/api unit tests pass — the 1 failure is a pre-existing, independently-reproduced (git-stash-verified against an unmodified tree) clock-resolution flake in users.spec.ts, a file this workflow does not touch. All 45 new/modified tests for this workflow pass in isolation. Both Playwright E2E projects (chromium-desktop, chromium-mobile) for the new magic-link-form-submission.spec.ts pass cleanly after diagnosing and fixing a stale Vite dependency-cache issue in the local dev server (an environment problem, root-caused via direct console/network tracing, not a code or test-authoring bug — confirmed by the fix actually resolving it on the next clean run)."
  findings:
    - "1 pre-existing test failure (users.spec.ts clock-race), confirmed independently reproducible on an unmodified tree via git stash — not caused by this workflow, no action taken, consistent with extensive prior-workflow history documenting the same flake."
    - "Initial E2E failures were a stale Vite optimize-dep cache in the local web-next dev server, not a MagicLinkForm.tsx or endpoint bug — diagnosed via a standalone debug script with console/network tracing, fixed by clearing node_modules/.vite and restarting, confirmed resolved by both Playwright projects passing cleanly afterward."
    - "AC-2/AC-3/AC-4 (full browser outcome)/AC-5 (dual-method live proof) remain live-UAT-only per 06-test-design.md's own AC-coverage table — not weakened or silently dropped here; these are the items the Orchestrator will verify live at Step 13 (or sooner, opportunistically) against the real Authentik instance and Mailpit."
```
