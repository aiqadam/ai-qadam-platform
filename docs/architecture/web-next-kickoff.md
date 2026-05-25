# Kickoff prompt — `apps/web-next/` greenfield build

> Hand this to a fresh Claude Code session. The agent will read it,
> read the linked docs, and execute Phase 0 PR-0a (the locks +
> architecture infrastructure).
>
> After PR-0a merges, dispatch agents for PR-0b through PR-0e in
> parallel worktrees with the same prompt template.

---

## Agent role

You are the **Architecture-Foundation agent** for the AI Qadam web
rewrite. Your job is to lay down the locks + scaffolding for a
greenfield `apps/web-next/` build that will replace `apps/web/` after
~5 weeks of phased PRs. You will ship PR-0a of Phase 0.

This is **not** a code-implementation task. PR-0a is documentation +
config + a small enforcement script. Code starts in PR-0b.

## Required reading (in order)

1. **CLAUDE.md** at repo root and in `.claude/` — operating rules,
   especially §3 (state plan before non-trivial changes), §5 (max 5
   files per code PR; docs+config exempted), §11 (Conventional
   Commits + PR template).
2. **ADR-0038** at [`docs/adr/0038-web-4-layer-architecture.md`](../adr/0038-web-4-layer-architecture.md)
   — the architectural decision this PR enforces.
3. **Migration plan** at [`web-migration-plan.md`](./web-migration-plan.md)
   — your overall north star + PR-0a's exact file list.
4. **Block catalogue** at [`blocks.md`](./blocks.md) — the L3 doc
   you're committing as part of PR-0a.
5. **Wiring map** at [`wiring-map.md`](./wiring-map.md) — the cabinet
   ↔ aggregate registry you're committing as part of PR-0a.
6. **Parity matrix** at [`parity-matrix.md`](./parity-matrix.md) —
   the cutover gate you're committing as part of PR-0a.
7. **decision-batch-process.md** — how ADR-0038 will get to Accepted.
8. **agent-prompts.md §0.1** — your canonical-docs context model.
9. **Memory entries** under `/home/drukker/.claude/projects/-home-drukker-aiqadam/memory/`:
   - `feedback_worktree_per_agent.md` — work in
     `/home/drukker/wt/<feature>/`, not the main checkout
   - `feedback_done_means_visible_in_prod.md` — don't say "done"
     until verified live
   - `feedback_never_stop_without_shipped_increment.md` — drive to
     merged + live
   - `feedback_auto_merge_unavailable.md` — `gh pr merge --squash --delete-branch`
   - `feedback_check_parallel_sessions_before_manual_ops.md` —
     check what other agents are doing before touching prod

## PR-0a scope (what you will deliver)

One PR, branch `chore/adr-0038-web-locks`, against `main`. Files:

| File | Source | Notes |
|---|---|---|
| `docs/adr/0038-web-4-layer-architecture.md` | ALREADY EXISTS in this PR — verify Proposed status | The ADR text |
| `docs/architecture/web-migration-plan.md` | ALREADY EXISTS | The phased plan |
| `docs/architecture/blocks.md` | ALREADY EXISTS | L3 catalogue (empty rows) |
| `docs/architecture/wiring-map.md` | ALREADY EXISTS | Data-flow registry |
| `docs/architecture/parity-matrix.md` | ALREADY EXISTS | Cutover gate |
| `tools/architecture-check.ts` | **NEW — you write** | The grep-based lint enforcing the locks. 150-200 LOC, zero runtime deps. Run via `tsx` or `bun`. |
| `tools/gen/page.ts` | **NEW — you write** | `pnpm gen:page <slug>` scaffold. ~60 LOC. Outputs a composition-only `.astro` file with `// @generated-from gen:page` header. |
| `tools/gen/cabinet.ts` | **NEW — you write** | Same but for `/workspace/<slug>/`. |
| `tools/gen/templates/` | **NEW** | One `.astro.tmpl` per generator. |
| `package.json` (repo root) | EDIT — add scripts | `"gen:page": "tsx tools/gen/page.ts"`, `"gen:cabinet": "tsx tools/gen/cabinet.ts"`, `"arch:check": "tsx tools/architecture-check.ts"` |
| `.husky/pre-commit` | EDIT | Append `pnpm arch:check` |
| `.github/workflows/ci.yml` | EDIT | Append an `architecture-check` job that runs `pnpm arch:check` |
| `.github/pull_request_template.md` | EDIT | Add the architectural-compliance checkboxes from ADR-0038 §Locks #4 |
| `packages/biome-config/biome.json` | EDIT | Add `noRestrictedImports` paths per ADR-0038 §Locks #1 — but **scope ONLY to `apps/web-next/**`**, NOT to `apps/web/**` (grandfathered) |
| `docs/agent-prompts.md` | EDIT | Add new §0.2 "Block-First Pre-Flight Gate 0" referencing this kickoff doc |

