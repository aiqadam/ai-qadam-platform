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

These names expand **AGENTS.md §1, §3, §5, §9**. Confirm each applies; do not
re-explain the rule — see AGENTS.md.

- [ ] Service methods: typed I/O, no `any`, all external input Zod-validated (controller + DTO)
- [ ] Custom typed errors (no bare `throw new Error(...)`)
- [ ] All promises awaited or explicitly handled
- [ ] DB queries: Drizzle only (no raw SQL outside `` sql`...` ``); tenant tables filtered by `countryCode`; N+1 avoided
- [ ] Cross-module calls via service interface — no direct entity/repository import, no circular module imports
- [ ] New endpoints: auth guard at controller level; rate limit on public; RFC 7807 error shape
- [ ] shared-types changes: Zod schema updated in `packages/shared-types`; both API and web/bot consumers updated
- [ ] New React component: functional only, no `dangerouslySetInnerHTML`, explicit prop types
- [ ] New Astro page: tenant context via `X-Tenant` header; auth state checked before protected content

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

**Write code changes** directly to affected files.

**Write to:** `.copilot/tasks/active/<workflow-id>/03-code-summary.md`

Required sections:
- `## Requirement Implemented`
- `## Files Changed` — table: `| File | Change Type | Description |`
- `## Key Design Decisions` — rationale where alternatives existed
- `## Architecture Rule Compliance` — confirm: module boundaries / tenant scoping / Zod at boundaries / no cross-schema queries / no `any` / auth at controller level
- `## Formatter Check` — `pnpm biome check` clean? Python ruff clean?
- `## Known Limitations`
- `## Gate Result` — per `.copilot/schemas/protocol.md` format

### Gate status semantics (this agent)

- `passed`: compiles, type-check and lint clean, all architecture rules confirmed.
- `failed-retry`: type error, lint failure, or architecture rule violation found during self-check.
- `deferred`: implementation complete for this feature but an integration gap belongs to a known future feature. Must set `deferred_to_feature` + `deferred_reason`.
