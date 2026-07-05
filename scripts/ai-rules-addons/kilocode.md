## Kilo Code — Tool-Specific Notes

Kilo Code reads `AGENTS.md` at the project root natively — this file is loaded
automatically, the same way it is for Claude Code. You do not need to be told
to read it; it is already in your context.

### Multi-agent system

This repo's agentic workflow system (Orchestrator + 15 specialized agents) is
defined once in `.copilot/agents/` and `.copilot/workflows/`, and exposed to
Kilo Code as thin wrapper files under `.kilo/agents/*.md` (Kilo's native
custom-agent format: YAML frontmatter + Markdown prompt body). Each wrapper
points back to its full role definition in `.copilot/agents/<name>.md` —
**do not duplicate role content into the wrapper**; if you need to change an
agent's behavior, edit `.copilot/agents/<name>.md` and keep the wrapper thin.

- Start a workflow via the `orchestrator` agent (`.kilo/agents/orchestrator.md`).
- The orchestrator reads `.copilot/workflows/<type>.md` for the step sequence
  and invokes subagents through Kilo's `task` tool, passing file paths only
  (never file contents) per the Subagent Invocation Pattern in
  `.copilot/agents/orchestrator.md`.
- Gate results, retries, and issue registration follow
  `.copilot/schemas/protocol.md` — read it before routing a gate or finishing
  a workflow, regardless of which tool (Claude Code, Copilot, or Kilo Code)
  is driving the session.

### Permissions

Each `.kilo/agents/*.md` file declares a `permission` block mirroring the
`tools:` list already used for this agent in `.github/agents/*.agent.md`
(GitHub Copilot). If you add a new specialized agent, add it in all three
places: `.copilot/agents/<name>.md` (full definition), `.github/agents/<name>.agent.md`
(Copilot wrapper), and `.kilo/agents/<name>.md` (Kilo wrapper) — or note in
the PR why a given tool is intentionally skipped.

### Shell and git operations

Kilo Code's `bash` permission maps to the `execute` capability referenced
throughout `.copilot/`. The same restrictions apply: never run
`pnpm db:migrate` automatically, never push without explicit user
instruction, and always route commit/push/PR operations through
`scripts/workflow-finish.sh` — do not reimplement that logic inline.
