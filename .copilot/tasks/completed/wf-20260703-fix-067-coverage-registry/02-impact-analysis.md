# 02 — Impact Analysis (ISS-UAT-COV-001)

**Workflow:** wf-20260703-fix-067-coverage-registry

## What changes

| Concern | Surface | Files |
|---|---|---|
| BP-UAT registry carries Spec/Smoke-overlap columns | Documentation (no schema migration; column added in-place) | `docs/02-business-processes/uat/registry.md` |
| Column data is auto-generated (no manual update, no drift) | New pure Node script | `scripts/gen-bp-uat-coverage.mjs` |
| BP-UAT-010 pilot Playwright spec | New test file under uat testDir; runs against `apps/web` on :4321 | `apps/e2e/tests/uat/BP-UAT-010.spec.ts` |
| Atomic registry/status flip per workflow protocol | Documentation + issue file + counter bump | `.copilot/issues/ISS-UAT-COV-001.md`, `.copilot/issues/registry.md`, `.copilot/context/workspace-state.md`, `.copilot/meta/next-workflow-id` |

## What does NOT change

- No app code (`apps/api`, `apps/web`, `apps/web-next`).
- No shared types (`packages/shared-types`).
- No design tokens, no CSS, no component changes.
- No DB schema, no migration.
- No smoke-spec edits.

## Risk surface

- **`registry.md` column extension** — additive; existing parsing scripts that read the table will continue to work because the column counts on existing rows are unchanged. A parsing script that explicitly indexes by column number and not header name would break, but no such script was found.
- **`gen-bp-uat-coverage.mjs`** — pure Node, no side effects beyond emitting the column text via stdout. Invocation uses `node scripts/gen-bp-uat-coverage.mjs --write` to overwrite the columns in-place. Idempotent.
- **`BP-UAT-010.spec.ts`** — runs against localhost:4321 + Authentik + Directus stack. Requires `pnpm uat:seed` first. The existing `BP-UAT-009` and `BP-UAT-013` specs already run in this environment, so the runtime context is known.

## Files inventoried (Step 1)

- 19 BP-UAT scripts under `docs/02-business-processes/uat/`
- 2 BP-UAT Playwright specs in `apps/e2e/tests/uat/` (BP-UAT-009 + BP-UAT-013)
- 35 smoke specs in `apps/e2e/tests/`
- 2 existing uat-results dirs: `BP-UAT-009` (last run 2026-07-02), `BP-UAT-013` (last run 2026-07-03)