That's 14 files. Mostly docs/config — under CLAUDE.md §5 "configs and
tests excepted" you're well within bounds. Net diff: ~1,200 lines (mostly
the docs already in this PR + ~300 new lines of tools + config).

## Implementation notes

### `tools/architecture-check.ts`

A pure Node script (Bun or tsx as runner — match what the repo uses).
Reads `git diff --name-only HEAD~1 HEAD` (or `--staged` in pre-commit
mode). For each touched file, checks:

```typescript
const violations: Array<{file:string, line:number, msg:string}> = [];

// Lock 1: blocks/pages must not import api-* or call fetch directly
if (file.match(/apps\/web-next\/src\/(blocks|pages)\//)) {
  if (content.match(/from ['"](\.\.\/)+lib\/api-/)) push('imports lib/api-*');
  if (content.match(/fetch\(['"]\/api\//)) push('raw fetch to /api');
  if (content.match(/style=\{|style="/)) push('inline style=');
}

// Lock 2: new pages need the @generated marker (unless explicitly exempted)
if (file.match(/apps\/web-next\/src\/pages\/.*\.(astro|tsx)$/) && isNewFile(file)) {
  if (!content.match(/@generated-from gen:(page|cabinet)/)) push('not from generator');
}

// Lock 3: components/ is deprecated under web-next
if (file.match(/apps\/web-next\/src\/components\//)) push('use src/blocks/ not src/components/');

// Lock 4: edits to blocks/* require edits to docs/architecture/blocks.md
const blockEdits = touched.filter(f => f.match(/apps\/web-next\/src\/blocks\//));
const catalogueEdited = touched.includes('docs/architecture/blocks.md');
if (blockEdits.length && !catalogueEdited) push('block edited; catalogue not updated');

// Lock 5: edits to api-queries.ts or new blocks reading new data require wiring-map update
// (heuristic — full enforcement is human review)
```

Exit non-zero on any violation, print a clear message linking back to
this kickoff + the ADR.

**Critical**: the lock paths in this script are scoped to
`apps/web-next/`, not `apps/web/`. Existing v1 code is grandfathered
until cutover. Verify the script PASSES on the current main HEAD —
otherwise the PR can't merge.

### `tools/gen/page.ts`

Reads `<slug>` from argv. Writes
`apps/web-next/src/pages/<slug>.astro` from
`tools/gen/templates/page.astro.tmpl`. Template content:

```astro
---
// @generated-from gen:page
// slug: {{slug}}
// generated: {{date}}
import Layout from '../layouts/Layout.astro';
import { PageHead } from '../blocks/common';
---

<Layout>
  <PageHead slot="head" title="{{slug}}" />
  <main>
    <!-- compose L3 blocks here -->
  </main>
</Layout>
```

Cabinet generator analogous but emits
`apps/web-next/src/pages/workspace/<slug>/index.astro` with
`<PageShell>` from `blocks/workspace`.

### Biome path restrictions

Add to `packages/biome-config/biome.json`. Critical: scope to
`apps/web-next/` (overrides) so existing `apps/web/` doesn't fail
the build:

```jsonc
{
  "overrides": [
    {
      "include": ["apps/web-next/src/blocks/**/*", "apps/web-next/src/pages/**/*"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "../lib/api-client": "Blocks/pages: import L1 query hooks instead.",
                  "../lib/api-queries": "OK in pages; blocks must receive data via props."
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

(Adjust to actual Biome 2.0 schema — confirm against
`pnpm biome --help` before committing.)

### PR template additions

```markdown
## Architecture compliance (ADR-0038)

