# GLOSSARY.md — Domain Terms

Common terms with precise meanings in the AI Qadam codebase. Use these consistently.

When two terms could mean the same thing, **we pick one** and stick with it. Synonyms in spec are bugs in product.

---

## Core entities

### User
A registered person on the platform. Has an account in Authentik (which is the source of truth for credentials) and a row in the `users` table (which extends with platform-specific fields). A User can be a Member, Speaker, Organizer, or Admin — these are **roles**, not separate entity types.

### Member
A User in the "member" role. The default role for anyone who signs up. Members can register for Events, manage their profile, earn Points and Badges.

### Speaker
A User in the "speaker" role. A Speaker is also a Member. The Speaker role grants the ability to manage one's `speakers` profile (bio, expertise, talks history) and respond to CFPs (Call For Papers).

### Organizer
A User in the "organizer" role for a specific Tenant (country). Can create and manage Events in their country.

### Country Admin
A User in the "country_admin" role. Like Organizer + manages Speakers, Partners, and platform settings for their country.

### Super Admin
A User with global admin access across all Tenants. Currently only Viktor.

### Tenant
A country instance of the platform. Identified by a two-letter code (`uz`, `kz`, `tj`). Each Tenant has its own subdomain, content, and team. Data is logically isolated by `country_code` columns.

### Country
**Same as Tenant** in our system. We use "Tenant" in technical/architectural contexts and "Country" in product/UX contexts. They refer to the same concept.

---

## Event domain

### Event
A scheduled gathering — meetup, workshop, hackathon, conference, online event, etc. Has a date, location (physical or online), description, speakers, partners, registrations. Belongs to one Tenant.

### Meetup
**A specific format of Event.** Recurring, community-driven, usually 2-3 hours, 1-3 speakers. The numbered series ("AI Qadam #4") refers to meetups specifically.

### Hackathon
**A specific format of Event.** Time-bounded competitive build event, multi-day, with tracks, teams, submissions, judging. Has its own sub-system (`hackathon_*` tables).

### Workshop
**A specific format of Event.** Hands-on session, one topic, smaller audience.

### Conference
**A specific format of Event.** Larger scale, multiple tracks, full day or multi-day, paid or free.

### Event Format
The kind of Event: `meetup`, `workshop`, `hackathon`, `conference`, `online`. Stored in `events.format`.

### Registration
A User's commitment to attend an Event. Created when User clicks "I'm going." Has a status (`pending`, `confirmed`, `waitlist`, `checked_in`, `no_show`, `cancelled`). One User, one Event = at most one Registration.

### Waitlist
A Registration with status `waitlist`. Occurs when Event is at capacity. Promoted to `confirmed` when someone cancels.

### Check-in
The act of confirming physical presence at an Event. Marks Registration as `checked_in`. Awards attendance Points. Triggered by scanning the User's QR code.

### QR Token
A unique string per Registration, encoded as a QR code in the registration confirmation email. Used for Check-in. Expires when the Event ends.

### Capacity
The maximum number of `confirmed` Registrations for an Event. `null` means unlimited. Registrations beyond capacity go to Waitlist.

### No-show
A Registration with status `no_show`. Set after the Event ends for Users who were `confirmed` but never checked in. May affect future registration priority.

### Agenda
The schedule of an Event — list of timed items (talks, breaks, panels). Stored as JSON in `events.agenda` or in a related table.

### Talk
A presentation by a Speaker at an Event. Has a title, description, duration, slides, optional video recording.

---

## Identity and access

### Authentik
Our identity provider. The source of truth for user credentials (email, password, MFA). Issues JWTs that the API verifies.

### Role
A named set of permissions. Stored in Authentik and propagated as JWT claims. See `users.role`.

### Tenant Scope
The set of Tenants a User has access to. A Country Admin's scope is one Tenant; a Super Admin's scope is all Tenants.

### Service Account
A non-human User account used by automated services (bot, workers, integrations). Has its own credentials, narrower permissions.

### Session
An authenticated state between User and the platform. Backed by a JWT for API, by a session cookie for web. Has an expiry.

---

## Content domain

### Page
A static piece of content (About, FAQ, Code of Conduct). Managed in Directus, identified by `slug`. Can be Tenant-scoped or global.

### Post
A blog/news article. Managed in Directus. Has an author, content, optional related Event.

### Material
A resource related to an Event or Speaker — slides, video, GitHub link, paper. Stored in `event_materials`.

### Tag
A label applied to Events, Posts, Speakers for categorization. Stored in `tags` table, joined via many-to-many.

