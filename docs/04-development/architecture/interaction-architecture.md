# AI Qadam — interaction & platform architecture

> v2 drafted 2026-05-19 after user feedback that (a) sponsor cabinet must phase iteratively up to payment wiring, (b) consent + EULA must be first-class and per-event-type, (c) we need a BI engine recommendation, (d) consent prompted at registration, (e) channels default to Telegram with rule + user-override, (f) hackathon teams (and other groups) are real, (g) E2E flow must be measurable in every direction.
>
> **No decisions in here. This is the architecture I'd build against — push back before I plan sprints.**

---

## 1. Three layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Layer 3 — Cabinets (actor-facing surfaces)                              │
│  • Client cabinet — aiqadam.org/me + Telegram bot                        │
│  • Sponsor cabinet — sponsors.aiqadam.org (phased)                       │
│  • Speaker cabinet — speakers.aiqadam.org (phased)                       │
│  • Operator workspace — Twenty + Directus + /admin redirect              │
│  • Team cabinet (hackathon) — /me/teams + bot                            │
└──────────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │  REST / GraphQL / Telegram API
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Layer 2 — Cross-cutting platform services (in our NestJS API)           │
│  • Auth wiring (Authentik proxies/OIDC)                                  │
│  • Interaction dispatcher (the privacy boundary)                         │
│  • Consent & EULA service                                                │
│  • Channel routing (rules + user prefs + Telegram default)               │
│  • Settings + experiments registry                                       │
│  • Group/team service                                                    │
│  • Payment service (much later, separate sprint)                         │
└──────────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │  REST + flows
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Layer 1 — Engines (back-office, operator-only, never touched by users)  │
│  • Authentik    — identity                                               │
│  • Directus     — CMS + entity store + flows                             │
│  • Twenty       — CRM (operator-facing relationships)                    │
│  • Metabase     — BI (proposed)                                          │
│  • Postgres     — single shared DB cluster, per-engine DBs               │
│  • Redis        — queues + cache                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

**Key rules:**
- Engines are not reachable by clients/sponsors/speakers. Only the API (Layer 2) and operators (via the wrapped /admin redirect) touch them.
- Cabinets only call Layer 2. They never see Directus tokens, Twenty tokens, Metabase admin tokens. Pattern already established (Sprint 4 admin decommission).
- Layer 2 is the privacy boundary. PII leaves it only through dispatcher → consented recipient channel adapters.

---

## 2. The lifecycle is a loop, not a funnel

```
              advertise event ──────────────►
                                              │
                                              ▼
        ◄────── improve & plan next  ◄──── client registers (+ accepts EULA)
                            │                   │
                            ▼                   ▼
                       measure CSAT/eNPS ◄── client attends
                       sponsor metrics
                       speaker metrics
                       operator funnel
```

Each loop generates outcomes consumable by **every actor**: sponsors see reach + clicks + leads; speakers see attendance + ratings; operators see funnel + CSAT + churn; clients see their own engagement + their place in the community.

---

## 3. Four actor categories

| Actor | Identity | First-class entity |
|---|---|---|
| **Client** | OIDC user, may be temp Telegram-only | `directus_users` row, optional `client_profile` |
| **Sponsor** | Org with one or more representative users | `sponsors` collection (org), `sponsor_reps` join |
| **Speaker** | Individual, may also be a client | `speakers` collection, FK to a representative `directus_users` row |
| **Operator** | AI Qadam team | `directus_users` with `actor_kinds: ['operator']`, role-bound in Authentik |

A single human can carry multiple actor_kinds. Authorization in cabinets checks `actor_kinds` for the user + their relationship to the entity (e.g. sponsor_rep for sponsor X).

### 4×4 interaction matrix (extended with teams)

| | → Client | → Team | → Sponsor | → Speaker | → Operator |
|---|---|---|---|---|---|
| **Client →** | (peer, parked) | join, leave, post-in-team | "interested in sponsor X" | "question for speaker Y" | support, feedback |
| **Team →** | submission deadline, status update | (intra-team) | sponsor-of-event message | speaker-of-event message | submission, attendance |
| **Sponsor →** | offer / ad (consent-gated, via dispatcher) | team prize announcement | (out of scope) | "speak at our event" | onboarding, billing, perf |
| **Speaker →** | promo (consent-gated) | "Q&A for my talk" | partnership offer | (peer, parked) | proposal, logistics |
| **Operator →** | event announce, reminder, CSAT, newsletter | team formation announce | lead update, perf report | invite, brief, payment | (internal) |

Teams as both initiator and recipient is what hackathons + cohort programs need.

---

## 4. The Interaction primitive

Single architectural unit. Every outbound message anywhere in the platform is one of these.

```
interaction
  id                       uuid
  initiator_actor          enum (operator | sponsor | speaker | client | team | system)
  initiator_id             FK
  audience                 jsonb (one of: user_ids[] | team_ids[] | filter_query)
  intent                   enum (registered | promoted | cancelled | reminder
                                 | event_announce | csat | enps | newsletter
                                 | sponsor_offer | speaker_promo | team_invite
                                 | team_submission_due | support_ack | lead_handoff
                                 | eula_update | password_reset | ...)
  payload                  jsonb (schema versioned per intent)
  consent_basis            enum (operational_contract | event_eula | explicit_opt_in
                                 | client_initiated | b2b_contract)
  consent_scope            jsonb | null (e.g. {event_id: x} for event-scoped EULA)
  allowed_channels         enum[] (subset of {email,telegram,in_app,push,crm,sms,web_modal})
  fallback_chain           enum[]
  policy_state             enum (draft | pending_approval | approved | scheduled
                                 | sending | sent | suppressed_by_policy | cancelled)
  scheduled_for            timestamptz | null
  expires_at               timestamptz | null
  experiment_assignment    jsonb | null  (which variant of which experiment)
  created_at, created_by
```

```
interaction_delivery        (per recipient × channel; recipient is user OR team)
  id                       uuid
  interaction              FK
  recipient_user           FK | null
  recipient_team           FK | null     (one of the two MUST be set)
  channel                  enum
  state                    enum (queued | sent | delivered | opened | clicked
                                 | responded | failed | skipped_consent | skipped_policy)
  attempted_at, delivered_at, opened_at, clicked_at, responded_at
  failure_reason           text | null
```

```
interaction_response        (structured replies — CSAT, eNPS, lead capture, ...)
  id                       uuid
  delivery                 FK
  response_intent          enum (csat_score | enps_score | sponsor_interest
                                 | speaker_question | unsubscribe | rsvp | ...)
  payload                  jsonb (e.g. {rating: 8, comment: "..."})
  received_at
```

These three tables become the read-side for every analytics view. Twenty's per-Person timeline is a filter on this. Metabase's dashboards aggregate from here.

---

## 5. Consent + EULA — first-class, per-event-type

You asked for EULA support per event type. Here's the shape.

### Three collections in Directus

```
eulas                    (immutable text; never edit, only add new version)
  id, slug, version (semver), title, body_markdown, locale, valid_from, valid_until?
  applies_to_event_types  enum[]   (meetup | workshop | hackathon | paid | online | ...)
  required_consents       enum[]   (data_processing | sponsor_marketing | photo_release | code_of_conduct | minor_participation)

consent_records          (user × intent_class × scope → granted/revoked)
  id, user, initiator_actor_class, intent_class
  scope                   jsonb | null  (e.g. {sponsor_id:x} | {event_type:hackathon} | null=all)
  granted_at, revoked_at  (revoked_at null = currently consented)
  source                  enum (registration | preferences_page | bot_command | operator_set)
  source_ref              jsonb | null  (e.g. {registration_id:x})

eula_acceptances         (user × eula version → recorded acceptance)
  id, user, eula (FK), accepted_at, ip_address, user_agent, source_event? (FK)
```

### Consent resolution at dispatch time

For every interaction × recipient candidate, the dispatcher asks:

1. What's the `consent_basis`?
   - `operational_contract` — always allowed (they're registered, this is the registration's transactional reply)
   - `event_eula` — check `eula_acceptances` for the event's EULA, valid version
   - `explicit_opt_in` — check `consent_records` for matching (user, initiator_actor_class, intent_class, scope)
   - `client_initiated` — check that a recent client→initiator interaction exists (one-shot reply allowed within N hours)
   - `b2b_contract` — only valid if initiator_actor is sponsor/speaker AND recipient is operator (B2B by construction)
2. If any check fails → mark delivery `state=skipped_consent`, log reason, move on.
3. The check is reproducible (recorded as `interaction_delivery.skip_reason`) so we can audit "why didn't this user get this?".

### Registration-time consent prompt

When a client registers for an event:
- API loads `events.eula_id` for that event
- Returns to the web/bot a `consent_prompt` payload listing every required consent + the EULA text URL
- Client checks each box (or single "Accept all" with collapsed view) — submission records both an `eula_acceptances` row AND `consent_records` rows for each consent_kind toggled
- Stored with `source=registration` + `source_ref={registration_id, event_id}`

Different event types can require different things. A hackathon EULA may require photo release + code of conduct + minor participation declaration. A standard meetup may only require data processing.

### EULA versioning

