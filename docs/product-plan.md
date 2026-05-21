# Product plan — AI Qadam (rolling 18-month strategic view)

> **Companion to**: [`community-platform-roadmap.md`](./community-platform-roadmap.md) (sprint-level tactical plan), [`marketing-and-pr-playbook.md`](./marketing-and-pr-playbook.md) (channel strategy + funnel), [`ux-and-content-guidelines.md`](./ux-and-content-guidelines.md) (presentation), [`agent-prompts.md`](./agent-prompts.md) (execution).
>
> **This doc**: ties surfaces + scaling + enrichment + product menu into one strategic narrative so a fresh stakeholder (next country lead, investor conversation, new engineer) can read one document and understand WHERE AI Qadam is going across 18 months. Quarterly review; reshape when reality diverges from a major branch.
>
> Authored 2026-05-21 by Viktor (COO) with the multi-hat process (product strategist + growth PM + DevRel/community PM + platform PM + business-model PM). Captures the architectural arcs from [ADR-0032](./adr/0032-operator-tools-must-sso-or-embed.md) and [ADR-0033](./adr/0033-community-member-graph.md) at the product level.

---

## 1. Vision & thesis

**AI Qadam is a community-as-platform for AI engineers across Central Asia.** The audience graph — people ↔ events ↔ skills ↔ employers ↔ interests ↔ consents — IS the platform asset. Every future product is a thin consumer of that graph, not a separate system with its own identity model.

Comparable archetypes that successfully made this play: Reforge (cohort courses + hiring on member graph), DEV.to / Forem (open community engine with sponsorships + jobs), MLH / Devpost (hackathon ops as a thin product on a community), Indie Hackers (pre-Stripe acquisition: community-first, products bolted on). Comparable archetypes that *didn't* (stitched-tool cluster like Lenny's Newsletter stack circa 2024) are now rebuilding from fragmentation.

**Founder narrative** (Binali Rustamov, Founder; Viktor Drukker, COO + Head of Vibe Code & Platform Operations): the community is the product; spin-offs (hackathons, talent matching, cohort courses, mentorship, premium content) compound on the same audience as it deepens.

**Revenue thesis**: today sponsor-led (5–15 sponsors / year per country at Bronze→Platinum tiers); year-2 adds paid workshops + premium content tier; year-3 unlocks talent-marketplace revenue share + cohort-course catalogue. Each layer requires the previous to be dense enough to justify it.

---

## 2. Surface map — every way an actor touches AI Qadam

