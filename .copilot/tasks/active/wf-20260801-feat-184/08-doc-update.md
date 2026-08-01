# Step 8 — Doc Update: FR-BOT-003 Bot Operator Runtime Commands

**Gate: passed**
**Author:** DocWriter

---

## Changes made

1. `docs/03-requirements/FR-BOT-003.md` — `status: Planned → Implemented`, `business_process: [BP-UAT-002, BP-UAT-005, BP-UAT-011, BP-UAT-019]` added to frontmatter.
2. `docs/03-requirements/requirements-registry.md` — Row 59 status `Planned → Shipped`.

No architecture docs require updating — this PR adds new bot commands entirely within the existing BOT module. The `POST /v1/internal/telegram/push-announcement` endpoint uses a direct Telegram Bot API call pattern rather than the outbox/Redis-Streams pattern; this decision is documented in the code-summary (`.copilot/tasks/active/wf-20260801-feat-184/03-code-summary.md`) as a pragmatic bounded design choice for event-day operator announcements (≤200 recipients).
