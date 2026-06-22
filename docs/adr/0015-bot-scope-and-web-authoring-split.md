# ADR-0015: Bot scope — member flows + organizer runtime; web for authoring

## Status
Accepted, 2026-05-15

## Context
[PROJECT.md §"Success criteria"](../01-business/project.md) states: "Telegram bot users can do everything the web users can do — both surfaces are first-class." Taken literally, this means every web feature also has a bot equivalent.

Two complications surfaced during planning:

1. **Phase 1 budget.** Literal parity = roughly 3–4 weeks of bot work across 12 Phase 1 weeks. Significant displacement of other backlog items (CRM integration, finance module, Phase 1 polish).
2. **Telegram inline UI is not suitable for all flows.** Long-form Markdown editing, multi-photo upload, drag-reorder agenda items, multi-step approval chains, multi-line formatted addresses — these are fundamentally awkward in chat-based interaction. Web authoring UX is not a "convenience" but a requirement for usable content management.

The Central Asian regional context matters: Telegram is the dominant social/communication channel in Uzbekistan, Kazakhstan, and Tajikistan. AI Qadam's existing audience already lives there. Bot-first quality is more strategically important here than for, say, a US meetup community.

## Decision
Split the "first-class equivalence" promise by surface strength:

### Bot is first-class for:

- **All member-facing flows:**
  - Browse upcoming events (paginated)
  - Event details, agenda, speakers, partners (read views)
  - Register / cancel
  - Get reminders, check in via QR
  - View `my-events` history
  - View leaderboard (top N)
  - Edit basic profile fields (display name, city, expertise tags, bio)
  - View own points, badges, streak
  - Reply to event Q&A threads

- **Organizer-runtime operations** (things organizers do *during* an event):
  - Live attendance monitoring
  - On-the-fly registration approval / waitlist promotion
  - Send push announcements to registered attendees
  - QR scan flow for door check-in
  - Mark no-shows post-event

### Web is first-class for:

- **Event authoring:**
  - Create event from scratch
  - Edit long-form description (Markdown editor with preview)
  - Build agenda (drag-reorder timed items)
  - Upload cover photo and event materials
  - Manage sponsor tiers
  - Configure custom registration fields

- **Speaker management** (CFP submission review, speaker profile management)
- **Tenant-wide settings** (timezone, default language, branding)
- Anything involving long-form Markdown, multi-file upload, or significant drag-reorder

### Both surfaces are first-class for:

- Read-only browsing of any public surface (events, speakers, partners, leaderboard, content pages)

## Rationale

- **Telegram inline UI is genuinely excellent** for ephemeral interactions, runtime operations, and high-frequency notifications. **Web is genuinely excellent** for long-form authoring and complex visual organization. Honoring each surface's strengths gives users the best of both, instead of a mediocre Telegram authoring experience and a redundant web member experience.
- **Production pattern in similar communities** (DOU.ua's bot ecosystem, KazDev tools, several Russian-language hackathon platforms): bot for runtime + member, web for authoring.
- **Phase 1 bot work fits in ~2–3 weeks** with this split, leaving budget for the rest of the [PROJECT.md §Phase 1](../01-business/project.md) backlog without deferring CRM or finance to Phase 2.

## Consequences

- ✅ Bot does what it's good at; web does what it's good at. Better UX overall than forcing parity.
- ✅ Phase 1 budget remains balanced — no need to push CRM integration, finance module, or polish to Phase 2.
- ✅ Organizers don't try to author event descriptions in a chat (which would be miserable for them and produce poor content).
- ⚠️ [PROJECT.md](../01-business/project.md)'s "first-class equivalence" wording becomes elastic — *first-class for what each surface is good at*. Round 2B updates `PROJECT.md` text to reflect this clearly so future readers don't trip on the literal interpretation.
- ⚠️ Some users may expect "everything via Telegram." Onboarding messaging tells organizers upfront that authoring is web-only. We expect 0–1 user complaints per quarter on this; if more, we revisit.
- 📝 The split is reviewable post-launch. If real organizer-usage data shows demand for bot-based authoring, we reconsider — with real demand signal, not a priori.

## Supersedes
The literal "do everything" reading of [PROJECT.md §"Success criteria"](../01-business/project.md). The PROJECT.md text update follows in Round 2B.

## References
- [PROJECT.md §"Success criteria"](../01-business/project.md) — the source of the "first-class equivalence" promise.
- [ARCHITECTURE.md §"Bot architecture (Python)"](../04-development/architecture/architecture.md) — bot is a thin client over the NestJS API.
