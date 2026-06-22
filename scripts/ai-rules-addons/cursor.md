## Cursor — Tool-Specific Notes

Cursor operates in Chat mode (question/answer, context-aware) and Agent mode
(autonomous multi-file edits). These rules apply to both.

### Agent mode
- Follow the planning step (AGENTS.md §2) strictly. Write the plan in chat before
  applying any changes.
- Use `@file` references when discussing specific files so the user can verify your
  context.
- Do not apply edits across more than 5 files in a single agent run without stating a
  plan and waiting for confirmation.
- After applying changes, post a brief summary: what changed, what to verify manually.

### Chat mode
- When explaining code, reference the actual file name and line number where possible.
- Default to teaching mode — explain the "why" of every suggestion (AGENTS.md §0).

### Terminal / shell
- Do not run destructive commands (`rm -rf`, `DROP TABLE`, `pnpm db:migrate`, etc.)
  without explicit user confirmation in chat for each command.
- Prefer `pnpm` over `npm` or `yarn` for all package operations.
- Never push to remote — leave that to the user.
