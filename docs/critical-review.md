# Critical review — the 16-sprint roadmap, through community-builder + PM lenses

> Drafted 2026-05-19 at user request: "Critically review it as a community builder and product manager, the goal is to enable community building at scale with limited core team effort."
>
> This is genuinely critical. I'm going to argue against several decisions I made earlier in the same conversation. Take the recommendations as proposals, not declarations.

---

## The two lenses

**Community-builder asks**: Will members talk to each other? Is there an engagement loop that runs without me poking it? Do voices get amplified? Do volunteers emerge? Does the platform get more valuable as more people join?

**Product manager asks**: What's the north-star metric? What's the smallest shippable v1? What's premature optimization? What's the time-to-first-value for a new user? What's the cost-of-delay on each sprint?

**Founder constraint**: limited core team effort. Anything that requires constant operator labor doesn't scale. Anything that requires building from scratch when a mature tool exists is waste.

---

## 12 problems with the current roadmap

### 1. The roadmap optimizes for the org's machine, not the member's first 7 days

Trace a brand-new member's journey through what we'd ship:

1. Hears about AI Qadam (no acquisition plan exists in the roadmap)
2. Visits website — sees one event listing, partners row, no other content
3. Registers — email confirmation
4. Attends — CSAT email next day
5. ... silence until the next event ships

**That's an event ticketing site, not a community.** Where's the "welcome to the tribe" moment? The introduction to other members? The discovery of like-minded people? The first dopamine hit of belonging? Nothing in the 16 sprints answers this.

### 2. Sponsor work is the cart before the horse

Sprints 5.7, 9, 11, 12, 13 = ~5 sprints of work optimizing for sponsors who don't exist yet because we don't have a critical mass of members for sponsors to want to pay for access to. **You sell sponsorship after you have an audience, not while building one.**

Phase A (operator-mediated, Sprint 5.7) makes sense — validates the data model with one or two friendly sponsors. Phases B/C/D should wait for `>= 100 active members per country` as the gating metric, OR slip behind growth work entirely.

### 3. No member-to-member connection in the entire roadmap

Member ↔ Operator: covered (everything Sprint 5.5 onwards).
Member ↔ Sponsor: covered (Phase B+).
Member ↔ Speaker: covered (Sprint 9).
**Member ↔ Member: completely missing.**

The closest is "hackathon teams" (Sprint 10) — scoped to one event type, not general-purpose. A real community needs:

- Member directory: find others by topic interest, country, city
- Follow / connection: "Bob is now following Alice"
- DM (mediated, opt-in): "ask Alice a question about her talk"
- Mentorship matching: senior offers to mentor junior on a topic
- Discussion threads on events (questions before, recap after)

Without these, AI Qadam is a broadcast list. Communities form WHERE members talk to each other, not where the operator talks to members.

### 4. No volunteer / ambassador architecture

"Limited core team effort" + "scale community" = **volunteers do the work, you get the credit**.

Where are:
- Country ambassadors (one trusted member per country who can publish events, moderate, recruit)
- Topic moderators (someone who curates the AI/ML topic page, suggests events, answers questions)
- Translator volunteers (Sprint W3 i18n needs them — who translates?)
- Mentor / mentee program
- Recognition mechanics for contributors (badges, levels, hall-of-fame)

The current roadmap has zero infrastructure for this. Every operator task is operator-only.

### 5. Content engine missing — what fills the time between events?

An AI engineering community holds maybe 2 events per country per month. Between events: silence. What keeps members opening the bot, opening the website, opening the email?

- Blog / articles? Not in plan.
- Q&A forum? Not in plan.
- Weekly digest of community happenings? Not in plan.
- Highlighted member contributions? Not in plan.
- Open discussion threads? Not in plan.

A community with no between-event content has 0% engagement except in event-weeks.

### 6. Engagement loops are one-way, not feedback loops

"Notification" is mostly the platform talking to members. Community engagement is bidirectional:

- Member registers → community sees ("Alice joined AI Drinks UZ" public-ish)
- Member completes profile → badge → social proof generates more profile completes
- Member earns streak → daily-login motivation
- Member writes recap → others react → recapper gets boost
- Member helps another → contribution score → ambassador track

Streaks, public-ish moments, reactions — the core dopamine mechanics of every successful community platform. **None of this is in our roadmap.**

### 7. Discovery / acquisition is Sprint W4 = late by 4 months

