# 04 — Security Review

**Workflow:** wf-20260704-fix-081-jsx-dev-runtime
**Issue:** ISS-UAT-009-6
**Agent:** SecurityReviewer (self-hosted as Orchestrator due to scope: 2-file config tweak + 1-test file, no API surface delta)
**Date:** 2026-07-04

---

## Code Changes Reviewed

| File | Lines changed | Nature |
|---|---|---|
| `apps/web/astro.config.mjs` | ~30 added, 0 removed | Bundler config: env-override guard + `optimizeDeps.force` |
| `apps/web/package.json` | +1 script | `dev:clean` script (cross-platform Node-based cache cleaner) |
| `apps/web/src/components/__tests__/jsx-dev-runtime.test.ts` | +60 (new file) | Regression test; pure read of `react/jsx-dev-runtime` exports |

## Invariant Check Results

| ID | Invariant | Applicable | Result | Notes |
|---|---|---|---|---|
| INV-1 | Tenant isolation | No | N/A | No DB queries, no service code. |
| INV-2 | Secrets by reference | No | N/A | No secrets in diff — `NODE_ENV` is a string and does not affect auth/secrets. |
| INV-3 | Auth at controller level | No | N/A | No controllers changed. |
| INV-4 | Validation at boundaries | No | N/A | No boundary I/O. |
| INV-5 | No cross-schema queries | No | N/A | No DB queries. |
| INV-6 | Rate limiting | No | N/A | No new endpoints. |
| INV-7 | CSRF protection | No | N/A | No state-changing endpoints. |
| INV-8 | No `dangerouslySetInnerHTML` | No | N/A | No JSX changes in shipped code. |
| INV-9 | No N+1 queries | No | N/A | No DB. |
| INV-10 | Drizzle parameterization | No | N/A | No SQL. |
| INV-11 | HttpOnly tokens (web) | No | N/A | No auth code; existing `aiqadam-refresh` HttpOnly cookie is untouched. |

### BLOCKER Findings

None.

### MAJOR Findings

None.

### MINOR / Informational

1. **The env-override guard modifies `process.env.NODE_ENV`** at config-load time. This is intentional and scoped to `astro dev` only (the guard checks argv). Production builds (`astro build`) and previews (`astro preview`) are unaffected. **Risk:** if a future contributor runs `astro dev` from a script that explicitly requires NODE_ENV=production (for toolchain parity), the guard will silently flip it to development. **Mitigation:** the guard logs a single console line at startup (`Forced NODE_ENV=development ...`), so the override is observable.

2. **`optimizeDeps.force = true`** costs ~2 seconds of pre-bundling per dev start. This is intentional (catches stale production pre-bundles) and is the standard pattern for forcing re-optimisation in Vite. No security impact.

## Gate Result

gate_result:
  status: passed
  summary: "Bundler-config-only fix; no security-relevant invariants triggered; no BLOCKER/MAJOR findings; 2 informational notes on the env-override guard are documented in the diff as comments."
  findings:
    - "INV-1..11 all N/A — config-only change, no API surface delta"
    - "Self-documenting override logs to console; observable without code inspection"
    - "Production builds (`astro build`) and `astro preview` are unaffected by the env-override guard"
  retry_target: ""
  deferred_to_feature: ""
  deferred_reason: ""
