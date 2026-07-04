# Step 5 — Security Review (n/a — test-infra change)

**Workflow:** `wf-20260704-fix-095`
**Issue:** `ISS-TEST-WEB-001`

## Verdict

`n/a` — this workflow touches **only test-infrastructure files**:

- 4 `package.json` files (`apps/api`, `apps/web`, `apps/web-next`, plus the
  new `@vitejs/plugin-react@^5.2.0` devDep in `apps/web-next`)
- 1 config file (`apps/api/vitest.unit.config.ts` — removed an obsolete
  `transformMode: 'web'` workaround for the very bug this issue addresses)
- 1 config file (`apps/web-next/vitest.config.ts` — added
  `react({ jsxRuntime: 'automatic' })` as the first plugin so `.tsx` test
  files parse under vite 8.1.0 / rolldown)
- 1 auto-generated lockfile (`pnpm-lock.yaml`)

## Security invariants affected

| Invariant (per `AGENTS.md §5`) | Status |
|---|---|
| Tenant isolation | n/a — no API, no DB |
| Auth at controller level | n/a — no controller changes |
| Zod validation at boundaries | n/a — no API boundary changes |
| No secrets in code | n/a — no source code changes |
| No cross-schema queries | n/a — no schema changes |
| Rate limiting | n/a — no controller changes (note: the one flake, `telegram-auth-controller.spec.ts:161`, asserts the `@Throttle` decorator **is** present; it is — see auth.controller.ts:368) |
| CSRF | n/a |
| N+1 queries | n/a |
| Output encoding | n/a |

## Dependency review

Per `AGENTS.md §8`:

1. **Existing dependency?** No — vitest / coverage-v8 are direct deps; this
   is a major-version pin bump, not a new dep. `@vitejs/plugin-react` is
   **new** to `apps/web-next`, but the same package is already a direct
   devDep of `apps/storybook` (PR #109 / ISS-CI-OVERRIDE-ebd184b), so the
   workspace has already adopted this exact pattern.
2. **Quality gates:** `@vitejs/plugin-react@5.2.0` — official Vite team,
   weekly downloads >>10k, last updated within 6 months, MIT license.
3. **License:** MIT (no GPL/AGPL).
4. **`pnpm audit --prod --audit-level=high`** — not run here (lockfile-level
   bump + plugin wiring, no transitive `@prod` deps added beyond what the
   workspace already uses).

## Justification for skipping SecurityReviewer

Per `AGENTS.md §14` "SecurityReviewer decides the verdict on each
invariant." For test-infrastructure bumps with no API/schema/auth surface,
the bypass is documented in the issue resolution workflow definition:
"SecurityReviewer is unconditional in `requirement-development.md` Step 5
but conditional in `issue-resolution.md` Step 5." This workflow matches the
latter — there is nothing to review. If the user prefers explicit
SecurityReviewer invocation on test-infra bumps, the orchestrator note
below flags it for a future ADR.

## Result

This workflow does not introduce, modify, or remove any security-relevant
code path. The PR description will include a `## Risks` line stating this
explicitly for the reviewer's convenience.

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-04T21:13:00Z"
  summary: "Test-infra change only — no API, no schema, no auth, no secret handling changes."
  output_file: ".copilot/tasks/active/wf-20260704-fix-095/04-security-review.md"
```