How does a new person find AI Qadam in our plan?
- Organic search: W4 (sprint #15 out of 16)
- Referral: W4
- Social share: W4
- Public profiles for SEO: W2 (sprint #9)

Acquisition mechanics should be FIRST, not LAST. With limited team effort, every member who refers another doubles your reach for free. Building referral mechanisms in month 5 instead of month 1 = months of missed compounding.

### 8. Speaker side is severely under-invested

Speakers in CIS AI ecosystem are scarce + extraordinarily valuable. A great speaker can fill a room, attract sponsors, draw press. The roadmap gives speakers:

- One PR in Sprint 9.5 (speaker cabinet)
- A page in W1.1
- CSAT in Sprint 8

Where's:
- Talk submission form (CFP — call for papers)
- Speaker portfolio (talks given, ratings, topics, recordings)
- Speaker invitation system (operator invites prospect; prospect responds)
- Speaker payment / honorarium tracking
- Speaker → speaker connections (recommend each other)
- Speaker office hours / Q&A sessions

This is a high-leverage actor under-modeled.

### 9. Operator-approval-for-everything doesn't scale

Plan: every sponsor send requires manual approval until Sprint 12. Newsletter dispatch is operator-triggered. Event publishing is operator-only. CSAT scheduling is operator-configured.

With 2 operators and 3 countries, that's the operator becoming the bottleneck on every flywheel. **Defaults need to be self-serve with guardrails**, not "ask permission". Rate limits + spam scoring + reputation reduce review burden by 10× vs manual queue.

### 10. The roadmap is sequential, fragile, and 5 months long

16 sprints in strict order. If Sprint 6 (Telegram bot, biggest single sprint) takes 3 weeks instead of 1, **everything slips by 2 weeks**.

A community builder's plan is phased by outcomes, not sprints:
- Phase 1 (4 weeks): "First 100 active members per country"
- Phase 2 (8 weeks): "Members come back monthly"
- Phase 3 (8 weeks): "Members talk to each other"
- Phase 4 (8 weeks): "First sponsor success story"
- Phase 5 (8 weeks): "Self-running engine"

Each phase has a TARGET METRIC. Sprints are the tactical decomposition INSIDE a phase. If a sprint doesn't move the phase metric, cut it.

### 11. No north-star metric defined

Every sprint's value is debatable without one. Candidates:
- **WAM** (weekly active members) — interaction count > 0 in last 7 days
- **Repeat attendance rate** — % of attendees who come to a second event within 90 days
- **Member NPS** — single survey question, aggregated
- **Events per country per month** — supply side
- **Member-initiated interactions per week** — community vitality

My pick for AI Qadam: **Member NPS** + **Repeat attendance rate**. Both are LAGGING but capture what matters (do members come back; do they recommend). Track WAM as a leading indicator.

Without these, we're building features we *think* matter.

### 12. "Build everything" assumption — what about adoption?

For limited team effort, the question is always: **what's the absolute minimum we must build vs what can we adopt?**

Existing mature tools in our space:

| Capability | Existing tool | Why we'd build instead | Verdict |
|---|---|---|---|
| Event ticketing + listing | Lu.ma, Eventbrite, Meetup | We need multi-tenancy + custom registration + tight CRM/CSAT loop | **Probably worth building** (already done) |
| Community forum / Q&A | Discourse (OSS, mature, free self-host) | Reinventing a forum is decades of UX work | **Adopt Discourse** instead of building member-to-member |
| Event chat / discussion | Telegram channels (already where members are) | Building chat is decades of work; Telegram does it free | **Use Telegram channels per country/topic**, don't build chat |
| Member directory + profiles | LinkedIn is free + everyone has one | Building "another LinkedIn" is pointless | **Surface LinkedIn URLs on profiles**, don't build a directory |
| Newsletter | Buttondown, Substack, Listmonk OSS | Building a newsletter engine is a project | **Adopt Listmonk** (already in original Phase 2 plan) — defer until we have content |
| Live streaming / recordings | YouTube, Twitch, Vimeo, Restream | Building video infra is insane | **Embed YouTube** for recordings, link to live streams |
| Calendar integration (ICS, Google Calendar) | iCalendar standard | Trivial to add | **Build** (it's a 100-line generator) |
| Polls / quick questions | Telegram polls native | Building polls is unnecessary work | **Use Telegram polls** in the bot |

**Major realization**: A "community forum" (Discourse) integrated with our auth + identity is dramatically more valuable than building member-to-member from scratch. Discourse has:
- Categories per topic
- Threaded discussions
- Likes / reactions / badges (built-in!)
- @-mentions, notifications
- Moderation tooling
- Trust levels (=ambassador system, free)
- Free OSS, self-hostable
- OIDC SSO support (works with our Authentik)

**Recommendation: adopt Discourse as the Member↔Member layer.** Sprint X = "Deploy Discourse + SSO + Twenty contact sync". ~1 sprint of work for what would otherwise be 5+ sprints to build poorly.

---

## What this critique implies for the plan

### What to CUT

- **Sponsor Phase D — Stripe payments (Sprint 13)** — delete until we have 5+ paying sponsors. Premature.
- **Sponsor Phase C — self-serve compose (Sprint 11)** — delete or defer 6+ months. Manual operator-composed messages cover us until ~20 sponsors.
- **Workflows engine (Sprint 12)** — delete unless we hit a real workflow case. Rules are sufficient at low scale.
- **Settings + experiments (Sprint 5.6)** — defer. A/B testing has no value until traffic justifies it. Hardcode for now, refactor later.
- **Phone 2FA (A7.6)** — defer. Phone OTP for verification yes, 2FA for sign-in is overkill at our scale.

### What to ADD

- **NEW Sprint M1 — Member-to-member layer via Discourse adoption** (1-2 PRs):
  - Deploy Discourse, configure Authentik SSO, set up categories per country + topic
  - Wire Twenty Person ↔ Discourse user; activities mirror into the dispatcher
  - Embed Discourse "latest" feed on the homepage
  - Single biggest community-building lever in the entire plan
- **NEW Sprint M2 — Volunteer / ambassador layer** (3 PRs):
  - `ambassadors` collection (user, country, topics, status); ambassador-only operator actions (publish events for their country, moderate topic discussions, invite speakers)
  - Trust-level mechanics: contributions → unlock abilities (cf. Discourse trust levels for free!)
  - Recognition: ambassador badge, leaderboard tile, monthly shoutout interaction
- **NEW Sprint M3 — Speaker tooling expansion** (4 PRs):
  - CFP submission form (Formbricks — already adopted)
  - Speaker portfolio page (rebuilt from W1.1 with talk archive + ratings + recordings link)
  - Speaker invitation flow (operator invites prospect via dispatcher; prospect responds via cabinet)
  - Speaker honorarium tracking (light, ties into Phase D later)
- **NEW Sprint M4 — Engagement loops** (5 PRs):
  - Streaks (login/visit/registration count per user; surface in bot + /me)
  - Public moments (opt-in "Alice just registered for AI Drinks!" in #announcements Discourse channel)
  - Reactions (👏 / 🔥 on event recaps, member posts)
  - Weekly digest interaction (intent=weekly_digest, auto-composed from the last 7 days of community activity)
  - Recommendations ("you might like this event because…" based on interests + history)
- **NEW Sprint M5 — Acquisition + referral loop** (3 PRs, brought forward from W4):
  - Referral codes with attribution (`?ref=user_id`) → referrer gets points / badge per converted signup
  - Share-to-Telegram/X/LinkedIn on every event with UTM
  - Open Graph + JSON-LD on every public page (was W4)
  - Bring this work to month 1, not month 5

### What to REORDER

| Current order | Proposed order | Rationale |
|---|---|---|
| 5.5 → 5.6 → 5.7 → W1 → 6 → 6.5 → 7 → 8 → W2 → 9 → 10 → W3 → 11 → 12 → W4 → 13 | 5.5 → **M5** → **W1** → 6 → **M1 (Discourse)** → W2 → 8 → **M3 (Speaker)** → **M4 (Engagement)** → 6.5 (BI) → 7 → **M2 (Ambassadors)** → 5.7 (Sponsor A) → 9 (Sponsor B) → W3 → 10 (Teams) → 11/12/13 maybe never | Acquisition + member-member + content loops FIRST; sponsor optimization LAST; only when WAM > N |

### What to RECAST as a phase plan

Replace "16 sprints in order" with 5 outcome phases:

**Phase 1 — Foundation + Acquisition** (~6 weeks, current Sprint 5.5 + M5 + W1)
- North-star: 500 unique website visitors / month, 50 sign-ups / month
- Ships: interaction primitive, share + referral mechanics, public discovery pages
- Cut if you have to: settings (5.6 deferred), sponsor work, BI

**Phase 2 — Member touchpoint** (~6 weeks, current Sprint 6 + M1 + W2 + 8 subset)
- North-star: 30% of new sign-ups return within 30 days; 10% Discourse activity
- Ships: Telegram bot with full member loop, Discourse adopted, /me dashboard, single-question CSAT
- Cut if you have to: Formbricks (defer to phase 4), public profiles (defer)

**Phase 3 — Community vitality** (~6 weeks, M3 + M4 + 10 partial)
- North-star: 100 WAM per country, 50 member-initiated interactions per week
- Ships: speaker tooling, streaks/reactions/digest, hackathon teams
- Cut: workflows engine, anything sponsor-side beyond Phase A

**Phase 4 — Operator leverage** (~4 weeks, 6.5 + 7 + M2)
- North-star: 1 operator can run all 3 countries
- Ships: BI dashboards, full auth provider set, ambassador / volunteer layer
- Cut: Phone 2FA, expensive perf optimizations

**Phase 5 — Monetization** (only when audience exists)
- Gate: 500+ WAM, 3+ inbound sponsor inquiries
- Ships: 5.7 (Sponsor A), 9 (Phase B cabinets), maybe 11/13 if economics justify
- This phase may never happen, and that's fine if the community thrives

---

## What the north-star metric should be

My recommendation: **two metrics, one leading + one lagging.**

- **Leading: Weekly Active Members (WAM)** — distinct users with ≥1 platform interaction (event view, registration, message, Discourse post) in the past 7 days
- **Lagging: 90-day repeat attendance rate** — of users who attended an event in month N, what % attended again by month N+3

Why these two:
- WAM tells you week-over-week whether the community is alive
- Repeat-attendance tells you whether what you're shipping makes people come back
- Both are operator-light to measure (one Metabase view)
- Both align all 4 actor categories (sponsors care because higher WAM = more reach; speakers care because repeat rate is their feedback; operators care because both = job done; members care because higher WAM = more people to meet)

Forbidden vanity metric: "total registered users". Easy to gameable, no relationship to community health.

---

## The biggest single change I'd argue for

**Adopt Discourse. Don't build member-to-member.**

This change alone:
- Saves us 5+ sprints of poorly-built forum/discussion features
- Gives us trust levels (= built-in ambassador system) for free
- Gives us badges (= part of our W2.3) for free
- Gives us notifications, likes, threading, search, moderation tools — all free
- Has OIDC SSO with Authentik — fits our single-source-of-auth principle
- Mature: used by Mozilla, Stack Overflow alternatives, every credible OSS project
- Self-hostable, MIT-ish (GPL-licensed but acceptable for self-host community use)

The cost: one more Coolify stack to maintain, one more identity bridge to wire (Discourse user ↔ directus_users), one more thing for operators to learn. **Massively worth it.**

The user said "before coding yourself, look if there are already zero-cost products". I should have proposed Discourse before proposing W2 + a member directory + a profile system + a discussion mechanism + a notification inbox + badges. Each of those would have been a sprint to build poorly. Discourse does all of them in one container.

---

## What I'd want you to push back on

1. **Cutting sponsor work to Phase A only.** I expect this is unpopular — sponsors are the revenue thesis. But premature sponsor work without an audience is dead code.
2. **Adopting Discourse for community.** Means another stack to operate and possibly disrupts the unified UX vision (Discourse looks like Discourse, not like our brand). Trade-off vs build cost is real.
3. **Cutting settings + experiments to deferred.** Reduces our ability to A/B test the things we'd ship. Risk if we lock in suboptimal defaults early.
4. **Phasing by outcome instead of sprint.** Loses the predictability of "we'll ship Sprint 5.5/3 next Friday." Replaces it with "we'll have 100 WAM by end of June."
5. **Member NPS as a north-star.** It's a SaaS metric; communities sometimes prefer participation metrics. I'd argue NPS is the right call for THIS community (AI engineers = sophisticated users who care about quality), but you might disagree.

---

## What I'd want to do RIGHT NOW

If you accept any of this, the rewrite is:

1. Replace §15 of the architecture doc with a phase-based plan (5 phases, with sprint decomposition inside each)
2. Add Discourse to §18 OSS landscape (with adoption decision)
3. Add §20: North-star metrics definition + how we measure them
4. Add §21: Acquisition strategy (referral mechanics + SEO + community-led growth)
5. Defer Sprint 5.6 (settings), 11, 12, 13 to "Phase 5 (maybe never)"

That's a 1-PR doc update. Then we resume implementation with **Sprint 5.5/1 unchanged** (the foundation work still needed) — but with a clearer view of WHERE WE'RE GOING and which sprints are conditional on traction.

If you want to push back on any of this critique itself (i.e. "no, sponsor stuff actually matters earlier" or "no, Discourse is wrong for our brand"), say so. I'm not married to any of these recommendations — they're the strongest version of "community-builder + PM" thinking I could muster against the plan I'd just shipped.
