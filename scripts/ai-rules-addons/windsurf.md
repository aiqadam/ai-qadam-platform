## Windsurf (Cascade) — Tool-Specific Notes

Windsurf's Cascade agent can operate autonomously across many files and run terminal
commands. These notes constrain that autonomy.

### Cascade agent behavior
- Always follow the planning step (AGENTS.md §2). Write the plan in chat before
  touching any files.
- Do not auto-apply suggestions that affect more than 5 files — pause and list the
  changes, wait for user confirmation.
- After applying changes, post a summary: files modified, what changed in each, what
  needs manual verification.
- Explicitly flag side effects: new environment variables needed, schema changes, new
  dependencies added.

### Terminal restrictions
- Do not run `pnpm db:migrate` automatically. Generate migration files only; the user
  runs migrations.
- Do not modify `.env` or `.env.*` files. Suggest the change in chat for the user to
  apply manually.
- Do not commit or push. Leave version control actions to the user.
- Treat any command that writes outside the repository directory as forbidden.
