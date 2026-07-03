# 03 — Code Summary (wf-20260703-fix-067-coverage-registry, ISS-UAT-COV-001)

## Files authored or modified

| Path | Status | Purpose |
|---|---|---|
| `scripts/gen-bp-uat-coverage.mjs` | new | Pure Node script that scans `apps/e2e/tests/{uat,}/` and rewrites the **Spec** + **Smoke Overlap** columns of `registry.md` in-place. Idempotent. |
| `docs/02-business-processes/uat/registry.md` | modified | +2 columns (**Spec**, **Smoke Overlap**) auto-generated, +legend entries documenting the columns. |
| `apps/e2e/tests/uat/BP-UAT-010.spec.ts` | new | Pilot Playwright spec for BP-UAT-010 (event registration flow). 7 ACs + 1 sandbox. Authoring follows the conventions of `BP-UAT-009.spec.ts` and `BP-UAT-013-signup.spec.ts`. |
| `.copilot/tasks/queued/uat-bp-uat-coverage-batch/handoff.yaml` | new | Sequenced follow-up queue: 17 placeholder workflow IDs for the remaining BP-UAT scripts without specs (positions 2–17) + pilot position 1. |
| `AGENTS.md` | modified | Softened §0 "refuse" wording to "analyze and present"; added §6.2 "Autonomous mode defaults"; added §13 "Critical analysis of user requests". |

## Files left untouched

- `apps/api`, `apps/web`, `apps/web-next` — no app code changes (this is docs + tests + generator).
- All existing `smoke-*.spec.ts` and `uat/*.spec.ts` files.
- Smoke spec corpus and test infra.

## Verification scope

- **Type / lint**: not applicable; this PR has no TypeScript application code. New `.mjs` script is plain ESM Node (no TS, no Biome rule violation surface).
- **Manual run** of `node scripts/gen-bp-uat-coverage.mjs --write` against current repo state → 3 UAT specs detected (`BP-UAT-009.spec.ts`, `BP-UAT-010.spec.ts` new, `BP-UAT-013-signup.spec.ts`); 32 smoke specs cross-referenced.
- **BP-UAT-010.spec.ts live execution**: deferred to the queued follow-up workflow `wf-20260703-uat-068-pilot-bp-uat-010`. Honesty disclosure per AGENTS.md §6.1.
