# ADR-0039: Five-layer documentation architecture

## Status
Accepted, 2026-06-19. Supersedes [ADR-0001](0001-docs-live-in-claude-folder.md).

## Context
The project's documentation grew organically into two homes: `.claude/` (the
eight agent operating documents, per ADR-0001) and `docs/` (ADRs, runbooks,
operator playbooks, plans, and architecture notes). At ~110 documents this is
hard to navigate by intent. A new reader cannot tell, from the folder layout,
which documents describe *why the community exists*, which describe *how it
operates*, which are *product requirements*, and which are *engineering guides*.

We want a single taxonomy that orders documents from intent down to
implementation, and that applies uniformly to the agent operating docs and the
`docs/` tree alike.

## Decision
All documentation is organized into five numbered layers under `docs/`:

```
docs/
├── 01-business/            Principles, vision, strategy, glossary, policy
├── 02-business-processes/  Operator playbooks, marketing/decision process,
│                           operational runbooks (events, leads, members)
├── 03-requirements/        Feature surfaces, parity matrix, plans, briefs
├── 04-development/          Standards, workflow, and per-discipline guides:
│   ├── architecture/
│   ├── backend/
│   ├── frontend/
│   ├── design-system/
│   ├── testing/
│   ├── infrastructure/     (+ infrastructure/runbooks/)
│   └── security/           (+ security/runbooks/)
├── 05-other/               Handover, reviews, agent collaboration, prompts
├── adr/                    Chronological decision log (unchanged)
└── README.md               Root index linking the five layers
```

Each layer has an auto-generated `README.md` index that lists its documents and
links to the ADRs most relevant to it.

The former `.claude/` operating documents move into the layer that matches their
subject (for example `PROJECT.md` → `01-business/project.md`,
`ARCHITECTURE.md` → `04-development/architecture/architecture.md`,
`SECURITY.md` → `04-development/security/security.md`).

### Two things that deliberately do NOT move
1. **`CLAUDE.md` stays in `.claude/`.** It is the only file the agent runtime
   auto-loads at session start. Its section 1 "required reading" list is updated
   to point at the new layered locations of the other operating docs. This keeps
   the zero-configuration auto-load that ADR-0001 valued, while still folding the
   operating docs into the single taxonomy.
2. **ADRs stay together in `docs/adr/`** as one immutable, chronological,
   numbered log. Splitting them across layers would break their numbering
   convention, the weekly decision-batch review cadence, and dozens of
   cross-references. Layer indexes link to the relevant ADRs instead.

## Consequences
- ✅ A reader can navigate by intent, top to bottom, from *why* to *how*.
- ✅ The agent operating docs are no longer a separate silo; they sit in the
  same taxonomy as everything else.
- ✅ Layer indexes are generated from the move map, so they cannot silently
  drift out of sync with the files.
- ✅ `git mv` preserves file history through the move.
- ⚠️ Existing external links (bookmarks, links in chat history, the Storybook
  `brandUrl`) that point at old paths must be updated. In-repo links and code
  comments are rewritten automatically by the migration script.
- ⚠️ ADR-0001's premise (operating docs co-located in `.claude/`) no longer
  holds; it is marked superseded by this ADR.
- 📝 If non-Claude AI tooling is adopted later, it can read the same `docs/`
  layers; only `CLAUDE.md` is Claude-runtime-specific.

## References
- Supersedes [ADR-0001](0001-docs-live-in-claude-folder.md).
- Migration tooling: `docs/_restructure/migrate.py`, `docs/_restructure/RUN.md`.
