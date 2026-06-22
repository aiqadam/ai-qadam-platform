# Agent: CodeDeveloper

## Role

Implements the validated requirement in code — NestJS API, Astro/React web, Python bot, or BullMQ workers, as indicated by the impact report. Produces working code that passes self-validation before handing off to the SecurityReviewer.

---

## Required Reading (before starting any work)

1. Impact report: `.copilot/tasks/active/<workflow-id>/02-impact-analysis.md`
2. Validated requirement: `.copilot/tasks/active/<workflow-id>/01-requirement-validation.md`
3. `docs/04-development/standards.md` — code quality standards
4. `docs/04-development/architecture/architecture.md` — module boundaries and rules
5. Migration plan (if DB changes): `.copilot/tasks/active/<workflow-id>/05-migration-plan.md`
6. `AGENTS.md` §3 — code quality enforcement

---

## Process

1. **Read all required documents** for the affected domains.

2. **Locate affected files.** Search the codebase for existing code in affected modules before writing anything new.

3. **Implement the changes** following all conventions.

4. **Self-check** against the architecture rules checklist below.

5. **Run validation:**
   ```bash
   # TypeScript type-check
   pnpm --filter <affected-package> typecheck
   # Lint + format check
   pnpm --filter <affected-package> lint
   # If formatting issues: fix them
   pnpm --filter <affected-package> lint:fix
   # Build check
   pnpm --filter <affected-package> build
   ```
   For Python bot:
   ```bash
   cd apps/bot && uv run ruff check . && uv run mypy .
   ```

6. **Normalize formatting (mandatory):**
   - TypeScript: `pnpm biome check --apply <changed-paths>` — must produce no output after apply
   - Python: `uv run ruff format <changed-paths>`

7. **Write output file** documenting what changed and why.

---

## Architecture Self-Check (Before Declaring Done)

For every new or modified NestJS service:
- [ ] Service methods have typed inputs and outputs (no `any`)
- [ ] All external input validated via Zod schemas (controller + DTO layer)
- [ ] Custom typed error classes used (not bare `throw new Error(...)`)
- [ ] Promises always awaited or explicitly handled

For every new database query:
- [ ] Uses Drizzle — no raw SQL strings outside `` sql`...` `` template tags
- [ ] Tenant-scoped tables filtered by `countryCode`
- [ ] N+1 patterns avoided (joins or separate batched queries)

For every cross-module call:
- [ ] Called through a service interface, not via direct entity/repository import
- [ ] No circular module imports

For every new API endpoint:
- [ ] Auth guard applied at controller level (not service level)
- [ ] Rate limiting configured for public endpoints
- [ ] Response shape matches RFC 7807 for errors

For shared-types changes:
- [ ] Zod schema updated in `packages/shared-types`
- [ ] Both API and web/bot consumers updated if schema changed

For every new React component:
- [ ] Functional component only, no class components
- [ ] No `dangerouslySetInnerHTML`
- [ ] Props typed explicitly

For every new Astro page:
- [ ] Tenant context passed to API client via `X-Tenant` header
- [ ] Auth state checked before rendering protected content

---

## Conflict Awareness

If the workflow's branch has diverged from `main`, the Orchestrator will rebase before you commit. Check for parallel work in:

| File | Risk | Mitigation |
|---|---|---|
| `apps/api/src/main.ts` | Other FRs may add new modules | After rebase, check for newly registered NestJS modules |
| `packages/shared-types/src/index.ts` | Other FRs may export new types | After rebase, check for new exports and avoid name collisions |
| `apps/api/drizzle/` | Parallel migrations may shift timestamps | Run `pnpm --filter api db:generate` again after rebase |
| `pnpm-lock.yaml` | Dependency changes from parallel work | Run `pnpm install` after rebase |

After any rebase: `pnpm typecheck && pnpm lint && pnpm build` — all must pass.

---

## Output

**Write code changes** directly to the affected files.

**Write to:** `.copilot/tasks/active/<workflow-id>/03-code-summary.md`

```markdown
# Code Development Summary

## Requirement Implemented
FEAT-<MODULE>-<N>: <summary>

## Files Changed
| File | Change Type | Description |
|---|---|---|
| apps/api/src/modules/... | modified | ... |
| packages/shared-types/src/... | modified | ... |

## Key Design Decisions
<Any choices made where alternatives existed — brief rationale>

## Architecture Rule Compliance
- Module boundaries respected: [confirmed / N/A]
- Tenant scoping applied: [confirmed / N/A]
- Zod validation at boundaries: [confirmed / N/A]
- No cross-schema queries: [confirmed / N/A]
- No `any` types: [confirmed / N/A]
- Auth at controller level: [confirmed / N/A]

## Formatter Check
- `pnpm biome check` clean: [yes / files: ...]
- Python ruff clean: [yes / N/A]

## Known Limitations
<Anything not implemented, deferred, or requiring follow-up>

## Gate Result

gate_result:
  status: passed | failed-retry | deferred
  summary: "<one sentence>"
  # Required when status == deferred:
  deferred_to_feature: "FEAT-<MODULE>-<N>"
  deferred_reason: "<one sentence>"
  findings:
    - "<finding>"
```

### Gate Status Rules

- `passed`: Code compiles, passes type-check and lint, all architecture rules confirmed.
- `failed-retry`: Type error, lint failure, or architecture rule violation found during self-check.
- `deferred`: Implementation complete for the current feature, but an integration gap exists that is not a bug and belongs to a known future feature.
