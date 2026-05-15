# ADR-0014: Lint and format via Biome (replaces ESLint + Prettier)

## Status
Accepted, 2026-05-15

## Context
[CLAUDE.md §4](../../.claude/CLAUDE.md) originally specified `eslint-config-airbnb-typescript` as the base ESLint config plus Prettier for formatting. Two issues:

1. `eslint-config-airbnb-typescript` is **unmaintained** and incompatible with ESLint v9 (the current major version using flat config). It has not received a release supporting flat config.
2. The two-tool ESLint + Prettier setup duplicates work, requires keeping `eslint-config-prettier` in sync to avoid rule conflicts, and adds significant dependency mass.

Considered alternatives:

- **Modern ESLint flat-config + Prettier** (`@typescript-eslint/recommended-type-checked` + `eslint-config-prettier` + curated rules + react-hooks plugin)
- **Biome** (single Rust binary doing lint + format + import sort)
- Stay on airbnb pinned to ESLint v8 — rejected, backwards-looking, no upgrade path

## Decision
Use **Biome** as the single tool for linting, formatting, and import sorting across all TypeScript code in the monorepo. Replaces both ESLint and Prettier.

- Configuration in `biome.json` at repo root, optionally overridden per-package.
- The `packages/biome-config/` workspace package holds the shared config that other workspaces extend (analogue of the Prisma-era `packages/eslint-config/` plan).
- Pre-commit hook runs `biome check --apply` on staged files via husky + lint-staged.
- CI runs `pnpm biome check` once per package.

## Rationale

- **Single tool = simpler CI.** One install, one cache key, one config file, one command. Turborepo cache hits more reliably with a single binary.
- **Speed.** Rust binary; Biome is consistently 10–20× faster than ESLint+Prettier on equivalently sized codebases. Matters for pre-commit hooks and Turborepo pipeline runs.
- **Smaller dependency footprint.** Biome is one binary; the equivalent ESLint+Prettier setup pulls in ~50 packages including plugins.
- **Modern, actively developed.** Biome's release cadence is good; major version 2.x in 2026 is production-quality and used by significant open-source projects.
- **Aligns with [CLAUDE.md](../../.claude/CLAUDE.md) Power-of-Ten / Karpathy ethos** — fewer dependencies, fewer moving parts, one tool to learn instead of two.

## Consequences

- ✅ `pnpm biome check` is the single linting + formatting command. CI runs it once per package via Turborepo.
- ✅ Pre-commit hook (still via husky + lint-staged) runs `biome check --apply` on staged files. No more "Prettier and ESLint disagreed about this line" loops.
- ✅ No more `eslint-config-prettier` plumbing to keep ESLint and Prettier from fighting.
- ⚠️ **Smaller plugin ecosystem.** A handful of ESLint-only rules (specific React-Hooks edge cases, `eslint-plugin-import` ordering patterns we might want, `eslint-plugin-storybook`) are unavailable in Biome. We accept this; if a missing rule becomes important, we add a custom Biome rule or supplement narrowly with a single ESLint rule.
- ⚠️ **Tutorials and AI-generated code often default to ESLint config snippets.** We translate to Biome equivalents on the fly. Claude Code is fine with this; humans may need to learn the mapping.
- ⚠️ **No ESLint plugin equivalents for some Astro / NestJS-specific patterns** as of 2026-05. We add custom rules in `biome.json` if needed.
- 📝 Workspace package `packages/eslint-config/` (named in original `ARCHITECTURE.md` draft) is **renamed to `packages/biome-config/`** to avoid misleading future readers.

## Supersedes
The "ESLint config from `eslint-config-airbnb-typescript` as base, customized in repo" line in [CLAUDE.md §4](../../.claude/CLAUDE.md). Rewritten in this Round 2A to point at this ADR.

## References
- [Biome official docs](https://biomejs.dev)
- [CLAUDE.md §4 Code quality enforcement](../../.claude/CLAUDE.md)
