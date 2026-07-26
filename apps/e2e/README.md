# @aiqadam/e2e — browser-agent smoke tests (Lane 2)

> Sprint 0.10 — the verification lane in the 3-lane execution model. See [`docs/01-business/community-platform-roadmap.md` §2.5](../../docs/01-business/community-platform-roadmap.md#25-execution-model--three-lanes) for context.
>
> **Every `[CC]` sprint item is expected to add 1–3 scenarios here as part of its PR.** The smoke catalog ([§7.5 of the roadmap](../../docs/01-business/community-platform-roadmap.md#75-smoke-scenarios-catalog-lane-2--browser-agent-verification)) lists what's expected per sprint.

---

## What this is

**As of 2026-07-26, this suite is not wired into CI at all.** It's available tooling — Playwright specs anyone can run manually (see below) — but nothing runs it automatically. See "History" below for why.

For actual pre-merge / pre-release verification of user-facing behavior, use:
- **`tests/uat/*.spec.ts`** + the `uat-verification` agentic workflow, or manual QA testing — the intended tool for "does this change actually work," run against a controlled stack with test data you own.
- **`.github/workflows/parity-check.yml`** (`tests/parity/`) for the scheduled v1/v2 parity sweep.

- **Target by default:** `https://aiqadam.org` (production). Written to be read-only (no writes, no destructive ops) — **but this is not uniformly true across all 32 files**; several (e.g. `smoke-onboarding.spec.ts`) assume a dedicated pre-seeded test user or an isolated local/CI stack, not a shared environment. Audit a file before running it against anything with real or manually-managed test data (prod, QA) — see "History" below.
- **Override target:** `BASE_URL=http://localhost:4321 pnpm test:e2e:smoke` to test against local dev.
- **Scope:** all `tests/smoke-*.spec.ts` files (32 as of 2026-07-26; grep `apps/e2e/tests/smoke-*.spec.ts` for the current list — this README doesn't try to enumerate every one). A few representative ones:
  - `smoke-public.spec.ts` — public surfaces (homepage, events, sitemap, robots, API health)
  - `smoke-auth-gates.spec.ts` — authentication boundaries (anon redirects, internal endpoints 401)
  - `smoke-accessibility.spec.ts` — axe-core WCAG 2.2 AA checks (serious/critical violations block merge)
  - `smoke-tenant.spec.ts` — multi-tenant subdomain routing (uz / kz / tj)
- **NOT included:** `tests/uat/*.spec.ts`, `tests/parity/*.spec.ts` (its own `playwright.parity.config.ts` + `pnpm e2e:parity`), and `tests/lead-form-within-fold.spec.ts` (a UAT-style regression spec that reads `UAT_BASE_URL`/needs Mailpit — misplaced at the tests/ root instead of tests/uat/, not migrated as of 2026-07-26). `pnpm test:e2e:smoke` deliberately excludes all of these via its `tests/smoke-*.spec.ts` glob; the unscoped `pnpm test:e2e` still sweeps in everything and will fail outside a full local stack.

## What this is NOT (yet)

Things that need a docker-compose stack with writeable Directus + Twenty + Authentik:
- Registration flow end-to-end (writes to `registrations`)
- Operator workspace flows (Sprint 2)
- Sponsor / speaker cabinet flows (Sprint 3)
- RBAC sync verification (Sprint 2.2)

These get a separate `smoke-fullstack.spec.ts` once Sprint 1 ships writeable flows (and a CI workflow with docker-compose).

## Running locally

```bash
# from repo root
pnpm install
cd apps/e2e
pnpm install:browsers   # one-time — installs chromium + system deps
pnpm test:e2e:smoke     # runs smoke-*.spec.ts only, against production (what CI runs)

# Open HTML report after a run
pnpm report

# Interactive UI mode (great for authoring new tests)
pnpm test:e2e:ui

# Watch a test run in a real browser
pnpm test:e2e:headed

# Step-debug a test
pnpm test:e2e:debug -- smoke-public

# Override target
BASE_URL=http://localhost:4321 pnpm test:e2e:smoke
```

## CI integration

**None, currently.** No workflow runs this suite automatically.

### History (2026-07-26 — both CI workflows for this suite removed)

Two workflows existed and were removed the same day, for different reasons:

**`smoke-schedule.yml`** (30-min cron prod-probe) — removed first. It predated [PR #45](https://github.com/aiqadam/ai-qadam-platform/pull/45) ("remove Coolify, fix SSH deploy secrets," 2026-07-23), which replaced Coolify's async auto-deploy with an SSH-triggered `deploy.sh` that already runs a post-deploy health check inline (`ci-cd.yml`'s `deploy-qa`/`deploy-prod` jobs poll `/health` right after deploying) — its deploy-race rationale no longer applied. It also never actually worked: a GitHub Actions platform bug stuck its trigger registration for months, producing zero real scheduled runs the entire time it existed.

**`smoke-pr.yml`** (`pull_request` trigger) — removed second, for a more fundamental reason. Prod deploys here are manual (`workflow_dispatch` on `ci-cd.yml`), and can lag `main` significantly — 6 days / 22 commits behind at time of removal. `smoke-pr.yml` always tested the **PR's own** test code against **whatever's currently live on prod**, which is frequently a different, older version of the app. That makes a red `smoke` check ambiguous by construction: it can mean "this PR broke something" or just as easily "prod hasn't caught up yet," with no way to tell which from the check alone — actively misleading as a PR gate. Moving it to run against QA post-deploy was considered and rejected: several smoke specs (e.g. `smoke-onboarding.spec.ts`) assume a dedicated seeded test user or an isolated stack, not a shared environment that also carries hand-managed manual QA test data — running them there risked colliding with real testing in progress. **QA/UAT verification (`tests/uat/`, the `uat-verification` workflow, manual testing) is the correct tool for "does this PR's change work" and already exists — smoke was answering a question nobody needed answered, badly.**

Non-deploy prod breakage (cert expiry, upstream dependency outage) remains an open gap with no automated catch. If that's ever prioritized, a dedicated lightweight uptime/health monitor (e.g. Gatus, already deployed at `infrastructure/gatus/`) is the right tool — not this Playwright suite.

## Adding scenarios

When you ship a new `[CC]` sprint item (or write any user-facing change), add scenarios to the appropriate spec:

1. **Decide the spec file:** is the scenario public / auth-gated / accessibility / tenant-scoped? Pick the matching `smoke-*.spec.ts`. New category → new spec.
2. **Name it `S{sprint}.{item}` plus a short purpose:** e.g., `'S1.1c post-event flow: CSAT email dispatched after event ends'`.
3. **Update the smoke catalog** in [roadmap §7.5](../../docs/01-business/community-platform-roadmap.md#75-smoke-scenarios-catalog-lane-2--browser-agent-verification) with the scenario name.
4. **Smoke tests are READ-ONLY** in this workflow. Write-side tests live in `smoke-fullstack.spec.ts` (post-Sprint 1).

## Failure debugging

When CI fails:
- HTML report uploaded as workflow artifact — download from the Actions run page
- Screenshot of failed assertion in the report
- Video for failed retries
- Trace viewer: `npx playwright show-trace <trace.zip>` for full network + DOM timeline

For production probe alerts: the alert message contains the failing scenario name + URL; reproduce locally with `BASE_URL=https://aiqadam.org pnpm test:e2e -- <scenario-name>`.

## Anti-flake practices

- No `page.waitForTimeout(N)` — use `await expect(locator).toBeVisible({timeout})` instead
- Don't depend on exact text — use roles + accessible names
- Don't depend on visit counts, time-of-day, or production data that changes
- Polite user-agent (`AIQadamSmokeTestAgent/1.0`) + `x-aiqadam-smoke: true` header lets the API exclude probe hits from analytics

## Catalog maintenance rule

Every PR that ships a `[CC]` sprint item:
- (a) adds the listed smoke scenarios from [roadmap §7.5](../../docs/01-business/community-platform-roadmap.md#75-smoke-scenarios-catalog-lane-2--browser-agent-verification)
- (b) updates the catalog in §7.5 if the item adds new flows beyond what's pre-listed

The browser agent (this suite + production probe) IS the verification lane. If it doesn't catch a regression, it's a gap in the catalog — file an issue + add the scenario.