| Surface | Today | 6 months | 12–18 months |
|---|---|---|---|
| **Web public** (`aiqadam.org`, per-country subdomains) | Static + dynamic event pages, registration, /me, /press, /workspace launcher | + 5 operator cabinets, /me/profile, /welcome/[slug] landing pages, /blog | + public hackathon submissions browse, talent profiles (opt-in), course catalogue, paid-tier paywall |
| **Web workspace** (`/workspace`) | Shell + launcher (3 cards) + auto-redirect SSO | + member directory + cohort builder, announce composer, event control panel, partner cabinet, /me/profile | + per-product cabinets (hackathons, courses, mentorship admin) |
| **Email** (Resend transactional via Interactions dispatcher) | Reg confirm, EULA prompt, /me/preferences consent | + post-event CSAT, T-7/T-2/T-3h reminders, T+3 matching, lead-capture nurture, cohort announcements | + paid-tier digests, course onboarding, certification, payment receipts |
| **Telegram group** (`t.me/aiqadam`) | Manual chatter, event reminders | + automated event-day pings (via bot) | unchanged (groups don't scale; channel + bot take the load) |
| **Telegram channel** (broadcast — DOES NOT EXIST YET) | — | Launched: event announcements, recordings, monthly digest | + per-country channels, sponsor takeover posts, course launches |
| **Telegram bot** (`@AIQadamBot` — NOT EXIST YET) | — | Sprint 5.5: account-link via Authentik OIDC deep-link; member commands (/events, /register, /me, /leaderboard) | + organizer runtime (/scan, /attendance, /announce), WebApp views, hackathon judging, course progress nudges |
| **Telegram WebApp** (Mini-app embeds inside Telegram) | — | — | Phase ζ.5: event detail, registration, cabinet-lite, hackathon team join, course lesson |
| **LinkedIn** | Manual solo (Viktor) | + scheduled posts (Buffer-style) via marketing dashboard; founder-led content (Binali + Viktor distinct voices per [playbook §13](./marketing-and-pr-playbook.md)) | + speaker amplification kit auto-posts; sponsor co-marketing posts |
| **Operator tools** | Coolify admin, Authentik admin, Directus admin (all engineer-only) | + cabinets replace operator Directus use; Gatus + Plausible accessed via /workspace launcher | + auto-PDF quarterly digest delivery; Metabase embeds inside workspace |
| **Mobile** | Responsive web (PWA-ready but not installed) | Telegram bot covers most member ops on phone | Native PWA install prompts; possible thin native app for organizers if event-day workflows demand it (decide based on usage signal) |

**Design principle**: every surface routes the actor to **ONE identity** (Authentik) and **ONE consent model** (`member_consents` per purpose). New surfaces never create a parallel identity store (see [ADR-0032](./adr/0032-operator-tools-must-sso-or-embed.md), [ADR-0033](./adr/0033-community-member-graph.md)).

---

## 3. Member journey — from discovery to advocacy

The funnel that everything else serves. Each transition has owned mechanics + a north-star signal.

| Stage | Trigger | Owned mechanic | Surface | Signal we measure |
|---|---|---|---|---|
| **Discover** | Search / referral / friend / Telegram forward | `/welcome/[slug]` landing page or event detail | Web public | UTM-attributed first-touch |
| **Lead** | "Notify me of events in {city}" form (Sprint 1.6) | Lead nurture: T+0 welcome / T+3 community / T+7 next event preview | Email | Lead → registration conversion |
| **Register** | First event registration | EULA + per-purpose consent prompt | Web | First-touch attribution captured to `acquisition_source` jsonb |
| **First attend** | Check-in at first event | T+1 thank-you + CSAT survey; "3 people you might meet" pre-event matching (Sprint 1.5) | Web + Email | NPS @ event 1 (target ≥40) |
| **Repeat** | Second event registration | Bringing a friend prompt (referral code); "events in {city}" cadence | Email + Web | 90-day repeat-attendance rate |
| **Contributor** | Speaks / mentors / brings ≥3 referrals | Speaker bench invite, mentor matching, +25-point badges (Sprint 5.3) | Web cabinet (/app/speaker, /me/referrals) | % members in contributor state |
| **Ambassador** | Brings ≥5 referrals OR owns a country lead role OR co-runs an event | Country lead onboarding flow, share-of-voice on Telegram channel, speaker amplification kit | All surfaces | Members generating ≥3 events worth of attendance (referrals × multiplier) |
| **Alumnus** | Inactive >180 days but consent retained | Win-back campaign (Phase ζ); product-specific re-entry (course alumni → next course) | Email | 180-day reactivation rate |

**Activation moment** (the one that decides whether a member becomes a regular): their FIRST EVENT EXPERIENCE. CSAT @ event 1 ≥ 4.2/5 + NPS ≥ 40 is the platform survival metric. Everything in Sprint 1 (post-event automation) is engineered to ensure that experience compounds, not erodes.

---

## 4. Platform pillars — the four capabilities everything else depends on

| Pillar | What it is | Where it lives today | What it unlocks for future products |
|---|---|---|---|
| **Identity & consent** | Authentik IdP + Directus `members` + per-purpose `member_consents` + `partner_audiences` entitlement chain | Authentik (deployed) + Directus (member graph shipped F-S3.0 / #134) | Every product's auth + permissioned data access; GDPR posture; off-boarding in one delete |
| **Member graph** | Rich profile + skills + employments + interests + connections + cohorts | Directus (F-S3.0 shipped). Operator UI: 5 cabinets (Sprint 3) | Hackathon team matching, HRtech talent feeds, edtech cohort recommendations, mentorship pairing, partner audience analytics |
| **Events engine** | Plan → publish → register → check-in → CSAT → follow-up; per-event audience + status taxonomy | Directus events + registrations (live); event_outcomes + event_followups rollups (F-S3.0); workflow automation Sprint 1 | Workshops (event format=workshop), paid sessions (event price_usd > 0), hackathons (event format=hackathon → extends to teams + submissions), closed events (event visibility=invite_only) |
| **Interactions dispatcher** | Multi-channel messaging gated by per-purpose consent + audience cohorts | NestJS InteractionsService + EmailAdapter (live via Resend); Telegram + push adapters Phase ζ | Cohort-targeted announcements, drip campaigns, transactional + marketing + research touchpoints with audit trail |

**Architectural floor** (won't change): Authentik = identity. Directus = entity store. NestJS API = orchestration. Astro+React = web. The pillars compose; products don't replace any of them.

---

## 5. Surface-by-surface rollout

### 5.1 Web public + workspace (highest priority through Sprint 5)

The web is the primary owned surface. Sprint 3 (cabinets) is the operator UX investment; Sprint 2 partial deliverables (workspace shell + launcher) are already serving.

**Next 6 months (per [roadmap §7](./community-platform-roadmap.md) + [agent-prompts.md §4](./agent-prompts.md))**:
- 5 operator cabinets (F-S3.2 → F-S3.6) at `/workspace/<concern>`
- Member self-service `/me/profile` with per-purpose consent ladder (F-S3.6)
- Public profile `/u/[handle]` for opted-in members (precursor to talent profiles)
- Auto-generated sponsor PDFs from event_outcomes rollups (F-S3.8)
- Landing pages `/welcome/[slug]` for campaign attribution (Sprint 5.9)

**6–12 months**:
- Public hackathon submission browse (Phase ζ.3)
- Talent profile feed (opt-in only, gated by `member_consents.recruiting=true`)
- Course catalogue surfaces (Phase ζ — edtech)
- Paywall surface for premium tier

### 5.2 Telegram strategy (phased; bot is high-leverage)

**Why Telegram matters more than LinkedIn for AI Qadam**: Central Asia's primary professional async channel is Telegram, not LinkedIn. The platform's distribution moat is whether members CHOOSE to forward AI Qadam content inside their Telegram networks. Bot + channel make that easy; lacking them caps reach at "who follows Viktor on LinkedIn".

**Sub-surfaces**, each rolled out separately:

| Sub-surface | Role | When | Decision needed |
|---|---|---|---|
| **Group** (`t.me/aiqadam`) — exists today | Synchronous member chatter; community signal | Live | Keep as low-signal "hangout"; do NOT replicate channel content |
| **Channel** (broadcast) — DOES NOT EXIST YET | Authoritative announcements + recordings + monthly digest. Powers forwarding. | Sprint 1 timeline (cheap once event automation ships) | ADR-0026 (Telegram channel structure — Proposed batch) needed: one channel or per-country? Recommendation: ONE channel today; per-country when KZ/TJ each have ≥monthly events |
| **Bot — member commands** (Sprint 5.5) | Account-link via Authentik OIDC deep-link; `/events`, `/register`, `/me`, `/leaderboard` | Sprint 5.5 timeline (gated on BotFather setup) | HUMAN: BotFather setup (~5 min) |
| **Bot — organizer runtime** (Phase ζ.5) | `/scan` (check-in via WebApp camera), `/attendance` (live counts), `/announce` (per-event Q&A thread post) | Phase ζ.5 | New ADR: Telegram WebApp initData → JWT bridge (drafted in agent-prompts as ADR-0032) |
| **WebApp views** (Phase ζ.5) | HTML pages served by web app, theme-matched via Telegram WebApp JS API. Event detail, registration, hackathon team join, course lesson. | Phase ζ.5 | Same ADR as above |
| **Mini-apps** (Phase ζ+1) | Future bet: per-product mini-apps if the WebApp adoption signal is strong | TBD | Validate WebApp engagement first |

**Phasing logic**: channel first (cheap, big distribution gain, ADR-0026 unblock). Bot v0 (account-link only) when Sprint 5 ships. Bot full + WebApp when event-day workflows demand it (signal: organizers asking for check-in on phone, not laptop).

### 5.3 Email — the orchestration backbone

Already live via Interactions dispatcher. Sprint 1 fills the automation. No new infrastructure needed; just templates + cron flows + cohort targeting.

**The newsletter question**: deferred to Phase ζ explicitly (per [project-deferred-capabilities](../../.claude/projects/-home-drukker-aiqadam/memory/project_deferred_capabilities.md)). Trigger to resume: ≥4 events/month across all countries, OR ≥1 monthly digest worth of content.

**Listmonk** (proper newsletter engine vs Resend transactional) ships when newsletter cadence triggers, not before.

### 5.4 LinkedIn / X / press — earned + paid distribution

Today: manual by Viktor. Sprint 5.8 marketing dashboard surfaces UTM-attributed inbound from each channel.

Plan:
- Founder-led posts (Binali on community + thought leadership, Viktor on engineering + DevOps) — manual but cadenced via marketing playbook §13
- Speaker amplification kit (Sprint 3.3) — speakers post their own AI Qadam talks → audience compounds
- Sponsor co-marketing kit (Sprint 3.2) — sponsors post their event sponsorship → audience compounds
- Press strategy: deferred until hype trigger (≥1k members + ≥1 cross-country event)
- Paid ads: capability included (UTM scheme + landing pages support it); spend gated on ADR-0028 (Proposed)

---

## 6. Scaling strategy

### 6.1 Geographic scaling (country provisioning)

Sprint 4 ships the self-serve country wizard. Today: UZ live, KZ and TJ tenants exist but no operator yet.

**Country onboarding playbook** (Sprint 4.3 runbook):
1. Country lead identified (HUMAN — recurring blocker per roadmap)
2. ADR-0022 (country-lead compensation model) Accepted (currently Proposed batch)
3. Country lead onboarded via `/workspace/admin/activate-country` wizard (Sprint 4.2)
4. Country profile (hero copy, brand voice, lead bio) set in Directus (Sprint 4.5)
5. First event published in 14 days
6. First sponsor outreach in 60 days

**Trigger to add a 4th country (KG / TM / ...)**: ≥3 events/quarter in each of UZ + KZ + TJ AND a country-lead candidate identified.

### 6.2 Audience-density scaling

The graph thickens as members attend more events. Density unlocks products:

| Density milestone | Member count proxy | Unlocked product |
|---|---|---|
| **Cohort gravity** | ~500 active members per country | Targeted closed-cohort events (CEO breakfasts, student workshops) become bookable |
| **Talent slice viable** | ~2k members with `consent.recruiting=true` | HRtech sponsor tier upgrade (sponsors pay for filtered talent feeds) |
| **Course cohort viable** | ~50 members opted into a specific topic | First paid cohort course |
| **Forum critical mass** | ~200 daily-active members | Discourse adoption (Phase ζ.2) — async discussion beyond Telegram |
| **Newsletter viable** | ≥4 events/month across countries | Listmonk + monthly digest |

These are **leading indicators for product launches**, not the product launches themselves. Each product is a 1–2 PR effort on the graph; the gating question is "will it have an audience"?

### 6.3 Sponsor scaling

Today's tier ladder (per [marketing playbook §3.5](./marketing-and-pr-playbook.md)): Community partner $0 / Bronze $500–1.5K / Silver $1.5K–4K / Gold $4K–10K / Platinum custom.

**Sponsor growth model**:
- Year 1: 5–10 sponsors per country (mix tier; mostly Bronze + Silver)
- Year 2: same count, mix shifts toward Silver + Gold; HRtech upgrade tier introduces (sponsors pay 1.5×–2× base for talent feed access)
- Year 3: + Platinum custom packages (multi-event + product placement)

Quarterly sponsor digest PDF (F-S3.8) is the retention tool — sponsors who SEE concrete value (audience composition, lead attribution, brand reach) renew. Without it, year-1 sponsors don't return.

### 6.4 Speaker bench scaling

Today: speakers found ad-hoc. Sprint 1.1b (speaker_added flow) + Sprint 3.3 (speaker cabinet) build the pipeline.

**Speaker referral loop** (Sprint 1.1c post-event flow): every confirmed speaker gets a thank-you with "who else should we ask?" prompt → referrals feed back into the speaker bench. This compounds: 1 speaker → 2-3 referrals → first wave compounds within 6 months to a self-replenishing bench.

---

## 7. Enrichment strategy — deepening the graph

The graph thickens over time through three mechanisms:

### 7.1 Member-declared enrichment

Members opt into adding data via `/me/profile` (F-S3.6):
- Job title + employer + seniority + industry tags
- Topic interests + intent (interested_in / willing_to_speak / looking_for_job / etc.)
- Per-purpose consents (events / marketing / research / recruiting / sponsor_share / content / paid_premium)
- Visibility preferences (appear in directory? share with sponsors?)

**Lever to increase declared data**: progressive disclosure during the member journey. New members start with email+country only; each event registered prompts for one more attribute. By event 5, profile is rich without ever feeling like a survey.

### 7.2 Behavior-inferred enrichment

The graph learns from observed actions:
- Attended ≥2 fintech meetups → `fintech` interest tag (auto-verified)
- Spoke at ≥1 event → `willing_to_speak=true`
- Brought ≥1 referral → `is_recruiter` or `ambassador` signal
- Completed ≥1 hackathon → `hands_on_builder` tag
- Logged ≥1 mentor session → `is_mentor` tag

**Implementation**: a `member_signals` collection (Phase ζ Sprint 1) + a nightly cron that runs inference rules. Phase ζ work — depends on enough event-attendance data accumulating to make signals reliable (≥3 events per member median).

### 7.3 Social graph enrichment

`member_connections` collection captures:
- Co-attendance (member A and B at the same event)
- Hackathon teammates
- Mentor-mentee pairs
- "You might like" referral co-occurrence

**Lever to use it**: pre-event "3 people you might meet" matching (Sprint 1.5) makes the social graph valuable to members → encourages opting into `appear_in_matches=true` → graph thickens.

### 7.4 Third-party enrichment (where it's safe + consensual)

Only with explicit per-purpose consent:
- LinkedIn URL on profile (member adds; we don't scrape)
- GitHub URL (same)
- Domain-verified employer email (Phase ζ — sponsors pay extra for "verified employees of company X" cohorts)

**Never**: scraping, third-party data brokers, purchased lists. These violate the trust model that makes the graph valuable.

### 7.5 The enrichment north star

**Average "rich attribute count" per active member, segmented by tenure**. Targets:
- New member (week 1): 3 attributes (email, country, joined_at)
- 3-month member: 8 attributes (+ job, employer, industry, 2 interests, 1 consent)
- 12-month member: 15+ attributes (full skills, employments, interests, connections, multiple consents)

Tracked in Metabase (Sprint 2.4) cross-country dashboard.

---

## 8. Product menu — what spins off the graph

Each is a thin product (1–2 vertical PRs of namespaced schema + a cabinet) on top of the member graph. Sequenced by audience-density triggers + revenue contribution + strategic fit.

### 8.1 Hackathons (Phase ζ.3) — first spin-off

**Why first**: pure community play; revenue indirect (sponsor presenting partner upgrade); high engagement; produces shareable artifacts that drive Acquisition; activates the social graph (teams).

**Schema (namespaced `hack_*`)**: `hack_teams`, `hack_submissions`, `hack_judges`, `hack_scores`, `hack_rubrics`.

**Cabinet**: extends `/workspace/events/[id]` for organizers; new `/workspace/hackathons/[id]/judge` for judging; member-side `/events/[id]/teams` for team formation.

**Go-to-market**: pilot as a 1-day weekend hackathon in UZ with a presenting sponsor (Bronze tier upgrade pays for it); if NPS ≥ 50 + ≥30 participants, schedule quarterly.

**Revenue contribution**: sponsor upgrades (~$500–2000 per hackathon presenting slot); long-term: paid registration tier for non-member participants.

### 8.2 HRtech — talent ↔ employer matching (Phase ζ — high revenue potential)

**Why second**: highest revenue potential in the menu; activates the sponsor relationship vertically (sponsors who're also recruiters convert at higher tier); requires the graph to be dense (≥2k consenting members).

**Schema (namespaced `hr_*`)**: `hr_jobs`, `hr_applications`, `hr_candidate_feeds`, `hr_employer_subscriptions`.

**Members opt in** via `/me/profile` → `consent.recruiting=true` + `looking_for_job=true`. Their `member_employments` + `member_skills` become visible to subscribed employers via curated feeds (NEVER direct query — always cohort-gated per partner_audiences).

**Cabinet**: `/workspace/jobs` for members (browse + apply); `/workspace/talent` for employer reps (subscribed cohort feed).

**Revenue contribution**: subscription model — employers pay $500–2000/month for a curated feed (e.g., "senior backend engineers in fintech, Tashkent, open to work"). Optional placement fee on successful hire.

**Trigger**: ≥2k members with recruiting consent OR ≥3 sponsors explicitly asking. Whichever comes first.

### 8.3 Edtech — cohort courses + paid workshops (Phase ζ — medium-high revenue)

**Why third**: leverages existing event infrastructure (workshop = event with format=workshop); paid courses produce direct revenue + alumni cohorts → next-course recommendations.

**Schema (namespaced `edu_*`)**: `edu_courses`, `edu_enrollments`, `edu_lesson_progress`, `edu_certifications`, `edu_instructors`.

**Cabinet**: `/workspace/courses` (instructor + admin); `/me/learning` (member progress).

**Pilot**: first cohort course "Practical LLM evaluation for AI engineers" — 6 weeks, $200/seat, cap at 30 members from existing community. Validates pricing + cohort dynamics before scaling.

**Revenue contribution**: $200–500/seat × 20–30 seats × 4–6 courses/year per country = meaningful direct revenue at scale.

**Trigger**: ≥50 members opted into a specific topic cohort.

### 8.4 Paid premium tier (Phase ζ — recurring revenue)

**Why fourth**: recurring revenue (vs one-off); separates "community curious" from "career invested" members; supports the platform without sponsor dependency.

**Schema (namespaced `paid_*`)**: `paid_subscriptions`, `paid_content`, `paid_perks`.

**Perks** (TBD by audience research): early access to event registration, recorded session library, members-only Discord/Telegram, monthly office hours with founders.

**Cabinet**: extends `/me/profile` (subscription mgmt); extends `/workspace/announce` (cohort-gated by paid tier).

**Revenue contribution**: $10–30/month × 5–10% conversion of active members.

**Trigger**: ≥500 active members per country (need critical mass to justify perks production cost).

### 8.5 Mentorship marketplace (Phase ζ — community deepening)

**Why fifth**: strengthens member-to-member ties (highest-retention signal); low revenue priority (could be paid or free); activates `member_connections` social graph.

**Schema (namespaced `mentor_*`)**: `mentor_profiles`, `mentor_matches`, `mentor_sessions`.

**Matching**: member.skills + member.interests + member_connections (mutual co-attendance signal).

**Cabinet**: `/workspace/mentorship` (admin); `/me/mentorship` (member-side).

**Revenue contribution**: optional — could be free as community good OR paid (mentor takes 80%, platform 20%).

**Trigger**: ≥200 senior members willing to mentor + ≥500 juniors interested.

### 8.6 Sponsor "talent slice" upgrade tier (Phase ζ — sponsor revenue lift)

**Why sixth (but actually unlocks earlier)**: NO new collections (it's an entitlement on `partner_audiences`); high revenue lift per existing sponsor; can ship as soon as HRtech (8.2) data is collected.

Sponsors at Silver+ tier can upgrade to a "talent slice" — entitled access to a filtered talent feed (e.g., all members who attended ≥2 of the sponsor's hosted events AND consented to recruiting). This is HRtech but with a one-sponsor relationship (deeper) vs a marketplace.

**Revenue contribution**: +50–100% of base sponsor tier price.

---

## 9. Business model evolution

| Year | Primary revenue | New revenue layers | Member-to-customer ratio target |
|---|---|---|---|
| **Year 1** (now) | Sponsor tiers Bronze→Platinum (~$30–80K / country / year at full mix) | — | 100% members; 0% paying |
| **Year 2** | Sponsors (~$50–120K / country) + paid workshops (~$10–30K) | Paid premium tier | 95% free / 5% paying (~$15–30/mo) |
| **Year 3** | Sponsors + workshops + cohort courses + HRtech subscriptions | Talent-marketplace upgrade tier | 90% free / 10% paying (subscriptions + courses + workshop seats) |
| **Year 4+** | Multi-country aggregate; HRtech becomes ≥30% of revenue if successful | Possibly: research panel income, advisory matching | 85% free / 15% paying (target ~$150K/country direct revenue) |

**Critical principle**: free tier never breaks. The community IS the platform; if free members ever feel "spammed by paid offers", the graph degrades. Paid offerings are visible but never pushy.

---

## 10. Metrics framework — what to watch

### 10.1 North stars (from [roadmap §1](./community-platform-roadmap.md))

1. **Active members per country** (M3M = sum of registrations across last 3 months, unique members)
2. **Repeat-attendance rate at 90 days** (% of members who attend ≥2 events within 90 days of first attendance)
3. **K-factor** (referrals per attendee × conversion rate of those referrals to registration)

### 10.2 AARRR funnel (per [marketing playbook §3](./marketing-and-pr-playbook.md))

| Stage | Metric | Surface |
|---|---|---|
| Acquisition | Weekly new leads + new registrations | Web (UTM); Telegram channel forwards |
| Activation | Lead → first registration; first registration → first attendance | Email nurture; CSAT |
| Retention | 30/60/90-day repeat-attendance | Email cadence; event matching |
| Referral | K-factor; referral-attributed registrations | Share buttons (Sprint 5.2); /me/referrals |
| Revenue | Sponsor renewals + paid workshop seats (year 2+) + subscription MRR (year 2+) | Sponsor digest; paid-tier cabinet |

### 10.3 Graph health metrics (unique to community-as-platform thesis)

| Metric | Target | Why |
|---|---|---|
| Average attributes per active member | ≥8 by month 3 | Enrichment is platform's compounding moat |
| % members with ≥1 per-purpose consent beyond default | ≥40% within 6 months | Powers cohorts; powers product spawn |
| % members in `member_connections` graph (co-attended ≥1 event) | ≥60% of active | Validates social graph density |
| `partner_audiences` entitled cohort count | ≥3 per sponsor by year 1 end | Validates sponsor data value |
| Skill-tag depth (verified-by-attendance) | ≥2 verified skills per active member | Validates inferred enrichment |

### 10.4 Product-specific metrics (per spin-off)

- Hackathon: participant count, NPS, sponsor presenting renewal, projects shipped publicly
- HRtech: subscribed employer count, MRR, time-to-hire on the feed
- Edtech: course NPS, completion rate, next-course conversion
- Paid premium: MRR, churn, perk-utilization rate

---

## 11. Risks + dependencies (compressed; full risk register in [roadmap §6](./community-platform-roadmap.md))

| Risk | Owner | Mitigation |
|---|---|---|
| **GDPR / privacy as graph thickens** | Architecture | Per-purpose `member_consents`, audit log per access, sponsor PII boundary (cohort-aggregated only per ADR-0033) |
| **Country lead recruitment bottleneck** | Founder + Operator playbook | Sprint 4 self-serve wizard; written 30-day plan; ADR-0022 compensation model |
| **Telegram-platform dependency** | Product | Bot is additive (not replacing web); WebApp uses standard web; member data lives on our infra |
| **Member graph migration if scale ceiling hit** | Engineering | Directus exports to SQL trivially; namespaced schema makes per-product migration possible |
| **Sponsor churn** (year 2 risk if year 1 sponsors don't see value) | COO + Marketing | Quarterly digest PDF (F-S3.8); pre-event audience composition reports; renewal call cadence |
| **Product spawn fragmentation** (50 collections by Phase ζ) | Architecture | Namespace prefix + quarterly schema review; cabinet ownership matrix |
| **Founder bus factor** (Binali + Viktor only today) | Founder | Operator playbook (S0.7); ADR-0022 country leads; cabinet UX makes operator handoff possible |
| **Auth/SSO ecosystem fragility** (Authentik upgrades, OIDC quirks) | Engineering | Provisioning script (Gatus pattern) + per-provider runbooks |

---

## 12. What we explicitly DON'T do (full list in [project-deferred-capabilities](../../.claude/projects/-home-drukker-aiqadam/memory/project_deferred_capabilities.md))

Recurring "no"s: Twenty CRM (ADR-0033), Discord (Telegram is primary CA), Slack (same), magic-link auth (Authentik suffices), buying/scraping member data, third-party CRM as source of truth, Enterprise paid tiers of OSS tools, premature i18n, premature paid ads spend, separate-system spin-offs (every product is a thin consumer of the member graph).

---

## 13. 18-month roadmap at a glance

```
Now ─────────────── 6 months ─────────────── 12 months ─────────────── 18 months

Sprint 0 wrap     ─►  Sprint 4 ships         Phase ζ.1 (recordings)   Year-2 paid tier live
Sprint 1 events   ─►  Country 2 active       Phase ζ.2 (Discourse?)   HRtech subscription live
Sprint 2 RBAC     ─►  Quarterly digest live  Phase ζ.3 (hackathons)   First cohort course completed
Sprint 3 cabinets ─►  Bot v0 + channel       Phase ζ.4 (discovery)    Multi-country dashboard
Sprint 5 growth   ─►  Sponsor renewals       Phase ζ.5 (bot full)     Mentorship marketplace live
                  ─►  500+ members/country   Phase ζ.8 (blog)         Paid premium tier validated
```

Quarterly review of this doc. Reshape when reality diverges from a major branch (e.g., if HRtech demand precedes density target → bring forward; if a country lead doesn't materialise → reshape geographic scaling).

---

## References

- [`community-platform-roadmap.md`](./community-platform-roadmap.md) — sprint-level tactical plan; this doc's siblings
- [`ux-and-content-guidelines.md`](./ux-and-content-guidelines.md) — voice + personas + form structures + onboarding scripts
- [`marketing-and-pr-playbook.md`](./marketing-and-pr-playbook.md) — channel strategy + AARRR funnel + sponsor tiers + UTM
- [`agent-prompts.md`](./agent-prompts.md) — vertical-feature backlog + kick-off template
- [ADR-0032](./adr/0032-operator-tools-must-sso-or-embed.md) — operator-tools auth/embed policy (Accepted)
- [ADR-0033](./adr/0033-community-member-graph.md) — community member graph on Directus (Accepted)
- [`docs/adr/`](./adr/) — full ADR archive
- [`docs/runbooks/`](./runbooks/) — operational procedures
