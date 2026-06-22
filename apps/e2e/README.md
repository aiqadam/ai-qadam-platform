# @aiqadam/e2e — browser-agent smoke tests (Lane 2)

> Sprint 0.10 — the verification lane in the 3-lane execution model. See [`docs/01-business/community-platform-roadmap.md` §2.5](../../docs/01-business/community-platform-roadmap.md#25-execution-model--three-lanes) for context.
>
> **Every `[CC]` sprint item is expected to add 1–3 scenarios here as part of its PR.** The smoke catalog ([§7.5 of the roadmap](../../docs/01-business/community-platform-roadmap.md#75-smoke-scenarios-catalog-lane-2--browser-agent-verification)) lists what's expected per sprint.

---

## What this is

Playwright tests that run on every PR (via [`.github/workflows/smoke.yml`](../../.github/workflows/smoke.yml)) AND every 30 minutes against production (Sprint 0.11 — separate workflow).

- **Target by default:** `https://aiqadam.org` (production). Read-only assertions only — no writes, no destructive ops.
- **Override target:** `BASE_URL=http://localhost:4321 pnpm test:e2e` to test against local dev.
- **Test types:**
  - `smoke-public.spec.ts` — public surfaces (homepage, events, sitemap, robots, API health)
  - `smoke-auth-gates.spec.ts` — authentication boundaries (anon redirects, internal endpoints 401)
  - `smoke-accessibility.spec.ts` — axe-core WCAG 2.2 AA checks (serious/critical violations block merge)
  - `smoke-tenant.spec.ts` — multi-tenant subdomain routing (uz / kz / tj)

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
pnpm test:e2e           # runs all specs against production

# Open HTML report after a run
pnpm report

# Interactive UI mode (great for authoring new tests)
pnpm test:e2e:ui

# Watch a test run in a real browser
pnpm test:e2e:headed

# Step-debug a test
pnpm test:e2e:debug -- smoke-public

# Override target
BASE_URL=http://localhost:4321 pnpm test:e2e
```

## CI integration

Two workflows:

1. **`.github/workflows/smoke.yml`** — runs on every PR + on push to `main`. Targets production by default; CI-managed retries (2) handle transient flakes.

2. **`.github/workflows/smoke-production-probe.yml`** (Sprint 0.11 — separate PR) — runs on a 30-minute schedule against production. Failures alert Telegram + email via existing notification path.

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