EULAs are immutable. To change one, publish a new version. Old registrations remain bound to the version they accepted. A `eula_update` interaction can prompt existing users to accept the new version (with consequences if they don't — e.g. revoked access to the cabinet).

---

## 6. Channel routing — Telegram default, rules + user-override

You said: "rule or workflow + user settings. Telegram is primary and set by default."

### Resolution order at dispatch time

For each recipient:

1. **Hard policy rule** for this `intent`?
   Example: `intent=password_reset` MUST use email (Telegram lockout if the user has lost Telegram access). Hard rules win over everything.
2. **User preference override** for this `intent`?
   Stored as `user.channel_preferences[intent] = ['telegram','email']`.
3. **User preference global default**?
   `user.channel_preferences['default'] = ['telegram','email']`.
4. **Platform default**: `['telegram','email','in_app']`.
5. Filter the resolved list against `interaction.allowed_channels` (intent-level whitelist).
6. Filter against `channel_availability(user)` — has the user linked Telegram? Has confirmed email?
7. The first surviving channel = primary; rest = fallback chain.

### Pre-link reality

Telegram-default means literally Telegram WHEN AVAILABLE. New web signups without a linked Telegram fall to email + in_app. The "Telegram is primary" defaults take effect after the user links their Telegram (Sprint 6 T6.5). The bot's lean-signup users (Sprint 6 T6.3) get Telegram from day 1 because that's how they signed up.

### Workflow vs rule

- **Rule** = static policy declared in code/registry. `intent.password_reset.required_channels = ['email']`.
- **Workflow** = computed per-context decision. E.g. "for sponsor_offer to a high-value lead, prefer Telegram; for a low-engagement user, prefer email digest." Workflows live as functions in the dispatcher, can be experiment-controlled.

We start with rules-only. Workflows added when measurable benefit is shown.

---

## 7. Groups / teams (hackathons + future cohorts)

```
teams                    (event-scoped)
  id, event (FK), name, description, status (forming | active | archived)
  created_at, created_by_user
  metadata                jsonb (free-form per event type: repo URL, track, ...)

team_memberships         (user × team)
  id, team (FK), user (FK), role (lead | member | invited | left)
  joined_at, left_at | null
  invited_by_user | null
```

### How teams interact with the rest

- **Audience type**: `interaction.audience = {team_ids: [...]}` fans out to all current members.
- **Initiator**: `initiator_actor=team` for "team posts an update for itself" (visible to members in `/me/teams/<id>`).
- **Consent**: team membership IS implicit consent for team-scoped intents (`team_invite`, `team_submission_due`, `team_chat_message`).
- **Lifecycle**: `forming` → `active` (when N members joined OR operator approved) → `archived` (event ended). Archived teams retain history.
- **Metrics per team**: CSAT, attendance, submission state. Each team gets its own row in BI dashboards.

### What's NOT in scope yet

- General-purpose groups outside event context (clubs, communities). Defer until requested.
- Inter-team messaging. Probably a Telegram group chat handles this natively for now.

---

## 8. BI engine — proposal

You asked for the best option. Comparison of the 6 viable OSS choices:

| Tool | Strengths | Weaknesses | Effort to deploy | Verdict |
|---|---|---|---|---|
| **Metabase** | Easy setup, great UX, dashboards + alerts + embedded views, row-level permissions (free tier), Postgres-native, large community | Limited modeling layer (no dbt semantic layer), heavier than Redash | 1 PR (Coolify stack) | **Recommended** |
| Apache Superset | Most powerful, SQL Lab + rich viz library, used by Lyft/Airbnb | Heavy infra (Python + worker + cache + DB), steeper learning curve, less polished UX for operator/sponsor self-serve | 2-3 PRs | Overkill for our size |
| Lightdash | dbt-native, code-first | Requires dbt project; we don't have one; significant ramp | 3+ PRs | Defer until we want dbt |
| Cube | Headless semantic layer + caching, great for embedded analytics in cabinets | Need a separate viz layer on top (Metabase or custom) — adds a service | Combine with Metabase later | Layer in if/when we need embedded SQL caching |
| Redash | Simple, query-runner-with-dashboards | Stale-feeling UI, fewer features, less active development | 1 PR | Don't bother — Metabase is strictly better |
| Grafana | Killer at time-series + alerting, free + battle-tested | Made for metrics, not business analytics; awkward for "show me sponsor X's conversion funnel" | already need it for ops | Keep for ops only, not business BI |

**Recommendation: Metabase, deployed as a Coolify stack.** Path:

- **Phase 1**: deploy Metabase, connect read-only to platform Postgres (`directus` + `twenty` DBs both readable), basic operator dashboards (signups/week, registrations/event, CSAT per event).
- **Phase 2**: row-level permissions so sponsors see only "their" leads & deliveries (via Metabase's sandboxes).
- **Phase 3**: embed Metabase iframes into the sponsor + speaker cabinets so each actor sees their own metrics in their own cabinet.
- **Phase 4** (only if needed): introduce Cube as a semantic layer for caching + consistent metric definitions.

### Risk on BI

The fact that BI reads our raw Directus/Twenty/platform Postgres tables creates a coupling: schema changes can break dashboards. **Mitigation:** every Metabase query goes through a *named SQL view* (`bi.events_summary`, `bi.sponsor_funnel`, `bi.csat_per_event`). View names + columns become the stable contract; the underlying tables can evolve. Views are versioned in our repo (`infrastructure/bi/views.sql`).

---

## 9. Sponsor cabinet — iterative phasing

You said: "in iteratively - build a Sponsor's cabinet. Not in a bang." Four phases.

### Phase A — Operator-mediated (Sprint ~5.7)
- No sponsor login. Operator creates the sponsor record in Twenty + composes outbound on the sponsor's behalf via the dispatcher.
- Sponsor receives a weekly summary email from the operator (engagement, leads, next steps).
- Goal: validate the **interaction + consent + dispatcher** plumbing with real sponsor content before any external user can touch it.

### Phase B — Read-only sponsor view (Sprint ~9)
- Sponsor user provisioned in Authentik with `actor_kinds: ['sponsor_rep']` + linked to their sponsor row.
- Read-only login at `sponsors.aiqadam.org` (or a `/sponsor` route).
- Views: their own delivered interactions, aggregate metrics (reach, opens, clicks, conversions), their leads (consented clients who clicked "interested").
- NO compose UI yet — operator still authors outbound, sponsor just observes.
- Embeds Metabase dashboards (Phase 3 of the BI rollout).

### Phase C — Self-serve compose (Sprint ~11)
- Sponsor authors a draft interaction in their cabinet: title, body, CTA, targeting hints (country, topic, tier).
- Submit → enters operator approval queue.
- Once approved → dispatcher fans out under sponsor's name, consent rules apply.
- Sponsor sees outcomes.

### Phase D — Payment + sponsorship tiers (Sprint ~13)
- Sponsorship packages (silver/gold/platinum or similar) with included interaction quotas, audience caps, event attachments.
- Stripe wiring: subscription, invoicing, refund handling.
- Self-serve upgrade/downgrade.
- PCI scope kept off our servers (Stripe Connect or hosted checkout).

Speaker cabinet follows the same A/B/C pattern, no D (speakers usually paid by operator, not the other way).

---

## 10. Sprint plan → see §15 (phase-based)

The sprint table previously here was superseded by the phase-based roadmap in §15 after the critical review on 2026-05-19.

---

## 11. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Scope creep — each new requirement (BI, EULA, teams, payments, group features) lengthens the plan | High | Medium | Strict sprint phasing as above; every "and also X" goes to a future sprint, not folded into the current one |
| 2 | Interaction primitive data model lock-in — getting it wrong is expensive | Medium | High | Versioned `payload` per intent, additive migrations only, dispatcher abstracts away storage shape from callers |
| 3 | Sponsor data leakage — bug exposes recipient PII to sponsor | Low | **Critical** | Dispatcher is privacy boundary; sponsor's request never carries PII; aggregate-only sponsor view; audit log; row-level perms in BI; security review before Phase C |
| 4 | EULA / consent edge cases — user changes mind, EULA version bumps, multi-event consents | Medium | Medium | Consent records have explicit `granted_at` + `revoked_at`; EULA versioning enforced; `eula_update` intent prompts re-acceptance; legal review of EULA texts before launch |
| 5 | Telegram-default fails for unlinked users — they get nothing | High | Medium | Channel resolver checks availability; falls back to email + in_app; account-link nudge after N missed deliveries |
| 6 | BI tool migration cost — locked to Metabase | Low | Low | All analysis through versioned SQL views; switching means re-rendering, not re-querying |
| 7 | Payment + PCI scope creep | Medium (when we reach Phase D) | High | Stripe Connect / hosted checkout — keeps PCI on Stripe, not us; entire Phase D budgeted as separate sprint with security review |
| 8 | Group/team abuse — spam, harassment within teams | Low at our scale | Medium | Team chat is intra-membership only; report-flag mechanism added in Sprint 10; operator can dissolve teams |
| 9 | Cross-actor permissions complexity — a user who's client + speaker + sponsor_rep | Medium | Medium | `actor_kinds` is an array on the user, but permissions resolve per-context: sponsor cabinet checks sponsor_rep relationship for this sponsor; client cabinet checks client; no global super-role |
| 10 | Operator approval bottleneck — sponsor messages queue up | Medium | Medium | Phase C ships with batch-approve + per-sponsor trust-tier auto-approval; metrics surface the queue depth |
| 11 | Channel preference UI overload — 10+ intents × 5 channels = too many toggles | Medium | Low | Group intents into categories (transactional, marketing, community); user toggles per category; per-intent override available in "advanced" view |
| 12 | Bot service becomes too coupled to the API — every command roundtrips | High | Low | Acceptable cost (<100ms per command); bot stays thin per D4; keeps the privacy boundary at the API |
| 13 | Migration of existing email side-effects to Interaction model breaks Sprint 3 flows | Medium | Medium | Sprint 5.5/5 migrates them one intent at a time, each behind a feature flag, with rollback path |

---

## 12. What I'd want answered to lock the Sprint 5.5 plan

These are real architectural choices that shape the next set of tables. My current instincts in italics:

**Q1 — EULA scope.** Per event (one EULA pointed to by `events.eula_id`) or per event-type (one EULA per type, all hackathons share)? *Per event-type by default, with optional per-event override for special cases like a sponsored summit.*

**Q2 — Consent granularity.** User toggles per (actor-class × intent) only, OR also per specific sponsor (e.g. "let HYPERAPP message me but not EPAM")? *Phase 1: per actor-class × intent. Phase 2 (when sponsors are real): add per-sponsor scope.*

**Q3 — Team formation.** Self-serve (a client creates a team, invites members) OR operator-assigned (organizer puts people into teams)? *Self-serve, with operator override; teams require event registration as prerequisite.*

**Q4 — Sponsor identity.** A sponsor company = one row + multiple sponsor_reps with different roles, OR a sponsor = one user account with company metadata? *Company + reps. Real sponsors have multiple humans.*

**Q5 — Channel availability gating.** Treat email as "always available" if user has any email on file, OR require explicit email verification first? *Require email verification. Avoids silent bounces; ties cleanly into the magic-link flow for Telegram-only users (D3).*

**Q6 — BI surface for sponsors.** Sponsor sees a Metabase iframe with their data filtered, OR we build custom dashboard widgets in the cabinet? *Iframe first (cheap); custom widgets later if iframes feel out of place.*

**Q7 — Operator approval queue.** Operator must approve EVERY sponsor outbound, OR trust-tier system (new sponsors require approval; established ones auto)? *Manual for every send in Phase C; auto-approval added in Sprint 12 once we have data on rejection rates.*

**Q8 — Team CSAT vs individual CSAT.** Hackathon CSAT — one rating per team member, OR one rating per team (lead submits)? *Per individual member; aggregate to team in BI. Don't lose individual signal.*

Once those 8 are settled, I have a stable enough model to write the Sprint 5.5 implementation plan.

---

## 14. Decisions on Q1–Q8 (locked after user revisions 2026-05-19)

| # | Question | **Decision** | Rationale |
|---|---|---|---|
| Q1 | EULA scope | **Capability only — engine supports N independent EULA datasets; texts come from legal later** | User flagged need for lawyer involvement on text; what we build now is the storage + versioning + resolution capability. Schema unchanged from previous draft: `event_types.default_eula_id` + nullable `events.eula_id`. **No baseline EULA seeded.** First real EULA inserted by operator after legal review. |
| Q2 | Consent granularity | **(actor-class × intent) at first; per-sponsor scope added in Sprint 9** | Unchanged. |
| Q3 | Team formation | **Self-serve + operator override** | Unchanged. |
| Q4 | Sponsor identity | **Single sponsor cabinet — `sponsors.rep_user_id` FK (1:1)** | User: "let's have a single sponsor cabinet, multi-user for sponsors is overkill." Drops the `sponsor_reps` join. If a sponsor wants two people accessing it, they share the login (acceptable for community-scale; revisit at Phase D if friction shows). |
| Q5 | Email availability | **Require verified email** | Unchanged. |
| Q6 | BI surface for sponsors | **Embedded Metabase iframe filtered to sponsor_id; Metabase deployed as a first-class engine in Layer 1** | User confirmed: "should be planned as engine further (simple, free)" — Metabase OSS is free + self-hostable; sits alongside Authentik/Directus/Twenty in the engines layer. |
| Q7 | Operator approval queue | **Manual for every sponsor send in Phase C; trust-tier auto-approval ships as Sprint 12** | Unchanged. |
| Q8 | CSAT / feedback engine | **Multi-actor CSAT: attendee + speaker + sponsor each rate the event from their angle. Form-builder capability via Formbricks (OSS, MIT, self-hosted)** | User: "also add attendee/speaker/sponsor CSAT, google forms like capability, use external library/engine if possible." Formbricks fits — see §18 research. Each actor's CSAT is its own form template + intent. Inline 0-10 rating still ships in bot/email for high-frequency single-question case; long-form questionnaires render in Formbricks; both write into `interaction_responses`. |

---

## 15. Phase-based roadmap (replaces previous sprint queue after 2026-05-19 critical review)

> Restructured per `docs/05-other/critical-review.md`. Old sequential sprint-by-sprint plan was wrong for community-building at scale with limited core team effort: too sponsor-heavy too early, missing member-to-member layer, missing acquisition mechanics, missing volunteer/ambassador architecture, no defined success metric.
>
> **Phases are gated by outcomes, not calendar dates.** A phase ships its sprints, then we measure the phase metric, then we decide whether to advance. The destination — sponsors paying for access to a thriving Central Asia AI community — remains the goal. The path is: build the community first, then sell access.

### Phase 1 — Foundation + Acquisition (≈6–10 weeks, gated by metric not calendar)

> **Phase metric**: 500 unique website visitors / month, 50 sign-ups / month from at least one country.
>
> **Why this is the first phase**: We can't measure anything if no one shows up. Acquisition mechanics + public discovery + the interaction foundation need to ship together so we know the loop is intact before measuring its results.
>
> **Calendar caveat (H3 hardening)**: 6 weeks was the optimistic estimate based on the recent ~2 PR/day cadence. Discourse adoption (Phase 2) and the Telegram bot Python project (Phase 2) are new territory and will run slower. **The phase advances when the gate passes; if that's 6 weeks, great. If it's 10 weeks, also fine.** Don't slip the gate to fit a date.

#### Sprint 5.5 — Interaction foundation (7 PRs, unchanged)

- [ ] **5.5/1 — Actor model + sponsors (single rep per Q4) + speakers collections**
- [ ] **5.5/2 — EULA + consent + acceptance collections (capability only, no seeded text)**
- [ ] **5.5/3 — Interaction tables**
- [ ] **5.5/4 — InteractionsService.dispatch + channel adapters**
- [ ] **5.5/5 — Migrate existing email side-effects to Interactions**
- [ ] **5.5/6 — /me/preferences consent UI**
- [ ] **5.5/7 — Registration-time EULA + consent prompt (no-op when events.eula_id null)**

#### Sprint M5 — Acquisition loop (4 PRs — added M5.0 analytics per H1 hardening)

- [ ] **M5.0 — Deploy Plausible Analytics at `analytics.aiqadam.org`** (H1 hardening — must ship before/with M5.1)
  - **What:** Coolify stack (Plausible Community Edition, `plausible/community-edition` image). Shared Postgres for Plausible state. Cookieless = no consent prompt needed (GDPR-clean).
  - **Why this is non-negotiable for Phase 1:** the gate is "500 visitors/mo + 50 signups/mo." Without analytics we cannot measure visitors → cannot gate the phase → phase runs forever.
  - **Wire script** into the web `Layout.astro` (one `<script defer data-domain="aiqadam.org">` tag).
  - **Acceptance:** dashboard shows live traffic from a real visit; signup event tracked with `plausible('Signup', {props: {country: 'uz'}})`.
- [ ] **M5.1 — Open Graph + Twitter Card + sitemap.xml + robots.txt + JSON-LD `Event` markup** on every event/speaker/sponsor page. Google rich-result eligibility. Trivial code, large compound impact on SEO.
- [ ] **M5.2 — Referral codes** — `?ref=<user_id>` query param attribution; new sign-up with a referrer awards the referrer +25 points + a "Brought a friend" badge. Plausible custom event `Referral_Signup`.
- [ ] **M5.3 — Share buttons + share-to-channels** — Telegram/X/LinkedIn share button on every event page + auto-suggested post text + UTM tagging.

#### Sprint W1 — Public discovery (5 PRs, unchanged from previous plan)

- [ ] **W1.1 — Speakers index + detail** (`/speakers`, `/speakers/:slug`)
- [ ] **W1.2 — Sponsors index + detail** (`/sponsors`, `/sponsors/:slug`)
- [ ] **W1.3 — Topic pages** (`/topics/:slug`) — intersection of events + speakers + sponsors by topic
- [ ] **W1.4 — Events index search + filters**
- [ ] **W1.5 — Past-events archive + recap pages**

**Phase 1 advance gate**: visitor count + sign-up count hit target. If not, run another acquisition iteration before advancing.

---

### Phase 2 — Member touchpoint (~6 weeks)

> **Phase metric**: 30% of new sign-ups return within 30 days; ≥10% of sign-ups make at least one Discourse post within 60 days.
>
> **Why this phase**: Acquisition without retention is leak. The Telegram bot + Discourse + /me dashboard form the daily touchpoint surface. CSAT closes the feedback loop.

#### Sprint 6 — Telegram bot + Telegram auth (7 PRs, unchanged)

- [ ] **6.1 — `apps/bot/` Python scaffold + Coolify stack**
- [ ] **6.2 — Bot ↔ API contract + Telegram → Authentik exchange**
- [ ] **6.3 — Bot `/start` lean signup (temp account)**
- [ ] **6.4 — Web Telegram Login Widget**
- [ ] **6.5 — Account-link command**
- [ ] **6.6 — Member bot commands**
- [ ] **6.7 — TelegramChannel adapter plugged into the InteractionsService dispatcher**

#### Sprint M1 — Discourse adoption (2 PRs, replaces ~5 sprints of build-from-scratch member-to-member)

- [ ] **M1.1 — Deploy Discourse at `community.aiqadam.org`**
  - **What:** Coolify stack (`discourse/discourse:latest` pinned to a stable version). Postgres + Redis backing (use shared pgvector cluster + dedicated Discourse Redis to avoid key collisions). OIDC SSO against Authentik (Discourse supports it natively).
  - **Categories:** seed one per country (uz/kz/tj) + one per top-level topic (AI/ML, MLOps, Python, Data Eng, Frontend, Backend, Hardware, Research). Operator can re-org freely.
  - **Trust levels:** Discourse's built-in 0-4 trust system — automatic promotion based on reading + posting activity. This is our ambassador-graph for free (Phase 4 builds the deeper ambassador layer; this is the foundation).
  - **Acceptance:** sign in to Discourse via "Continue with AI Qadam"; create test post in #uz; trust level 0 assigned; second post bumps to TL1.

- [ ] **M1.2 — Discourse ↔ Twenty + dispatcher bridges**
  - **What:** Discourse webhook on user_created + post_created → POST to `/v1/internal/discourse/event` on our API → (a) ensures Twenty Person mirrors via existing CrmController, (b) records the post as a low-priority Interaction so it shows in the member's timeline. Reverse: when our dispatcher sends a `discourse_mention` intent, it posts to the user's Discourse inbox via Discourse API.
  - **Acceptance:** post in Discourse → Twenty Person Note appears; dispatcher → Discourse inbox notification appears.

#### Sprint W2 — Member surfaces (3 PRs, simplified — Discourse handles badges, notifications-cross-actor, member directory)

- [ ] **W2.1 — /me dashboard rewrite** — per design s3-2; stat cards (events attended / talks given / streak / points), activity feed, quick actions
- [ ] **W2.2 — Public profile pages** (`/u/:handle`) — opt-in (`users.is_public_profile`); links to Discourse profile + linkedin URL + topics
- [ ] **W2.3 — Profile editor + avatar upload**
- ~~W2.4 badges system~~ → **CUT** (Discourse trust levels + M4 streaks/reactions cover it)
- ~~W2.5 in-app notifications inbox~~ → **CUT** (Discourse inbox covers cross-actor; in-app intent for transactional only, built minimally into the dispatcher's existing InAppChannel adapter)

#### Sprint 8-lite — CSAT/eNPS first-class intents (4 PRs, Formbricks deferred to Phase 5)

- [ ] **8.1 — CSAT + eNPS intents** (single-question inline rating in bot + email + Discourse)
- [ ] **8.2 — Scheduled post-event CSAT dispatch** (multi-actor per Q8: attendee + speaker + sponsor)
- [ ] **8.3 — Response capture endpoint**
- [ ] **8.4 — Operator BI dashboard tile** (uses Metabase from Phase 4 — tile defined now, lights up when BI ships)

**Phase 2 advance gate**: 30-day return rate + Discourse activity rate hit target.

---

### Phase 3 — Community vitality (~6 weeks)

> **Phase metric**: 100 WAM per country, ≥50 member-initiated interactions per week platform-wide (Discourse posts, profile updates, registrations, reactions).
>
> **Why this phase**: Phase 2 gives members a place; this phase gives them reasons to keep coming back and reasons to bring others. Speaker tooling raises content quality; engagement loops add the dopamine; teams enable cohort programs.

#### Sprint M3 — Speaker tooling (4 PRs)

- [ ] **M3.1 — CFP submission form via Formbricks** — operator publishes a CFP per event series; speakers submit talks; submissions route to operator queue.
- [ ] **M3.2 — Speaker portfolio page expanded** — talks given, ratings (from CSAT), recordings link, topic tags, contact button.
- [ ] **M3.3 — Speaker invitation flow** — operator invites prospect via dispatcher; prospect responds Y/N via simple cabinet page.
- [ ] **M3.4 — Speaker honorarium tracking** — light bookkeeping; ties into Phase 5 payment work later.

#### Sprint M4 — Engagement loops (5 PRs)

- [ ] **M4.1 — Streaks** — counter on users (visits, registrations, attended events); displayed in /me dashboard + bot; weekly streak digest.
- [ ] **M4.2 — Public moments** — opt-in publishing of "Alice just registered for AI Drinks UZ" to a `#announcements` Discourse channel; FOMO + social proof.
- [ ] **M4.3 — Reactions** — 👏 / 🔥 / 🤝 reactions on event recap posts, member contributions, ambassador shoutouts.
- [ ] **M4.4 — Weekly digest intent** — auto-composed from last 7 days: top posts, upcoming events filtered by interests, new members in your topic, top reactors. Dispatched on user's preferred channel.
- [ ] **M4.5 — Recommendations** — basic "events you might like" (interest match + popularity) + "speakers you might follow" rendered on /me.

#### Sprint 10 — Teams (hackathons) (4 PRs, unchanged)

- [ ] **10.1 — `teams` + `team_memberships` collections**
- [ ] **10.2 — Team self-serve + operator-override UI**
- [ ] **10.3 — Team-scoped Interaction recipient**
- [ ] **10.4 — Team CSAT per member, aggregate to team in BI**

**Phase 3 advance gate**: WAM + member-initiated activity rates hit target.

---

### Phase 4 — Operator leverage (~4 weeks)

> **Phase metric**: 1 core operator can run all 3 countries (≤8h/week operator load on routine tasks). Validated by time-tracking the operator's actual workload.
>
> **Why this phase**: at the end of Phase 3 we have a flywheel turning. Phase 4 reduces operator hand-cranking so the flywheel keeps turning at higher RPM without burning the team.

#### Sprint 6.5 — Metabase BI engine (2 PRs)

- [ ] **6.5/1 — Deploy Metabase at `bi.aiqadam.org`** (depends on Sprint 7 Google SSO for login)
- [ ] **6.5/2 — Bootstrap operator dashboards + `bi.*` view layer**

#### Sprint 7 — Identity expansion (5 PRs — Phone 2FA dropped per critique)

- [ ] **7.1 — Authentik Google OAuth source**
- [ ] **7.2 — Authentik GitHub OAuth source**
- [ ] **7.3 — Web sign-in UI** with 4 buttons (email/PW, Google, GitHub, Telegram)
- [ ] **7.4 — Cross-channel Telegram identity reconciliation**
- [ ] **7.5 — Phone number capture + OTP verification (pluggable provider)** — kept; user explicitly asked
- ~~7.6 — Phone as optional 2FA~~ → **CUT** (defer; not needed at our scale)

#### Sprint M2 — Ambassadors (3 PRs)

- [ ] **M2.1 — `ambassadors` collection + role mechanics** — extends `actor_kinds` with `country_ambassador | topic_moderator | speaker_scout | translator`; per-role permissions in API
- [ ] **M2.2 — Trust-level mechanics tied to Discourse trust levels** — Discourse TL3+ users auto-promoted to ambassador-candidate; operator one-click confirm
- [ ] **M2.3 — Recognition** — ambassador badge on profile, leaderboard tile, monthly shoutout interaction in #announcements, special bot commands

**Phase 4 advance gate**: operator weekly load measured ≤8h on routine tasks.

---

### Phase 5 — Monetization (gated; only when traction warrants)

> **Hard gate**: 500+ WAM in at least one country AND 3+ inbound sponsor inquiries collected through the platform (form on /sponsors page, no outbound prospecting required). If both conditions aren't met, **Phase 5 doesn't run**.
>
> **Why this gate**: building sponsor cabinets, approval queues, Stripe wiring before there's a market is dead code that depreciates. If a 50-WAM-per-country community survives without sponsor revenue (volunteer-run, operator-funded), that's a fine end state. If it doesn't reach traction, sponsor work won't save it.
>
> **What the previous plan over-invested in**: 5 sprints of sponsor optimization (5.7/9/11/12/13) before any of Phase 1-4 had measurably shipped. Per the critical review: cart before horse.

#### Phase 5a — Sponsor Phase A (3 PRs, only if gate passes)

- [ ] **5.7/1 — Seed sponsor + speaker records** (migrate placeholder PARTNERS list to real `sponsors` rows)
- [ ] **5.7/2 — Operator compose UI in Twenty** — operator authors outbound on sponsor's behalf via dispatcher
- [ ] **5.7/3 — Sponsor weekly summary email**

#### Phase 5b — Sponsor + Speaker Phase B cabinets (5 PRs, only if Phase 5a generates sponsor demand)

- [ ] **9.1 — Sponsor + Speaker login + RBAC** at `/sponsor`, `/speaker`
- [ ] **9.2 — Embedded Metabase per sponsor** (depends on Metabase from Phase 4)
- [ ] **9.3 — Lead handoff intent** (client→sponsor)
- [ ] **9.4 — Per-sponsor consent scope ships** (Q2 evolution)
- [ ] **9.5 — Speaker cabinet**

#### Phase 5c — Long-form forms via Formbricks (2 PRs, only if sponsor surveys needed)

- [ ] **8.5 — Deploy Formbricks at `forms.aiqadam.org`**
- [ ] **8.6 — Formbricks ↔ InteractionsService bridge**

#### Phase 5d — i18n + accessibility + polish (5 PRs, ships before any paid sponsor launch)

- [ ] **W3.1 — Tolgee for i18n**
- [ ] **W3.2 — RU + UZ-Latin + KZ translations**
- [ ] **W3.3 — WCAG 2.1 AA audit + fixes**
- [ ] **W3.4 — Mobile QA pass**
- [ ] **W3.5 — Performance audit**

#### Phase 5e — Sponsor self-serve + payments (open-ended)

- [ ] **11 — Sponsor Phase C self-serve compose** (4 PRs)
- [ ] **12 — Workflows / rules engine + trust-tier auto-approval** (3 PRs)
- [ ] **W4.4 — Voice-of-customer feedback widget** (1 PR, the only piece of W4 that survives — share + SEO + referral now live in M5)
- [ ] **13 — Sponsor Phase D Stripe payments** (5 PRs, security review gate)

---

### Cut from the plan entirely

- **Settings + experiments (Sprint 5.6)** — premature for our traffic; hardcoded defaults until we have data to compare against. Lay groundwork in interaction `policy_state` enum + intent registry for easy retrofit later.
- **Phone 2FA (A7.6)** — overkill at our scale.
- **Workflows engine (Sprint 12)** — kept in Phase 5e but conditional; if rules suffice in Phase 5a-d, this never ships.
- **Settings-driven A/B for every notification** — replaced with intent-registry defaults; A/B added later when we have traffic to test.

### Sprint 5.5 — Interaction foundation (6 PRs)

> **Goal:** stand up the Interaction primitive end-to-end. After this sprint, every notification in the system is dispatched through the same code path with consent + channel routing applied uniformly.

- [ ] **5.5/1 — Actor model + sponsors + speakers** (simplified by Q4 update)
  - **What:** Add `actor_kinds: text[]` column to `directus_users` (one of `client | operator | speaker | sponsor_rep`). New Directus collections: `sponsors` (id, name, slug, country, status, logo, website, tier?, **rep_user FK to directus_users — 1:1, single sponsor cabinet user per Q4**), `speakers` (id, user FK, bio, country, status).
  - **Migration:** seed admin user with `actor_kinds=['operator','client']`. All existing users default to `['client']`.
  - **Acceptance:** Directus admin shows the new collections; `directus_users` row for admin has the right kinds.

- [ ] **5.5/2 — EULA + consent + acceptance collections** (capability only per Q1)
  - **What:** Three new Directus collections per §5 of this doc: `eulas` (immutable, versioned, supports N independent datasets), `consent_records`, `eula_acceptances`. Add nullable `default_eula_id` FK to `event_types`; nullable `eula_id` FK to `events`.
  - **No EULA seeded.** First real EULA inserted by operator post-legal review. Until then, `events.eula_id` stays null and registration flow skips the prompt (5.5/7 makes it a no-op when null resolves).
  - **Acceptance:** schema applied; empty `eulas` collection; events still register cleanly without an EULA attached.

- [ ] **5.5/3 — Interaction tables**
  - **What:** `interactions`, `interaction_deliveries` (with both `recipient_user` AND `recipient_team` FKs; CHECK constraint exactly one set), `interaction_responses`. Per §4 of this doc.
  - **Acceptance:** schema applied to prod Directus DB; can manually insert + read a row.

- [ ] **5.5/4 — InteractionsService.dispatch in the API**
  - **What:** New module `apps/api/src/modules/interactions/`. `InteractionsService.dispatch(interaction)` resolves audience → checks consent for each recipient → picks channels per §6 routing rules → fans out through `ChannelAdapter`s in parallel → records every result in `interaction_deliveries`. Channel adapters: `EmailChannel`, `TelegramChannel` (stub until Sprint 6), `InAppChannel` (stub, real in Sprint 9), `CrmActivityChannel` (writes a Note via TwentyClient — already exists from C5.4).
  - **Tests:** mock the channel adapters, exercise consent rejection, channel fallback, audience resolution.
  - **Acceptance:** unit tests green; manual smoke via `/v1/internal/interactions/dispatch` posts a fake interaction and lands a Note in Twenty.

- [ ] **5.5/5 — Migrate existing email side-effects to Interactions**
  - **What:** The Sprint 3 email flows (registration-confirmed, registration-waitlisted, registration-promoted, registration-cancelled) become `dispatcher.dispatch({intent:'registered', ...})` calls. The `/v1/internal/email` endpoint stays for backwards compat but is now called by `EmailChannel` from the dispatcher (not by Directus flows directly). Update Directus flows to call `/v1/internal/interactions/from-registration` (single endpoint, computes the interaction internally based on status change).
  - **Acceptance:** old email side-effects keep working; rows appear in `interaction_deliveries`; visible in Twenty (Note via CrmActivityChannel — replaces the C5.4 direct calls).

- [ ] **5.5/6 — `/me/preferences` consent UI**
  - **What:** New web page lists each `(actor-class × intent_class)` consent surface + a global channel preference (`Telegram → Email`). Toggles upsert/revoke `consent_records` rows via `POST /v1/me/consents`.
  - **Acceptance:** sign in to `/me/preferences`, toggle "operator newsletter" → consent row recorded; dispatcher dry-run reflects it.

- [ ] **5.5/7 — Registration-time EULA + consent prompt**
  - **What:** `POST /v1/events/:id/register` now returns `409 EULA_REQUIRED` if user hasn't accepted the event's resolved EULA. Web/bot present the EULA text + consent checkboxes; second POST with `acceptances: [...]` records `eula_acceptances` + initial `consent_records`, then proceeds with registration. Capacity flow unchanged.
  - **Acceptance:** register flow blocked until EULA accepted; admin already accepted (seeded acceptance row for the bootstrap event).

### Sprint 5.6 — Settings + experiments (3 PRs)

> **Goal:** every dispatcher rule / interaction policy that we'd otherwise hardcode becomes an A/B-testable setting.

- [ ] **5.6/1 — Settings registry + resolution**
  - **What:** `apps/api/src/modules/settings/registry.ts` (typed TS catalog with `~25` initial settings, see Q-list section above for the seed). New Directus collections `platform_settings` (key, value JSON, updated_by), `experiments` (setting_key, status, variants, target_filter, dates), `experiment_assignments` (user, experiment, variant). `SettingsService.get<T>(key, userId?)` with experiment→override→default resolution + sticky hash assignment.
  - **Endpoint:** `GET /v1/internal/settings/resolve?keys=a,b,c&userId=X`.
  - **Acceptance:** unit tests for assignment determinism; manual smoke flips a setting via Directus and `/v1/internal/settings/resolve` reflects it within 5s.

- [ ] **5.6/2 — Wire intents to settings**
  - **What:** Every intent policy in the dispatcher (allowed_channels, fallback_chain, scheduled delay) reads from `SettingsService` instead of being hardcoded. Adds keys: `intent.{name}.allowed_channels`, `intent.{name}.fallback`, `intent.{name}.delay_minutes`, `intent.{name}.enabled`.
  - **Acceptance:** disabling `intent.welcome.enabled` via Directus suppresses welcome dispatch; existing dispatcher tests updated.

- [ ] **5.6/3 — Helper for cabinets (web + bot)**
  - **What:** Tiny `useSetting()` hook for React islands (server-resolved during SSR, hydrated). Bot pulls a batch at `/start`. Deferred details land alongside Sprint 6 + 9.
  - **Acceptance:** demo island reads `topic_ontology` setting.

### Sprint 5.7 — Sponsor Phase A + Speaker actor (3 PRs)

> **Goal:** operator can create sponsor records, author outbound on their behalf through the dispatcher. No sponsor login yet. End-to-end "fake" sponsor outbound works.

- [ ] **5.7/1 — Seed sponsor + speaker records**
  - **What:** Migrate the placeholder PARTNERS list (HYPERAPP, EPAM, etc.) into real `sponsors` rows. Add 2-3 speakers as test records.
  - **Acceptance:** Directus admin shows them; web homepage partners section reads from `sponsors` (replaces the current hardcoded list via cms.ts).

- [ ] **5.7/2 — Operator compose UI in Twenty**
  - **What:** Operator opens a Sponsor row in Twenty → custom tab "Send on behalf" → form (title, body, intent=`sponsor_offer`, target country + topic). Submit hits `POST /v1/internal/interactions/compose-from-sponsor` (operator-only, OIDC-guarded). API creates the interaction with `initiator_actor=sponsor, initiator_id=X`, dispatches under consent gates.
  - **Acceptance:** operator can send a test sponsor_offer; consented users receive it on their preferred channel; suppressed users have skipped_consent recorded.

- [ ] **5.7/3 — Sponsor weekly summary email**
  - **What:** Scheduled Directus flow Monday 09:00 UTC: for each active sponsor, generate aggregate (interactions sent, recipients reached, opens, clicks, responses) and dispatch a `sponsor_weekly_summary` intent (consent_basis=b2b_contract) to the sponsor's reps via email.
  - **Acceptance:** test run sends a summary to admin@aiqadam.org (acting as sponsor_rep for a test sponsor).

### Sprint W1 — Web public-discovery layer (~5 PRs) — runs after 5.7 (needs sponsor + speaker rows)

> **Goal:** turn the public website from a thin event-list shell into a real discovery surface. Sponsors, speakers, topics all become first-class browsable destinations. Foundation for SEO + community growth.

- [ ] **W1.1 — Speakers index + detail** (`/speakers`, `/speakers/:slug`) — reads from `speakers` collection; per-speaker bio + past events + upcoming sessions + CSAT-derived rating (Sprint 8 wires the rating, page renders placeholder until then).
- [ ] **W1.2 — Sponsors index + detail** (`/sponsors`, `/sponsors/:slug`) — reads from `sponsors`; per-sponsor brief + supported events + (Phase B+) live offers feed.
- [ ] **W1.3 — Topic pages** (`/topics/:slug`) — filtered intersection of events + speakers + sponsors by topic. Links from `/me/preferences` topic toggles into the matching page.
- [ ] **W1.4 — Events index search + filters** — search box (title/description/speaker), filters (format, country, topic, date range), URL-state for sharable views.
- [ ] **W1.5 — Past-events archive + recap pages** — `/events/past`, `/events/:id` shows recap (CSAT aggregate, attendee count, speaker list, photos slot, recording slot). Empty until content lands; structure first.

### Sprint 6 — Telegram bot + Telegram auth (7 PRs)

> Unchanged in shape vs the previous plan, but T6.7 now plugs into the InteractionsService dispatcher as a `TelegramChannel` adapter (replaces the standalone `/v1/internal/telegram/notify` endpoint).

- [ ] **6.1 — `apps/bot/` Python scaffold + Coolify stack**
- [ ] **6.2 — Bot ↔ API contract + Telegram → Authentik exchange** (D1: API verifies HMAC, drives Authentik admin API to mint a session)
- [ ] **6.3 — Bot `/start` lean signup** (temp account per D2, synthetic email `tg<id>@telegram.local`)
- [ ] **6.4 — Web Telegram Login Widget** at `/auth/sign-in`
- [ ] **6.5 — Account-link command** in bot for already-signed-in web users
- [ ] **6.6 — Member bot commands** (`/events`, `/event N`, `/register N`, `/me`, `/leaderboard`, `/interests`, `/upgrade`)
- [ ] **6.7 — TelegramChannel adapter** plugged into the InteractionsService dispatcher. Replaces standalone notify endpoint. Outbound DMs go API → Telegram Bot API directly (per D6).

### Sprint 6.5 — BI engine (Metabase) (2 PRs)

> **Goal:** operators have dashboards. Foundation for sponsor cabinet (Phase B) embedded views.

- [ ] **6.5/1 — Deploy Metabase**
  - **What:** Coolify stack at `bi.aiqadam.org`. Metabase image `metabase/metabase:latest` (pin). Postgres backing DB on the shared pgvector cluster. OIDC SSO via Authentik (Metabase supports SAML/OIDC on the Pro version; OSS uses Google OAuth — set up via Sprint 7's Google source).
  - **Risk:** OSS Metabase doesn't support OIDC natively. Workaround = Google OAuth (free); requires Sprint 7 to land first OR temporary local-password admin.
  - **Acceptance:** operator can sign in to `bi.aiqadam.org`; read-only Postgres connection works.

- [ ] **6.5/2 — Bootstrap operator dashboards + `bi.*` view layer**
  - **What:** `infrastructure/bi/views.sql` defines: `bi.events_summary`, `bi.registrations_funnel`, `bi.csat_per_event` (empty until Sprint 8), `bi.sponsor_engagement` (per sponsor delivery + opens), `bi.member_lifetime` (per-user activity). Metabase dashboards built on these views, not the raw tables.
  - **Acceptance:** four dashboards live; operator can browse.

### Sprint 7 — Identity expansion (Google + GitHub + Telegram round-trip + phone verification) (~6 PRs)

> Renamed from "Google + GitHub auth" per user feedback that this sprint should also (a) explicitly close the Telegram bot↔web auth loop and (b) add phone number capture + verification with a pluggable OTP provider.

- [ ] **7.1 — Authentik Google OAuth Source** + Google Cloud OAuth app registered. Unblocks Metabase Google SSO too.
- [ ] **7.2 — Authentik GitHub OAuth Source** + GitHub OAuth app registered.
- [ ] **7.3 — Web sign-in UI** renders 4 buttons (email/password + Google + GitHub + Telegram Login Widget). Telegram exchange wiring ships in T6.4; this is the UI tie-in.
- [ ] **7.4 — Cross-channel Telegram identity reconciliation**
  - **What:** explicit smoke + glue work so bot-signup users (T6.3) and web Login Widget users (T6.4) resolve to the SAME Authentik account. Scenarios:
    1. User signs up via bot → synthetic email `tg<id>@telegram.local` + `is_temporary=true`. Later on web, Telegram Login Widget → same account, signs in (per D2: gamification still locked until email upgraded).
    2. User who has a real email account opens bot for the first time → bot offers "link your existing account" if Telegram identity matches a known email (via magic-link confirmation); else creates a new temp account.
    3. User upgrades temp account by providing real email → magic-link verify → `is_temporary=false`, synthetic email replaced. From this point Telegram Login Widget on web works to sign into the full account.
  - **Acceptance:** all three scenarios pass an integration test against staging Authentik + bot + web; explicit edge-case docs in `docs/04-development/architecture/auth-architecture.md`.
- [ ] **7.5 — Phone number capture + OTP verification (pluggable provider)**
  - **What:** Add `users.phone` + `users.phone_verified_at` columns. New `PhoneVerificationService` (separate from the general dispatcher — security-critical path, tighter rate-limits, audit log). Pluggable `OtpProvider` interface; adapters land alongside (see §18 update). Endpoints: `POST /v1/me/phone/start-verify { phone }` → sends OTP via configured provider; `POST /v1/me/phone/confirm { code }` → verifies + sets columns. Rate-limit: 3 attempts per phone per 15 min; 5 verification starts per user per hour.
  - **Acceptance:** end-to-end test with at least one provider adapter (Telegram Gateway recommended for free-during-dev); abuse cases (replay, brute-force) covered.
- [ ] **7.6 — Phone as optional 2FA factor**
  - **What:** Add a "Enable phone 2FA" toggle in `/me/preferences`. Once enabled, sign-in flow inserts an OTP step for that user (Authentik already supports this via stages — wire it up). Recovery codes generated + stored hashed on the user.
  - **Acceptance:** user enables 2FA → next sign-in prompts OTP → cannot complete without code; recovery code lets them sign in if phone lost.

> **Out of scope for Sprint 7:** SMS as a notification channel for general intents (e.g. event reminders by SMS). That's a separate sprint once we know the OTP provider's per-message cost and pick whether to enable bulk SMS. Tracked as a Sprint-7-followup item.

### Sprint 8 — CSAT / eNPS / measurement loop (6 PRs, expanded for Q8 multi-actor + Formbricks)

> **Goal:** close the lifecycle loop. Every actor (attendee, speaker, sponsor) rates events from their angle. Inline ratings for single-question CSAT; Formbricks for long-form questionnaires.

- [ ] **8.1 — CSAT + eNPS as first-class intents** (single-question inline)
  - **What:** New intents `csat`, `enps`. Dispatcher renders them as in-bot inline keyboards (0-10 buttons) for Telegram + a tiny `/feedback/<token>` page for email users.
  - **Acceptance:** dispatching a test csat to admin renders the right surface in both channels.

- [ ] **8.2 — Scheduled post-event CSAT dispatch**
  - **What:** Directus scheduled flow daily 18:00 UTC: for each event that ended in the last 24h, dispatch CSAT to `attended` registrations (intent=`csat_attendee`), to invited speakers (intent=`csat_speaker`), to sponsoring sponsors (intent=`csat_sponsor`). Settings: `csat.attendee.enabled`, `csat.speaker.enabled`, `csat.sponsor.enabled`, `csat.delay_hours`.
  - **Acceptance:** test by ending a fake event; all three audiences get their CSAT.

- [ ] **8.3 — Response capture endpoint**
  - **What:** `POST /v1/internal/interactions/response { delivery_id, response: {score, comment?, ...formbricks_payload?} }`. Idempotent on `delivery_id`. Stores into `interaction_responses`.
  - **Acceptance:** rating recorded; visible in BI view `bi.csat_per_event` broken down by actor.

- [ ] **8.4 — Operator BI dashboard tiles**
  - **What:** Metabase tiles: CSAT trend per event type per actor, eNPS quarterly, response rate vs send count, multi-actor breakdown.
  - **Acceptance:** visible at `bi.aiqadam.org`.

- [ ] **8.5 — Deploy Formbricks at `forms.aiqadam.org`** (form engine, per §18)
  - **What:** Coolify Docker stack (formbricks/formbricks image). Postgres backing DB on shared pgvector cluster. Auth: Google SSO via Authentik (depends on Sprint 7) — falls back to local admin password until Sprint 7 ships.
  - **Acceptance:** operator can sign in; create a sample survey.

- [ ] **8.6 — Formbricks ↔ InteractionsService bridge**
  - **What:** Operator builds long-form post-event templates in Formbricks (attendee questionnaire, speaker debrief, sponsor ROI survey). Dispatcher's `csat_*_long` intent variants send Formbricks survey links (with embedded `delivery_id` query param) instead of inline ratings. Formbricks webhook on submission → `POST /v1/internal/interactions/response` with the full form payload.
  - **Acceptance:** end-to-end test: schedule a long-form attendee survey for a past event → email lands with Formbricks link → submit → response visible in our `interaction_responses` + Metabase tile.

### Sprint W2 — Web member surfaces (~5 PRs) — runs after 8 (needs CSAT for badges, InAppChannel from 5.5/4 for inbox)

> **Goal:** the `/me` page becomes the member's home. Public profiles, badges, in-app notification inbox.

- [ ] **W2.1 — /me dashboard rewrite** — per design s3-2 (already prototyped in Phase 1): hero stat cards (events attended / talks given / streak / points), activity feed, "speaking at this" indicators on hosted events, quick actions.
- [ ] **W2.2 — Public profile pages** (`/u/:handle`) — opt-in (`users.is_public_profile`). Avatar + bio + handle + topics-interested + attended events count + badges. Linkable from leaderboard.
- [ ] **W2.3 — Badges system** — `badges` Directus collection (slug, name, icon, criteria_json), `user_badges` join (user, badge, awarded_at, awarded_for). Criteria evaluators run on Interactions (e.g. "5 events attended" awards `regular` badge). Display on profile + leaderboard.
- [ ] **W2.4 — Notifications inbox (in-app channel)** — implements `InAppChannel` adapter (deferred from 5.5/4). `/me/inbox` shows every `interaction_delivery` where channel=`in_app`, mark-as-read, archive. Bell icon in nav with unread count.
- [ ] **W2.5 — Profile editor + avatar upload** — `/me/edit` page; avatar to Directus files (or S3 if we add); validates handle uniqueness; writes `directus_users` fields.

### Sprint 9 — Sponsor + Speaker Phase B (5 PRs)

> **Goal:** sponsors and speakers can log in to read-only cabinets at `sponsors.aiqadam.org` / `speakers.aiqadam.org` (or `/sponsor`, `/speaker` on the main domain — choose at impl time). They see their delivered interactions, aggregates, and any leads (client-initiated interest).

- [ ] **9.1 — Sponsor + Speaker login + RBAC**
  - **What:** New web app (or `/sponsor` route on aiqadam-web). Authentik SSO; gate via `actor_kinds` ⊇ `['sponsor_rep']` + relationship to a sponsor. Speaker analogous.
  - **Acceptance:** an Authentik user marked as a sponsor_rep can sign in to `/sponsor`; a vanilla client cannot.

- [ ] **9.2 — Embedded Metabase per sponsor**
  - **What:** Per-sponsor dashboard (sponsor_id filtered via Metabase signed-embed token). Same for speakers.
  - **Acceptance:** sponsor sees ONLY their own metrics; switching sponsor URL params for another sponsor's view returns 403.

- [ ] **9.3 — Lead handoff intent (client → sponsor)**
  - **What:** A client opens a sponsor offer → "I'm interested" button → creates an Interaction `client → sponsor, intent=sponsor_interest`. Sponsor sees lead in their cabinet; operator gets a notification.
  - **Acceptance:** end-to-end test from sponsor compose → client receives → client clicks interested → sponsor sees lead.

- [ ] **9.4 — Per-sponsor consent scope ships**
  - **What:** Add UI in `/me/preferences` to mute specific sponsors. `consent_records.scope={sponsor_id: x}` honored by dispatcher.
  - **Acceptance:** muting Sponsor A → user receives Sponsor B offers, not A.

- [ ] **9.5 — Speaker cabinet** (smaller subset of 9.1 + 9.2)

### Sprint 10 — Teams (hackathons) (4 PRs)

- [ ] **10.1 — `teams` + `team_memberships` collections** in Directus
- [ ] **10.2 — Team self-serve + operator-override UI** in `/me/teams` + bot `/team` command
- [ ] **10.3 — Team-scoped Interaction recipient** — dispatcher supports `recipient_team`; resolves to current members at dispatch
- [ ] **10.4 — Team CSAT per member, aggregate to team in BI** (per Q8) + team metrics tile

### Sprint W3 — i18n + accessibility + polish (~5 PRs) — runs after 10 (after the major feature surface stabilises)

> **Goal:** website ready for multi-country audience + WCAG-AA + mobile + perf. Sets the bar before sponsor self-serve launches.

- [ ] **W3.1 — i18n infrastructure rework** — existing `i18next` setup graduates to Tolgee (OSS, self-hosted) for in-context editing by operators. String extraction across the codebase. Translation memory.
- [ ] **W3.2 — Russian + Uzbek (Latin) + Kazakh translations** — operator-translated via Tolgee; baseline strings for public pages + sign-up flow + /me. Tajik phase 2.
- [ ] **W3.3 — Accessibility audit (WCAG 2.1 AA) + fixes** — keyboard nav, contrast, screen-reader landmarks, alt text everywhere, focus management on modals/sheets.
- [ ] **W3.4 — Mobile QA pass** — every public page tested at 360px, 414px, 768px; bottom-sheet patterns for registration on event detail; navigation bar mobile mode.
- [ ] **W3.5 — Performance audit** — LCP < 2.5s, CLS < 0.1 per STANDARDS.md. Image lazy-loading, code-splitting of React islands, Astro view transitions for SPA-feel routing on the public side, Cloudflare cache tuning.

### Sprint 11 — Sponsor Phase C (self-serve compose) (4 PRs)

- [ ] **11.1 — Compose UI in sponsor cabinet** (title, body, CTA, country + topic targeting)
- [ ] **11.2 — Operator approval queue** (a tab in Twenty showing pending sponsor interactions; approve/reject with comment)
- [ ] **11.3 — Throttling + frequency caps** (settings: `sponsor.max_per_user_per_week`, `sponsor.max_recipients_per_send`)
- [ ] **11.4 — Audit log surfacing** (read-only timeline in operator workspace: every approved/rejected/sent sponsor interaction with metadata)

### Sprint 12 — Workflows / rules engine (3 PRs)

- [ ] **12.1 — Workflow type** = function in dispatcher that computes per-context channel routing or policy; first concrete workflow: "for sponsor_offer, prefer Telegram for users with >5 events attended, email otherwise"
- [ ] **12.2 — Trust-tier auto-approval for sponsors** (Q7 — sponsors with rejection rate < 5% in last 30d → auto-approve; configurable per sponsor)
- [ ] **12.3 — Audit log surfacing for workflows** (which workflow took effect, which branch, why)

### Sprint W4 — Growth + SEO (~4 PRs) — runs after 12

> **Goal:** acquisition surface tightened up before payments-sponsor cabinet (Phase D) goes live.

- [ ] **W4.1 — Open Graph + Twitter Card + sitemap.xml + robots.txt + JSON-LD `Event` markup** — every event, speaker, sponsor page gets per-page meta + structured data. Google rich-result eligibility.
- [ ] **W4.2 — Newsletter signup component + double opt-in** — `/subscribe` lands as a route + embedded component on key pages. Creates a temp client (per D2) + `intent=newsletter` consent. Sends confirmation via the dispatcher.
- [ ] **W4.3 — Share buttons + referral program** — share-to-Telegram/X/LinkedIn on event pages with UTM. Referral codes (`?ref=user_id`) attribute new signups. Simple leaderboard tile for top referrers.
- [ ] **W4.4 — Voice-of-customer feedback widget** — site-wide tiny widget for any-page feedback (separate from event CSAT); rate-limited; pipes into operator queue.

### Sprint 13 — Sponsor Phase D (payments) (5 PRs)

> **Hardest sprint of the lot. Security review before merge.**

- [ ] **13.1 — Sponsorship package model** (Directus: `sponsorship_packages` collection with quotas, audience caps, included intents)
- [ ] **13.2 — Stripe Connect (or hosted checkout) integration** (server-side, no card data on our infra)
- [ ] **13.3 — Subscription lifecycle wiring** (signup, renewal, downgrade, cancel, webhooks)
- [ ] **13.4 — Invoicing + tax** (Stripe-handled where possible; manual escalation for KZ/UZ/TJ regulatory specifics)
- [ ] **13.5 — Cabinet billing tab** + receipts archive

---

## 16. Cross-sprint ops items (not PRs, but track-able)

- [ ] **OPS — Security review before Sponsor Phase C ships** (Phase 5e). Reviewer: external if budget; otherwise self + checklist focused on dispatcher PII boundary.
- [ ] **OPS — Legal track for EULA** (H2 hardening — added 2026-05-19)
  - **Trigger:** 5.5/2 merges (EULA capability ships)
  - **Parallel work:** engage a lawyer for: (a) platform baseline EULA (data processing + COC + photo release); (b) per-event-type addendum templates (hackathon waiver, paid-event ToS); (c) GDPR-style data-export policy text
  - **Timeline expectation:** if lawyer engagement is >4 weeks out, ship a v0 self-drafted "I agree to AI Qadam's terms" linking to a basic terms page — better than no EULA at all in prod for months
  - **Hard gate:** real EULA text in prod before Phase 5 (any sponsor outbound). Phase 1-4 can run with v0 self-drafted text; revenue work cannot.
  - **Where it lives:** `/legal/baseline-v1.md` in this repo, surfaced via Directus `eulas` collection
- [ ] **OPS — GDPR-style data-export endpoint** (`GET /v1/me/export`) — required-ish in many jurisdictions; add as a small follow-up item between Phase 2 and Phase 3.
- [ ] **OPS — Backup verification cadence** — Restic snapshots cover Coolify volumes already; verify monthly that we can restore.
- [ ] **OPS — Cost monitoring** as we add containers (Plausible, Discourse, Metabase, Telegram bot, future sponsor cabinet host); the prod host has finite RAM. Check after each new Coolify stack ships; cap at 12GB RAM used.

---

## 17. Immediate next action

If §14 + §18 are accepted: **Sprint 5.5/1 (actor model + sponsors + speakers collections)**. Simplified by Q4 update (single rep per sponsor, no `sponsor_reps` join). Pure Directus migration + seed. ~1 hour. Branch: `feat/s55-1-actor-model`.

---

## 18. OSS landscape research — what to adopt vs build

> User directive 2026-05-19: "Before coding yourself, look if there are already zero-cost products for our architecture." Findings below.

### Tools evaluated, decision per area

| Capability | OSS candidates considered | Decision | Reasoning |
|---|---|---|---|
| **Identity / OIDC** | Authentik (in use), Keycloak, Zitadel, Ory Kratos | **Keep Authentik** | Already deployed, working, single source per D1. |
| **CMS / entity store** | Directus (in use), Strapi, Payload, KeystoneJS | **Keep Directus** | Already deployed, flows + admin UI mature. |
| **CRM** | Twenty (in use), EspoCRM, SuiteCRM, Krayin | **Keep Twenty** | Just shipped, OIDC SSO working. |
| **BI dashboards** | Metabase, Superset, Lightdash, Cube, Redash, Grafana | **Adopt Metabase** (Sprint 6.5) | Per §8: easiest deploy, row-level perms, embeddable, OSS MIT. First-class engine per Q6. |
| **Multi-channel notification dispatcher** | **Novu** (MIT, self-host), Knock (SaaS), Courier (SaaS), Apprise (Python lib) | **Build in-house, do NOT adopt Novu** | Novu integration cost > value at our scale. Our dispatcher needs ~300 LOC of TS to fan out across email + Telegram + in-app + CRM-activity. Novu adds another container, another subscriber model to bridge with `directus_users`, their template language vs our existing React Email setup, ongoing migration tax on their version bumps. **Revisit when we have 5+ channels or >100k monthly notifications.** |
| **Form-builder / survey engine** (Q8 → CSAT, eNPS, post-event surveys, sponsor questionnaires) | **Formbricks** (MIT, self-host, very active), HeyForm (AGPL — restrictive), LimeSurvey (PHP, heavy), OhMyForm (abandoned), SurveyJS (library not engine) | **Adopt Formbricks** (Phase 5c) | User asked for "google forms like capability" + "use external if possible." Formbricks fits exactly: operators design surveys in UI, multi-channel delivery, webhook responses into our InteractionsService. Self-hosted Docker stack on Coolify. MIT license. **Deferred to Phase 5c** per critical review — single-question CSAT in Phase 2 covers the urgent feedback loop; long-form questionnaires only matter when sponsors exist. |
| **Community forum / member-to-member layer** (member directory, threaded discussion, reactions, @mentions, badges, trust levels, search, moderation) | **Discourse** (GPL, OSS, mature, free self-host), Flarum (lighter alternative), NodeBB | **Adopt Discourse** (Phase 2, Sprint M1) | **Biggest single architectural decision in the critical review.** Adopting Discourse vs building member-to-member from scratch saves ~5 sprints of inferior in-house work. Out of the box we get: per-country / per-topic categories, threaded posts, likes + reactions, @mentions, notifications inbox, badges (covers our W2.3), trust levels 0-4 (= foundation for our ambassador system, free), moderation tooling, search. OIDC SSO via Authentik works natively. Mature: Mozilla, every credible OSS project. Cost: another Coolify stack to operate (~500MB RAM), one auth bridge to wire, one identity sync to maintain. **Massively worth it.** |
| **Consent / EULA records** | DocuSeal, OpenSign (full document signing), Klaro (cookie banner only), OpenConsent (small lib) | **Build in-house** | Document signing tools are PDF + signature drawing — overkill. Our need is "show text, capture checkbox, record audit row with IP + UA" — ~50 LOC of TS. Adopting a signing tool means standing up another service for a checkbox. |
| **Feature flags / A/B testing** | **GrowthBook** (MIT self-host), Unleash, Flagsmith | **Build lean DIY for Sprint 5.6; GrowthBook later if we outgrow it** | At our scale (single-digit experiments per quarter) GrowthBook's deployment + integration cost beats the value. The lean DIY (3 PRs) lays compatible groundwork: GrowthBook can read our `experiment_assignments` table via their SDK if/when we migrate. |
| **Workflow / rules engine** (Sprint 12) | **Temporal** (durable workflows, MIT), **n8n** (visual, fair-source), Activepieces, Cadence | **Defer evaluation to Sprint 12; lean toward Temporal for durable orchestration, n8n for operator-facing visual workflows** | Don't pre-commit. By Sprint 12 we'll know which kind of workflows we actually have. |
| **Group / team management** | none directly applicable (Mattermost/Rocket.Chat = chat platforms, not team primitives) | **Build in-house** | Our use case (event-scoped hackathon teams + memberships) is small + tightly coupled to our event model. ~100 LOC of Directus collections + thin API. |
| **Helpdesk / support ticketing** (future, for "client → operator support" interactions) | Chatwoot (MIT, OSS), FreeScout, Zammad | **Defer; revisit when support volume warrants it** | Until then, support = email to admin@aiqadam.org. |
| **Email sending (transactional)** | Currently Resend (proprietary, free tier). Alternatives: Postal, Listmonk (newsletter), Mautic | **Keep Resend** for now; revisit at scale or if pricing changes. | Resend free tier covers our volume. Migrating later is one channel-adapter swap, not architectural. |
| **Payment** (Sprint 13, far away) | Stripe (proprietary, free unless transacting), LemonSqueezy, Paddle | **Stripe Connect** when Phase D arrives | Industry standard, PCI-offloaded. |

### Two adoptions confirmed by this research

1. **Metabase** — Sprint 6.5 (already planned)
2. **Formbricks** — adds to Sprint 8 (CSAT/eNPS sprint). Becomes the form/survey engine for any non-trivial questionnaire.

### One thing that GOT MORE COMPLEX from the research

**Q8 expansion** — multi-actor CSAT means each of attendee/speaker/sponsor has their own post-event form template + delivery rules. Sprint 8 grows from 4 PRs to ~6:

- 8.1 — CSAT + eNPS intents (single-question inline rating in bot + email) — unchanged
- 8.2 — Scheduled post-event dispatch — unchanged
- 8.3 — Response capture endpoint — unchanged
- 8.4 — Operator BI dashboard tile — unchanged
- **8.5 — Deploy Formbricks at `forms.aiqadam.org`** + bootstrap operator admin
- **8.6 — Long-form questionnaires via Formbricks** + webhook → `interaction_responses` bridge; templates for attendee/speaker/sponsor post-event surveys

### Principle going forward

For every new capability proposed in any future sprint: **first run a 30-minute OSS landscape scan**. Document the candidates considered in the relevant sprint PR's description. Only build in-house when adoption cost > build cost.

This goes into `docs/dev-process.md` (TBD — small write-up of how we work).

---

## 19. Cabinets — clarification after Q4 simplification

With Q4 set to "single user per sponsor", the cabinets layer simplifies:

| Cabinet | Identity model | Login |
|---|---|---|
| Client cabinet (`aiqadam.org/me` + bot) | `directus_users` with `actor_kinds ⊇ ['client']` | OIDC (any provider) or Telegram |
| Sponsor cabinet (`sponsors.aiqadam.org` or `/sponsor`) | `directus_users` with `actor_kinds ⊇ ['sponsor_rep']` linked to one `sponsors` row via `sponsors.rep_user_id` | OIDC, gate on relationship |
| Speaker cabinet (`/speaker`) | `directus_users` with `actor_kinds ⊇ ['speaker']` linked to one `speakers` row via `speakers.user_id` | OIDC, gate on relationship |
| Operator (Twenty + Directus + /admin redirect) | `directus_users` with `actor_kinds ⊇ ['operator']` | OIDC |
| Team cabinet (`/me/teams/<id>`) | gated by membership in `team_memberships` | Same login as client |
| Operator BI (Metabase) | mirrors operator OIDC | Google SSO via Authentik (Sprint 7 dependency) |
| Sponsor/Speaker BI (embedded Metabase iframes) | signed embedding token from API, scoped to sponsor_id / speaker_id | No separate login |

- **Doesn't decide UX of any cabinet.** That's per-sprint design work.
- **Doesn't pick experiment tooling.** Sprint 5.6 (lean DIY vs GrowthBook) still open per the previous discussion.
- **Doesn't propose a federated identity model.** A single human can have multiple actor_kinds via the array on directus_users; no separate identity providers per actor type.
- **Doesn't address moderation tooling for client → client or team chat.** Parked until those features exist.
- **Doesn't tackle internationalization of EULAs / consent UI.** The data model supports per-locale EULAs (column `locale`); the rendering work is a future sprint.
- **Doesn't propose how sponsors pay** beyond "Phase D = Stripe". The actual pricing model, package design, refund policy, tax handling — all separate from this architecture, all in Phase D.

---

## 20. North-star metrics

> Added 2026-05-19 per critical review §11. Every sprint's value gets evaluated against these. Sprints that don't move them get deferred or cut.

### Primary metrics (track weekly, reported on operator dashboard)

| Metric | Type | Definition | Why | Where it lives |
|---|---|---|---|---|
| **WAM** — Weekly Active Members | Leading | distinct users with ≥1 platform interaction (event view, registration, Discourse post, bot command, profile update, reaction) in the past 7 days | Tells us week-over-week whether the community is alive | `bi.wam` view; Metabase tile |
| **90-day repeat attendance rate** | Lagging | of users who attended an event in month N, % who attended again by month N+3 | Captures the only thing that proves community health: people come back | `bi.repeat_attendance` view; Metabase tile (quarterly) |

### Phase metrics (gate Phase N → Phase N+1)

- **Phase 1 → 2**: 500 unique website visitors/mo + 50 sign-ups/mo, at least in one country
- **Phase 2 → 3**: 30% of new sign-ups return within 30 days + ≥10% post in Discourse within 60 days
- **Phase 3 → 4**: 100 WAM per country + ≥50 member-initiated interactions per week platform-wide
- **Phase 4 → 5**: 1 operator runs all 3 countries with ≤8h/week routine load (measured via time-tracking)
- **Phase 5 hard gate**: 500+ WAM in at least one country AND 3+ inbound sponsor inquiries collected through the platform

### Secondary metrics (track but don't gate on)

- Member NPS (single-question survey, asked once per quarter to active members): aspirational target 40+
- Event CSAT average (after Phase 2 ships csat intent)
- New-member onboarding completion rate (signup → first registration)
- Discourse trust-level distribution (proxy for ambassador-readiness)
- Per-country WAM (geographical health)

### Forbidden vanity metrics

- **Total registered users** (easy to gameable; no relationship to community health)
- **Page views** in isolation (without conversion context)
- **Telegram channel subscriber count** (not interaction; not retention)

### Measurement plumbing

- Phase 1 ships interaction logging (5.5/3) — every action becomes a row in `interaction_deliveries` / `interaction_responses`
- Phase 4 ships Metabase (6.5) — dashboards on top of the `bi.*` view layer
- Until Phase 4, operator queries raw SQL or runs `psql` ad-hoc reports against the views — acceptable for low traffic

---

## 21. Acquisition strategy

> Added 2026-05-19 per critical review §7. Acquisition mechanics are first-class because growth is the only thing that makes everything else (community vitality, sponsor sustainability) achievable with a limited team. Built into Phase 1 (M5), not deferred to month 5.

### The four loops we're investing in

| Loop | Phase | Mechanism | Compounding effect |
|---|---|---|---|
| **Search → page → sign-up** | Phase 1 (M5.1) | SEO: Open Graph + JSON-LD + sitemap; W1 brings real content surfaces (speaker / sponsor / topic pages); long-tail keywords ("AI events Tashkent", "MLOps meetup Almaty") | Pages keep ranking forever; one ranking → years of traffic |
| **Member refers member** | Phase 1 (M5.2) | Referral codes attribute new sign-ups; referrer earns points + "Brought a friend" badge; leaderboard tile | Each active member compounds: 1 → 1.2 → 1.44; the multiplier is free |
| **Member shares event** | Phase 1 (M5.3) | Share-to-Telegram/X/LinkedIn buttons on every event page with auto-suggested text + UTM | Event-driven peaks; each share = ~5 new visitors at the right moment |
| **Discourse community is the lure** | Phase 2 (M1) | Discourse is public-readable for non-members; quality discussion = SEO + word-of-mouth | Content compounds: 100 great threads → ranking power + member-brought-by-search loop |

### What we deliberately don't invest in

- **Paid ads** — burns cash; no thesis at our scale; reconsider only when we have ≥3 reproducible cohorts that pay back acquisition cost
- **Affiliate / influencer programs** — premature; the ambassador layer (M2) is the homegrown version of this
- **Email blasts to scraped lists** — illegal under most jurisdictions + ruins our sender reputation + against consent model
- **SEO-content factory** — quality content from speakers + members organically; no AI-generated SEO chaff

### Where Phase 1 changes daily operator behavior

After Phase 1:
- Every event page gets a sharable URL with OG card (operator: post the URL to channels)
- Every member who signs up sees referral mechanics on their `/me` (member: shares with friends)
- Every visitor sees a clean "Sign up to attend" CTA, not a thin event list

Operator time spent on acquisition drops from "post to 8 channels by hand" to "one share button, one referral leaderboard check". **Acquisition becomes self-running by end of Phase 1.**

### How acquisition strategy interacts with §6 channel routing

For unauthenticated visitors, the Telegram-default channel doesn't apply (we don't know them yet). Phase 1 needs a different funnel:

1. Public page → engaging content → "register for this event" CTA
2. Registration is the conversion event (creates user + assigns channel preferences)
3. Post-registration → Telegram-default channel kicks in for ongoing communication

So acquisition surface = web; retention surface = bot. Both matter; both ship in Phase 1-2 in that order.
