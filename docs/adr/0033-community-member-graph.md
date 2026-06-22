# ADR-0033: Community member graph on Directus — replacing sales-CRM tooling

## Status
Accepted, 2026-05-20

> Set by Viktor in conversation on 2026-05-20 after working through the Twenty CRM impasse end-to-end (Enterprise-OIDC gate per [PR #73](https://github.com/viktordrukker/aiqadam/pull/73) → embed cabinet option per [ADR-0032](./0032-operator-tools-must-sso-or-embed.md) → "but what about CRM scalability" → realisation that AI Qadam is community-as-platform, not a sales motion). This ADR captures the architectural conclusion and the operator-UI consequence in one place so future "should we add CRM tool X / build screen Y in Directus" decisions have a single reference.

## Context

### The trigger

Twenty CRM was selected in Sprint 5 (PR #71 plan) on the assumption that AI Qadam would need standard B2B sales-pipeline tooling for sponsor relationship management. The deployment hit an architectural wall:

- Twenty OSS does not support generic OIDC — it's Enterprise-only ([PR #73](https://github.com/viktordrukker/aiqadam/pull/73))
- The "embed in workspace" fallback ([ADR-0032 §Decision](./0032-operator-tools-must-sso-or-embed.md)) implied building a cabinet — sensible, but the question that surfaced during that planning was *"what data model should the cabinet present?"*
- The honest answer: **Twenty's data model is sales-pipeline-shaped (Contact → Account → Opportunity → Deal), and AI Qadam's business model has no sales pipeline.** We run community events; we don't sell deals through reps.

### What AI Qadam actually is

Reframed by the PM / community-platforms hat (during the same conversation): AI Qadam is a **community-as-platform** play, not a meetup organiser. The audience graph (people ↔ events ↔ skills ↔ employers ↔ interests ↔ consents) is the platform asset; every future product — problem-solving hackathons, HRtech (talent ↔ employer matching), edtech (cohort courses + paid workshops), premium content, mentorship marketplace — is a **thin consumer of that graph**, not a separate system.

This is the same architectural shape as Reforge, Indie Hackers (pre-Stripe acquisition), DEV.to (Forem), MLH/Devpost. The community platforms that stitched CRMs and tool sprawl into their member identity (the Lenny's Newsletter cluster) are now spending real money rebuilding a unified member graph after fragmentation.

### Why a sales CRM is the wrong primitive

CRM tooling — Twenty, EspoCRM, HubSpot, Salesforce — encodes the **deal pipeline** as a first-class concept and everything else as supporting (contacts exist *for* opportunities; accounts exist *for* deals). For AI Qadam:

- Sponsor pipeline at our scale = 5–15 organisations per year. Not a pipeline; a saved view.
- Member relationships are not "opportunities"; they are nodes in a graph with multiple purposes (event attendance, content engagement, skill development, peer connections, talent matching).
- Spinning up a hackathon, a job board, or a cohort course needs to read **the same member**, not a CRM-shadow of them sync'd from somewhere else.

A bolt-on B2B sales motion may emerge years out (e.g., selling enterprise sponsorship packages with a multi-rep sales team). At that point HubSpot becomes a **downstream consumer of the graph**, not a replacement for it. That decision is not now.

### Why Directus is the right substrate

We already operate Directus 11 as the entity store ([migration to Directus-centric](../04-development/architecture/migration-to-directus-centric.md)). It is:

- API-first (REST + GraphQL) — every product spawn is a thin consumer
- Permissioned per-role, per-collection, per-record — sponsor X cannot see member Y unless the consent chain allows it
- Flow-orchestrated — automation lives next to the data
- Already integrated with Authentik OIDC (no new auth island)
- Already integrated with our Interactions dispatcher (mass-personalised messaging by audience filter)

Directus is **not** a CRM, but its data primitives (collections + relations + presets + permissions + flows) are exactly the entity-graph primitives this thesis requires. Off-the-shelf CRMs (Twenty, EspoCRM, etc.) optimise for a different shape and would force the same fragmentation problem the comparable platforms hit.

### The UX problem

Directus admin is a **database tool**. Operators (country leads, sponsor reps, board members, speakers) are not engineers. Letting them edit member records in Directus admin replicates the Authentik-admin / Coolify-admin auth-island problem at the UX layer — exactly what [ADR-0032](./0032-operator-tools-must-sso-or-embed.md) prohibits for external tools, and inconsistent if we permit it for Directus.

The operator UI must be **purpose-built per workflow, in operator language, on the workspace shell** — same pattern ADR-0032 mandates for every other tool.

## Decision

### Part 1 — Data layer: community member graph on Directus

Establish a **member graph** as the canonical platform data model. Schema (extending what exists; namespace `members/`, `partners/`, `cohorts/`):

```
members
  (= directus_users today; add rich profile)
  id, email, display_name, country, locale, joined_at,
  job_title, employer (FK), seniority enum (ic/senior/lead/manager/director/vp/c_level),
  is_student bool, industry tag[], bio_md,
  appear_in_directory bool (member-controlled)

member_skills
  member_id, skill_tag, endorsement_count, verified_by_event_id?
  (auto-verified-by-event = "attended a fintech meetup" → "fintech" tag gets a verification signal)

member_employments
  member_id, employer (FK to companies), role, started_at, ended_at?, is_current bool,
  share_with_sponsors bool (per-employment consent)

member_interests
  member_id, topic_tag, intent enum (interested_in/willing_to_speak/looking_for_job/looking_for_cofounder/etc.)

member_consents
  member_id, purpose enum (events/marketing/research/recruiting/sponsor_share/content/paid_premium),
  granted_at, revoked_at?, source enum (signup/preferences_page/email_link/event_check_in)

member_connections
  member_a_id, member_b_id, signal enum (co_attended_event/hackathon_teammate/mentor_pair),
  context_event_id?, weight int
  (powers "3 people you might meet at this event" + future social graph products)

companies
  id, name, slug, industry, size_band, country, website, is_sponsor bool, is_employer bool

cohorts
  id, name, slug, filter_query jsonb, created_by, created_at,
  member_count_cached int (refreshed by cron)
  (a cohort = a saved Directus filter against members, usable as audience for dispatcher OR
   as entitled-audience for partner_audiences)

partner_audiences
  partner_id (FK companies where is_sponsor or is_employer or is_product_partner),
  cohort_id, purpose enum (event_invite/job_posting/research_invite/sponsor_analytics),
  granted_at, expires_at?
  (THE consent-chain enforcement primitive — sponsor X can see cohort Y for purpose Z only)

event_types
  (existing; extend taxonomy: meetup/workshop/hackathon/closed/paid/course_session)

events
  (existing; add: visibility enum (public/cohort/invite_only), audience_cohort_id?,
   price_usd?, capacity_band)

event_outcomes
  event_id, registrations_count, attended_count, csat_avg, nps,
  content_artifacts_count, follow_up_completed bool
  (denormalised post-event rollup; powers sponsor reports cheaply)

event_followups
  event_id, kind enum (retrospective/thank_you_sent/recap_posted/sponsor_report_delivered),
  body_md?, completed_at?, due_at?
```

**Sponsors** (existing `sponsors` collection from PR #78) becomes a **view-shape on top of `companies WHERE is_sponsor=true`** + the existing `sponsor_tier` enum + a `sponsor_contributions` collection (per-year-per-tier-amount). Contracts deferred per Viktor's note.

**Twenty CRM is dropped.** Coolify service deletion + Twenty workstream (Sprint C5 area) closed. Member relationship management lives in the graph.

### Part 2 — UI strategy: cabinets, not Directus admin

**Directus admin = engineer-only escape hatch.** Operators never touch it. Per ADR-0032's "embed in workspace" clause, operator workflows live in `/workspace/<concern>` cabinets we build in Astro + React using our design system. The Directus card in the workspace launcher gets an `engineer` chip alongside Coolify-admin and Authentik-admin.

### Part 3 — Operator surface: five cabinets covering ~80% of operator work

Built incrementally as vertical features per [`docs/05-other/agent-prompts.md`](../05-other/agent-prompts.md) §2 template. Ordered by frequency × persona-pain:

| # | Cabinet | URL | Primary persona | What it does | Why first | Effort |
|---|---|---|---|---|---|---|
| **1** | Member directory + cohort builder | `/workspace/members` | Country lead (Aigerim) | Search/filter members; preview audience; save filter as named cohort. Unlocks: closed events, targeted invites, sponsor analytics segments. | Most leveraged primitive; everything else reads cohorts | ~2 days |
| **2** | Announcement composer | `/workspace/announce` | Country lead, board | Pick cohort → write message → preview → send via Interactions dispatcher. | Activates the cohorts; weekly use | ~1 day |
| **3** | Event control panel | `/workspace/events/[id]` | Country lead + day-of organisers | Pre-event prep (speakers, capacity, venue), day-of check-in scanner, post-event followups. Replaces Directus + spreadsheets. | Per-event use; high pain today | ~2 days |
| **4** | Partner / sponsor view | `/workspace/partners/[id]` | Sponsor reps | See entitled cohort analytics (Metabase embed) + download deliverables (co-marketing kit, quarterly digest PDF). | Activates the partner_audiences entitlement model | ~1 day |
| **5** | Member self-service | `/me/profile` | Members | Manage own profile, consents per purpose, interests, employment, visibility. Powers the graph by giving members agency. | Activates member_consents; unblocks GDPR posture | ~1 day |

**Total: ~7 days of focused work** across 5 vertical PRs. Anything outside these cabinets stays in Directus admin behind the `engineer` chip.

Cabinet build approach: same stack as `/workspace` today (Astro + React island + Tailwind via design tokens + NestJS API endpoints that proxy Directus with our auth + cohort-entitlement enforcement layered on). **No admin-UI framework** — they're database-shaped (just prettier) and we'd be fighting toward operator-language UX. Each cabinet is small enough that hand-built is competitive.

## Future products mapping

Every product on AI Qadam's spawn radar lands on this graph as a thin schema extension + a cabinet:

| Product | Schema extension (namespaced) | Reads from the graph | Cabinet |
|---|---|---|---|
| **Hackathons** | `hack_teams`, `hack_submissions`, `hack_judges`, `hack_scores` | members + member_skills (team matching) + event_outcomes + partner_audiences (presenting sponsor entitlement) | `/workspace/hackathons/[id]` (extends event control panel) |
| **HRtech** (talent ↔ employer) | `hr_jobs`, `hr_applications`, `hr_candidate_feeds` | members WHERE `consent.recruiting=true AND interest.looking_for_job=true` + member_skills + member_employments | `/workspace/jobs` + `/workspace/talent` (partner cabinet for employers) |
| **Edtech** (workshops, paid cohorts) | `edu_courses`, `edu_enrollments`, `edu_lesson_progress`, `edu_certifications` | members + event_outcomes (workshop = event with format=workshop) + cohorts (alumni-of-course-X cohort feeds next-course recommendation) | `/workspace/courses` + `/me/learning` (member-side) |
| **Paid premium / newsletter** | `paid_subscriptions`, `paid_content` | members + dispatcher (cohort gates dispatch to subscribers) | extension of `/workspace/announce` + `/me/profile` consent |
| **Mentorship marketplace** | `mentor_profiles`, `mentor_matches`, `mentor_sessions` | members.skills + members.interests + member_connections | `/workspace/mentorship` + `/me/mentorship` |
| **Sponsor "talent slice" upgrade tier** | (no new collections) | partner_audiences entitlement upgrade — sponsor gets a HRtech-style curated talent feed | extends `/workspace/partners/[id]` |

Each is 1–2 vertical PRs on top of the graph. None requires a new database, a new auth system, or a new admin tool.

## Consequences

### Positive

- **One member identity.** Every product reads the same person; no sync hell, no fragmentation. Off-boarding = revoke Authentik = revoked everywhere.
- **Cabinets-only operator UX.** Operators see one bookmark (`/workspace`), navigate left-sidebar to per-concern cabinets, never touch a database tool.
- **Consent layering, by design.** `member_consents` × `partner_audiences` is the GDPR posture; per-purpose opt-in is first-class, not bolted on.
- **Cheap product spawn.** Hackathon / HRtech / edtech land as namespaced schema + a cabinet. No "stand up a new system" project per product.
- **Sponsor value compounds.** As the graph thickens (more members, richer profiles), every sponsor's audience composition report gets better — without re-architecting.
- **Reversibility.** Directus collections export to SQL/CSV trivially. If we hit a scale ceiling or a future product needs a different substrate, we migrate the relevant subgraph, not the whole platform.

### Negative

- **No specialised B2B sales UX.** If we later run a real sales motion, we add HubSpot (or similar) as a downstream consumer of the graph; we don't have it day-one.
- **Schema sprawl risk.** Each product adds collections. Mitigation: namespace prefix (`hack_*`, `edu_*`, `hr_*`) + quarterly schema review.
- **"Looks like a database tool" perception for operators sneaking into Directus.** Mitigation: cabinets shipped before any operator gets Directus access; Directus admin gets `engineer` chip.
- **Cabinet ownership.** Operator UX requires real frontend craft; we own every screen. Mitigation: 5 cabinets are bounded (~7 days total); each cabinet is small enough to maintain.

### Neutral

- ADR-0032 unaffected — this ADR is its application to the Directus engine. Future-tool decisions still follow ADR-0032; the cabinets are the application surface.
- [PR #73](https://github.com/viktordrukker/aiqadam/pull/73) (Twenty Enterprise OIDC abandonment) is closed by this ADR — there is no follow-up Sprint 5 Google fallback because there is no Twenty.
- Sprint C5 (Twenty CRM workstream) is dropped from the roadmap. The Twenty container will be deleted from Coolify.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Consent debt** — multi-purpose opt-in is THE thing community platforms get wrong; one mis-permissioned query and we leak member data to a sponsor who shouldn't see it | High | `member_consents` × `partner_audiences` is consent-first by design; sponsors NEVER read raw member rows; always go through cohort-aggregated views (Metabase) or dispatcher (audience-scoped). Audit per record via the audit_events collection landing in Sprint 2.5. |
| **Schema sprawl** — 50 collections by Phase ζ if unmanaged | Medium | Namespace prefixes (`hack_*`, `edu_*`, `hr_*`) + quarterly schema review meeting + cabinet-per-namespace ownership |
| **Sponsor PII boundary leakage** — `partner_audiences` is the new attack surface | High | Sponsors NEVER touch raw member rows. Cohort-aggregated views only (Metabase). Per-purpose audit per access. Pen-tested before each new product onboards. |
| **Directus admin UX at 50k+ members** — admin slows down | Low (today); rises with member count | Switch heavy editing to API + custom workspace pages then; today we have ~hundreds of members |
| **"Member graph" sounds abstract to operators** | Low | Internally we use product language ("members", "partners", "events"); operators never see the graph theory — they see cabinets |
| **Cabinet maintenance burden** — 5 cabinets × forever evolution | Medium | Same design system + same Astro+React stack everywhere; ownership matrix per cabinet; cabinet PRs follow the vertical-feature template |
| **Future B2B sales motion** — if a real sales team emerges, the graph isn't a CRM | Low; years out | Bolt HubSpot (or similar) on as a downstream consumer; member graph remains source of truth |

## What changes in the roadmap

| Roadmap item before | After this ADR |
|---|---|
| **Sprint C5 — Twenty CRM (deployed, OIDC abandoned, Google fallback planned)** | **Dropped.** Twenty Coolify service deleted. C5.x workstreams closed. |
| **Sprint S3.2 — Sponsor cabinet (Twenty embed via API)** | **Reshaped: partner_audiences entitlement model + sponsor analytics in Metabase + Cabinet #4 (Partner / sponsor view).** Much smaller PR than the Twenty-embed plan. |
| **(missing) Sprint 3.0 — member graph foundation** | **New: ship the graph collections + extensions + permissions in one vertical PR before any cabinet.** Blocks Cabinets #1–#5. |
| **(missing) Cabinet sequence** | **New: 5 cabinets ordered by frequency × pain (table above). Each is one vertical PR.** |
| **Phase ζ.3 — Hackathon teams** | Lands on member graph (hack_* namespace). Cabinet extends `/workspace/events/[id]`. |
| **Phase ζ (HRtech / edtech / paid premium / mentorship)** | **Now has an architectural home.** Each is a namespaced schema extension + a cabinet. No product is a "stand up a new system" project. |

## References

- [ADR-0032](./0032-operator-tools-must-sso-or-embed.md) — operator-tools-must-SSO-or-embed; this ADR is its application to the Directus engine
- [migration to Directus-centric](../04-development/architecture/migration-to-directus-centric.md) — why Directus is the entity store
- [interaction-architecture](../04-development/architecture/interaction-architecture.md) — the dispatcher cohorts feed into
- [PR #73](https://github.com/viktordrukker/aiqadam/pull/73) — Twenty Enterprise OIDC gate documentation (closed by this ADR)
- [marketing-and-pr-playbook.md §3.5](../02-business-processes/marketing-and-pr-playbook.md) — sponsor tier model
- [community-platform-roadmap.md §1](../01-business/community-platform-roadmap.md) — north-star metrics this graph powers
- [community-platform-roadmap.md §3](../01-business/community-platform-roadmap.md) — actor lifecycles whose data lives in the graph
- Pattern references (no link — strategic context): Reforge (member graph powering courses + hiring), Indie Hackers (member graph pre-acquisition), DEV.to / Forem (open source community engine with sponsorships + jobs as products), MLH / Devpost (hackathon ops on a member graph)
