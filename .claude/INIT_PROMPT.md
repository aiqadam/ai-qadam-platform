# INIT_PROMPT.md — First Claude Code session

This is the prompt for your **first interaction with Claude Code** after placing all 8 documentation files in an empty repository.

---

## How to use this

1. Create an empty GitHub repository: `aiqadam` (or whatever name you prefer).
2. Clone it locally.
3. Place these 8 files at the repository root:
   - `CLAUDE.md`
   - `PROJECT.md`
   - `ARCHITECTURE.md`
   - `STANDARDS.md`
   - `WORKFLOW.md`
   - `SECURITY.md`
   - `AI_COLLAB.md`
   - `GLOSSARY.md`
4. Commit and push: `git add . && git commit -m "docs: initial project documentation" && git push`
5. Open the repo in your editor (Cursor, VS Code, etc.).
6. Start Claude Code in that directory: `claude` (or via your IDE integration).
7. Paste the prompt below as your first message.

---

## THE PROMPT (copy from here)

```
Hi Claude. This is the first session on the AI Qadam Platform project.

Before doing anything else, please:

1. Read ALL of these files in this order:
   - CLAUDE.md
   - PROJECT.md
   - ARCHITECTURE.md
   - STANDARDS.md
   - WORKFLOW.md
   - SECURITY.md
   - AI_COLLAB.md
   - GLOSSARY.md

2. After reading, respond with a short briefing that confirms understanding:
   - 2-3 sentences summarizing what we're building
   - 3-5 key rules from CLAUDE.md that you find most important
   - The tech stack from ARCHITECTURE.md (just list it)
   - Any contradictions, ambiguities, or gaps you noticed between the docs
   - Any questions you have before we start building

3. Do NOT write any code yet. Do NOT create any files yet. Do NOT install any dependencies yet.

The goal of this first session is to validate that the documentation is consistent and that we're aligned on the foundations. We'll start building infrastructure in the next session.

After your briefing, I'll either:
(a) Confirm we're aligned, and we move to "Week 1: Infrastructure" planning
(b) Make adjustments to the docs based on what you flagged
(c) Discuss specific areas that need more detail

Take your time reading carefully. The quality of the next 12 weeks of work depends on whether we got this foundation right.
```

---

## What to expect from Claude Code's response

A well-functioning Claude Code will respond with something like:

```
I've read all 8 files. Here's my briefing:

**What we're building:** AI Qadam is a multi-tenant community platform for AI 
engineers across Central Asia, supporting event registration, gamification, 
content management, and a Telegram bot. It's self-hosted, open-source, and 
built for one developer (you) with AI assistance.

**Top rules from CLAUDE.md I'll hold to strictly:**
1. Read docs at session start (just did this).
2. State plan before non-trivial code changes, ask for approval.
3. Functions ≤ 60 lines, no `any`, all input validated at boundaries.
4. Small PRs ≤ 400 lines; one logical change per PR.
5. Never bypass tests, security, or git workflow to "ship faster."

**Tech stack:** Astro 5 + React + Tailwind 4 + shadcn/ui (web), NestJS 11 + 
Drizzle + Zod (API), Directus 11 (CMS), Python 3.12 + aiogram 3 (bot), 
PostgreSQL 16 + Redis 7 + MinIO, Authentik (SSO), Listmonk, Twenty CRM, 
Coolify orchestration on hyperapp.cloud.

**Things I noticed:**
- [Specific items here, hopefully showing careful reading]

**Questions:**
- [Specific clarifying questions]
```

If Claude Code skips reading, hallucinates, or rushes to code — **stop and re-prompt**. The first session sets the tone.

---

## If Claude Code flags inconsistencies

This is good — it means the docs got real scrutiny. Likely candidates:

- A rule in CLAUDE.md that conflicts with something in STANDARDS.md
- A term used in ARCHITECTURE.md that's not in GLOSSARY.md
- A workflow step in WORKFLOW.md that depends on tooling we haven't set up

**Don't dismiss these.** Either fix the docs or explicitly accept the gap with a TODO.

---

## After the briefing — Week 1 kickoff

When you're satisfied with the briefing, your next message should be:

```
Aligned. Let's plan Week 1: Infrastructure Foundation.

The goal of Week 1 is:
- Coolify running on the Hetzner server (agentic.uz)
- Wildcard DNS configured for *.aiqadam.org
- PostgreSQL 16, Redis 7, MinIO running as shared services
- Authentik running as OIDC provider
- Minimal "hello world" Astro app deployed to uz.aiqadam.org
- Empty NestJS API deployed to api.aiqadam.org with /health endpoint
- CI pipeline on GitHub Actions
- Monitoring (Grafana + Loki + Prometheus + Uptime Kuma) running

Please propose:
1. A day-by-day breakdown of Week 1 tasks.
2. The repository structure we'll create.
3. The first 3 PRs we should open in sequence.
4. Any prerequisites I need to handle (DNS access, server access, GitHub setup) before we start.

Don't write any code or create any files yet. Just the plan.
```

This continues the planning-before-coding rhythm.

---

## Tips for success

### Do
- **Read what Claude Code wrote** before approving. Don't skim.
- **Push back when something feels off.** Trust your instinct even if Claude Code is confident.
- **Take breaks.** Tired Viktor + tireless Claude Code = bad decisions.
- **Commit often.** End of every working block, push to branch.
- **Update docs as you learn.** If a rule isn't working, change the rule.

### Don't
- **Don't say "just do it" repeatedly** — that's how rules erode.
- **Don't merge PRs you don't understand.** Ask for explanation first.
- **Don't add a dependency Claude Code suggests** without checking it yourself (npm page, GitHub stars, last update).
- **Don't run shell commands you don't recognize.** Ask Claude Code to explain.

---

## When this prompt has done its job

After Session 1, you should have:
- A confirmed shared understanding of the project
- All 8 docs validated against each other
- A Week 1 plan ready to execute
- A clear sense of how the collaboration will feel

Save this prompt. You'll reuse a shorter version of it at the start of every new Claude Code session, since Claude Code has no memory between sessions:

```
Re-reading project docs before continuing. Please load CLAUDE.md, 
ARCHITECTURE.md, and any other docs relevant to today's task. 
Today we're working on [task].
```

That's enough to bootstrap any subsequent session.
```
