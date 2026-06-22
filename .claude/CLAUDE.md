# CLAUDE.md — Claude Code Configuration

> **`AGENTS.md` is the master rule file.** Claude Code reads it automatically at
> session start. This file contains only Claude Code–specific additions.
>
> Edit `AGENTS.md` for shared rules. Edit this file for Claude Code–only behavior.
> Do not duplicate rules here that already exist in `AGENTS.md`.

If a rule here conflicts with a user request, **stop and ask** before proceeding.

---

## Required reading at session start

Before writing any code in a new session, read these files in this order:

1. `AGENTS.md` — master rules (loaded automatically, but re-read if anything feels
   unclear)
2. `docs/01-business/project.md` — business context
3. `docs/04-development/architecture/architecture.md` — technical structure
4. `docs/04-development/standards.md` — code standards
5. `docs/04-development/workflow.md` — process rules
6. `docs/04-development/security/security.md` — security baseline
7. `docs/05-other/ai-collab.md` — how we work together
8. `docs/01-business/glossary.md` — domain terms

If any of these files is missing or contradicts another, **stop and report it** before
proceeding.

---

## Shell and agentic behavior

Claude Code has shell access and runs commands autonomously. These additional rules
apply on top of `AGENTS.md` Section 6:

- **Never `rm -rf` outside the repository working directory.**
- **Never run `pnpm db:migrate` automatically.** Generate migration files; the user
  runs them.
- **Never push to remote** without explicit user instruction in chat.
- **Before any destructive shell command**, state what it does and why, and wait for
  explicit confirmation.
- **Prefer `pnpm`** over `npm` or `yarn` for all package operations in this repo.

---

## How to handle conflicts with user requests

If the user asks for something that violates `AGENTS.md` or this file:

1. Stop. Do not partially comply.
2. Quote the specific rule being violated and explain why it exists.
3. Suggest an alternative that achieves the user's goal without violating the rule.
4. Proceed only if the user explicitly overrides the rule in chat.
5. Note the override in the PR description under "Risks."

---

## This file is NOT auto-generated

`AGENTS.md` is the single source of truth for shared rules. Tool config files
(`.cursorrules`, `.windsurfrules`, `.clinerules`,
`.github/copilot-instructions.md`) are auto-generated via `pnpm ai:sync`.

This file is hand-maintained. Keep it short.
