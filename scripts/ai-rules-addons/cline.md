## Cline / Kilo Code — Tool-Specific Notes

Cline and Kilo Code operate as autonomous agents with tool use: file read/write, shell
commands, and browser access. These rules govern that autonomy.

### Auto-approve thresholds
- **File reads:** auto-approve always.
- **File writes (new files):** auto-approve only if the file was explicitly named in a
  confirmed plan.
- **File edits:** auto-approve only if the edit was explicitly covered in a confirmed
  plan.
- **Shell commands:** never auto-approve. Every command requires explicit user
  confirmation before execution.
- **Network / MCP tool calls:** never auto-approve.

### Required behavior during agentic runs
- Always follow the planning step (AGENTS.md §2) before using any write or shell tool.
- After each tool use, report what happened (outcome + any errors) before taking the
  next action — do not chain actions silently.
- If a tool returns an unexpected error, **stop and report** to the user. Do not retry
  with an undisclosed workaround.
- Do not install npm packages globally without asking first.
- Do not modify files outside the repository root.

### MCP tools
- Before calling any MCP tool (database, cloud API, etc.), state the tool name,
  the arguments, and the reason in chat. Wait for user confirmation.
- Treat all MCP tool calls as high-risk — they may have side effects outside this
  repository.
