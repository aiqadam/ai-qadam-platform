# ADR-0001: Operating documentation lives in `.claude/`

## Status
Superseded by [ADR-0039](0039-five-layer-doc-architecture.md), 2026-06-19. Originally Accepted 2026-05-14.

## Context
The eight operating documents (`CLAUDE.md`, `PROJECT.md`, `ARCHITECTURE.md`, `STANDARDS.md`, `WORKFLOW.md`, `SECURITY.md`, `AI_COLLAB.md`, `GLOSSARY.md`) need to be discoverable both by humans browsing the repository and by Claude Code at session start.

Two natural locations were considered:
- **Repo root** — most discoverable for a human opening the project for the first time, but clutters the root with eight markdown files plus the README.
- **`docs/` folder** — clean root, but Claude Code wouldn't auto-load anything; humans would still find them via README.

A third location was the deciding factor: Claude Code automatically reads `~/CLAUDE.md` (user-level) and any project-local `.claude/CLAUDE.md` at the start of every session. Placing all eight in `.claude/` lets us follow the exact same pattern Claude Code already uses, with zero configuration.

## Decision
All eight operating documents live in `.claude/`:

```
.claude/
├── CLAUDE.md
├── PROJECT.md
├── ARCHITECTURE.md
├── STANDARDS.md
├── WORKFLOW.md
├── SECURITY.md
├── AI_COLLAB.md
└── GLOSSARY.md
```

Claude Code reads `CLAUDE.md` automatically. The session-start instruction in CLAUDE.md §1 ("Required reading at session start") names the other seven by relative path; Claude Code pulls them in by name.

ADRs and runbooks (operational procedures) live in `docs/adr/` and `docs/runbooks/`. Generated API documentation lives in `docs/api/`. The repo root contains `README.md`, which prominently links into `.claude/` so humans can find the operating context.

## Consequences

- ✅ Claude Code's auto-loading of `CLAUDE.md` works without any per-project hook configuration.
- ✅ The session-start "read these eight files in this order" instruction is the canonical entry point for any new conversation.
- ✅ Repo root stays clean — one `README.md`, plus the standard `apps/`, `packages/`, `infrastructure/`, `docs/` directories.
- ✅ Anyone opening `.claude/` immediately understands "this is the operating context for AI-assisted work on this project."
- ⚠️ GitHub's file-tree UI collapses dotfolders by default, so `.claude/` is one click away rather than visible at the top level. Mitigated by `README.md` linking into it explicitly.
- 📝 If we ever onboard non-Claude AI tooling (Cursor, Aider, Codeium, etc.), each typically wants its own conventions-folder. We'd either duplicate the docs (bad), symlink them (acceptable), or write a small generator. Not a current concern.

## References
- [ARCHITECTURE.md §"Repository structure"](../04-development/architecture/architecture.md) cites this ADR.