- [ ] I composed L3 blocks; did not write inline `style=` or raw `fetch()`
- [ ] If I added a block: I added a Storybook story + updated `docs/architecture/blocks.md`
- [ ] If I changed data wiring: I updated `docs/architecture/wiring-map.md`
- [ ] If I added a new page: it was generated via `pnpm gen:page` or `pnpm gen:cabinet`
- [ ] `pnpm arch:check` passes locally
```

### agent-prompts.md addition

```markdown
## 0.2 Block-First Pre-Flight Gate 0 (ADR-0038)

Before writing ANY new code under `apps/web-next/`, an agent must:

1. Read [`docs/adr/0038-web-4-layer-architecture.md`](./adr/0038-web-4-layer-architecture.md)
2. Read [`docs/architecture/blocks.md`](./architecture/blocks.md)
3. Search for an existing block matching the feature
4. If found: import it, pass props, ship
5. If not found: open a block-proposal PR FIRST (block + Story +
   catalogue entry), get it accepted, then compose
6. If creating a new page: run `pnpm gen:page` or `pnpm gen:cabinet`
   — do NOT hand-write the file
```

## Acceptance bar

Before opening the PR:

1. `pnpm arch:check` runs locally in ~2s with exit 0 on current main
   (i.e. the existing repo state passes).
2. Plant a test violation:
   `apps/web-next/src/pages/test-violation.astro` with `fetch('/api/foo')`.
   Run `pnpm arch:check`. Must exit non-zero with a clear error
   pointing at the violation.
3. **Remove** the test violation. Commit the rest.
4. CI on the PR passes (the arch-check job included).
5. `apps/web-next/` doesn't exist yet as a workspace package — that
   lands in PR-0b. **Do not** create `apps/web-next/` in PR-0a. The
   locks reference a path that doesn't exist yet; the arch-check
   handles this gracefully (no files to check = pass).

## Workflow rules (from memory)

- Cut a worktree at `/home/drukker/wt/adr-0038-locks`. Don't edit
  `/home/drukker/aiqadam` directly.
- Branch: `chore/adr-0038-web-locks`.
- Conventional Commit: `chore(web): ADR-0038 — web architecture locks + scaffolding`.
- Open the PR with the body referencing this kickoff doc + the ADR.
- Wait for CI green. Use `gh pr merge --squash --delete-branch`
  (auto-merge is disabled per [`feedback_auto_merge_unavailable`]).
- After merge: verify on a fresh checkout that
  `pnpm gen:page test-page` works + the generated file passes
  `pnpm arch:check`. Then `rm` the test page.

## What's out of scope for PR-0a

- Creating `apps/web-next/` package. That's PR-0b.
- L2 atoms. PR-0c.
- L1 runtime. PR-0d.
- Storybook + generators infrastructure (only the gen scripts
  themselves; Storybook setup is PR-0e).
- Migrating any existing page or component.
- Deploying `next.aiqadam.org`. PR-0b.

## Reporting

When PR-0a is merged + verified, write a short status update to the
session referencing:
- PR number and commit SHA
- `pnpm arch:check` output on main HEAD (zero violations)
- A demo violation trace (planted + caught + removed)
- Whether ADR-0038 made it onto the decision-batch agenda for the
  upcoming Monday

Then stop. Don't start PR-0b yourself — that's a separate agent
dispatch.

---

## Dispatching PR-0b through PR-0e

After PR-0a lands, dispatch four fresh agents in parallel worktrees
using the same kickoff template, scoped to each PR:

| Agent | PR | Worktree | Branch |
|---|---|---|---|
| Foundation-Shell | 0b: `apps/web-next/` shell + Coolify deploy | `/home/drukker/wt/web-next-shell` | `feat/web-next-shell` |
| Foundation-Kit | 0c: shadcn-based L2 atoms | `/home/drukker/wt/web-next-kit` | `feat/web-next-kit` |
| Foundation-Runtime | 0d: apiClient + useAuth + TanStack Query | `/home/drukker/wt/web-next-runtime` | `feat/web-next-runtime` |
| Foundation-Storybook | 0e: Storybook + completed gen scaffolds | `/home/drukker/wt/web-next-storybook` | `feat/web-next-storybook` |

Each agent reads ADR-0038 + this kickoff + the migration plan, then
delivers their PR. Foundation-Shell must merge first (it creates the
package directory the others fill in).
