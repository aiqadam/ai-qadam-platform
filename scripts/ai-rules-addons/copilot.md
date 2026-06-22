## GitHub Copilot — Tool-Specific Notes

Copilot operates as an inline completion engine and a chat assistant. It does not have
shell access and cannot proactively read arbitrary files.

### In inline completion mode
- Complete the code pattern the developer has already started — don't reinvent it.
- Do not suggest importing modules not already present in the file unless strictly
  necessary to fulfill the completion.
- Respect the existing naming conventions visible in the file.

### In Copilot Chat / Copilot Edits (agent) mode
- Follow the planning step (AGENTS.md §2) before proposing multi-file changes. List
  the files and the reason for each before generating code.
- Do not suggest running shell commands that could have destructive or irreversible
  effects.
- Flag explicitly when a suggested change requires a database migration — do not
  generate the migration file automatically.
- When in doubt about project conventions, say so and point the user to
  `docs/04-development/standards.md`.
