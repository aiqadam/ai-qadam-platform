# PROJECT.md — AI Qadam Platform

## What we're building

A **multi-tenant community platform** for AI engineers and tech builders across Central Asia. The platform serves three jobs:

1. **Event discovery and registration** — members find meetups, register, get reminders, check in via QR
2. **Community identity** — public profiles, speakers, gamification (points, badges, streaks, leaderboards)
3. **Content and operations** — multi-tenant CMS per country, partner/sponsor management, hackathon platform

## Why it exists

AI Qadam is currently run on a mix of Telegram groups, Google Forms, and ad-hoc tools. This works for one country and 50 people. It will not scale to:
- 3+ countries (Uzbekistan, Kazakhstan, Tajikistan, possibly more)
- Multiple recurring formats (meetups, Fuck-Up Nights, hackathons, workshops)
- A growing roster of speakers, partners, and sponsors
- A community that wants identity, recognition, and connection beyond a chat group

The platform exists to **let AI Qadam scale to a regional movement without losing the community feel**.

## Who uses it

### Primary users

- **Members:** AI engineers, ML practitioners, founders, students. Aged 22–40. Highly digital. They use Linear, GitHub, Notion daily.
- **Speakers:** community members who give talks. They want a profile, materials archive, CFP applications.
- **Organizers:** country leads (Abdu in UZ, future leads in KZ/TJ) who manage events, speakers, partnerships.
- **Partners and sponsors:** companies that support events with venue, food, prizes, or money.

### Internal users

- **Super admin:** Viktor (project owner) — has full access to all countries
- **Country admins:** see and manage only their country's data
- **Content editors:** can create/edit content but not change settings
- **Bot services:** automated systems (Telegram bot, integrations)

## Tone and brand

- **Serious and technical**, not playful
- **Confident but not loud**
- **Pan-regional** — Central Asian, world-aware
- **Inclusive across languages** — Russian primary, English secondary, Uzbek and Kazakh added progressively
- **Open-source spirit** — community-owned values, transparent decisions

## Success criteria

- A first-time visitor (senior ML engineer) within 3 seconds thinks: **"These people are serious, this is a real product."**
- Registration for an event takes ≤3 clicks from event page.
- Telegram bot is first-class for the registration journey, member flows (browse/register/cancel/check-in/my-events/leaderboard view/basic profile), and organizer-runtime ops (live attendance, on-the-fly approvals, push announcements). Web is first-class for content authoring (event creation, long-form descriptions, agenda building, materials upload, settings). Both surfaces are first-class *for what each is good at* — see [ADR-0015](../docs/adr/0015-bot-scope-and-web-authoring-split.md).
- A country lead can run their entire community without engineering support.
- Page load (LCP) under 2 seconds on 4G mobile in Tashkent.

## What we're explicitly NOT building

- A general-purpose event platform (Luma exists)
- A CRM (Twenty exists — we integrate)
- A custom Telegram client
- A learning management system
- A job board (separate concern, maybe later)
- A paid ticketing system (all our events are free for now)

## Constraints

- **Self-hosted, open-source only.** No proprietary SaaS in critical path.
- **Free of charge.** This is community infrastructure.
- **Runs on one server initially:** 8 vCPU / 32 GB RAM / 2 TB disk (Hetzner).
- **Built primarily by one person (Viktor)** using Claude Code as the implementation partner. Code must be readable by a future engineer who joins the team without context.
- **Multi-language from day one** architecturally, even if content starts in Russian/English only.

## Multi-tenancy model

Each country is a tenant:
- `uz.aiqadam.org` — Uzbekistan
- `kz.aiqadam.org` — Kazakhstan
- `tj.aiqadam.org` — Tajikistan
- `aiqadam.org` — global (regional events, cross-country leaderboard)

**Isolation:** logical, not physical. Single database with `country_code` discriminator on every tenant-scoped row.

**Sharing:** users can attend events in any country. Speakers can speak in multiple countries. Partners can sponsor in multiple countries.

## Phases

This document focuses on **Phase 1** (the first 12 weeks):

1. Infrastructure foundation (Coolify, Postgres, Redis, MinIO, Authentik)
2. Skeleton API and frontend (NestJS + Astro)
3. Content management (Directus)
4. Event registration flow (web + email)
5. Telegram bot integration
6. Profiles, follows, basic feed
7. Gamification v1 (points + badges + per-country leaderboard)
8. Check-in via QR + post-event flow
9. CRM integration (Twenty)
10. Finance module
11. Polish, content backfill, launch

**Out of scope for Phase 1:** photo gallery with ML, hackathon platform, speaker CFP, cross-country leaderboard, mobile app, paid tickets.

## Decision authority

- **Viktor** decides product, scope, priorities.
- **Claude Code** implements within these rules. When unclear, asks.
- **External advisors** (Abdu, Binali) provide feedback on UX and community fit.

## Stakeholders

- **Viktor Drukker** (owner, PM, primary developer; GitHub `viktordrukker`)
- **Abdu Muzaffariy** (close collaborator, UZ community lead)
- **AI Qadam community** (members, speakers, partners)
- **OTP Group / Ipoteka Bank** (Viktor's employer — separate, no overlap with this project)