### Partner
A company that supports Events with sponsorship, venue, food, prizes, or media. Has a profile with logo and description. Sponsorship tier per Event is in `event_partners`.

### Sponsor
**A type of Partner** specifically providing monetary or material support. We use "Partner" as the umbrella term; "Sponsor" is one type.

---

## Gamification domain

### Points
Numeric score awarded for actions (registering for an Event: +5, attending: +20, speaking: +50). Stored as `users.points_total` (denormalized for fast lookup) and as the audit trail in `activities.points_awarded`.

### Badge
A discrete achievement earned by Users. Defined in `badges` catalog, awarded via `user_badges`. Examples: Pioneer, Speaker, Connector, Streak.

### Tier
A Badge's prestige level: `bronze`, `silver`, `gold`, `special`. Affects visual treatment.

### Streak
The current count of consecutive Meetups attended by a User. Resets if a User skips a meetup that they were in attendance range for. Stored as `users.streak_current`.

### Leaderboard
A ranked list of Users by Points within a scope (per-country, per-period). Computed on read with caching.

### Activity
A record of something a User did or that happened to them. Powers the feed and the gamification audit. Examples: `event_registered`, `event_attended`, `badge_earned`, `speaker_spoke`. Stored in `activities`.

---

## Technical terms

### Tenant Resolution
The middleware step that determines which Tenant a request belongs to. Looks at hostname → header → user context.

### Bounded Context
A domain area with explicit boundaries (e.g., "Events" is one bounded context, "Gamification" is another). Cross-context interaction goes through service interfaces, not direct table access.

### ADR (Architecture Decision Record)
A short document describing a significant technical decision: context, decision, consequences. Lives in `docs/adr/`. Append-only — superseded ADRs are marked, not deleted.

### Runbook
A document describing how to handle an operational scenario (deploy, rollback, restore from backup, debug a common issue). Lives in `docs/runbooks/`.

### Migration
A version-controlled schema change to the database. Generated via `drizzle-kit`. Applied in order, immutable once merged.

### Seed
Initial data inserted into a database — countries, languages, default tags, etc. Idempotent; running twice has the same effect as running once.

### Fixture
Test data used in automated tests. Lives near the tests, not in production code.

### Pipeline / Workflow
A sequence of automated steps (CI build, deploy, etc.). We use "Pipeline" for CI/CD, "Workflow" for the team process (covered in WORKFLOW.md).

---

## Languages and i18n

### Locale
A language + regional variant combination (`ru`, `en`, `uz-latn`, `uz-cyrl`, `kk`). User-selectable, persisted in profile.

### Translation
A specific-language version of a piece of content. UI strings are in JSON files; content translations are in Directus.

### Script
The writing system used by a language. Uzbek has both Latin and Cyrillic scripts. We support Latin primarily; Cyrillic is opt-in.

---

## Misc terms

### Phase 1
The first 12 weeks of building, scoped in PROJECT.md. Excludes photo gallery ML, hackathon platform, speaker CFP system, mobile app.

### Founding Member
A User who registered during Phase 1 launch period. Special badge, no other privileges.

### Soft Delete
Marking a record as deleted (`deleted_at` timestamp) without removing it from the database. Used where we may need to restore (user accounts have 30-day soft delete).

### Hard Delete
Actually removing a row from the database. Used after soft-delete grace period, or for non-critical records.

### Idempotent
An operation that has the same effect whether run once or many times. Most of our PUT/DELETE endpoints are idempotent; some POSTs accept `Idempotency-Key`.

### Multi-tenant
The property of one codebase + one database serving multiple Tenants (countries). Our model: shared everything, isolated by `country_code` discriminator.

---

## Terms we explicitly DON'T use (and why)

- **"Customer"** — we don't have customers, we have community members. We say "User" or "Member."
- **"Account"** — ambiguous (Authentik account? Profile? Subscription?). We say "User" for the person, "Profile" for their public-facing identity.
- **"Booking"** — too commerce-y for free events. We say "Registration."
- **"Ticket"** — same. There are no tickets, just confirmed Registrations and QR codes.
- **"Webinar"** — generic and dated. We say "Online Event" or specify the format.
- **"Tribe" / "Squad"** — overused jargon. We say "Community," "Country," "Team" (for hackathon teams specifically).
- **"Onboarding"** for users — too SaaS-y. We say "Signup flow" or "First-time experience."

---

## When you encounter a new term

If you find yourself coining a new term while building:

1. Check if an existing term covers it.
2. If genuinely new, **add it here** with a precise definition.
3. Don't use multiple terms for the same concept across the codebase. Synonyms drift into separate concepts over time.

This file is part of the codebase. Update it like you update code.
