# AI Qadam community-platform roadmap

> **Single source of truth for the next 12 weeks of platform work.** This document combines (a) PM phase planning, (b) senior-architect review with single-VM-constraint adaptation, and (c) BA process / lifecycle / behavioral-risk analysis. Developers should read it end-to-end before starting Sprint 0; thereafter, treat each sprint section as the spec for that sprint.
>
> **Drafted 2026-05-19**, four-pass authorship: feature-PM v0 → community-PM v1 → enterprise-architect review v2 → BA process analysis v3 (this version).

---

## 0. Situation

- **Event 1 closed: 100+ attendees, 75% registration→attendance conversion.** Industry meetup conversion is 40–50%. The in-person event format has product-market fit. The cohort is captured in Twenty CRM; CSAT capture is no longer "save the cohort" but "automate the post-event flow for every event N=1..∞."
- **Operator directive (2026-05-19):** *raise the platform to automate the work.* Founder hustle no longer scales across UZ/KZ/TJ + the distributed community team.
- **Team:** **Binali Rustamov = Founder.** **Viktor Drukker = COO + Head of Vibe Code & Platform Operations.** Country leads run their countries. Community Volunteering Board provides governance + advisory + sponsor-relations oversight. (Previously this document attributed the founder role incorrectly — propagated correction 2026-05-19.)
- **Strategic bet:** scalable multi-tenant community OS, not a single community. Multi-country, multi-actor (client / sponsor / speaker / operator), RBAC-from-day-one. Other regions / clients could plug in.
- **Marketing model:** influencer + community partnerships, not paid acquisition. Lower spend, higher trust, slower attribution, compounding returns.
- **Team:** community team distributed across UZ/KZ/TJ. Operator workspace is P0.
- **Infrastructure constraint:** single VM (Hyperapp host, 31 GB RAM). No budget for a second host yet. Staging is **layered on the existing host** (Option A — see [§Sprint 0.1](#sprint-0--foundation-week-12)).
- **Architecture decisions locked:** custom workspace at `workspace.aiqadam.org`, Authentik groups as canonical RBAC source, self-serve country provisioning via CMS, single-origin cabinet routing (see [§Sprint 3.1](#sprint-3--per-actor-cabinets-week-69)).
- **What's already done (PRs #67–#87, all merged):** Twenty CRM live with OIDC SSO, Interactions primitive (interactions / deliveries / responses tables + dispatcher service + EmailAdapter), ConsentService, `/me/preferences` UI, registration-time EULA + consent prompt API, Plausible Analytics live + tracker in Layout, OG/Twitter/canonical/sitemap.xml/robots.txt/JSON-LD Event.

---

## 1. North-star metrics

Revised after BA critique: "% events automated" is not the goal; **automation enabling quality at scale** is. Each automation metric is paired with a quality floor it must not violate.

| Metric | Definition | 90-day target | Quality floor |
|---|---|---|---|
| **Operator hours per event** | Time from "first operator action on event" to "event_status=archived" in audit log, summed by operator | ≤ 4h (was ~20h on event 1) | **CSAT must stay ≥ 4.3** |
| **% events fully automated end-to-end** | Events where post-event CSAT + thank-you + CRM activity all fire without operator action | ≥ 95% | **CSAT must stay ≥ 4.3** |
| **Median days between member's first & second event** (per country) | Habit-formation proxy | ≤ 35 | Must trend down, not flat |
| **Speaker return rate** | % speakers who return for event N+1 within 12 months | ≥ 40% | n/a — pure quality signal |
| **Active countries** | Countries with ≥ 1 published event in last 90 days | ≥ 2 (UZ + KZ) | New-country CSAT must be ≥ 4.0 in first 3 events |
| **Quarterly active members (QAM)** | Members who attended ≥ 1 event in last 90 days | ≥ 250 | n/a |
| **Inbound sponsor inquiries** | Unsolicited sponsor contacts via `sponsors@`, public form, or workspace | ≥ 3 | n/a |
| **% new registrations from existing-member referral** | `registrations.referred_by IS NOT NULL` / total | ≥ 25% by month 6, ≥ 40% by month 12 | n/a |
| **Geographic depth per country** | % of country's members from outside the primary city | ≥ 20% by country month 6 | Watch from country #2 |
| **Time to provision new country** | Operator clicks "activate KG" → KG members can register | < 10 min | All RBAC sync steps must succeed |
| **% engineering touches per country activation** | Manual engineer steps required to activate a new country | 0 (post-Sprint 4) | n/a |

**Measurement infrastructure:** operator-hours requires Toggl integration in first 3 months to calibrate (self-report is unreliable); auto-attribute via `directus_activity` audit log + workspace timer thereafter. CSAT must be operator-unattributable at write time (anonymize to cohort level, never per-member-per-operator) to avoid country-lead survey gaming.

---

## 2. Strategic theses (read these before sprinting)

1. **Automation is leverage, not a goal.** Some operator-heavy flows are GOOD because they create relationship density. The Interactions dispatcher supports two modes: **pure automation** (reminder emails, CSAT delivery, badge issuance — automate fully) and **operator-assisted automation** (speaker thank-yous, sponsor renewal asks, high-value member welcome — platform prepares, operator reviews + sends). Every Interaction has a `requires_operator_approval` flag and there's an approval queue in the workspace. Don't auto-fire what shouldn't feel auto.

2. **Status > convenience.** Members come because being part of AI Qadam signals something about them, not because the UX is nice. Eventbrite UX is fine but no one builds identity around being on Eventbrite. Public profiles, badges, leaderboard, speaker pages — these are status surfaces; treat them seriously.

3. **Trust ladders, not features.** The platform must move actors up trust ladders: visitor → member → contributor → speaker → operator. Each rung needs explicit ceremony + permission expansion + reciprocal value. Skipping rungs creates churn.

4. **Network density compounds.** First 100 members are operator-introduced. Members 100–1,000 come from existing-member referral if the referral surface exists. Members 1,000+ come from organic search + content if W1.x discovery pages exist. Build the surfaces BEFORE you need them, not after.

5. **Franchise discipline.** Multi-country with one operator per country fails without a shared playbook. UZ lead's experiments must reach KZ + TJ + KG leads within days, not months. The workspace must surface cross-country comparison + run a monthly all-leads sync.

6. **OSS-first ≠ build-everything.** Adopt Discourse for forums (Sprint 6.2), Metabase for BI (Sprint 2.4), Plausible for analytics (done). Build only what's load-bearing for our specific domain (Interactions dispatcher, RBAC sync service, country provisioning).

7. **Privacy by default for members; transparency for operators.** Members default to social-proof-friendly visibility (attendance public, profile public, leaderboard public — they're AI engineers, not data-paranoid civilians); operators face full audit logs of their data access. The /me UI shows users their access log (architect-recommended transparency mechanism).

---

## 2.5 Execution model — three lanes

**Critical reframe (2026-05-19):** the executor is not a human team. It's:

```
LANE 1 — Claude Code (engineering)        — ships PRs, runs migrations, edits docs
LANE 2 — Browser agent (verification)     — Playwright in CI + production probing
LANE 3 — Humans (irreducible)             — decisions, recruitment, founder voice,
                                            sponsor sales, physical event execution
```

This changes capacity assumptions throughout the plan:

- **Engineering throughput is effectively unlimited** at observed pace of ~9 substantive PRs per Claude Code session.
- **Verification throughput moves from days-of-human-time to minutes-of-report-review** when smoke tests run in CI + on production probes.
- **Human time becomes the actual critical path** — decisions + recruitment + sales + founder content + event execution span weeks regardless of how fast engineering ships.

Every sprint item below is tagged:

| Tag | Meaning |
|---|---|
| **[CC]** | Claude-Code-executable autonomously, ships via PR with CI gate |
| **[L2]** | Browser-agent-verifiable (Playwright smoke / visual regression / accessibility / production probe) — usually paired with [CC] |
| **[HYBRID]** | [CC] for engineering + [HUMAN] for input/decision/review; can ship in batches with weekly human review cadence |
| **[HUMAN]** | Irreducibly human (decisions, recruitment, sales, founder voice, physical event execution) |

**Three-lane discipline rules:**

1. **No [CC] item ships without an [L2] smoke scenario** (catalogued in §7.5).
2. **No [HYBRID] item ships without explicit decision artifact** — ADR drafted by Claude Code, reviewed in PM weekly decision batch.
3. **No [HUMAN] item is on the engineering critical path** — engineering ships ahead; [HUMAN] items pace the launch milestones independently.
4. **Runbooks-as-living-docs codify formerly-ambient operator knowledge** so humans follow steps rather than invent flow ([docs/runbooks/](../docs/runbooks/) directory; runbook framework = Sprint 0.13).
5. **Guidelines-as-automated-checks** replace "human reviews brand fit" wherever the check can be mechanical (UX guidelines §1 voice patterns → linter; brand color contrast → CI; AI-generated faces → visual regression baseline; etc.).

The irreducibly-human work (the [HUMAN] tag) is intentionally minimized but not eliminated. See [§9](#9-what-were-explicitly-not-doing) and [§11 concurrent operational work](#11-concurrent-operational-work-parallel-to-engineering-sprints) for the residual.

---

## 3. Actor lifecycles

Every sprint serves one or more of these lifecycles. When designing a feature, ask: **which state transition does this make easier / faster / safer?**

### 3.1 Member lifecycle

```
visitor (anonymous)
  → lead (gave email, not yet registered)              ← Sprint 1.5 surfaces nudge
  → registered (first event)                            ← already wired
  → attended (first event)                              ← already wired
  → repeat-attended (event 2 within 28 days)            ← Sprint 1.1+1.4 reminders drive this
  → engaged (linked Telegram, opted into newsletter)    ← Sprint 5.5 bot v0
  → contributor (referred a friend, wrote a post,
                  asked a question on stage)            ← Sprint 5.1+5.2 referral surface
  → speaker-candidate (asked + accepted to speak)       ← Sprint 3.3 speaker cabinet
  → operator-candidate (helping with logistics)         ← Sprint 4.3 country-lead runbook
  → lapsed (90+ days no event)                          ← needs win-back flow (Phase ζ)
  → reactivated | churned
```

**Data captured at each transition:** `directus_users.last_event_at`, `interactions` with `intent=onboarding|win_back|status_change`, `consent_records` for marketing communications. **Exit conditions:** churn = no engagement for 180 days; reactivation = any registration within that window.

### 3.2 Speaker lifecycle

```
prospect (in operator's outreach list, Twenty record only)
  → invited (formal ask + brief + 3 candidate dates)    ← Sprint 3.3 (referral inbound)
                                                         + Twenty pipeline (manual today)
  → confirmed (accepted, content brief sent)            ← Speaker cabinet invite
  → speaking (event day; logistics support)             ← Day-of operator process
  → spoke (post-event thank-you, recording shared)      ← Sprint 1.1 automation
  → ambassador (refers next speaker, returns for N+1)   ← Sprint 1.1 "who next?" prompt
  → lapsed (12+ months no engagement)                   ← Win-back (Phase ζ)
```

**Key insight:** **the single biggest source of new speakers is existing-speaker referrals.** The "who else should we ask?" prompt at T+3 days post-event in the speaker cabinet is the highest-leverage missing flow. **Sprint 1.1 must include this prompt** (BA addition — was deferred to γ.2 in original PM plan; restored here).

### 3.3 Sponsor lifecycle

```
prospect (LinkedIn / member intro / cold list)
  → contacted (intro call done)                         ← Twenty pipeline view (S3.2a)
  → qualified (budget tier + use case captured)
  → proposed (custom deck shared)
  → signed (LOI + invoice — invoicing decision blocks Sprint 3.2; see §10)
  → activated (sponsoring an upcoming event)            ← Sprint 3.2 cabinet invite
  → fulfilled (event happened, leads delivered)         ← Sprint 3.5 auto-PDF report
  → reviewed (success metrics, renewal discussion)
  → renewed | churned
```

**Two-track onboarding** (BA correction to original plan): high-touch sponsors come via operator-initiated Twenty pipeline; small / inbound sponsors come via the "I want to sponsor" public form. The cabinet UX is the same; the routes in differ. Both end in `activated`.

**Most-missed sub-flow:** the operator's **deliverables checklist per sponsor** (logo placement, slot length, leads agreed, swag distribution). Today this lives in operator memory. **Add a `sponsorship_deliverables` collection** linked to sponsor + event with structured items + checkbox state. Workspace surfaces "X / Y deliverables completed" before event close.

### 3.4-pre — Community Volunteering Board (governance actor)

Per operator clarification (2026-05-19), the platform has a **Community Volunteering Board** providing governance + advisory + sponsor-relations oversight. They read dashboards (read-only RBAC) and receive **quarterly digests** (see [marketing playbook §14](./marketing-and-pr-playbook.md#14-quarterly-sponsor-digest-specification)).

```
member-in-good-standing OR external advisor
  → board-candidate (operator or board nominates)
  → board-confirmed (Authentik group `board` + AUP signed)
  → active (reads dashboards, attends quarterly board meeting,
            receives sponsor health updates)
  → emeritus (steps back; retains read-only quarterly digest access)
```

**Permissions** (via Sprint 2.2 RBAC sync):
- Read access to country dashboards (cross-country), audit logs (filtered to high-level summaries), quarterly aggregated sponsor metrics
- NO write access to events, sponsors, members, or finances
- NO access to per-member data (only aggregated)
- Receives: quarterly digest + monthly board update + ad-hoc on major decisions

**Compensation:** volunteer (per name). Status incentive + community vested interest.

### 3.4 Operator / country-lead lifecycle

```
engaged member in target country
  → volunteer (helps at 1 event)
  → trusted volunteer (recurring help, gradual permissions)
  → country-lead-candidate (formal trial: runs 1 event end-to-end
                            with operator shadowing)
  → country-lead (full RBAC, own country)               ← Sprint 2 + Sprint 4 activate
  → senior-lead (mentors other country leads)
  → emeritus (steps back, retains read access)
```

**Open decision blocking Sprint 4:** **what is the compensation model?** Volunteer-with-title (limited scale, motivated by status/CV) vs revenue-share (aligned but complex) vs part-time salary (scalable, costly) vs hybrid. Until this is decided, the onboarding flow for country leads can't be designed properly. PM must drive answer by week 6. See [§10 Open decisions](#10-open-decisions-blocking-issues).

**Trust transfer ceremony missing:** when a new country lead activates, existing community deserves a "meet your new KZ lead" announcement post / DM / introduction. This isn't infrastructure work but it must be in the country-lead runbook (Sprint 4.3).

### 3.5 Event lifecycle (parallel workstreams, NOT a single state machine)

Real event production runs several concurrent tracks. Treating it as a linear state machine (e.g., "speakers must be confirmed before publish") would force the operator to delay announcement — which kills early-registration momentum. Each track has its own state; **the event aggregates them.**

```
                       ┌──── PUBLICATION ────┐
                       │ draft               │
                       │   → published       │ ← announcement fires; visible
                       │   → updated*        │ ← incremental: new speaker, new sponsor
                       │   → cancelled       │
                       └─────────────────────┘

                       ┌──── VENUE ──────────┐
                       │ scouting            │
                       │   → shortlisted     │
                       │   → booked          │
                       │   → contract_signed │
                       │   → confirmed       │
                       │   → cancelled       │
                       └─────────────────────┘

                       ┌──── SPEAKER BENCH ──┐
                       │ per-speaker state   │
                       │ (event_speakers     │
                       │  junction):         │
                       │   invited           │
                       │   → accepted        │
                       │   → confirmed       │ ← optionally triggers
                       │   → spoke / cancel  │   incremental announcement
                       └─────────────────────┘

                       ┌──── LOGISTICS ──────┐
                       │ pending             │
                       │   → AV_confirmed    │
                       │   → catering_set    │
                       │   → run_of_show_done│
                       │   → ready           │
                       └─────────────────────┘

                       ┌──── REGISTRATIONS ──┐
                       │ closed              │
                       │   → open            │ (driven by PUBLICATION=published)
                       │   → filling         │
                       │   → at_capacity     │
                       │   → frozen          │ (final headcount for venue)
                       └─────────────────────┘

                       ┌──── TIMELINE PHASE ─┐
                       │ (cron-driven        │
                       │  computed state):   │
                       │ ideation → scoping  │
                       │   → t-30, t-7, t-1  │
                       │   → live            │
                       │   → ended           │ ← post-event flow (Sprint 1.1)
                       │   → recapped        │
                       │   → archived (90d+) │
                       └─────────────────────┘
```

**Crucial:** `PUBLICATION=published` does NOT require `SPEAKER BENCH=all confirmed`. Operator can — and should — announce as early as scope + date + venue + first speaker are locked. Remaining speakers confirm in parallel; each confirmation can fire an **incremental announcement** (Sprint 1 has the dispatcher for this — new intent `speaker_added`).

**Data model implications** (BA addition):
- `events.publication_status` (the current `events.status` field, scope unchanged)
- `events.venue_status`, `events.logistics_status` — new enum fields
- **`event_speakers` junction collection** (new — NOT in current schema; speakers collection from 5.5/1 has no event linkage yet): `(event, speaker, status, invited_at, confirmed_at, talk_title, talk_abstract, cancelled_reason)`. Adds the per-speaker-per-event state machine.
- `events.lineup_state` (computed view): "{N} of {M} speakers confirmed" — drives the public event page's "Speakers" section + the incremental-announcement trigger.
- `events.timeline_phase` (computed by cron based on `starts_at` / `ends_at` / `lineup_state`)
- `events.event_retrospective` text (post-event operator notes — surface for cross-country knowledge sharing, Sprint 2.6)

**Sprint impacts:**
- **Sprint 1.1 extended:** add `speaker_added` intent. When `event_speakers.status` flips `accepted → confirmed`, fire incremental announcement to (a) registered attendees ("Speaker N joins the lineup!") and (b) public event page updates lineup. Idempotent (skip if announced for this speaker already).
- **Sprint 1.4 extended:** the T-7 days "speaker brief refresh" reminder iterates over `event_speakers` where `status=confirmed`, not a single event-level field.
- **Sprint 2.4 country dashboard:** event row shows mini-status per workstream ("📣 published / 🏛 venue confirmed / 🎤 3/5 speakers / 📋 logistics 70%") instead of one status badge.
- **Sprint 3.3 speaker cabinet:** speaker sees per-event state — "you're CONFIRMED for event X" vs "you've been INVITED to event Y, please respond by Z." Not just a flat list of bookings.
- **Sprint 5.4 social cards:** card regenerates on `lineup_state` change so shared links always show the current speaker list.

**What this changes about the original PM plan:** the `speakers-pending → speakers-confirmed → published` sequence is wrong and was deleted. Publication runs ahead of speakers; speakers confirm asynchronously; both are visible on the public event page; both can trigger broadcasts.

---

## 4. Process flows the platform must support

These are the end-to-end flows the actor lifecycles imply. Each flow names: who triggers it, when, what data moves, what the platform does, what the operator does, what the actor does.

### 4.1 Member onboarding ceremony (registration → first event)

| Trigger | Channel | Sender | Recipient | Content |
|---|---|---|---|---|
| T+0 (registered) | email + Telegram (if linked) | system | registrant | confirmation + ICS + Telegram opt-in link |
| T+1 hour | email | system | registrant | "what to expect" + venue map + speaker bios |
| T+3 days OR T-7 days (whichever later) | email or in-app | system | registrant | "3 people you might want to meet" (matching by interests/role/company — Sprint 1.5 surface) |
| T-2 days | preferred channel | system | registrant | reminder + "bring a question for the speaker" prompt |
| T-3 hours | Telegram > email | system | registrant | doors-open + transit + cancel-here link |
| T+1 day post-event | preferred channel | system | attendee | CSAT + photos + recording link + "register for event 2" |
| T+7 days post-event | preferred channel | country lead (operator-assisted) | non-returner | personal-style nudge: "what would make event 2 worth your time?" |

**Coverage:** Sprints 1.1, 1.4, 1.5. The T+7 nudge requires a "lapsed prospect" queue in the workspace operator dashboard (Sprint 2.4).

### 4.2 Speaker pipeline

```
                              ┌─────────────────────────────┐
                              │ Speaker referral             │
                              │ (T+3 days post-event,        │
                              │  speaker cabinet auto-prompt)│
                              └──────────────┬──────────────┘
                                             │
                                             ▼
[Cold outreach by operator]──►[Twenty: prospect record]──►[invitation drip via dispatcher]
                                             │
                                             ▼
                                  [prospect accepts]──►[create speaker record + cabinet invite]
                                             │
                                             ▼
                                  [Speaker fills cabinet profile + talk abstract]
                                             │
                                             ▼
                                  [Operator reviews abstract in workspace approval queue]
                                             │
                                             ▼
                                  [Event day-of logistics handoff]
                                             │
                                             ▼
                                  [Event happens]
                                             │
                                             ▼
                                  [Post-event: dispatcher sends thank-you + 
                                   recording link + "who next?" referral prompt]
                                             │
                                             └──► (back to top of loop)
```

**Build coverage:** Twenty pipeline view (Sprint 3.2a), speaker cabinet (Sprint 3.3), referral prompt as Sprint 1.1 auto-flow. **Reusable brief template** lives in Directus as a CMS asset (operator picks the variant per speaker; system fills name/event/date placeholders before sending).

### 4.3 Sponsor pipeline (CRM-driven; cabinet is downstream)

```
Operator: prospect identified
  ↓
Twenty pipeline (Sprint 3.2a): Prospect → Contacted → Qualified → Proposed → Signed
  ↓ (signed = LOI + invoice)
Invoicing integration sends invoice (open decision — Xero / Stripe / manual; see §10)
  ↓ (paid)
Operator: marks sponsor as activated in Twenty → automation creates sponsor record in Directus
  + sends cabinet invite + creates sponsorship_deliverables checklist
  ↓
Sponsor: logs into cabinet (Sprint 3.2) → reviews deliverables, downloads marketing assets,
         agrees on lead-share scope
  ↓
[Event happens]
  ↓
T+1 day post-event: dispatcher generates sponsor report PDF (Sprint 3.5) →
                    sponsor cabinet surfaces "your event 5 report ready" notification
  ↓
T+30 days post-event: operator-assisted message: "renewal discussion?"
  ↓
Renewed | Churned (Twenty pipeline closes)
```

**Build coverage:** Sprint 3.2a (Twenty pipeline view), Sprint 3.2 (cabinet), Sprint 3.5 (auto report). **Invoicing decision blocks Sprint 3.2** — without it, the cabinet UX can't decide whether sponsors pay in-cabinet or get external invoice links.

### 4.4 Operator → country-lead handoff

```
[Engaged member identified in target country]
  ↓ (operator informal conversation, NOT in platform yet)
[Trial: candidate co-hosts 1 event with operator shadowing]
  ↓
[Operator decision: ready?]
  ↓ (yes)
[Formal offer per compensation model — OPEN DECISION blocking §10]
  ↓ (accepted)
[Viktor: adds candidate to Authentik group `country_lead_kz`]
  ↓
[Sprint 2.2 RBAC sync service: webhook fires → applies in Directus + Twenty + Plausible]
  ↓
[Sprint 4.2 activation wizard: walks new country lead through first-event creation,
 sponsor pipeline tour, CSAT setup, dashboard introduction]
  ↓
[Trust-transfer ceremony: announcement to existing community —
 "meet your new {country} lead" — operator-assisted broadcast]
  ↓
[Quarterly check-in calendar entry created in workspace —
 compensation/scope review every 90 days]
```

**Build coverage:** Sprint 2.2 (RBAC sync), Sprint 4.2 (wizard), Sprint 4.3 (runbook). **Candidate evaluation checklist** lives in operator playbook (Sprint 0.7).

### 4.5 Cross-country knowledge sharing (franchise discipline)

```
Country lead X tries an experiment (e.g., switches venue type → CSAT +0.3)
  ↓
Per-event retrospective field captured (Sprint 1.1 — add `event_retrospective` text)
  ↓
Workspace cross-country dashboard (Sprint 2.6) surfaces:
  - "this month's top-CSAT events across countries"
  - "experiments tagged for replication"
  - country-over-country attendance, CSAT, sponsor count
  ↓
Monthly all-leads sync (calendar event in workspace, rotating note-taker)
  ↓
Notes captured back into operator playbook (Sprint 0.7) with country variants
```

**Build coverage:** Sprint 0.7 (playbook), Sprint 1.1 (retro field), Sprint 2.6 (cross-country dashboard).

### 4.6 Crisis playbook (deferred to Phase ζ)

Out of scope for first 90 days, but listed here so it's not forgotten. Phase ζ.7 covers: sponsor pull-out 48h before event, speaker no-show, venue cancel, negative-incident-at-event (harassment, content controversy), operator burnout/departure, brand crisis (controversial speaker, sponsor exposed).

Each scenario needs: decision tree, comms templates, escalation contacts, member-trust-and-safety policy, code of conduct enforcement, member ban flow.

---

## 5. Implicit assumptions to challenge

These are operator beliefs the plan currently bets on. Each has an alternative interpretation; pick deliberately rather than by default.

| Assumption baked into plan | Alternative read | Recommendation |
|---|---|---|
| **Automation everywhere is good** | Some operator touch creates relationship density that's the moat | Distinguish "pure automation" vs "operator-assisted" per Interaction intent. Dispatcher has `requires_operator_approval` flag + workspace approval queue. |
| **Members want privacy by default** | AI engineers want SOCIAL PROOF (visible attendance, public profile, leaderboard rank) | Default to social-proof-friendly visibility. Opt-out, not opt-in, for profile / attendee list. Add `members.visibility_*` fields in Sprint 5.6. |
| **Sponsors want self-service** | Enterprise sponsors want a salesperson; self-service is for renewals + small sponsors | Two-track onboarding: high-touch (Twenty pipeline) + self-serve form. Sprint 3.2 split into 3.2a (pipeline) + 3.2 (cabinet). |
| **Speakers want a cabinet to manage** | Speakers want a competent producer; cabinets should be read-mostly | Speaker cabinet (Sprint 3.3) is mostly read (stats, calendar, recordings); one high-value write action (propose-next-talk). No bio editing UI; LinkedIn handles that. |
| **All countries are alike** | UZ ≠ KZ ≠ TJ in language, channel preference, audience size | Sprint 4 country provisioning includes a structured `country_profile` (default locale, currency, time zone, holiday calendar, channel routing defaults, default reminder cadence) — Sprint 4.5. |

---

## 6. Behavioral risks + mitigations

Designing for the median actor is easy; designing for the misuse case is the BA's job. Each risk below is a known pattern from comparable platforms.

| # | Risk | Mitigation | Owner sprint |
|---|---|---|---|
| 1 | **Plausible + RBAC = surveillance.** Operators can see which sponsor reps visit which pages. | Disclose what's tracked in privacy notice; conditionally skip Plausible script injection for `is_operator || is_sponsor_rep` users. | Sprint 2 (when workspace lands) |
| 2 | **Brought-a-friend badge → alt accounts.** Predictable gaming. | Badge requires referee to actually attend (not just register); dedupe by email; IP heuristic for blatant cases. | Sprint 5.3 |
| 3 | **Country-lead RBAC → member-data access without bounded use** | Country-lead AUP signed at onboarding; workspace UI shows the member their own "last data access" audit log. | Sprint 2.5 (audit log) + Sprint 4.3 (runbook AUP) |
| 4 | **Sponsor lead lists = privacy landmine.** Sharing attendee contacts without explicit per-event opt-in. | Registration form has explicit, separate "share my contact with event sponsors? [ ]" opt-in (not bundled in EULA). Lead list contains only opt-in attendees. Sponsor cabinet logs every lead-list access for audit. | Sprint 5.6 (visibility prefs) + Sprint 3.2 (cabinet enforces) |
| 5 | **Telegram bot account-linking → presence panopticon.** Operators see exact online timestamps. | Operators see "active/inactive in last 7 days," not timestamps. Use Telegram presence at low granularity. | Sprint 5.5 (bot v0 design) |
| 6 | **"People you might meet" matcher discloses company affiliation.** Some attendees are job-hunting. | Opt-in to appear in matches; show only first name + job title + interests (NOT company unless explicitly enabled). | Sprint 1.5 |
| 7 | **CSAT trend in country-lead dashboard → survey gaming.** Leads pressure members for high scores. | CSAT submissions anonymized at write time; surface as cohort aggregates only, never per-member-per-operator. Sprint 1.2 must respect this in the data model. | Sprint 1.2 |

---

## 7. Build plan: Sprints

Each sprint includes: items with effort estimates, exit gate, and rationale ties back to lifecycles / flows / risks above.

### Sprint 0 — Foundation (week 1–2)

**Goal:** the platform is operable by more than one person, recovers from incidents, and refuses to ship code that introduces known vulnerabilities.

| Item | Output | Effort |
|---|---|---|
| **0.1 — Layered staging on the existing host** (Option A; single-VM constraint) | Three tiers: **(a) `country=demo` tenant** inside existing engines — country leads onboard/train here, isolated by Directus permission policies (`country=demo` rows visible only to users with `is_test_user=true`, default-deny elsewhere); **(b) Coolify PR preview environments** — parallel API+Web per open PR at `pr-<n>.aiqadam.org`, shares engine layer with tenant=demo, torn down on merge; **(c) Local docker-compose** (already exists in `infrastructure/`) for engine-level changes (schema migrations, RBAC sync logic). Emails to test users routed to **Mailtrap** (free tier) via Interactions dispatcher's `if any(recipients).is_test_user → MAILTRAP_API_KEY else RESEND_API_KEY` rule. Plausible pageviews from test users tagged `props.is_test=true` so dashboards exclude them by default. Twenty test contacts get a `Workspace tag = demo`. CI test asserts the dispatcher never mixes real and test routing. | 2 PRs + Coolify PR preview config + runbook |
| **0.2 — Break-glass admin path** | One Directus admin token + one local DB superuser cached at `/tmp/aiqadam-secrets-BREAKGLASS_*`, rotated quarterly. Documented "in case of fire" wrapper in runbook. Solves the Authentik-is-SPOF chicken-and-egg. | 0.5 PR + runbook |
| **0.3 — Supply-chain CI gates** | `pnpm audit --audit-level=high` blocks merge; weekly Trivy scan of every prod image (severity ≥ high blocks); Dependabot for npm + docker + github-actions. | 1 PR |
| **0.4 — Observability v0** (#112 stack + ops-events helper via issue #113; rbac.denied stub pending S2.2 RBAC) | Loki + Promtail for log aggregation (~1.5 GB RAM); Uptime Kuma probing every public endpoint with alerts → Telegram/email; Plausible custom events for auth failures, dispatch failures, RBAC denials. | 1 PR + Coolify config |
| **0.5 — Automated backup restore test** | Monthly CI job: spin up fresh Postgres + ClickHouse, restore latest restic snapshot, assert row counts non-zero. Failure pages Viktor. Converts backup theater into reality. | 1 PR |
| **0.6 — RBAC manifest ADR** (no code) | `docs/adr/0021-rbac-manifest.md` defining: roles inventory, Authentik groups → engine permissions mapping, sync trigger (webhook vs poll), conflict resolution rules, partial-failure handling. Blocks Sprint 2.2. | 0 code, just docs |
| **0.7 — Operator playbook v0** (BA addition) | Notion or Directus document capturing current operator workflows (Binali + Viktor + country leads' how-we-do-it knowledge): venue selection, speaker outreach templates, sponsor pitch deck variants, day-of run-of-show, post-event checklist. Versioned, country variants supported. Becomes training material for country leads in Sprint 4.3. | ~1 week of writing, no code |
| **0.8 — UTM scheme + URL builder** (#105 merged) (Marketing addition) | Per [marketing playbook §16](./marketing-and-pr-playbook.md#16-utm-scheme--attribution-standard): standardize `utm_source` / `utm_medium` / `utm_campaign` / `utm_content` conventions across all marketing links. Build a tiny URL-builder UI at `workspace.aiqadam.org/marketing/url-builder` so operators don't hand-construct UTMs. Lives in `docs/marketing-utm-scheme.md`. **Without this, all marketing attribution is vibes.** | 1 PR |
| **0.9 — Brand asset library + `/press` page scaffolding** [HYBRID — CC builds scaffolding; HUMAN produces brand-judgment assets] (Marketing addition) | Per [marketing playbook §15](./marketing-and-pr-playbook.md#15-brand-assets--ai-design-pipeline): new Directus `marketing_assets` collection (logos, social-card templates, photo library, video library, press-kit zip). Public `/press` page with media kit download (Binali + Viktor bios, fact sheet, logo pack). Production pipeline (Claude Design + ChatGPT Image Generator with Viktor as human-in-loop reviewer) documented in playbook. | 1 PR (collection + page) + concurrent asset production |
| **0.10 — Browser-agent smoke test infrastructure** [CC] (3-lane reframe) | Playwright in CI + GitHub Actions workflow. Test catalog seeded from [UX guidelines §10 task flows](./ux-and-content-guidelines.md#10-task-flows): member registration, /me/preferences toggle, event detail, EULA-gated registration, profile edit, CSAT submit. Visual regression baseline established. axe-core for accessibility checks. **Every subsequent [CC] sprint item adds 1–3 smoke tests to this catalog** (see §7.5 smoke scenarios catalog). | 1 session |
| **0.11 — Production-probe browser agent** [CC] (3-lane reframe) | Scheduled GitHub Actions job (every 30 min) runs Playwright against `https://aiqadam.org` + `https://uz.aiqadam.org` (and per-country subdomains as they activate) testing critical paths: homepage loads, event detail loads, sign-in flow reaches Authentik. Alerts to Telegram/email on failure. Replaces "human notices the site is broken" with "agent notices in <30 min." | 1 session |
| **0.12 — Decision-batch ADR pipeline** [HYBRID — CC drafts; HUMAN reviews weekly] (3-lane reframe) | Claude Code drafts ADRs for open decisions (compensation model, invoicing, revenue phasing, brand asset tooling, etc.) with options + recommendation + tradeoffs. PM reviews batch 1×/week, replies inline "ADR-X = accept option B" or comments for revision. Repository: `docs/adr/`. **First batch closes 9 of 19 open decisions in week 1 with ~1 hour PM time.** | 1 session for first batch |
| **0.13 — Runbook framework** [HYBRID — CC scaffolds; HUMAN fills lived-experience content] (3-lane reframe) | `docs/runbooks/` already exists. Standardize structure: pre-conditions, steps, verification, rollback. Convert ambient operator knowledge to runbooks for: (a) event production day-of, (b) sponsor onboarding handover, (c) speaker invitation, (d) country lead activation, (e) crisis comms triage. Living docs operators reference. Pairs with Sprint 0.7 operator playbook. | 2 sessions |
| **0.14 — Content-quality guidelines as automated checks** [CC] (3-lane reframe) | Brand voice linter (runs on PR for any string-changing file in `apps/web` or `apps/api/src/modules/email/templates`): pattern check for UX §1 anti-patterns ("Hey there!", excessive emoji, "Click here", "Please", "Are you sure?", etc.). Markdown link checker for docs. Astro check + Lighthouse score gate (perf, a11y, SEO ≥ 90) in CI. | 1 session |

**Sprint-0 exit gate (3-lane verified):**
- **[L2 browser agent verifies]**: `country=demo` tenant exists; test user completes "register → attend → CSAT" with emails landing in Mailtrap (not Resend) — runs as a Playwright scenario in CI.
- **[L2]**: PR preview environment spins up for an open PR (verified by Coolify webhook + agent probe).
- **[L2]**: production probe alerts fire when `https://aiqadam.org/api/health` returns non-200.
- **[L2]**: backup restore CI workflow runs against latest snapshot + asserts row counts.
- **[CC + L2]**: every Sprint 0 PR passes CI gates (Trivy + pnpm audit + Lighthouse + brand-voice linter + axe-core).
- **[HUMAN — 30 min]**: break-glass auth tested by COO logging in via the local admin path (Authentik bypassed).
- **[HYBRID — 1 hour PM time]**: RBAC manifest ADR approved (Sprint 0.6); 9 open decisions closed via decision-batch ADR pipeline (Sprint 0.12).
- **[HYBRID]**: Sprint 0.7 operator playbook scaffolding shipped with at least one section filled by Binali (the "brand + voice" section); remaining sections fill incrementally Sprints 1–4.
- **[HYBRID]**: Sprint 0.9 brand asset library scaffolded; `/press` page renders; at least one branded social card template + one Binali photo + one Viktor photo + fact sheet PDF uploaded.

**Known limitations of layered staging (Option A):** schema-level changes still need Tier 3 local docker-compose validation; host-level changes only test in prod (Coolify rollback as safety net); `country=demo` cohabits prod databases (blast radius unchanged vs current cross-tenant uz/kz/tj — compensated by Directus policies + audit log in Sprint 2.5). Migration path to Option C (Hetzner CX11 ~€5/mo) is drop-in if budget opens up later.

---

### Sprint 1 — Post-event automation + pre-event surfaces (week 2–3)

**Goal:** every event triggers its full lifecycle automation without operator action. Pre-event, members get nudged in ways that build relationship density before they arrive.

| Item | Output | Effort | Serves flow / risk |
|---|---|---|---|
| **1.1 — Event lifecycle automation (multi-workstream)** | Three concurrent flows driven by the parallel state machines in [§3.5](#35-event-lifecycle-parallel-workstreams-not-a-single-state-machine):<br>**(a) Publication flow** — on `events.publication_status: draft → published`, broadcast initial announcement to relevant audience (matches `country`, optionally tagged interests). Intent: `event_announce`. Even if speaker bench is incomplete — operator decides when to publish.<br>**(b) Incremental announcement flow** — on `event_speakers.status: accepted → confirmed`, dispatch `speaker_added` intent to all registered attendees + trigger public event page lineup re-render + regenerate OG/social card (Sprint 5.4 hook). Idempotent per (event, speaker) pair.<br>**(c) Post-event flow** — cron on events where `ends_at < now()` AND `publication_status='published'` AND `post_event_processed=false`. Dispatches: CSAT survey to attendees (intent: `csat`), thank-you to confirmed speakers with "who else should we ask?" referral prompt (intent: `speaker_thanks_with_referral_ask`), "next event" teaser to attendees if one is scheduled (intent: `next_event_teaser`). Marks `post_event_processed=true`. Idempotent. Adds `events.event_retrospective` text field for operator notes (Sprint 2.6 surface). | 1 PR (publication flow + collection fields) + 1 PR (incremental announcement flow + new `event_speakers` junction) + 1 PR (post-event flow) | [§3.5](#35-event-lifecycle-parallel-workstreams-not-a-single-state-machine), [§4.1](#41-member-onboarding-ceremony-registration--first-event), [§4.2](#42-speaker-pipeline), [§4.5](#45-cross-country-knowledge-sharing-franchise-discipline) |
| **1.2 — CSAT response capture** | `POST /v1/feedback/csat` receives survey responses, writes to `interaction_responses` with `response_intent=csat_score`. **Anonymized at write time** — store cohort-level (event_id), never per-member-per-operator linkage. | 1 PR | [§6 risk #7](#6-behavioral-risks--mitigations) |
| **1.3 — CSAT operator surfacing** | Per-event CSAT view in admin (later workspace): avg score, top free-text comments, response rate, distribution histogram. Cross-country aggregation deferred to Sprint 2.6. | 1 PR | [§4.5](#45-cross-country-knowledge-sharing-franchise-discipline) |
| **1.4 — Pre-event reminder cron** | Cron: T-7 days → speakers brief refresh; T-2 days → registrants reminder + "bring a question" prompt; T-3 hours → final reminder + venue + cancel link. Routes via preferred channel (Telegram > email when bot is linked). Idempotent (skip if already sent). | 1 PR | [§4.1](#41-member-onboarding-ceremony-registration--first-event) |
| **1.5 — Pre-event member-to-member matching** (BA addition) | T+3 days post-registration OR T-7 days pre-event: dispatch "3 people you might want to meet" message. Matching: simple co-occurrence over interest tags + job title (NOT company unless opt-in). Requires: new `members.interests` tag field, opt-in `members.appear_in_matches` flag (default true), simple matching query (Directus aggregation, no ML). | 2 PRs | [§4.1](#41-member-onboarding-ceremony-registration--first-event), [§6 risk #6](#6-behavioral-risks--mitigations) |
| **1.6 — Lead capture for non-registrants + 3-email nurture** (Marketing addition) | Per [marketing playbook §3.2](./marketing-and-pr-playbook.md#32-activation--they-take-the-key-action): visitors who give email but don't register today (e.g., "notify me when next event in {city}") get the `lead` user state + a 3-email nurture: T+0 welcome / T+3 "here's why community matters" / T+7 next event preview. Uses Interactions dispatcher. CTA on homepage + event detail + /events pages: "Notify me of new events in {city}." | 1 PR (lead form + collection) + 1 PR (nurture flows) | [§3.1 member lifecycle](#31-member-lifecycle) (lead state) |
| **1.2 extension — NPS on CSAT** (Marketing addition) | Add Q5 to CSAT form (Sprint 1.2): "How likely are you to recommend AI Qadam to a colleague? 0–10." Track quarterly NPS trend. Marketing dashboard surfaces NPS by country + global. | included in 1.2 spec | [§3.3 retention](#33-retention--they-come-back) |

**Sprint-1 exit gate:** event 2 fires its full post-event flow without any operator action; reminders for event 2 fire on schedule; CSAT shows up in operator view; speakers from event 2 get the "who next?" prompt; ≥ 1 registrant for event 3 came from a Sprint 1.5 match-driven nudge.

---

### Sprint 2 — Workspace + RBAC + cross-country dashboard (week 3–6)

**Goal:** country lead in KZ logs into `workspace.aiqadam.org`, sees only KZ data across all engines, publishes a KZ event with no engineer touch, and can compare KZ's performance to other countries.

Depends on Sprint 0.6 RBAC manifest ADR.

| Item | Output | Effort |
|---|---|---|
| **2.1 — `workspace.aiqadam.org` shell** | New Astro app (or sub-path of main web). Authentik SSO, role-aware landing dashboard, application launcher cards (Events / CRM / CMS / Analytics). | 2 PRs |
| **2.2 — RBAC sync service** | Per manifest ADR: webhook from Authentik group change → applies to Directus policy + Twenty workspace + Plausible site. State machine with per-engine status + retry. Partial-failure paths surface in workspace dashboard with retry button (no silent partial state). | 3 PRs |
| **2.3 — Application launcher cards (role+country gated)** | Each card resolves to underlying engine URL with scoping pre-applied (Directus filter token, Twenty workspace, Plausible site). One card per app the user can access. | 2 PRs |
| **2.4 — Country-scoped operator dashboard** | "This week in {country}" widget: events count, registrations delta, CSAT trend, sponsor activity, **pending operator tasks** (lapsed members queue from §4.1 T+7 flow, speaker abstract reviews from §4.2, sponsor renewal nudges from §4.3, operator-assisted Interactions awaiting approval). Built on Metabase queries against `bi.*` SQL views (architecture doc §8). Metabase deploys here, ahead of original Phase 4 schedule. | 2 PRs + Metabase deploy |
| **2.5 — Audit log integration** | Directus `directus_activity` enabled with 1-year retention. Our API emits audit events to same shape. Workspace surfaces "last 50 admin actions" per user. **Member-facing transparency:** `/me` shows the member their own data-access log (who looked at their record, when). | 1 PR |
| **2.6 — Cross-country comparison dashboard** (BA addition) | Workspace view: events count, attendance, CSAT, sponsor count, speaker pipeline depth — country-over-country. "Top experiments to replicate" surface based on tags on `event_retrospective` field (Sprint 1.1). Healthy competition + knowledge transfer. **Marketing addition: cohort retention curves per country + K-factor (referrals per attendee × conversion rate)** per [marketing playbook §3.3, §3.4](./marketing-and-pr-playbook.md#33-retention--they-come-back). | 1 PR + extensions |

**Sprint-2 exit gate:** Viktor adds test user to Authentik `country_lead_kz` group. On their next staging login, they see only KZ events/contacts/analytics across all 4 cards. They publish a test KZ event. RBAC sync log shows ✓ across all engines. Cross-country view shows demo + uz side-by-side.

---

### Sprint 3 — Per-actor cabinets (week 6–9)

**Goal:** sponsors and speakers self-onboard + self-manage. Operator approves once + steps out.

Depends on Sprint 2's RBAC + the **PII data-flow map** (concurrent work — must be written before Sprint 3.2 ships).

| Item | Output | Effort |
|---|---|---|
| **3.1 — Single-origin cabinet routing ADR** | Per architect review: decide explicitly between separate-subdomain SSO maze vs single-origin role-routed (`app.aiqadam.org/sponsor`, `app.aiqadam.org/speaker`). Architect picks single-origin. ADR documents reasoning. Locks 3.2 + 3.3 architecture. | 0 code (ADR) |
| **3.2a — Sponsor pipeline in Twenty** (BA addition, BEFORE cabinet) | Twenty pipeline view: Prospect → Contacted → Qualified → Proposed → Signed → Active → Renewed/Churned. Operator-facing. Pipeline cards link to sponsor record + open opportunities. **Without this, the cabinet is downstream of nothing.** | 1 PR (Twenty config) |
| **3.2 — Sponsor cabinet MVP** | Sponsor rep sees: events they sponsored, opt-in lead list (only registrants who opted in per §6 risk #4), reach metrics, marketing assets download. **Deliverables checklist** per sponsorship (logo placement, slot length, leads agreed, swag distribution — `sponsorship_deliverables` collection). Two-track onboarding: high-touch (operator-initiated via 3.2a) + self-serve "I want to sponsor" form. **Marketing extension:** sponsor co-marketing kit (pre-built logo + tagline graphics, sample LinkedIn/Telegram posts, hashtag guidance, brand voice cheatsheet) per [marketing playbook §10](./marketing-and-pr-playbook.md#10-sponsor-co-marketing-kit). **Marketing extension:** `quarterly_digests` section per [marketing playbook §14](./marketing-and-pr-playbook.md#14-quarterly-sponsor-digest-specification). | 4 PRs + extensions |
| **3.3 — Speaker cabinet MVP** | **Read-mostly** (per BA assumption challenge): calendar of upcoming bookings, past talks with attendance counts, recording links. **One high-value write:** propose-next-talk form (goes to operator approval queue). No bio-editing UI — LinkedIn handles that. **Marketing extension:** speaker amplification kit — branded social cards with speaker's photo + talk title, pre-written LinkedIn/X/Telegram posts (one-click copy), quote graphic generator, personal speaker analytics ("your AI Qadam page got N views"). Per [marketing playbook §11](./marketing-and-pr-playbook.md#11-speaker-amplification-kit). | 3 PRs + extensions |
| **3.4 — Operator approval queue** | Workspace tile listing: pending sponsor onboarding, pending speaker proposals, operator-assisted Interactions awaiting send approval (from §2 thesis 1). One-click approve invokes downstream action. | 1 PR |
| **3.5 — Auto-generated post-event sponsor report PDF** (BA addition) | Template-driven, pulls from Plausible event metrics + registration count + opt-in lead list + photos. Generated T+1 day post-event by event-end flow (Sprint 1.1 extension). Sponsor cabinet shows + downloads. Saves operator 1–2 hours per event per sponsor. | 2 PRs |
| **3.6 — Referral codes schema + API + first-touch/last-touch attribution** (was Sprint 5.1; **moved to Sprint 3 per PM validation 2026-05-19** so 6+ weeks of attribution data accumulates by week 12 instead of 1 week) | `referral_code` on `directus_users` + `referred_by` on `registrations` + mint/resolve endpoints. **Marketing extension:** `acquisition_source` jsonb on registrations capturing first-touch + last-touch UTM params (per [marketing playbook §16.3](./marketing-and-pr-playbook.md#163-attribution-model)). Sprint 5.2 (share buttons) + Sprint 5.3 (referral UI + +25 points + badge) consume this schema. | 1 PR + extension |

**Sprint-3 exit gate:** ≥ 1 sponsor + ≥ 3 speakers onboarded entirely via their cabinet, zero operator hand-holding beyond initial approval click. One sponsor receives auto-generated post-event report PDF.

---

### Sprint 4 — Self-serve country provisioning + country profiles (week 9–11)

**Goal:** Viktor adds country=KG in CMS → KG live in < 10 min, no engineer touch. Country lead onboards through a guided wizard with country-appropriate defaults.

**Open decision blocking sprint:** compensation model for country leads (see [§10](#10-open-decisions-blocking-issues)).

| Item | Output | Effort |
|---|---|---|
| **4.1 — Country provisioning service** | State-machine-backed (per architect review). On `countries.items.create`, sequentially: register Authentik OIDC redirect URI for new subdomain, create Directus permission policy, create Twenty workspace tag, create Plausible site, register Coolify FQDN. Each step idempotent + retriable. State persisted in `countries.provisioning_state`. Surfaces per-step status. | 3 PRs |
| **4.2 — "Activate country" wizard in workspace** | Operator UX wrapping 4.1. Per-step status display, retry button on failure, "go live" confirmation requires all green. | 2 PRs |
| **4.3 — Country-lead onboarding runbook** | After provisioning, workspace walks new country lead through: first event creation, sponsor pipeline tour, CSAT setup, dashboard introduction. **Includes AUP** (acceptable use policy) for member data — country lead must accept before RBAC fully activates. Also documents **trust-transfer ceremony** for existing community. Refers to operator playbook (Sprint 0.7). | 1 PR + docs |
| **4.4 — Staging proof: provision + de-provision 3 times** | Pre-prod requirement: provisioning works AND rolls back cleanly. Tested on `country=demo` tenant, evidence captured in runbook. | Validation work |
| **4.5 — Country profile data model** (BA addition) | Beyond technical provisioning: structured `country_profile` per country — default locale (en / ru / kk / uz-Latn / tg), default currency for sponsor invoices, time zone, public holiday calendar (to avoid scheduling), default reminder cadence, default channel routing (Telegram-primary vs email-primary per country preferences). Country leads tweak in workspace. | 1 PR (schema) + 1 PR (workspace UI) |

**Sprint-4 exit gate:** Add a fourth country (KG or AZ) on staging in < 10 min via wizard. Provision + de-provision cycle works 3 times in a row. Country profile defaults applied (e.g., KG defaults to KGS currency, Asia/Bishkek tz, KG public holidays). KZ activated in prod with real country lead onboarded.

---

### Sprint 5 — Growth loops + bot v0 + member visibility (week 11–13)

**Goal:** referral + share loops compound the influencer-marketing funnel. Telegram bot v0 closes the channel gap. Members control their visibility surface.

| Item | Output | Effort |
|---|---|---|
| ~~**5.1 — referral codes schema + API**~~ | **MOVED to Sprint 3.6** per PM validation 2026-05-19 — so referral attribution data accumulates 6+ weeks by week 12 instead of 1 week. Sprint 5.2 + 5.3 (share buttons + referral UI) remain in Sprint 5 consuming the already-live Sprint 3.6 schema. | — |
| **5.2 — M5.3 share buttons on event detail** | Telegram / X / LinkedIn share with UTM + referral code from 5.1. | 1 PR |
| **5.3 — M5.2b code surfacing + +25 points + Brought-a-friend badge** | UI + points hook + badge issuance. **Anti-gaming:** badge requires referee to actually attend (not just register); email + IP dedupe. | 1 PR |
| **5.4 — Per-event social cards (Satori)** | 1200×630 PNG generated on-demand for OG/Twitter image. Shared event links look slick. | 2 PRs |
| **5.5 — Telegram bot v0** | **Account-link only** (per architect rescope): `/start` + email verification bridge + account-link confirmation. No commands yet — unlocks Telegram-channel delivery for the Interactions dispatcher. Operators see "active/inactive in last 7 days" (not timestamps — risk #5). | 4 PRs |
| **5.6 — Member visibility preferences** (BA addition) | Extend `/me/preferences` with: appear on attendee list (default: yes), appear on public leaderboard (default: yes), appear in "people you might meet" matches (default: yes), share contact with event sponsors (default: **no** — explicit opt-in per registration), show company on public profile (default: no — first name + job title + interests only). Defaults are social-proof-friendly except for sponsor contact (privacy-first there). | 1 PR |
| **5.7 — Listmonk deploy + newsletter v0** (Marketing addition, **DEFERRED to Phase ζ** pending event density of ≥ 4 events/month across countries) | Per [marketing playbook §6](./marketing-and-pr-playbook.md#6-email-marketing--newsletter): Coolify Listmonk deploy + Resend SMTP relay + DMARC/bounce monitoring + monthly digest template + segmentation by country/interests/attendance frequency. First issue produced by PM. | DEFERRED — Phase ζ |
| **5.8 — Marketing dashboard** (Marketing addition) | Per [marketing playbook §17](./marketing-and-pr-playbook.md#17-marketing-dashboard-metrics--dashboards): 6 Metabase pages — Acquisition funnel / Activation+Retention / Referral health / Revenue / Content performance / Event marketing scorecard. Built on `bi.*` SQL views (architecture doc §8). Audience: PM + COO + Board (read-only). | 2 PRs |
| **5.9 — Campaign landing pages** (Marketing addition) | Per [marketing playbook §4.3](./marketing-and-pr-playbook.md#43-paid-channels-capability-built-deployment-deferred): `/welcome/[slug]` Astro dynamic route reading from Directus `landing_pages` collection. Per-campaign tailored landing for influencer/partner/paid traffic. | 1 PR + Directus collection |

**Sprint-5 exit gate:** ≥ 20% of new event-3 registrations have `referred_by` populated. Telegram bot accounts linked for ≥ 30% of members. Member visibility preferences UI live; opt-in sponsor lead-share enforced in Sprint 3.2 cabinet.

---

### Sprint 6+ (Phase ζ) — Content + community-to-community layer (week 13+)

**Goal:** content library + member-to-member layer + hackathon teams + full discovery surface + full bot command suite + crisis-response framework.

| Item | Output | Effort |
|---|---|---|
| **6.1 — Talk recordings + transcripts** | YouTube/Mux integration; Whisper transcripts; searchable past-talks page. | 4 PRs |
| **6.2 — Discourse adoption** | Self-hosted Discourse, SSO via Authentik (de-risk with spike first — confirm config works), embedded into workspace. | 2 PRs + spike |
| **6.3 — Hackathon teams** | Interaction architecture doc §7 collections + team cabinet. | 4 PRs |
| **6.4 — W1.1–W1.5 public discovery pages** | Speakers index, sponsors index, topics, search, archive. Depends on content seeding (manifest-in-git pattern, separate decision). | 5 PRs |
| **ζ.8 — Blog + RSS + posts collection** (Marketing addition) | Per [marketing playbook §5](./marketing-and-pr-playbook.md#5-content-marketing-strategy--editorial-calendar): Directus `posts` collection + `/blog` Astro index + `/blog/[slug]` post template + Atom/RSS feed. Editorial calendar in Directus. Cadence: ≥ 2 posts/month minimum (event recaps + speaker spotlights). | 3 PRs |
| **6.5 — Telegram bot full (D3–D6)** | Organizer commands (`/scan`, `/attendance`, `/announce`), Q&A threads, WebApp views. | 5 PRs |
| **6.6 — i18n cabinets** | RU + UZ-Latn + KK across workspace + cabinets. **Decision Sprint 5:** Tolgee self-hosted (new service) vs i18next files-only (simpler, no admin UI for translators). | 3 PRs |
| **6.7 — Win-back flow for lapsed members** (BA addition, from §3.1) | Member at 60 days inactive → operator-assisted personal nudge; at 90 days → final "we'd love to see you back" email; archive at 180 days (read-only retention per GDPR). | 2 PRs |
| **ζ.7 — Crisis & trust & safety framework** (BA addition) | Code of conduct enforcement, member ban flow, content moderation, sponsor pull-out playbook, speaker no-show backup process, brand crisis comms. Must land BEFORE second country activates (real risk grows with surface area). | 3 PRs + comms templates |

---

### 7.5 Smoke scenarios catalog (Lane 2 — browser agent verification)

Every [CC] sprint item adds 1–3 Playwright scenarios to this catalog. Each runs in CI on PR and as a post-merge production probe. Visual regression baselines tracked per scenario.

| Sprint | Smoke scenarios browser agent runs |
|---|---|
| **0.1** layered staging | (a) test user registers via staging → confirmation email lands in Mailtrap (not Resend); (b) prod user registers via prod → confirmation lands in Resend (not Mailtrap); (c) staging Plausible event has `is_test=true` prop. |
| **0.3** supply-chain CI | (a) PR with intentionally-vulnerable dep is blocked; (b) PR with high-CVE image in compose is blocked. |
| **0.4** observability | (a) Loki captures a sample log line within 60s; (b) Uptime Kuma alert fires on simulated 503. |
| **0.5** backup restore | (a) Monthly CI workflow runs + restore returns non-zero row count + asserts pass. |
| **0.10–0.11** browser agent infra | (a) Test catalog runs on every PR; (b) production probe runs every 30 min + alerts on failure. |
| **1.1a** publication broadcast | Operator publishes event in staging → audience matching country receives `event_announce` email within 60s; idempotency: re-publish doesn't double-broadcast. |
| **1.1b** speaker added | Operator flips `event_speakers.status: accepted → confirmed` → registered attendees receive `speaker_added` email within 60s; OG image regenerates; public event page shows updated lineup. |
| **1.1c** post-event flow | Fast-forward staging time past `ends_at` → CSAT dispatch + speaker thank-you + next-event teaser all fire; `post_event_processed=true` set; second cron tick doesn't re-fire. |
| **1.2** CSAT capture | Submit CSAT via tokenized link → response in `interaction_responses` table + visible in operator surface; resubmit same token → "already responded." Anonymity check: no per-member-per-operator link queryable. |
| **1.4** pre-event reminders | Fast-forward staging time → T-7 speaker brief refresh; T-2 attendee reminder + "bring a question"; T-3h final reminder; each idempotent on second cron tick. |
| **1.5** member matching | 3 staging users register with overlapping interests + opt-in → T+3 matching email lists correct 3 people; opt-out user does NOT appear in others' matches. |
| **1.6** lead nurture | Submit lead form on staging → 3 emails fire on schedule; unsubscribe link works on each. |
| **2.1–2.3** workspace shell | (a) Country lead logs in → sees only their country's data across all cards; (b) super-admin sees all; (c) RBAC denial path returns 403 (not 500); (d) launcher cards gate by role+country. |
| **2.2** RBAC sync | Webhook: add user to Authentik `country_lead_kz` group → within 60s, Directus policy + Twenty workspace + Plausible site permissions all reflect; remove → reverse within 60s; partial-failure surfaced in workspace dashboard. |
| **2.4** country dashboard | Multi-workstream event status renders ("📣 published / 🏛 venue confirmed / 🎤 3/5 speakers / 📋 logistics 70%"); operator approval queue shows pending items. |
| **2.5** audit log | Member opens `/me/access-log` → sees who accessed their record; operator action recorded in `directus_activity` within 60s. |
| **2.6** cross-country dashboard | Cohort retention curve renders for staging + uz data; K-factor calculation matches manually-computed value. |
| **3.0** PII data-flow map | Lints `docs/pii-data-flow.md` for "every PII-containing collection is listed" via grep against schema. |
| **3.2** sponsor cabinet | Sponsor rep signs in → sees only their sponsored events; lead list contains only opt-in attendees; download CSV; auto-generated PDF report renders. |
| **3.3** speaker cabinet | Speaker accepts invitation → status flips; propose-talk form submits to operator queue; per-event state shows correctly. |
| **3.4** approval queue | Operator sees pending items; one-click approve invokes downstream action; rejected items move to "rejected" bucket. |
| **3.5** sponsor PDF | After event end, sponsor cabinet shows "report ready" notification + downloadable PDF with correct numbers. |
| **4.1–4.2** country provisioning | Wizard adds new country → state machine completes all 5 steps; partial failure: retry succeeds; de-provision: reverses all 5 steps; verify on staging × 3 (per architect requirement). |
| **5.1–5.3** referral | Member generates code → URL works; friend registers via code + attends → +25 points + Brought-a-friend badge issued; anti-gaming: same email twice = no double-credit; alt-account same IP = flagged. |
| **5.4** social cards | Event with 1 speaker generates correct OG image; speaker added → image regenerates within 5 min; image matches visual regression baseline. |
| **5.5** Telegram bot v0 | `/start` in Telegram → account-link prompt; email verification → account linked; coarse presence: operator sees "active in last 7 days" (not exact timestamps). |
| **5.6** visibility prefs | Toggle "appear on attendee list" off → public attendee page hides user; toggle "appear in matches" off → user not in others' matching candidates; "share contact with sponsors" default OFF + only opt-in per registration. |
| **5.8** marketing dashboard | All 6 pages render; cohort retention chart matches Sprint 2.6 source; K-factor matches; sponsor pipeline visualization matches Twenty source. |
| **5.9** campaign landing pages | `/welcome/{slug}` reads from `landing_pages` Directus collection; UTM params from URL preserved in `acquisition_source` at registration. |
| **0.14** content-quality linter | PR containing "Hey there!" in copy → CI blocks; PR with brand-color contrast < AA → CI blocks; PR with AI-generated face in commit → visual regression flags. |

**Catalog maintenance rule:** every [CC] sprint item's PR includes (a) the smoke scenarios listed here AND (b) updates this catalog if the item adds new flows. Reviewer (browser agent on subsequent PRs) verifies the catalog stays in sync.

---

## 8. Sprint dependency map + critical path

```
Sprint 0 (foundation) ─── BLOCKS EVERYTHING
         ├──► Sprint 1 (post-event automation + pre-event matching — depends on Interactions = done)
         │
         └──► Sprint 2 (workspace + RBAC + cross-country dash — depends on 0.6 RBAC ADR)
                  │
                  ├──► Sprint 3 (cabinets — depends on 2.2 RBAC sync + PII data-flow map)
                  │      │
                  │      └──► 3.2 sponsor cabinet — additionally blocked by invoicing decision
                  │
                  ├──► Sprint 4 (country provisioning — depends on full Sprint 2)
                  │      │
                  │      └──► 4.3 country-lead runbook — additionally blocked by compensation decision
                  │
                  └──► Sprint 5 (growth loops + bot v0 + visibility prefs — independent of 3+4)
                                                                  │
                                                                  └──► Sprint 6+ (Phase ζ)
                                                                        │
                                                                        └──► ζ.7 crisis framework
                                                                              MUST LAND BEFORE 2nd country
```

**Critical-path estimate (3-lane execution model — see §2.5):**

The OLD estimate was "12 weeks at 2–3 PR/day" — which assumed a human pair-programming team. With Claude Code as primary [CC] executor + browser agent as [L2] verifier + humans only on [HYBRID]/[HUMAN] tagged items, the math shifts.

| Lane | Throughput | Sprint 0 → 5 estimate | Critical-path role |
|---|---|---|---|
| **Lane 1 (Claude Code engineering)** | ~9 substantive PRs per Claude session (observed in this codebase) | **8–12 sessions = 3–4 weeks wall-clock** if humans don't gate | Ships ahead; ready before humans need it |
| **Lane 2 (Browser agent verification)** | Runs on every PR + every 30 min in production; report-review time only | Continuous; no calendar impact | Replaces "human verifies in browser" |
| **Lane 3 (Humans — irreducible)** | Decisions (1 hr/week PM batch); recruitment + sales (relationship-paced 4–12 weeks); event execution (per-event; ~1 day each); founder content (2 posts/week Binali) | **8–12 weeks wall-clock** for sponsor pipeline maturation, KZ country lead recruitment, event cadence | **Actual critical path** |

**The 90-day "launch ready" gate is bounded by Lane 3, not Lane 1.** Engineering ships the full Sprint 0 → 5 in ~3–4 weeks of Claude Code sessions; the platform is then waiting for:

- KZ country lead onboarded (depends on outreach + compensation decision)
- 3+ active sponsors with cabinets in use
- 4+ events per month (across countries) — unlocks newsletter (Sprint 5.7 deferred condition)
- First quarterly sponsor digest produced (depends on accumulated event data)
- Telegram broadcast channels launched per country (operator-paced)
- LinkedIn org page + founder content cadence sustained (Binali-paced)

**Composite milestone (realistic):**
- **Engineering-ready: end of week 4** (Sprint 0 + 1 + 2 + parts of 3 shipped)
- **First KZ event possible: week 6–8** (engineering ready; gated on country lead + venue + speakers)
- **First quarterly sponsor digest: week 12** (gated on 3 events worth of data + 3 active sponsors)
- **Phase ζ complete: weeks 12–18** (recordings, Discourse, hackathon teams, full bot — paced by content writers + community managers existing)

**Replaces previous "90-day window covers Sprints 0–5 with room for slip"** — accurate framing is **"engineering ready in 4 weeks; operator/human work paces actual launch milestones (8–14 weeks)."**

Sprint dependency graph remains valid; what changed is the rate at which dependencies clear.

---

## 9. What we're explicitly NOT doing

- ~~**Paid ad acquisition**~~ **CORRECTED 2026-05-19** — paid ads are a **deferred capability**, NOT permanently excluded. Infrastructure (UTM scheme, attribution, landing pages) ships in Sprint 5 so paid is launchable on day 1 when triggered. See [marketing playbook §4.3](./marketing-and-pr-playbook.md#43-paid-channels-capability-built-deployment-deferred) for deployment triggers.
- **Multi-language member-facing UI beyond EN+RU** — UZ-Latn / KK polish defers to Sprint 6.6
- **Native mobile app** — Telegram bot is the mobile surface for Central Asia; native defers to post-10k members
- **Discourse before workspace** — embedded into workspace (Sprint 6.2), not a parallel destination
- **Sponsor "tier" pages** (logo + bronze/silver/gold) — sponsors get cabinets + leads + slots + custom deliverables, not vanity placement
- **Custom RBAC role-store** — Authentik is canonical; we sync from it, never duplicate it
- **Sub-second analytics queries** — Metabase + Postgres is plenty for QAM scale; ClickHouse-as-OLAP defers to post-50k events
- **Speaker thank-you as a standalone Sprint item** — folded into Sprint 1.1 generic post-event flow
- **Per-tenant database isolation in initial deploy** — `country=demo` cohabits with prod databases (architect-acknowledged trade-off; Sprint 2.5 audit log + Sprint 0.1 Directus policies are the compensating controls)
- **Speaker bio editor in cabinet** — cabinet is read-mostly; LinkedIn handles bio management
- **Operator notification spam for low-priority items** — operator approval queue (3.4) batches operator-assisted items; only crisis items push real-time alerts

---

## 10. Open decisions (blocking issues)

These must be resolved before the named sprint can ship.

| Decision | Blocks | Owner | Notes |
|---|---|---|---|
| **Country-lead compensation model** | Sprint 4.3 (onboarding runbook) | PM | Volunteer-with-title vs revenue-share vs part-time salary vs hybrid. Biggest non-technical unknown for scaling. PM should drive answer by week 6. |
| **Invoicing integration** | Sprint 3.2 (sponsor cabinet UX) | PM | Xero / Stripe Invoicing / manual link to external invoice. Determines whether sponsors pay in-cabinet or get an external invoice link. |
| **Single-origin cabinet routing (A/B/C)** | Sprint 3.1 (ADR), then 3.2 + 3.3 | Architect | Architect picks Option C (single-origin role-routed: `app.aiqadam.org/sponsor` etc). Confirmed at planning, ADR makes it formal. |
| **i18n approach (Tolgee vs files-only)** | Sprint 6.6 (cabinets i18n) | PM + architect | Tolgee = new service + translator-friendly admin; files = simpler + harder to coordinate. Decide during Sprint 5. |
| **Plausible behavior for operators/sponsors** | Sprint 2 (workspace launch) | Architect | Surveillance risk (§6 risk #1). Recommend conditional script injection skip for `is_operator || is_sponsor_rep`. |

---

## 11. Concurrent operational work (parallel to engineering sprints)

Non-blocking but in-flight from week 1.

### Operator-side
- **Schedule event 2 in Tashkent + announce date** — gives Sprint 1's reminders something real to fire against
- **Identify KZ country lead** — Sprint 2's RBAC needs a real test subject by week 4
- **Reach out to first 5 sponsor prospects** using event-1 attendance numbers as proof — Sprint 3's sponsor cabinet needs first sponsors by week 7
- **Compile event-1 photo set + 1-page recap PDF** for influencer/partnership outreach
- **EULA legal brief** (triggered by 5.5/2 EULA schema) — lawyer engagement, ~3 week turnaround. Start now so text lands by Sprint 3 when sponsor cabinet's terms surface.
- **Quarterly check-in calendar for country leads** — set up recurring meeting cadence even before Sprint 4 ships, for any current trusted volunteers

### Engineering-parallel (small, non-blocking)
- **PII data-flow map** (`docs/pii-data-flow.md`) [HYBRID — CC drafts from codebase + privacy research, PM reviews via decision-batch ADR pipeline (Sprint 0.12)] — week 2. **Blocks Sprint 3.2**. Reframed from purely-human to hybrid execution under the 3-lane model.
- **Runbooks** (`docs/runbooks/`) [HYBRID — CC scaffolds, HUMAN fills lived-experience content per Sprint 0.13] — Index of: event production day-of, sponsor onboarding handover, speaker invitation, country lead activation, crisis comms triage, EULA acceptance audit, photo consent flow at events. Living docs that replace ambient operator knowledge with codified procedure.
- **Vendor exit-strategy ADRs** — one short ADR per major dep (Authentik, Directus, Twenty, Plausible, Coolify). Week 4. Architect-flagged. Not blocking.
- **Cost / scale ceiling modelling** — at 1k / 5k / 25k members, where does the architecture break? Week 5. Informs Sprint 6 design.
- **SOPS or Bitwarden secrets lifecycle** — adopt before week 6 when first non-Viktor admin joins.
- **Country-lead AUP draft** (acceptable use policy for member-data access) — needed for Sprint 4.3; lawyer review optional.

### Marketing concurrent (per [`marketing-and-pr-playbook.md`](./marketing-and-pr-playbook.md))
- **Telegram broadcast channels** (per country — currently only Telegram GROUP exists in UZ; broadcast channel absent) — country leads launch
- **LinkedIn organization page** (Viktor's personal page currently the only LinkedIn presence) — PM sets up + assigns cadence ownership
- **`media_contacts` Twenty view** (press list management, ready for when first inbound press request lands) — concurrent
- **`influencer_partners` + `community_partners` Twenty views** (pipeline like sponsors) — concurrent
- **Founder content cadence** (Binali 2/week LinkedIn + monthly long-form essay) — concurrent operator habit
- **Photo + video producer relationships** — concurrent, per country

---

## 12. Architect review pushback (preserved as record)

Captured 2026-05-19, all items folded into the plan above.

### P0 — folded into Sprint 0
1. **RBAC sync underspec'd** → 0.6 RBAC manifest ADR
2. **No staging environment** → 0.1 layered staging on existing host (Option A; single-VM constraint). Original "separate VM" recommendation parked for Option C (~€5/mo) if budget opens.
3. **Authentik = SPOF, no break-glass** → 0.2 break-glass admin

### P1 — folded into Sprint 0 + later sprints
4. **Country provisioning isn't atomic** → 4.1 state-machine design (Sprint 4)
5. **Per-actor cabinets subdomain maze** → 3.1 single-origin ADR (Sprint 3)
6. **No observability** → 0.4 observability v0 (Sprint 0)
7. **Backup verification is theater** → 0.5 automated restore test (Sprint 0)
8. **No PII data-flow map** → concurrent engineering work, blocks Sprint 3.2
9. **Telegram bot account-linking underestimated** → 5.5 rescoped to account-link-only

### P2 — folded into later sprints / concurrent work
10. **Secrets lifecycle no rotation/audit** → concurrent (SOPS or Bitwarden, week 6)
11. **Supply-chain security zero coverage** → 0.3 CI gates (Sprint 0)
12. **Cost / scale ceiling not mapped** → concurrent engineering work
13. **Vendor exit strategy missing** → concurrent (one ADR per dep)
14. **No audit log for admin actions** → 2.5 audit log integration (Sprint 2)
15. **i18n strategy across cabinets undecided** → 6.6 (Sprint 6) but decided in Sprint 5

### Phase η — exit dignity (architect addition)
For every engine in the stack, document the export-and-leave path before we depend on it for years. If Authentik license/governance turns, what's the path to Keycloak? If Twenty BSL conversion fails, what's the path to Attio / HubSpot? You don't build these migrations — you document them so the time-to-recovery is a week, not 6 months. Concurrent ADR work, no code.

---

## 13. BA analysis preserved (this document's v3 layer)

The BA-added artifacts above are not optional polish — they're the difference between a feature catalog and a working operational system. Specifically:

- **Actor lifecycles** (§3) define the state machines every sprint serves
- **Process flows** (§4) describe what humans + system do at each transition
- **Implicit assumptions** (§5) call out where the default interpretation may be wrong
- **Behavioral risks** (§6) name the failure modes humans-using-the-system create
- **Metrics critique** (§1) replaces vanity metrics with quality-paired metrics
- **Sprint additions** — 0.7 (operator playbook), 1.1 referral-prompt extension, 1.5 (member matching), 2.6 (cross-country dashboard), 3.2a (Twenty pipeline), 3.5 (sponsor report PDF), 4.5 (country profile), 5.6 (visibility prefs), 6.7 (win-back flow), ζ.7 (crisis framework) — all originate from process gaps the feature-only plan missed.

When in doubt, re-read §2 (Strategic theses) and §3 (Actor lifecycles) before designing a feature. Build to move actors up the trust ladder, not to maximize automation count.
