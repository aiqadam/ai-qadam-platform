# AI Qadam — marketing & PR playbook

> **Companion to [`community-platform-roadmap.md`](../01-business/community-platform-roadmap.md) and [`ux-and-content-guidelines.md`](../04-development/design-system/ux-and-content-guidelines.md).** The roadmap says WHAT to build. UX guidelines say HOW IT FEELS to members. This doc says HOW WE GROW.
>
> **Audience:** PM (Binali Rustamov), COO (Viktor Drukker), future Community Manager, country leads, Community Volunteering Board, content + design contributors, future PR partner. Engineering-touching items are inherited into the roadmap as new sprint items (see §20).
>
> Authored 2026-05-19 by a marketing manager with 15 years across community + B2B SaaS + tech-conference marketing.

---

## Table of contents

0. [Scope](#0-scope)
1. [Positioning + brand story](#1-positioning--brand-story)
2. [Marketing audience model](#2-marketing-audience-model)
3. [AARRR funnel + metrics](#3-aarrr-funnel--metrics)
4. [Channel strategy](#4-channel-strategy)
5. [Content marketing strategy + editorial calendar](#5-content-marketing-strategy--editorial-calendar)
6. [Email marketing + newsletter](#6-email-marketing--newsletter)
7. [Social media presence + posting cadence](#7-social-media-presence--posting-cadence)
8. [PR + media relations (deferred — hype-building first)](#8-pr--media-relations-deferred--hype-building-first)
9. [Influencer + community partnerships](#9-influencer--community-partnerships)
10. [Sponsor co-marketing kit](#10-sponsor-co-marketing-kit)
11. [Speaker amplification kit](#11-speaker-amplification-kit)
12. [Founder-led growth (Binali + Viktor)](#12-founder-led-growth-binali--viktor)
13. [Event marketing playbook (per event)](#13-event-marketing-playbook-per-event)
14. [Quarterly sponsor digest specification](#14-quarterly-sponsor-digest-specification)
15. [Brand assets + AI design pipeline](#15-brand-assets--ai-design-pipeline)
16. [UTM scheme + attribution standard](#16-utm-scheme--attribution-standard)
17. [Marketing dashboard (metrics + dashboards)](#17-marketing-dashboard-metrics--dashboards)
18. [Crisis comms protocol](#18-crisis-comms-protocol)
19. [Anti-patterns (marketing-specific)](#19-anti-patterns-marketing-specific)
20. [Engineering items inherited into roadmap](#20-engineering-items-inherited-into-roadmap)
21. [Open marketing decisions](#21-open-marketing-decisions)
22. [Cross-references](#22-cross-references)

---

## 0. Scope

**This doc covers:**
- Brand positioning + story for external use
- Marketing audience model (different from product personas)
- AARRR funnel definition + measurement standards
- Channel strategy (owned / earned / paid; even paid is deferred-capability not absent)
- Content production pipelines (blog, video, social, email)
- Partnership templates (influencer, community, sponsor, speaker amplification)
- Founder + COO content cadence
- Event-specific marketing run-of-show (per-event timeline)
- Quarterly sponsor digest as a key deliverable
- Brand asset library structure (production via Claude Design + ChatGPT Image Generator with Viktor as human-in-loop)
- Attribution standards (UTM scheme)
- Marketing dashboard specification
- Crisis comms protocol

**This doc does NOT cover** (lives elsewhere):
- Visual design system (`design-system/*.css` + 22 designed screens)
- Engineering architecture ([`community-platform-roadmap.md`](../01-business/community-platform-roadmap.md), [`interaction-architecture.md`](../04-development/architecture/interaction-architecture.md))
- Product UX details ([`ux-and-content-guidelines.md`](../04-development/design-system/ux-and-content-guidelines.md))

---

## 1. Positioning + brand story

### 1.1 One-line positioning

> **AI Qadam is Central Asia's AI engineer incubator network — where ML engineers, founders, and AI-curious builders across Uzbekistan, Kazakhstan, and Tajikistan come to find collaborators for side-projects, learn from peers ahead of them, and build the regional AI scene.**

(Russian variant — to be hand-localized by native-RU community member, not machine-translated.)

### 1.2 Three-sentence story

> Central Asia has hundreds of working AI engineers and thousands more learning. They're scattered across Tashkent, Almaty, Astana, Dushanbe — each working in isolation, often integrating LLMs into apps that no one else knows about.
>
> AI Qadam brings them into one room (or one Telegram channel) every month. Real talks from real practitioners. Side-projects find collaborators. Hiring happens face-to-face.
>
> Founded by Binali Rustamov in 2026, AI Qadam is run by a distributed team of country leads with a working community across all three Central Asian republics.

### 1.3 Why "incubator network" not "meetup community"

| "Meetup community" framing | "Incubator network" framing |
|---|---|
| You go to listen to a talk | You go to find your next collaborator |
| Speaker = entertainer | Speaker = peer with something to teach |
| Sponsor = logo on a banner | Sponsor = recruiting / distribution / co-founder discovery |
| Members consume | Members build alongside other members |
| Success metric = attendance | Success metric = side-projects launched, hires made, co-founders matched |

The incubator framing matters for: sponsor pitches (higher willingness-to-pay), member retention (status of being part of an incubator network > status of "I go to meetups"), press attention (incubator stories beat meetup stories), and future revenue optionality (demo days, mentorship matching).

### 1.4 Brand values (declarative)

1. **High signal, low noise.** No buzzword-soup talks. Real practitioners only.
2. **Local-first.** UZ/KZ/TJ context, languages, network. Not a Western community in Asian clothes.
3. **Build in public.** Members + community publish numbers, lessons, projects.
4. **Sponsors as partners.** Sponsors get real value (audience, leads, deliverables); members get sponsor-curated job + product opportunities; no logo-theatre.
5. **Speakers as peers.** Speakers are members who have something to share, not booked-and-paid keynotes.

### 1.5 Brand voice for outbound marketing

UX guidelines §1 covers member-facing voice ("Warm. Confident. Specific."). Marketing-facing voice variants:

| Surface | Voice variant | Example |
|---|---|---|
| Press release | Authoritative, factual, numbers-led | "AI Qadam announces 100+ engineers attended its launch event in Tashkent on {date}, with 75% registration-to-attendance conversion — well above the global meetup benchmark of 40–50%." |
| LinkedIn organization post | Professional, aspirational, speaker-credited | "Aigerim Nurlanovna (Kaspi.kz) joined us to talk about RAG at scale. 80+ engineers. Talk recording linked. Next event: {date}." |
| Twitter / X | Concise, quote-led, photo-led | "@AigerimN at AI Qadam KZ today: 'RAG works at 80% recall. Getting from 80 → 95 is where the actual engineering lives.' 📷 [photo]" |
| Telegram channel post | Direct, Telegram-native, low-emoji | "AI Qadam UZ #5 in {N} days. {speaker_names}. Tashkent, {venue}, {date}. Register: {link}" |
| Sponsor pitch deck | Business-formal, outcome-focused, numbers | "Our event 1 attendees: 100+ engineers, 75% attendance, 64% mid-to-senior, 38% from companies with > 50 employees. {Your_company} can: recruit, distribute, find co-founders." |
| Influencer outreach DM | Personal, respectful, specific (not templated) | "Hey {name}, I saw your post on {their_recent_thing}. We're building {our_thing} for AI engineers in CA — would love to have you on as a speaker or share with your network." |

---

## 2. Marketing audience model

Different from product personas (UX §2). Marketing thinks about ICP (Ideal Customer Profile) for each revenue/value stream:

### 2.1 ICP-1: Sponsor decision-maker (THE revenue audience)
- **Title:** Head of Marketing / Head of Talent / VP Engineering / Founder
- **Company:** Tech company hiring AI talent, OR product company wanting to reach AI engineers, OR investor wanting deal flow
- **Geography:** CA-based (Kaspi, Beeline, Halyk, Toptal-CA, etc.) OR international companies expanding to CA OR diaspora-led startups
- **Pain:** Hard to reach high-quality AI engineers in CA. Generic ads don't work. Conferences are expensive. LinkedIn cold outreach has 2% response rate.
- **What we offer:** A curated audience, recurring monthly access, post-event lead lists with explicit consent, deliverables checklist.
- **Channels to reach them:** Binali's LinkedIn (warm), Viktor's LinkedIn (warm), Twenty CRM outbound (cold-to-warm), inbound `/sponsor` form, referrals from existing sponsors

### 2.2 ICP-2: Speaker prospect (key amplification audience)
- **Title:** Engineer (ML/AI), founder, researcher, technical leader
- **Profile:** Has something specific + interesting to share, has a network worth amplifying to, ambitious enough to want speaking visibility
- **Geography:** Primarily CA-based; secondarily diaspora; tertiary international with CA tie
- **Pain:** Few high-quality stages in CA for tech talks. International conferences = travel + visa. Personal blog has small reach.
- **What we offer:** Engaged audience, recording, photos, public profile page, transferable speaker credential.
- **Channels to reach them:** Personal network (Viktor + Binali), speaker referrals (a speaker recommends another), inbound propose-talk form, scouting from local tech Twitter/LinkedIn

### 2.3 ICP-3: Member (the audience sponsors pay to reach)
- See UX §2 personas (Aigerim, Sardor, Karina)
- Marketing-relevant: where do they DISCOVER us? Influencer posts, LinkedIn, Telegram channels they already follow, search ("AI meetup Tashkent"), word-of-mouth from peers, founder/COO personal posts

### 2.4 ICP-4: Community Volunteering Board (governance audience)
- Role: oversight + advisory + relationship maintenance
- Reads: operator dashboards, quarterly digests, financial summary, sponsor health
- Comms: monthly board update email, quarterly review meeting, ad-hoc on major decisions
- Marketing relevance: board members are often well-connected; their endorsements drive credibility

### 2.5 ICP-5: Press / media (deferred audience)
- Local tech journalists at: kursiv.media, tech.kz, Forbes KZ/UZ, MyTech.kg, Bilim Land, RBC.ru regional desk
- International tech press with CA interest: Rest of World, TechCrunch (rare), Sifted (when EU angle exists)
- Pain: hard to find CA tech stories that match Western news frames
- What we offer (eventually): numbers + photos + founder quotes + member case studies
- **Defer this until hype-building has produced enough story-worthy material** — see §8

---

## 3. AARRR funnel + metrics

The marketing organizing framework. Every channel choice, every spend, every infrastructure decision maps to one of these stages.

### 3.1 Acquisition — strangers discover us

**Definition:** A unique visitor lands on `aiqadam.org` (any subdomain) for the first time.

**Sources to instrument:**
- Organic search (Google, Yandex)
- Direct (link clicks from anywhere; UTM-parameterized when possible)
- Social (LinkedIn, Telegram, X, Instagram)
- Referral (member-to-member share with UTM)
- Influencer (sponsored or organic post with UTM)
- Partner (cross-promotion, co-event listing)
- Aggregator (Lu.ma, Meetup.com, AllEvents)
- Press / earned media

**Target metrics by month:**

| Month | Visitors / mo | Notes |
|---|---|---|
| Month 1 (now) | ~500 | Event-2 driven |
| Month 3 | 1,500 | Influencer + LinkedIn ramp |
| Month 6 | 5,000 | Blog SEO compounding + KZ launch |
| Month 12 | 15,000 | Multi-country + content library + press hits |

### 3.2 Activation — they take the key action

**Definition (locked):** Member is "activated" when both: (a) attended first event AND (b) linked Telegram within 14 days of registration.

Why this combined definition: registration is a low bar (form fill). Attendance + Telegram link = behavior that predicts 90-day retention.

**Activation rate target:** ≥ 60% of registrants by month 3.

**Sub-funnels to measure:**
- Visitor → registration: target ≥ 5% (industry benchmark for warm-traffic community sites)
- Registration → attendance: target ≥ 65% (event 1 was 75% — small numbers; scale-adjusted target lower)
- Attendance → Telegram link: target ≥ 50% (depends on bot v0 prompt)
- Composite activation: registration → attended-AND-linked: target ≥ 30%

### 3.3 Retention — they come back

**Definition (locked):** Member is "retained" if they attend ≥ 1 additional event within 90 days of activation.

**Targets:**
- 30-day retention (attended 2 events in 30 days): ≥ 30% by month 3
- 90-day retention: ≥ 50% by month 6
- 12-month retention: ≥ 25% (industry benchmark for free communities)

**Cohort tracking:** every registration tagged with cohort = month of first registration. Cohort retention curves visible in marketing dashboard (§17).

### 3.4 Referral — they bring others

**Definition:** New registration with `registrations.referred_by IS NOT NULL` (member referral via Sprint 5.1 code) OR `acquisition_source.utm_source = '<existing member handle>'`.

**Targets:**
- Month 6: ≥ 25% of new registrations are referred
- Month 12: ≥ 40% of new registrations are referred
- K-factor (referrals per attendee × referral conversion): target ≥ 0.5 by month 6, ≥ 1.0 by month 12

**Specific referral surfaces** (priority order):
1. Member-to-member referral codes (Sprint 5.1–5.3)
2. Speaker amplification (every speaker posts on their network — §11)
3. Sponsor amplification (every sponsor posts on their company channels — §10)
4. Operator-shared content (post-event recaps shared by attendees)
5. Influencer + community partnership posts (§9)

### 3.5 Revenue — sustainable monetization

**Model (locked):** **Sponsor-led monetization.**
- Members are free. Always.
- Sponsors pay because the audience is high-quality engineers building side-projects — prime for hiring, product distribution, co-founder discovery.
- Future revenue streams (demo-day participant fees, mentorship match fees, paid premium workshops, equity-in-alumni) are OPEN questions, not P0.

**Sponsor pricing tiers** (operator playbook captures the matrix; this is the marketing-facing summary):

| Tier | Typical pricing | Deliverables |
|---|---|---|
| Community partner | $0 (in-kind: venue, food, AV) | Logo on event page, brief mention in recap |
| Bronze | $500–1,500/event | Logo + 30-second slot + brief recruitment plug |
| Silver | $1,500–4,000/event | Bronze + 5-min product slot + lead list (opt-in only) + post-event report |
| Gold | $4,000–10,000/event | Silver + opening slot + workshop hour + dedicated quarterly digest mention |
| Platinum / multi-event | Custom $10K–50K/year | All above + naming rights + custom deliverables |

**Targets:**
- Month 3: ≥ 2 paying sponsors (one Silver, one Bronze)
- Month 6: ≥ 5 active sponsor relationships
- Month 12: ≥ 1 Gold or Platinum multi-event sponsor
- Sponsor renewal rate ≥ 60%

**Unit economics tracking:**
- Revenue per event (gross)
- Direct event cost (venue + catering + photo + AV + speaker hospitality)
- Gross margin per event
- Sponsor LTV (sum of revenue across all events they sponsor)
- Sponsor CAC (operator hours × value-of-operator-hour to acquire)

---

## 4. Channel strategy

Per AARRR stage, by ownership type.

### 4.1 Owned channels (we control them fully)

| Channel | Status | Owner | Primary AARRR stage |
|---|---|---|---|
| **aiqadam.org website** | Live | Eng | Acquisition (SEO) + Activation |
| **Event detail pages** | Live | Country leads (content) | Acquisition (organic share + OG previews) + Activation (registration) |
| **/me dashboard** | Live | Eng | Retention + Referral |
| **/u/{handle} public profiles** | Live | Members (content) | Retention (status) + Referral (sharing) |
| **Newsletter (monthly digest)** | DEFERRED to Phase ζ | TBD CM | Retention (relationship) + Referral (forwarding) |
| **Telegram broadcast channel** | **DOES NOT EXIST YET** — concurrent task | Country leads | Retention + Acquisition (channel discoverable) |
| **Telegram group (chat)** | Live (UZ) | Country leads | Retention + Activation (engaged members) |
| **Telegram bot** | Sprint 5.5 (account link only) | Eng | Activation (linking) + Retention (notifications) |
| **Blog** | DEFERRED to Phase ζ.8 | TBD content writer | Acquisition (longtail SEO) + Retention (content) |
| **YouTube channel (recordings)** | Phase ζ.1 | Eng + content writer | Acquisition (search) + Retention (replay) |
| **Discourse forum** | Phase ζ.2 | Country leads + community managers | Retention + Acquisition (longtail SEO) |
| **/press media kit page** | DOES NOT EXIST — Sprint 0.9 | PM | Earned media support |
| **/blog Atom/RSS feed** | DOES NOT EXIST — with blog (Phase ζ.8) | Eng | Acquisition |

### 4.2 Earned channels (others amplify us)

| Channel | Status | Owner | Primary AARRR stage |
|---|---|---|---|
| **Influencer partnerships** | NOT FORMALIZED | PM (CRM pipeline) | Acquisition |
| **Community partnerships** (other meetups, university clubs) | NOT FORMALIZED | PM + country leads | Acquisition + Activation (co-events) |
| **Speaker network amplification** | Manual ad-hoc; formalize Sprint 3.3 | Operator + speaker | Acquisition + Retention |
| **Sponsor network amplification** | Manual ad-hoc; formalize Sprint 3.2 | Operator + sponsor | Acquisition (sponsor's company channels) |
| **Member word-of-mouth** | Sprint 5 surfaces | Members | Referral |
| **Press coverage** | DEFERRED — §8 | Binali (spokesperson) | Acquisition + Trust |
| **Industry awards + nominations** | Concurrent | Binali + Viktor | Trust + Acquisition |
| **Cross-listings (Lu.ma / Meetup.com / Eventbrite)** | NOT STARTED — concurrent | Country leads | Acquisition (cheap discovery) |

### 4.3 Paid channels (capability-built, deployment deferred)

**Reframed:** Original plan said "explicitly NOT doing paid ads." Corrected: **paid is a capability to include.** Infrastructure ships in Sprint 5 (UTM scheme + landing pages + attribution); deployment timing is a separate decision.

| Channel | Capability ship | Deployment trigger | Owner |
|---|---|---|---|
| **LinkedIn Sponsored Posts** (B2B for sponsor recruitment) | Sprint 5 (UTM + landing pages) | When sponsor pipeline (3.2a) has capacity for 3+ qualified leads/month | PM |
| **Meta / Instagram Ads** | Sprint 5 | When KZ + UZ both have ≥ 50 QAM and we have content investment justifies | PM |
| **Telegram channel boosts** (paid promo on third-party local channels) | Sprint 5 | After event 3; channels selected by country leads | Country leads |
| **Google Search Ads** (for high-intent queries like "AI meetup Tashkent") | Sprint 5 | After blog content has saturated organic, ads close the long-tail gap | PM |
| **Podcast sponsorships** (CA tech podcasts) | Sprint 5 | When budget allows ($200–500/episode) | PM |

**Budget shape (preliminary, until measurement justifies):**
- Month 1–3: $0 paid spend (capability building only)
- Month 4–6: $500–1,000/month testing LinkedIn Sponsored + 1 podcast
- Month 7–12: scale based on CAC vs LTV; cap at $5K/month until unit economics prove it

---

## 5. Content marketing strategy + editorial calendar

### 5.1 Why content marketing matters

For a sponsor-led model, content marketing serves:
- **Acquisition**: longtail SEO ("RAG for legal documents Kazakhstan" → blog post → discovery → registration)
- **Activation**: prospective member reads a great post → joins the community
- **Retention**: members get value between events (talks library, blog posts, technical notes)
- **Referral**: members share posts on their networks
- **Sponsor credibility**: sponsors prefer audiences with content gravity over flat membership lists
- **Press**: journalists discover stories through content

### 5.2 Content types (priority order)

1. **Event recaps** (every event, within 7 days) — high effort, high return. Lives at `/events/{id}/recap` (see UX §16.4).
2. **Speaker spotlights** (1–2/month) — interview-style post or speaker's own write-up. Distributed to speaker's network.
3. **Technical notes** (1–2/month) — member-written or country-lead-curated. "How we use {tool} at {company} in {country}."
4. **Quarterly community report** (every 3 months) — numbers, growth, lessons. Public PR-grade content.
5. **Founder essays** (1/month) — Binali on the AI scene in CA, founding insights, vision. Published on blog + LinkedIn.
6. **Member case studies** (when notable) — "Member X built Y after meeting collaborator at AI Qadam." Validates the incubator positioning.
7. **Sponsor-driven content** (when sponsor agreement includes it) — sponsor publishes a guest post on their use case. Mutual value.
8. **Talk videos** (each event) — YouTube + embedded on /events/{id}/recap.
9. **Talk transcripts** (each event) — Whisper-generated + human-reviewed. SEO gold.
10. **Photo essays** (each event) — visual storytelling, lower text density. Instagram + Twitter friendly.

### 5.3 Editorial calendar template (monthly)

Lives in Directus as `editorial_calendar` collection (or Notion if faster to start; migration to Directus at Sprint 0.7 operator playbook tooling decision).

| Week | Content piece | Author | Channel mix |
|---|---|---|---|
| Week 1 | Event 1 recap of last month | Country lead | Blog + LinkedIn + Telegram channel + speaker's network |
| Week 2 | Speaker spotlight (interview) | CM (or Binali) | Blog + speaker's LinkedIn + Twitter |
| Week 3 | Technical note OR community announcement | Member-written / country-lead-curated | Blog + Telegram channel |
| Week 4 | Monthly digest newsletter (when density supports it) | CM | Email list + Telegram channel cross-post |

**Production cadence sustainability:** start at 2 pieces/month (recap + spotlight), grow to 4/month when CM is hired or country leads have bandwidth.

### 5.4 Content production pipeline

```
Idea capture (anyone, anywhere)
  ↓
Editorial calendar (Directus or Notion)
  ↓
Author drafts (in Directus content editor or external)
  ↓
Review by PM (Binali) — voice + facts + brand fit
  ↓
Asset creation (header image, social cards) — Claude Design + ChatGPT Image Generator with Viktor as reviewer
  ↓
Publish on /blog (Phase ζ.8)
  ↓
Distribute: LinkedIn (Binali + Viktor + organization page) + Telegram channel + cross-post to community partners + email when relevant
  ↓
Track: Plausible page-views + UTM-tagged inbound links + Twenty CRM for sponsor/journalist referrers
```

### 5.5 SEO strategy

Keyword priorities (research + refresh quarterly):

**Tier 1 (highest priority — country + topic combos):**
- "AI meetup Tashkent" / "AI митап Ташкент"
- "ML community Kazakhstan" / "ML сообщество Казахстан"
- "AI engineer Almaty" / "AI инженер Алматы"
- "machine learning Central Asia"

**Tier 2 (content topics):**
- "RAG implementation case study"
- "LLM at scale {industry}"
- "AI hiring Central Asia"
- "Kazakh language NLP"
- "Uzbek language LLM"

**Tier 3 (long-tail):**
- "{speaker_company} ML team" (when speakers from notable companies)
- "AI hackathon {city}"
- "speaker {name} talk" (long-tail capture from speaker's personal name searches)

### 5.6 Content distribution multiplier

Every piece published goes to a minimum 5 surfaces:

1. **Blog (canonical)** — `/blog/{slug}`
2. **LinkedIn organization page** — full post or excerpt + link
3. **Binali's personal LinkedIn** — comment + share with personal framing
4. **Viktor's personal LinkedIn** — when topic is platform/tech-ops relevant
5. **Telegram broadcast channel** — short post + link
6. **Cross-post to community partners** — when relevant
7. **Email to subscribers** — when batch hits monthly digest
8. **Twitter/X** — when post has quote-graphic or speaker-tagged opportunity
9. **Instagram** — when post has strong visual asset (Phase ζ+)
10. **YouTube description** — when post references a recording

---

## 6. Email marketing + newsletter

### 6.1 Current state vs target state

| Aspect | Current | Target |
|---|---|---|
| Transactional emails | ✓ Live (Sprint 5.5/5 — Resend via Interactions) | (no change) |
| Newsletter / digest | Not built | Monthly digest once event density supports (≥ 4 events/month across countries) |
| Email service provider | Resend (transactional) | Resend (transactional) + Listmonk (newsletter) per architecture doc |
| List management | None | Listmonk: segments by country, by interest, by attendance frequency |
| Email reputation infrastructure | SPF + Resend DKIM (set up) | Above + DMARC alignment + bounce monitoring + sender reputation tracking |

### 6.2 Newsletter v0 specification (Phase ζ when density justifies)

**Cadence:** Monthly, first Tuesday.
**Audience:** All members with `consent_records.intent_class=newsletter, revoked_at IS NULL` (Sprint 5.5/5b consent service enforces).
**Segments:** by country (primary), by interest tags (secondary — used for "you might like" sections).

**Content template:**

```
Subject: AI Qadam {month} digest — {top headline}

From: AI Qadam {country} <hello@aiqadam.org>
Reply-To: {country_lead_email}

---

Hi {first_name},

Here's what happened in AI Qadam {country} this month, plus what's coming next.

## What happened

### {Event 1 title} — {date}
{2-sentence recap. Link to full recap.}
[Read recap →]

### {Event 2 title} — {date}
{2-sentence recap}

## What's next

### {Upcoming event title} — {date}, {city}
{2-sentence preview. Speaker name(s). Register link.}
[Register →]

## Worth reading
- {Blog post title} — {one-line hook} [Read →]
- {Speaker spotlight title} — {one-line hook} [Read →]
- {Sponsor's content if any} — {explicit "From our sponsor {name}" label} [Read →]

## Community moments
{One paragraph: a member's story, a side-project that came out of the community, a hiring win}

## Coming next month
{Brief forward-look — next country activating, new format launching, etc.}

---

Want different topics? [Adjust your preferences →]
Don't want monthly emails? [Unsubscribe (one click) →]

— {country_lead_name}, AI Qadam {country}
{Binali Rustamov when global digest}
```

**Production process:**
- Last Friday of month: country leads submit recap blurbs + photos to PM
- Saturday: PM drafts; reviews with country leads
- Sunday: assets created (header image via Claude Design); ChatGPT for variant titles
- Monday: final review + Listmonk schedule
- Tuesday 09:00 local time: send (per country)
- Tuesday afternoon: cross-post the recap part to Telegram broadcast channel + LinkedIn organization page

### 6.3 Email reputation infrastructure

| Item | Status | Action |
|---|---|---|
| SPF record on aiqadam.org | Likely set by Resend setup | Verify with `dig TXT aiqadam.org` |
| DKIM (Resend) | Set | Verify in Resend dashboard |
| DKIM (Listmonk via Resend SMTP) | Not configured | Sprint 5.7 — configure when Listmonk deploys |
| DMARC policy | Likely none | Sprint 5.7 — add `p=quarantine` DMARC record |
| Bounce monitoring | Not in dashboard | Sprint 5.7 — Resend webhook → API → Directus `email_bounces` collection |
| Sender reputation tracking | Not measured | Sprint 5.7 — Google Postmaster Tools + Mailgun (if used) reputation dashboards |

### 6.4 Email design templates

- **Transactional emails:** plain HTML, max 2 colors (brand teal + neutral), minimal layout. Already shipped (Sprint 3 + 5.5/5).
- **Newsletter template:** richer HTML with header image + sectioned layout. Built in MJML or React Email for cross-client compatibility. To produce in Phase ζ when Listmonk deploys.
- **Sponsor-driven emails:** dedicated template with sponsor branding clearly demarcated ("From our sponsor {name}"). Used sparingly.

---

## 7. Social media presence + posting cadence

### 7.1 Current state (locked-in)

- **LinkedIn:** Viktor's personal page, manual posts, solo. No organization page yet.
- **Telegram:** group chat (UZ exists); **no broadcast channel** (gap).
- **X / Twitter:** not active.
- **Instagram:** not active.

### 7.2 Target state by month 3

| Platform | Account | Owner | Cadence |
|---|---|---|---|
| LinkedIn — Viktor's personal | Existing | Viktor | 1–2 posts/week (platform + tech-ops content) |
| LinkedIn — Binali's personal | Existing (set up if not) | Binali | 1–2 posts/week (founder + vision + community content) |
| LinkedIn — AI Qadam organization page | TO SET UP — concurrent | PM | 1 post/week (events + speakers + sponsors) |
| Telegram channels (broadcast) | TO LAUNCH — concurrent | Country leads | 2–4 posts/week (event announcements + recaps + opportunities) |
| Telegram groups (chat) | UZ exists; KZ + TJ to launch with country activation | Country leads | Native conversation; no posting cadence |
| Twitter / X | TO SET UP — concurrent | PM (low-effort) | 2–3 posts/week (quotes + photos from events) |
| Instagram | Phase ζ when photo pipeline strong | Country leads + designer | 1–2 posts/week (visual storytelling) |

### 7.3 LinkedIn posting templates

**Event announcement (organization page):**

> [Event banner image]
>
> {Event title} — {date}, {city}
>
> {2-sentence what-it's-about}
>
> Speakers:
> 🎤 {Speaker 1 name} ({company}) on {topic}
> 🎤 {Speaker 2 name} ({company}) on {topic}
>
> {N} engineers expected. Free, registration required.
>
> [Register link]
>
> #AIqadam #AIengineersCA #{city}AI

**Speaker spotlight (founder/COO personal):**

> When {speaker first name} agreed to speak at AI Qadam {country} this month, I knew we'd struck signal. {Their work / why they're notable in 2 sentences.}
>
> They'll be talking about {topic}. {Why this matters to engineers in CA, 2 sentences.}
>
> [Recording link if past event, registration if upcoming]

**Recap (founder personal):**

> {Event title} happened last week. 80+ engineers, {top moment in one sentence}.
>
> Three things I'm taking away:
> 1. {Insight 1}
> 2. {Insight 2}
> 3. {Insight 3}
>
> Full recap with photos + recordings: [link]
> Next event ({title}, {date}): [link]

**Build-in-public post (founder):**

> Month {N} of AI Qadam:
> - {N} events run
> - {N} active members
> - {N} speakers
> - {N} active sponsors
> - {country count} countries
>
> What I'm learning: {one specific insight}.
>
> What's hard: {one honest challenge}.
>
> What's next: {one forward thing}.
>
> [Link to community-platform-roadmap.md or quarterly report]

### 7.4 Telegram broadcast channel posting cadence

| Day | Post type |
|---|---|
| Monday | Week ahead: upcoming events + open registrations |
| Wednesday | Speaker spotlight or community moment |
| Friday | Past-week highlights: photos / quotes / new joiners shoutout |
| Plus: real-time on big news (sponsor confirmed, speaker added) |

Keep posts short (≤ 3 lines unless visual). Use Telegram's preview-card feature for outbound links.

### 7.5 Hashtag strategy

Owned hashtags:
- `#AIqadam` — universal
- `#AIengineersCA` — community-positioning
- `#AIqadam{city}` — local (`#AIqadamTashkent`, `#AIqadamAlmaty`)

Borrowed (use to ride existing conversations):
- `#machinelearning` (international)
- `#ML` `#LLM` `#RAG` (topic-specific)
- `#KazakhstanTech` `#UzbekistanTech` `#CentralAsiaTech`

Hashtag use is platform-specific (LinkedIn = 3–5 tags fine, Twitter = 1–2 max, Telegram = optional).

### 7.6 Engagement protocol

- **Response time SLA:** mentions + DMs in business hours respond within 4 hours; sponsor + speaker DMs within 1 hour during business hours.
- **Voice:** matches §1.5 marketing voice variants per platform.
- **Who responds:** PM (Binali) for high-visibility threads; Viktor for tech-platform questions; country leads for country-specific.
- **Crisis escalation:** any negative public mention → triage to Binali within 1 hour. See §18.

---

## 8. PR + media relations (deferred — hype-building first)

**Locked:** Press strategy is FUTURE. First we build hype to attract press attention. Once inbound press requests arrive (likely month 3–6), formalize the press machine.

### 8.1 Hype-building (now → month 3)

What we produce now that becomes press-ready material later:

| Asset | When produced | Press value |
|---|---|---|
| Event 1 numbers (100+ attendees, 75% conversion) | Done | "Tashkent's first AI Qadam draws 100+ engineers" — local press hook |
| Event-by-event photo essays | Each event | Photographer-quality images give press something visual |
| Founder + COO LinkedIn posts | Weekly | Builds Binali's quotable presence |
| Quarterly community report | Quarterly (§14) | Numbers + narrative — press uses as source |
| Speaker quotes worth sharing | Per event | "On AI Qadam stage: '{quote}' — {speaker}" — sharable + quotable |
| Country launch announcement | Per country | "AI Qadam expands to Kazakhstan" — local press hook per country |
| First major sponsor announcement | When signed | "{Sponsor} backs AI Qadam" — co-marketing opportunity |
| Member success stories | When they happen | "Member started {project} after meeting collaborator at AI Qadam" |

### 8.2 PR machine (when triggered — likely month 4+)

**Trigger:** first inbound press request OR a major milestone worth proactive announcement (country #2 launching, first Gold sponsor, > 500 members).

**Components to build at that point:**

| Component | What | Owner |
|---|---|---|
| `/press` page on aiqadam.org | Public media kit: founder + COO bios, brand assets, fact sheet, past coverage list, contact form | Eng + PM |
| Press list in Twenty CRM | `media_contacts` view: journalist, outlet, beat, last contact, story preferences | PM |
| Pitch templates | "Milestone story", "Speaker spotlight pitch", "Community impact pitch", "Country launch pitch" | PM |
| Press release template | Standardized format: headline, dateline, body, quote, boilerplate, contact | PM |
| Spokesperson designation | **Binali for company/vision/community stories; Viktor for platform/tech/ops stories.** Country leads as local spokespeople once activated. | (Already known) |
| Embargo policy | When we share news with press before public; trust + relationship management | PM |
| Coverage tracker | Twenty CRM custom view: which stories ran, what outlet, what tier | PM |

### 8.3 Pitch story types (when ready)

1. **Milestone stories**: "AI Qadam crosses {N} members", "First country expansion", "{N}th event"
2. **Founder vision stories**: Binali on CA AI scene, founding origin, lessons
3. **Speaker spotlights**: when speaker has independent newsworthiness
4. **Sponsor announcement stories**: when sponsor is notable enough
5. **Member success stories**: side-projects/companies that came from the community
6. **Community impact stories**: hiring outcomes, side-project launches attributable to the community
7. **Regional tech ecosystem stories**: AI Qadam as a lens on CA's AI scene maturation

### 8.4 Media outlets to track (CA + diaspora)

**Tier 1 (priority CA tech press):**
- kursiv.media (KZ business/tech)
- tech.kz (KZ tech)
- Forbes Kazakhstan (KZ business)
- MyTech.kg (KG tech)
- Bilim Land (KZ general)
- Spot.uz (UZ general)
- Repost.uz (UZ tech)

**Tier 2 (regional + diaspora):**
- Rest of World (international, CA-aware)
- TechCrunch (rarely covers CA, but startup stories occasionally)
- Sifted (when EU angle exists)

**Tier 3 (broader trade):**
- AI / ML newsletters (Import AI, The Batch — international)
- Diaspora-led tech publications (often CA-aware contributors)

Build the list in Twenty CRM `media_contacts` view when press machine activates.

---

## 9. Influencer + community partnerships

### 9.1 Why influencer + community partnerships are the primary growth engine

Per the operator directive (community-platform-roadmap.md §0), influencer + community partnerships are the chosen marketing model. Reasons:
- High trust (their audience trusts them)
- Targeted (their followers are likely our ICP)
- Lower cost than paid ads at this stage
- Compounding (relationships compound; ads don't)
- CA-friendly (paid ads work less well in CA than warm endorsements)

### 9.2 Influencer infrastructure

Build the same way we built sponsor pipeline (Sprint 3.2a):

| Component | What | Sprint |
|---|---|---|
| `influencer_partners` view in Twenty | Pipeline: Prospect → Contacted → Qualified → Proposed → Active → Renewed/Churned | Concurrent (post-Sprint 3.2a) |
| Influencer outreach template library | Personal, specific DMs (not templated-looking) | Concurrent (operator playbook §16.5) |
| Co-promotion tracking | UTM scheme + Twenty activity timeline | Sprint 5 (UTM scheme done) + Sprint 0.4 (Plausible event tracking) |
| Influencer asset kit | What we provide to influencers when they agree to post (logo pack, sample copy, hashtags, event-specific brief) | Sprint 0.9 (brand asset library) |

### 9.3 Influencer types we work with

| Type | Example | Reach | What we offer |
|---|---|---|---|
| **CA tech LinkedIn voices** | Independent CA tech commentators with 5K+ followers | Targeted | Speaker slot, sponsor referral commission (small), cross-promo |
| **Telegram channel admins** | Curators of CA tech / AI Telegram channels | Targeted, large | Cross-post agreement, optional paid promo (cheap) |
| **Tech YouTubers (KZ/UZ)** | Russian-speaking tech YouTubers covering CA | Broad | Event coverage, behind-the-scenes content |
| **Podcast hosts (CA tech)** | English or Russian podcasts on tech in CA | Targeted | Speaker guest appearance, sponsor mention |
| **Diaspora tech leaders** | CA-origin engineers at FAANG / unicorns | Status-signal | Speaking slot (remote), member-network access |
| **Local AI Twitter/X accounts** | Smaller but active | Native-targeted | Cross-promo of events |

### 9.4 Influencer outreach template

> Hi {influencer_first_name},
>
> {Specific reference to their recent post or work — proves you're not mass-DMing.}
>
> I'm Viktor at AI Qadam — we're building Central Asia's AI engineer community. Currently UZ; KZ + TJ launching soon.
>
> Two things I'd love to explore:
>
> 1. **Would you be open to speaking at AI Qadam {country}** in {month range}? Audience is ~80–120 engineers, mid-to-senior, mix of practitioners and founders. Format: 25-min talk + 15-min Q&A. We provide engaged audience, recording, photos, transit + dinner.
>
> 2. **Cross-promotion** — we'd love to share your work with our network (when it fits). And if it's mutual, your audience getting first dibs on events in {their_country} would be cool.
>
> No pressure either way. If yes, let me know format that works for you (call / DM / async).
>
> {Viktor's signature}

### 9.5 Community partnership infrastructure

Same pattern as influencers:

| Component | What | Sprint |
|---|---|---|
| `community_partners` view in Twenty | Other meetups, university clubs, dev communities | Concurrent |
| Calendar coordination protocol | Don't double-book; lift each other's events | Operator playbook §16.5 |
| Joint event template | When co-organizing | Operator playbook §16.5 |
| Cross-mention agreement | We mention them in our channels, they mention us | Operator playbook §16.5 |
| Shared sponsor pool | When a sponsor wants multi-community deal | PM negotiates case-by-case |

### 9.6 Communities to partner with (priority list to build out)

| Community | Country | Type |
|---|---|---|
| Almaty Tech Garden community | KZ | Hub-led |
| KazNU AI club | KZ | University |
| INHA University Tashkent ML club | UZ | University |
| Tashkent IT Park communities | UZ | Hub-led |
| ML Almaty (existing meetup) | KZ | Peer meetup |
| Tashkent Tech meetup | UZ | Peer meetup |
| Dushanbe Tech (if exists) | TJ | Peer meetup |
| Kyrgyz Software Industry Association | KG (future) | Trade body |

---

## 10. Sponsor co-marketing kit

Sponsors want to amplify events they sponsor — IF we make it easy + on-brand.

### 10.1 What sponsors get in their cabinet (Sprint 3.2 extension)

| Asset | Format | Purpose |
|---|---|---|
| **Branded social cards** (for the sponsored event) | PNG 1200×630 + 1080×1080 (square for IG/LinkedIn) | Sponsor team posts on their company's channels |
| **Pre-written social posts** | LinkedIn (200–300 words), Twitter (3 variants), Telegram (1 variant) | Copy-paste-able with placeholders filled |
| **Sponsor logo placement examples** | PNG of event page header showing their logo, screenshot of stage photo with logo | Sponsor PR uses for internal reporting |
| **Hashtag + handle guidance** | `#AIqadam #{eventcity}AI @{aiqadam_handles}` | Consistent attribution |
| **Brand voice cheatsheet** | One-pager: how to mention us, what NOT to say, our positioning | Sponsor's social team doesn't need to ask |
| **Photo + video asset access** | Post-event: link to event photo gallery + recording embed code | Sponsor's marketing reuses |

### 10.2 Sponsor co-marketing template

> 🎤 {Company} is a {tier} sponsor of AI Qadam {country} this {month} — Central Asia's AI engineer community.
>
> Why we're backing AI Qadam: {1–2 sentences from sponsor's perspective — recruiting / brand / supporting ecosystem}.
>
> Join us at the next event: {event_title}, {date}, {city}.
>
> [Register: {UTM-tracked link}]
>
> #AIqadam #{eventcity}AI

### 10.3 Sponsor amplification tracking

UTM scheme distinguishes sponsor-driven traffic: `utm_source={sponsor_slug}&utm_medium=sponsor_post&utm_campaign=event-{N}`.

Sponsor cabinet shows them: "Posts you shared drove {N} visits + {M} registrations." Closes the value loop — they see ROI from amplification.

---

## 11. Speaker amplification kit

Speakers WANT to promote their talk — but only if we make it easy. Currently underleveraged.

### 11.1 What speakers get in their cabinet (Sprint 3.3 extension)

| Asset | Format | Purpose |
|---|---|---|
| **Branded social cards with speaker's photo + talk title** | PNG 1200×630 + 1080×1080 | Speaker posts on their channels |
| **Pre-written posts (LinkedIn, X, Telegram)** | Templated with speaker's name pre-filled | Copy-paste-able |
| **Personal speaker page URL** | `aiqadam.org/u/{speaker_handle}` updated to include this talk | Speaker links to it from their LinkedIn |
| **Recording embed code** (post-event) | iframe / direct video link | Speaker embeds in their personal blog |
| **Quote graphic generator** | Automated: speaker quote + their photo + AI Qadam branding | Easy-share content from their own talk |
| **Personal speaker analytics** | "Your AI Qadam page got {N} views in the {M} weeks after your talk" | Reinforces personal value |

### 11.2 Speaker amplification template

> 🎤 Excited to be speaking at AI Qadam {country} on {date}: "{Talk title}".
>
> {1–2 sentences on what the talk is about — speaker's framing.}
>
> Audience: ~80–120 AI engineers + founders + researchers across Central Asia.
>
> If you're in {city}, would love to see you there.
>
> [Register: {UTM-tracked link}]
>
> #AIqadam #{topic_tag}

### 11.3 Pre-event speaker prompt (timing)

- T-21 days (after confirming): "Here's your social kit. Share when ready."
- T-7 days: gentle reminder if not yet shared ("Your network would love this — here's the post if you want it")
- T-1 day: final reminder
- T+1 day: post-event "Thank you" + new kit (with recording + photos + post-event quote graphic) for amplifying the talk asset

### 11.4 Speaker amplification tracking

UTM: `utm_source={speaker_slug}&utm_medium=speaker_post&utm_campaign=event-{N}`.

Speaker cabinet shows: "Your post drove {N} visits + {M} registrations." Speakers love seeing this; it makes them better amplifiers.

---

## 12. Founder-led growth (Binali + Viktor)

The founder + COO are themselves marketing channels. Their personal brands compound with the community's brand.

### 12.1 Roles + voice distinction

| Person | Role | Voice on personal channels | Frequency |
|---|---|---|---|
| **Binali Rustamov** | Founder | Vision, founding story, CA AI ecosystem commentary, community wins, big-deal welcomes | 2 posts/week LinkedIn, occasional X, monthly long-form essay |
| **Viktor Drukker** | COO + Head of Vibe Code & Platform Operations | Platform building updates, team operations, ops lessons, dev culture, tech-ops insights | 2 posts/week LinkedIn, occasional X |

### 12.2 Binali's content cadence

**Weekly LinkedIn posts (2/week):**
- Monday: Vision / strategic post (industry observation, AI in CA, community-building lesson)
- Thursday: Community update (event highlights, member story, speaker spotlight)

**Monthly long-form essay (LinkedIn article + blog cross-post):**
- Topics rotate: CA AI scene state-of-the-union, founding lessons, community-building reflections, sponsor partner spotlights

**Ad-hoc:** big announcements (event recaps with strong numbers, sponsor wins, country launches, press features when they happen)

### 12.3 Viktor's content cadence

**Weekly LinkedIn posts (2/week):**
- Tuesday: Build-in-public (what's shipping, what we learned)
- Friday: Tech / ops insight (vibe code culture, platform decisions, OSS thoughts)

**Monthly long-form** (optional, when something warrants it): platform deep-dives, ops playbooks, transparent metrics shares

### 12.4 Cross-amplification rules

- Both publish the SAME piece on different timing (not simultaneous — looks coordinated/inauthentic)
- Each comments + shares the other's posts (warm engagement)
- Each tags the other when relevant
- Both maintain DISTINCT voices (Binali = vision + community; Viktor = platform + ops + build-culture)

### 12.5 What Binali + Viktor should NOT do

- Post sponsor's marketing copy verbatim (sponsor amplification is separate; founder posts have founder voice)
- Auto-cross-post (every platform needs platform-native voice)
- Engagement bait ("Comment if you agree" / "Like if you've ever…")
- Buzzword-soup ("Generative AI is transforming…")
- Generic motivational posts unrelated to AI Qadam (dilutes the brand)

---

## 13. Event marketing playbook (per event)

End-to-end marketing run-of-show for each event. Operator + country lead executes; PM oversees.

### 13.1 T-30 to T-21 days: scoping + announcement readiness

- [ ] Event scoped (date + venue confirmed + topic agreed)
- [ ] First speaker confirmed (per event-lifecycle parallel workstreams — roadmap §3.5)
- [ ] Event detail page drafted in Directus
- [ ] Branded event hero image generated (Claude Design + ChatGPT, Viktor reviews)
- [ ] Social cards generated (1200×630 + 1080×1080)
- [ ] Pre-written announcement posts drafted (LinkedIn org page + Binali + Viktor + Telegram channel + cross-posts)
- [ ] Influencer + community partner outreach started (T-30 to T-14)
- [ ] Sponsor co-marketing kit prepared (logo + briefing if relevant)

### 13.2 T-21 to T-14 days: initial announcement

- [ ] Publication status flipped to `published` (Sprint 1.1 publication flow fires)
- [ ] LinkedIn organization page post live
- [ ] Telegram broadcast channel post live
- [ ] Binali's personal LinkedIn post live
- [ ] Viktor's personal LinkedIn post live (if relevant — when content is platform/ops adjacent)
- [ ] Cross-post to community partners
- [ ] Lu.ma / Meetup.com event mirror (if active on these platforms)
- [ ] Sponsor + first speakers given amplification kits + prompted to share
- [ ] Email to existing members in country (single dedicated email, not bundled in digest)

### 13.3 T-14 to T-7 days: amplification

- [ ] Influencer posts triggered (if agreements in place)
- [ ] Additional speakers announced as they confirm (Sprint 1.1 `speaker_added` flow fires — incremental social posts)
- [ ] Quote-graphic content (if any speaker shared a teaser quote)
- [ ] Mid-cycle reminder post on LinkedIn org page
- [ ] Mid-cycle reminder on Telegram channel
- [ ] First wave of community/sponsor amplification expected to land

### 13.4 T-7 to T-2 days: final push

- [ ] Final speakers confirmed (if any pending)
- [ ] Pre-event reminder dispatch (Sprint 1.4 — registered attendees)
- [ ] "Bring a friend" prompt on social (LinkedIn + Telegram)
- [ ] Photographer + videographer confirmed
- [ ] Speaker briefs refreshed (Sprint 1.4 includes T-7 speaker brief auto-send)

### 13.5 T-1 to T-0: event day

- [ ] Final reminder dispatch (Sprint 1.4 T-3h flow)
- [ ] Last-minute amplification: "Doors open at {time}" on Telegram channel
- [ ] Sponsor on-site activation (deliverables checklist confirmed)
- [ ] Photography + videography in motion
- [ ] Live posts during event (optional — selectively, to avoid being on phone instead of with members)

### 13.6 T+1 to T+7 days: post-event amplification

- [ ] Event-end flow fires (Sprint 1.1 — CSAT + thank-you + next-event teaser)
- [ ] Photos selected (best 30–50 from photographer)
- [ ] Recap blog post drafted (UX §16.4 template)
- [ ] 5–10 social-ready quote graphics produced (Claude Design + ChatGPT, Viktor reviews)
- [ ] Recap published on /blog
- [ ] LinkedIn organization page recap post
- [ ] Telegram channel recap post (compressed version)
- [ ] Binali's personal LinkedIn recap post (with personal framing)
- [ ] Speaker amplification kits updated (recording + photos + quote graphics → speakers re-share)
- [ ] Sponsor cabinet updated with post-event report (Sprint 3.5 generates PDF)
- [ ] Quarterly sponsor digest captures this event for next quarter cycle

### 13.7 T+14 to T+30 days: long-tail

- [ ] Recording uploaded to YouTube + embedded in /events/{id}/recap (Phase ζ.1)
- [ ] Transcripts published (Whisper-generated, human-reviewed, Phase ζ.1)
- [ ] Member case studies captured (if any side-projects/hires came from this event)
- [ ] Newsletter inclusion in next monthly digest

---

## 14. Quarterly sponsor digest specification

Per the operator directive: **Community Volunteering Board reads dashboards; quarterly digests prepared for sponsors.**

### 14.1 Purpose

Sponsors receive a per-event PDF report (Sprint 3.5). The **quarterly digest** aggregates across all events in the quarter PLUS forward-looking content. It's the document sponsors share with their CFOs to justify renewal.

### 14.2 Cadence

Q1 (Jan-Mar) → digest published April 15
Q2 (Apr-Jun) → digest published July 15
Q3 (Jul-Sep) → digest published October 15
Q4 (Oct-Dec) → digest published January 15 (also serves as annual report)

### 14.3 Distribution

- Email (personalized to each sponsor) with PDF attached
- Sponsor cabinet (auto-uploads to `app.aiqadam.org/sponsor/digests/{quarter}.pdf`)
- Public version on `/community-reports/{quarter}.pdf` (numbers + narrative; sponsor-specific data removed)
- Linked from quarterly LinkedIn announcement post

### 14.4 Content structure (template)

```
# AI Qadam Quarterly Community Report — {quarter} {year}

## Executive summary
{1-paragraph: state of the community at end of quarter}

## The numbers
| Metric | {Quarter} | Change vs prev quarter |
|---|---|---|
| Active countries | | |
| Events held | | |
| Total attendance | | |
| Average CSAT | | |
| Active members (QAM) | | |
| Speakers | | |
| Active sponsors | | |
| New members from referral | | |

## What we shipped — community
- {Event 1}: {1-sentence highlight}
- {Event 2}: {1-sentence highlight}
- {Etc.}

## What we shipped — platform
- {Sprint X}: {what shipped, why it matters}
- {Etc.}

## Sponsor highlights
- {Sponsor 1}: {what they got — leads / hires / brand reach}
- {Sponsor 2}: {what they got}

## Speaker highlights
- {Best-attended talk}: {speaker} on {topic}
- {Most-discussed talk}: {speaker} on {topic}

## Member stories
- {Story 1}: {member name → side-project / hire / collaboration}
- {Story 2}: {ditto}

## Coming next quarter
- {Country activations planned}
- {Event format experiments}
- {Platform milestones}

## Sponsor opportunities
{1 paragraph + table: open sponsorship slots, premium opportunities, custom packages}

## Governance + transparency
- Board meeting outcomes (high-level)
- Open decisions involving sponsor input

---
{Binali Rustamov, Founder}
{Viktor Drukker, COO + Head of Vibe Code & Platform Operations}
{Country lead names}
{Board members}
```

### 14.5 Production process

- Week 1 of quarter end: pull metrics from Plausible + Metabase + Twenty + Directus
- Week 2: draft narrative (PM/Binali) + member stories (country leads)
- Week 3: review with Community Volunteering Board
- Week 4: final design + PDF render (Claude Design + ChatGPT for layouts, Viktor reviews) + distribution

### 14.6 Engineering support needed

| Component | Sprint |
|---|---|
| Metrics export from Metabase to a templated PDF format | Phase ζ.x — automation later; manual in first 2 quarters |
| Sponsor cabinet `digests` section | Sprint 3.2 extension |
| Public `/community-reports/` page | Sprint 0.9 brand asset library / press kit; same surface |

---

## 15. Brand assets + AI design pipeline

### 15.1 Production workflow (locked)

**Current pipeline:** Viktor prompts **Claude Design** + **ChatGPT Image Generator** for visual assets. Viktor is the human-in-loop reviewer. This is the actual production reality.

| Asset type | Tool | Reviewer | Cadence |
|---|---|---|---|
| Event hero images | Claude Design (composition) + ChatGPT (image gen) | Viktor | Per event |
| Social cards (1200×630 + 1080×1080) | Same | Viktor | Per event + per content piece |
| Quote graphics | ChatGPT + canvas tool | Viktor | Post-event |
| Speaker spotlight cards | Same | Viktor | Per speaker |
| Sponsor logo placements | Sponsor-provided logos + Canva/Figma composition | Viktor | Per sponsor onboarding |
| Newsletter header images | Claude Design + ChatGPT | Viktor | Monthly |
| Blog post header images | Claude Design + ChatGPT | Viktor | Per post |
| Quarterly digest PDF layout | Claude Design (layout) + Canva (template) | Viktor + Binali | Quarterly |

### 15.2 Brand consistency guardrails (for AI-generated assets)

When prompting Claude Design / ChatGPT for AI Qadam assets, prompts include:

- **Brand colors**: brand teal (`oklch(0.58 0.10 192)`) primary + dark mode default
- **No AI-generated faces** (anti-pattern in UX guidelines + here)
- **Style:** clean, minimal, technical-feeling — not corporate-stock-photo, not maximalist-creative
- **Typography:** Geist for display headlines, Inter for body, JetBrains Mono for data
- **Logo:** uses brand mark from `apps/web/public/brand/`; never AI-regenerated
- **Cultural fit:** CA-relevant imagery (architecture, geography) when relevant; avoid generic Silicon Valley imagery

### 15.3 Brand asset library structure (Sprint 0.9)

```
infrastructure/brand-assets/  (or in Directus `marketing_assets` collection)
  ├── logos/
  │   ├── aiqadam-mark-light.svg
  │   ├── aiqadam-mark-dark.svg
  │   ├── aiqadam-wordmark.svg
  │   └── aiqadam-favicon.png (already exists)
  ├── social-card-templates/
  │   ├── event-card-template.psd (or Figma)
  │   ├── speaker-spotlight-template.psd
  │   ├── quote-card-template.psd
  │   └── recap-card-template.psd
  ├── press-kit/
  │   ├── press-pack.zip (logo pack + fact sheet + founder bios)
  │   ├── founder-photo-binali.jpg
  │   ├── coo-photo-viktor.jpg
  │   └── fact-sheet.pdf
  ├── photo-library/
  │   ├── event-1/ (photographer-quality photos from each event)
  │   ├── event-2/
  │   └── ...
  └── video-library/
      ├── recaps/ (per event)
      └── speaker-clips/
```

Lives in Directus (`marketing_assets` collection) so country leads can self-serve OR in object storage (S3-compatible) with Directus tracking metadata. Decision: Sprint 0.9.

### 15.4 Public `/press` page

Surfaces:
- AI Qadam logo (downloadable in multiple formats)
- Brand color palette
- Founder + COO bios (Binali + Viktor — high-resolution headshots)
- Fact sheet (1-page PDF: what we do, mission, history, numbers)
- Press contact: `press@aiqadam.org` (forwards to Binali)
- Quarterly community reports (latest + archive)
- Past press coverage (when applicable)

---

## 16. UTM scheme + attribution standard

The single most important marketing infrastructure decision. Lock it once.

### 16.1 UTM parameter convention

Every marketing link includes:

| Param | What it is | Examples |
|---|---|---|
| `utm_source` | Specific account / channel that drove the click | `binali-li` (Binali's LinkedIn) / `viktor-li` / `aiqadam-orgli` (org page) / `aiqadam-tg-uz` / `inf-{handle}` (specific influencer) / `partner-{slug}` / `speaker-{handle}` / `sponsor-{slug}` / `member-{handle}` (member referral) |
| `utm_medium` | Channel type | `linkedin_post` / `linkedin_message` / `telegram_channel` / `telegram_group` / `email_digest` / `email_transactional` / `referral` / `sponsor_post` / `speaker_post` / `paid_li` / `paid_meta` / `paid_telegram` / `aggregator` |
| `utm_campaign` | Specific campaign / event | `event-{N}` / `quarterly-digest-{Q}{YY}` / `country-launch-kz` / `sponsor-recruitment-{Q}{YY}` |
| `utm_content` | Variant identifier (for A/B testing) | `headline-a` / `image-v2` / `cta-register` (optional, only when A/B testing) |

### 16.2 URL builder

Sprint 0.8 ships a simple URL builder at `workspace.aiqadam.org/marketing/url-builder` (or as a standalone tool linked from operator playbook). Operator fills in fields, gets the URL with UTM params correctly encoded.

### 16.3 Attribution model

**First-touch + last-touch** (both captured at registration):

- `acquisition_source.first_touch`: UTM params from the FIRST visit to aiqadam.org (cookie persists 90 days)
- `acquisition_source.last_touch`: UTM params from the IMMEDIATE PRECEDING visit before registration

Stored as `jsonb` on `registrations` per Sprint 5.1 extension.

For reporting:
- First-touch attribution shows which channels DISCOVER members (acquisition-stage measurement)
- Last-touch attribution shows which channels CLOSE members (activation-stage measurement)
- Multi-touch attribution (linear or position-based) is Phase ζ when traffic volume justifies

### 16.4 UTM hygiene rules

- ALL marketing links must include UTM. No exceptions.
- UTM values are lowercase, hyphenated (not underscores in `source`/`medium` — exception: `utm_content` can use underscores for A/B variants)
- UTM values are STABLE — once `utm_source=binali-li` is established, never change to `binali-linkedin` (breaks historical data)
- The URL builder ENFORCES the convention; manual UTM construction is discouraged
- Internal links DO NOT have UTM (only external entry points)

---

## 17. Marketing dashboard (metrics + dashboards)

Engineering ships the operator dashboard (Sprint 2.4). Marketing needs its own surface — same Metabase instance, different views.

### 17.1 Marketing dashboard pages

**Page 1 — Acquisition funnel**
- Visitors per channel (Plausible source breakdown + UTM attribution)
- Visitor → registration conversion rate per channel
- Top-performing influencer / sponsor / speaker / member referrer
- First-touch attribution per registration
- Channel cost (where applicable — paid spend / hour cost of partnership management)

**Page 2 — Activation & retention**
- Activation rate (registration → attended + Telegram linked)
- Cohort retention curves (per country + global)
- Median time to first attendance (post-registration)
- Lapsed member queue size + win-back conversion rate

**Page 3 — Referral health**
- K-factor (referrals per attendee × conversion)
- Top referrers (members, speakers, sponsors)
- Referral chain depth (does Member A → B → C exist?)

**Page 4 — Revenue (sponsor focus)**
- Sponsor pipeline state (Prospect → Active → Renewed)
- Revenue per event + gross margin
- Sponsor LTV per tier
- Sponsor renewal rate
- Cost per sponsor acquisition (operator hours × rate)

**Page 5 — Content performance**
- Blog post views + scroll depth (Plausible) + time-on-page
- Newsletter open rates + CTR (Listmonk when deployed)
- Social post engagement (manual entry initially; API integration Phase ζ)
- Top content drivers of registration

**Page 6 — Event marketing scorecard (per event)**
- Promotion timeline adherence (T-30/T-21/T-14/T-7/T-1 actions completed)
- Channel mix that drove registrations to THIS event
- Speaker amplification reach (cabinet analytics)
- Sponsor amplification reach (cabinet analytics)
- Post-event content production (recap published, video uploaded, photos distributed)

### 17.2 Audience for marketing dashboard

- PM (primary) — quarterly digest + monthly review + ad-hoc decision support
- COO — overview + escalation points
- Community Volunteering Board — read access for governance
- Country leads — country-scoped view (their channels + their events)
- Sponsors — NOT this dashboard (they get their cabinet); aggregate-anonymous version may be public

### 17.3 Marketing dashboard sprint allocation

| Item | Sprint |
|---|---|
| Marketing dashboard page scaffolding (Metabase) | Sprint 5.8 (new) |
| First-touch + last-touch attribution data model | Sprint 5.1 extension |
| Channel cost tracking | Concurrent (operator data entry in Twenty initially) |
| Cohort retention queries | Sprint 2.6 dashboard extension |
| K-factor calculation | Sprint 2.6 + Sprint 5.3 (when referral codes live) |
| Sponsor pipeline visualization | Sprint 3.2a |
| Content performance integration | Phase ζ.8 (with blog deploy) |
| Event marketing scorecard | Sprint 2.4 country dashboard extension |

---

## 18. Crisis comms protocol

Touched in roadmap §4.6 + Phase ζ.7. This section is the marketing/PR side.

### 18.1 Crisis categories

| Category | Examples |
|---|---|
| **Negative incident at event** | Harassment claim, attendee misconduct, speaker controversy mid-talk |
| **Sponsor crisis** | Sponsor exposed for misconduct, sponsor pulls out at 48h notice |
| **Speaker crisis** | Speaker's recent tweet causes controversy, no-show, late cancellation |
| **Operational failure** | Venue cancels, AV failure, registration system fails day-of |
| **Brand crisis** | Public attack on founder / community, viral misrepresentation, accusation of harm |
| **Data incident** | Member data leak, sponsor lead list misuse, breach |

### 18.2 Decision tree per crisis

```
Crisis detected
  ↓
TRIAGE: Who is affected? Members / sponsors / speakers / public / regulator?
  ↓
SEVERITY:
  ├─ Low: handle internally, document for retro
  ├─ Medium: respond to affected parties, no public statement needed
  ├─ High: public statement required, escalate to Binali
  └─ Critical: legal involvement, comms freeze until cleared, possible event cancellation
  ↓
SPOKESPERSON:
  ├─ Internal-only → country lead or COO (Viktor)
  ├─ Member-facing → country lead OR Binali for high-severity
  ├─ Press-facing → Binali always (others quote-only if needed)
  └─ Regulatory → Binali + legal counsel
  ↓
COMMS WINDOW: 4 hours for High; 1 hour for Critical
  ↓
RESPONSE: prepared statement from template + factual + accountability
  ↓
FOLLOWUP: 24h status update + 7d post-mortem (internal + Board)
```

### 18.3 Crisis response templates

Stored in `docs/crisis-comms-templates/`. Examples (to be drafted in Phase ζ.7):

- "Statement on incident at event {date} {city}" — harassment / misconduct
- "Statement on sponsor termination" — sponsor crisis
- "Statement on speaker withdrawal" — speaker crisis
- "Statement on operational failure" — operational
- "Statement on data incident" — privacy/security (GDPR notification template required)

### 18.4 Code of conduct enforcement (member-facing)

- Code of conduct lives at `/code-of-conduct` (Sprint 5.6 visibility section + content production)
- Reporting mechanism: anonymous form + named complaint (both supported); routes to `safety@aiqadam.org` (forwards to Binali + designated Board member)
- Enforcement actions: warning → temporary ban → permanent ban → public statement (last only for repeat/severe)
- All actions logged in audit log (Sprint 2.5) + reported in quarterly digest (anonymized counts)

### 18.5 Pre-crisis preparation

- [ ] Crisis response templates drafted (Phase ζ.7)
- [ ] Spokesperson designation documented + agreed (Binali primary)
- [ ] Legal counsel relationship established (concurrent)
- [ ] Media holding statement ready: "We're aware of the situation and looking into it. We'll share an update by {time}."
- [ ] Member trust & safety policy published
- [ ] Sponsor + speaker code of conduct (separate from member; covers behavior toward members)

---

## 19. Anti-patterns (marketing-specific)

Beyond UX anti-patterns (UX guidelines §17), marketing has its own:

1. **No paid follower / engagement bots.** Period. Even small-scale "to bootstrap" buys. Permanent reputation damage when discovered (and it will be discovered).
2. **No buying email lists.** Outbound to people who never opted in violates GDPR + destroys deliverability + offends recipients.
3. **No "sponsored content" without disclosure.** "From our sponsor X" label always shown. Native advertising without disclosure is dishonest.
4. **No comparing ourselves negatively to other communities.** "Unlike X, we…" weakens our brand AND theirs. Ride our own positives.
5. **No claims we can't back up.** "Largest AI community in CA" → only when audit proves it. Otherwise: "growing community."
6. **No press release for non-news.** Sending a press release with no news erodes journalist trust. Save the channel for real news.
7. **No social media auto-DM on follow.** Universally hated. Members coming via LinkedIn don't deserve a templated DM thanking them.
8. **No artificial urgency** ("LAST CHANCE TO REGISTER" when 50% of seats remain).
9. **No engagement-bait headlines.** "You won't believe what happened at AI Qadam this week" type clickbait. Headline says what the post is about.
10. **No member testimonials without permission** (and signed release if used in paid materials).
11. **No screenshots of private Telegram conversations** in marketing without explicit permission. Even with anonymized handles.
12. **No taking credit for member achievements** beyond a respectful "Built after meeting at AI Qadam" attribution. The member made it; we hosted the connection.

---

## 20. Engineering items inherited into roadmap

The following marketing-required engineering items are inherited into [`community-platform-roadmap.md`](../01-business/community-platform-roadmap.md) as new or extended sprint items. Each ties back to a section here.

| Roadmap item | Source section | Sprint |
|---|---|---|
| S0.8 — UTM scheme + URL builder | §16 | Sprint 0 |
| S0.9 — Brand asset library + `/press` page scaffolding | §15 | Sprint 0 |
| S1.6 — Lead capture for non-registrants + 3-email nurture | §3.2 | Sprint 1 |
| S1.2 extension — NPS question added to CSAT | §3.3 | Sprint 1.2 |
| S2.6 extension — cohort retention curves + K-factor | §3.3, §3.4 | Sprint 2.6 |
| S3.2 extension — sponsor co-marketing kit in cabinet | §10 | Sprint 3.2 |
| S3.2 extension — `quarterly_digests` section in sponsor cabinet | §14 | Sprint 3.2 |
| S3.3 extension — speaker amplification kit in cabinet | §11 | Sprint 3.3 |
| S5.1 extension — `acquisition_source` jsonb on registrations (first+last touch) | §16.3 | Sprint 5.1 |
| S5.7 — Listmonk deploy + newsletter v0 (DEFERRED to Phase ζ pending event density) | §6 | Phase ζ |
| S5.8 — Marketing dashboard (Metabase pages) | §17 | Sprint 5 |
| S5.9 — Campaign landing pages (`/welcome/[slug]`) | §4.3 | Sprint 5 |
| ζ.8 — Blog + RSS + posts collection | §5 | Phase ζ |
| Concurrent — `media_contacts` Twenty view | §8.2 | Concurrent |
| Concurrent — `influencer_partners` Twenty view | §9.2 | Concurrent |
| Concurrent — `community_partners` Twenty view | §9.5 | Concurrent |
| New actor — **Community Volunteering Board** in roadmap §3 | §2.4 + §14 | Roadmap update |

---

## 21. Open marketing decisions

| Decision | Blocks | Owner |
|---|---|---|
| **Future revenue streams** (demo-day fees / mentorship / equity-in-alumni)? Phasing? | Sprint 3.2 (sponsor cabinet's pricing surface should reflect what we DO and DON'T charge for) | PM (Binali) |
| **LinkedIn organization page** set up by whom + posting cadence ownership | Concurrent operator work | PM |
| **Telegram broadcast channel** structure (one per country + cross-country aggregator?) + admin assignment | Concurrent operator work | PM + country leads |
| **Twitter/X presence** — set up org account or operate from Binali + Viktor only? | Concurrent | PM |
| **Instagram start trigger** — what milestone justifies launching IG? | Phase ζ | PM |
| **Newsletter trigger** — what's the exact "≥ 4 events/month" threshold trigger? | Phase ζ.x | PM |
| **First paid spend trigger** — what milestone unlocks LinkedIn Sponsored / Telegram boosts / podcast ads? | Sprint 5+ | PM |
| **Press machine activation trigger** — what milestone justifies the `/press` page + press list? | When first inbound press request lands, or month 4 proactive | PM |
| **Brand asset library tooling** — Directus collection (single source) vs S3 bucket + Directus tracking + Figma? | Sprint 0.9 | PM + Viktor |
| **Influencer compensation model** — when influencer drives ≥ N registrations, do we pay them? Revenue share? Sponsor commission? | Concurrent (post-Sprint 3.2a) | PM |
| **Photo + video producer relationship** — in-house, contractor per event, or member volunteer? | Concurrent | PM + country leads |
| **Quarterly digest design ownership** — Viktor (AI design pipeline) or external designer? | Q1 digest production | Binali |

---

## 22. Cross-references

- **Strategic context:** [`community-platform-roadmap.md` §0–§2](../01-business/community-platform-roadmap.md#0-situation)
- **Actor lifecycles** (member, speaker, sponsor, operator, event, **+ new: board**): [`community-platform-roadmap.md` §3](../01-business/community-platform-roadmap.md#3-actor-lifecycles)
- **Process flows** marketing operates within: [`community-platform-roadmap.md` §4](../01-business/community-platform-roadmap.md#4-process-flows-the-platform-must-support)
- **UX heuristics + content voice** (member-facing): [`ux-and-content-guidelines.md`](../04-development/design-system/ux-and-content-guidelines.md)
- **Interactions dispatcher** (templated messages): `docs/04-development/architecture/interaction-architecture.md` §4 + this doc §13.6 templates
- **Sprint plan** (where marketing items execute): [`community-platform-roadmap.md` §7](../01-business/community-platform-roadmap.md#7-build-plan-sprints)

When in doubt: **build the loop, then build the campaign.** Marketing infrastructure is build-it-before-you-need-it, just like RBAC.
