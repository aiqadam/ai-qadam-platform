# AI Qadam — UX research, design rulesets, and content guidelines

> **Companion to [`community-platform-roadmap.md`](./community-platform-roadmap.md).** The roadmap tells you WHAT to build and WHY; this document tells you HOW IT SOUNDS, FEELS, AND BEHAVES. Developers, designers, and content writers consult both before shipping anything member-facing.
>
> This is the full UX research deliverable: scope, personas, information architecture, UX heuristics & rulesets, design system rules, accessibility + responsive specs, form structures (field-level), task flows, interaction patterns, content guidelines, microcopy + notification copy, empty/loading/error states, anti-patterns, and UX quality metrics. When in doubt: clarity over cleverness, honesty over hype, respect over warmth-theatre.
>
> Authored 2026-05-19. Senior UX researcher with background in community platforms (Meetup, Eventbrite, Lu.ma, Read.cv), edtech (Coursera, Duolingo), behavioral economics (Fogg, Clear), persuasion (Cialdini), and motivation theory (Self-Determination Theory).

---

## Table of contents

0. [What UX research delivers (scope)](#0-what-ux-research-delivers-scope)
1. [Voice & tone principles](#1-voice--tone-principles)
2. [Audience model + personas](#2-audience-model--personas)
3. [Information architecture](#3-information-architecture)
4. [UX heuristics + rulesets](#4-ux-heuristics--rulesets)
5. [Design system rules](#5-design-system-rules)
6. [Accessibility (WCAG 2.2 AA target)](#6-accessibility-wcag-22-aa-target)
7. [Responsive design rules](#7-responsive-design-rules)
8. [Interaction patterns + state management](#8-interaction-patterns--state-management)
9. [Form structures (field-level specs)](#9-form-structures-field-level-specs)
10. [Task flows](#10-task-flows)
11. [Identity reinforcement moments](#11-identity-reinforcement-moments)
12. [Onboarding scripts (per actor)](#12-onboarding-scripts-per-actor)
13. [Notification copy library](#13-notification-copy-library)
14. [Empty / loading / error states](#14-empty--loading--error-states)
15. [Microcopy patterns (button + link + label library)](#15-microcopy-patterns-button--link--label-library)
16. [Content provision approach](#16-content-provision-approach)
17. [Anti-patterns (explicitly DON'T do)](#17-anti-patterns-explicitly-dont-do)
18. [UX quality metrics + research methods](#18-ux-quality-metrics--research-methods)
19. [Implementation notes for developers](#19-implementation-notes-for-developers)
20. [Open UX decisions](#20-open-ux-decisions)
21. [Cross-references](#21-cross-references)

---

## 0. What UX research delivers (scope)

A complete UX research deliverable for a platform of this size has 12 layers. This document covers all of them.

| Layer | What it answers | Where in this doc |
|---|---|---|
| **Personas + needs** | Who are we designing for? What do they want? What's their context? | §2 |
| **Information architecture** | How is the platform organized? What's where? What's the navigation model? | §3 |
| **Heuristics + rulesets** | What design principles govern decisions when no spec exists? | §4 |
| **Design system rules** | Typography, color, spacing, components — used how, when? | §5 |
| **Accessibility** | Who is excluded if we don't think about it? What's our conformance bar? | §6 |
| **Responsive design** | How does this work on phones vs laptops vs Telegram WebApp? | §7 |
| **Interaction patterns** | What happens when the user clicks/taps/types? Sync vs async, optimistic vs waited, etc. | §8 |
| **Form structures** | Every form's field-by-field spec: type, validation, dependencies, conditional display | §9 |
| **Task flows** | Step-by-step from entry to completion for each key task, with all branches | §10 |
| **Content guidelines** | Voice, tone, copy patterns, content templates | §1, §11–§16 |
| **States + edge cases** | Empty, loading, error, success — what happens, what's shown | §14 |
| **UX quality measurement** | How we know UX is improving (or regressing) over time | §18 |

**What UX research is NOT (already-provided assets this doc defers to):**
- **Visual design / brand identity** — already provided. Tokens at [`design-system/tokens.css`](../design-system/tokens.css), components at [`design-system/components.css`](../design-system/components.css), portal compositions at [`design-system/portal.css`](../design-system/portal.css). Brand marks at `apps/web/public/brand/`. The 22 designed screens from Claude Design handoff at `/tmp/aiqadam-design/aiqadam/project/AI Qadam Portal.html` are the visual source of truth.
- **Engineering architecture** — lives in [`community-platform-roadmap.md`](./community-platform-roadmap.md), [`interaction-architecture.md`](./interaction-architecture.md), ADRs at `docs/adr/`.
- **Product strategy / business model** — lives in `community-platform-roadmap.md`.

**§5 below ("Design system rules") is USAGE rules** — how to apply the existing visual system in UX contexts (e.g., "one primary CTA per page", "no display font for body"). It does NOT re-specify what already exists in tokens/components — it tells implementers when + why to reach for each.

**Research methods used / planned:**
- **Persona synthesis** — drawn from existing knowledge of the audience (event 1 attendees, Viktor's network, comparable communities like ML Almaty, Tashkent Tech meetups)
- **Heuristic evaluation** — applied to existing surfaces (PRs #67–#87)
- **Task analysis** — derived from actor lifecycles in roadmap §3
- **Tree testing for IA** (planned, post-Sprint 2 when workspace lands)
- **Moderated user testing** (planned, Sprint 1 — 5 members + 3 country leads + 2 speakers + 2 sponsor reps)
- **Unmoderated tests** (post-Sprint 5, when forms multiply)
- **Analytics review** (Plausible — quarterly)
- **CSAT** (Sprint 1 — ongoing)

---

## 1. Voice & tone principles

Five principles govern every word on every surface. When unsure, re-read them.

### 1.1 Talk to professionals like professionals
Our audience is AI engineers, ML researchers, founders, serious students. They build systems for a living. They tolerate Slack-speak from their tools; they prefer respect from their community. **Default register: warm but not casual. Confident but not corporate. Specific but not jargon-heavy.**

| Avoid | Prefer |
|---|---|
| "Hey there! 👋 Welcome to AI Qadam!" | "Welcome. You're in." |
| "Oops! Something went wrong 😢" | "We couldn't process that. Try again, or [contact us](#) if it keeps happening." |
| "🎉 Awesome! You're registered!" | "Registered. See you at {event}." |
| "Hop on over to your dashboard" | "Open your dashboard" |
| "Pretty please update your profile" | "Add a one-line bio so members can find you" |

### 1.2 Speak as the community, not as a vendor
There is no "we, the platform, are happy to inform you…" We are AI Qadam — the people, the gatherings, the work. The platform is the medium, not the speaker.

| Vendor voice | Community voice |
|---|---|
| "The system has cancelled your registration." | "You cancelled your spot. Your seat is open for someone else." |
| "Click here to access your account." | "Open your profile" |
| "Our team will respond within 48 hours." | "{name} or {name} will get back to you in a day or two." |
| "Sign up for our newsletter to receive updates." | "Want a monthly digest of what's happening in CA? [Yes]" |

### 1.3 One verb per CTA
Every button is a single verb. "Continue with Authentik" is fine; "Click here to continue to your next step" is a failure. Hierarchy through size + color, not word count.

### 1.4 Honesty about ambiguity > false certainty
When something might fail, say so. When timing is uncertain, give a range. When a decision isn't final, say "we're considering" not "we will." Trust compounds; false certainty erodes it.

### 1.5 English-default, Russian-equal
EN and RU are both first-class. Tech terms stay in English ("AI", "LLM", "GPU", "prompt") even in Russian copy — the audience code-switches naturally. **Never machine-translate.** Every Russian string is hand-localized by someone who speaks the audience's register (informal-professional, not bureaucratic). UZ-Latn and KK lower-priority but follow same rules when shipped (Sprint 6.6).

---

## 2. Audience model + personas

Three personas drive every decision. When in doubt, picture them.

### Note on team roles (used in onboarding scripts + signatures throughout this doc)

**Founder:** Binali Rustamov — voice for big-deal welcomes, vision posts, founder essays, press attribution, quarterly digest sign-off.

**COO + Head of Vibe Code & Platform Operations:** Viktor Drukker — voice for platform updates, ops emails, build-in-public content, tech-platform questions, operator-side communications.

**Country leads:** named persons running each country — voice for country-specific member comms, T+7 personal nudges, post-event recaps for their country.

**Community Volunteering Board:** governance + advisory body. Recipient of quarterly digests, monthly board updates. Read-only RBAC. Not member-facing.

When a script says `{country_lead_first_name}` it means the country lead for the recipient's country. `{operator_name}` is the country lead OR Viktor for cross-country / platform matters. Big-deal communications (first major sponsor signed, country launch, milestone announcements) are signed by Binali. Marketing-channel + LinkedIn presence per [marketing playbook §12](./marketing-and-pr-playbook.md#12-founder-led-growth-binali--viktor).

---

### Persona A: "Aigerim, ML engineer at a fintech in Almaty"
- 28, has a stable role, eyes the international market
- LinkedIn-active, Telegram-native, occasional Twitter/X
- Attends meetups for: signal value on her CV, learning latest, meeting people who could become co-founders / referees / hires
- Pain: most local content is too beginner-level; international content doesn't fit her time zone or career stage
- What she wants from us: high-signal events, ability to BE SEEN as someone who attends (public profile, leaderboard, badges that recruiters notice)

### Persona B: "Sardor, AI-curious founder in Tashkent"
- 35, runs a small SaaS, knows he needs to integrate LLMs but doesn't know how
- Telegram-dominant, low LinkedIn use, no Twitter
- Attends meetups for: practical guidance, finding a contractor or hire, networking with peers ahead of him
- Pain: AI hype overwhelming, doesn't know who to trust, intimidated by code-heavy talks
- What he wants: events that meet him at his level, speakers who explain rather than show off, founders he can grab coffee with

### Persona C: "Karina, AI ops at a startup, helps run AI Qadam KZ"
- 30, full-time job + 5–10h/week as country lead
- Loves the community work but doesn't want it to consume weekends
- Pain: too many manual steps, hard to find right speakers in Almaty, sponsor follow-ups slip
- What she wants: a workspace that does boring stuff so she can focus on human stuff

**All copy + flows must work for all three.** Aigerim and Karina are technical and tolerate dense interfaces; Sardor needs warmer hand-holding. When trade-offs are forced, **bias toward Sardor's clarity** — Aigerim and Karina forgive simplicity, Sardor punishes complexity.

### Cross-persona needs analysis

| Need | Aigerim | Sardor | Karina |
|---|---|---|---|
| Discover events easily | High | High | Medium (creates them) |
| Identity signaling (profile/badges) | High | Low | Medium |
| Fast registration | High | Medium | n/a |
| Personal welcome | Low | High | n/a |
| Clear venue/transit info | Medium | High | High (must provide) |
| Reduce repetitive operator tasks | n/a | n/a | High |
| RU language quality | Medium | High | High |
| Mobile-first surfaces | High (commute) | High (only device) | Medium |

---

## 3. Information architecture

### 3.1 Site map per actor

**Public / unauthenticated visitor:**
```
/                          (homepage — country-localized hero, next events, partners, about)
/events                    (events index — upcoming + past toggle)
/events/{id}               (event detail)
/u/{handle}                (public profile of a member who's been on stage / opted public)
/sponsor                   (public "sponsor with us" landing)
/auth/sign-in              (Authentik handoff)
/auth/sign-out
/sitemap.xml               (M5.1)
/robots.txt                (M5.1)
```

**Member (signed-in client):**
```
/me                        (dashboard — upcoming, attended, badges, points)
/me/profile                (profile editor)
/me/preferences            (consent toggles)
/me/preferences/visibility (Sprint 5.6 — who sees what about me)
/me/feedback/csat/{token}  (Sprint 1.2 — CSAT form via tokenized link)
/me/access-log             (Sprint 2.5 — who accessed my data, transparency loop)
```

**Speaker (single-origin per architect decision):**
```
/app/speaker               (cabinet home — read-mostly)
/app/speaker/calendar      (upcoming + past talks)
/app/speaker/past          (per-talk: stats, recording, photos)
/app/speaker/propose       (propose-next-talk form)
```

**Sponsor (single-origin):**
```
/app/sponsor               (cabinet home — events sponsored)
/app/sponsor/leads         (opt-in lead list per event)
/app/sponsor/assets        (marketing assets download + upload)
/app/sponsor/reports/{id}  (per-event sponsorship report PDF — Sprint 3.5)
/app/sponsor/billing       (invoices + subscription state — depends on invoicing decision)
```

**Operator / country lead (workspace):**
```
workspace.aiqadam.org/                       (role-aware landing dashboard)
workspace.aiqadam.org/events                 (Directus events scoped to my country)
workspace.aiqadam.org/events/{id}            (per-event detail w/ parallel workstream status)
workspace.aiqadam.org/events/{id}/registrations
workspace.aiqadam.org/events/{id}/retrospective  (post-event notes — Sprint 1.1)
workspace.aiqadam.org/crm                    (Twenty workspace embedded, scoped)
workspace.aiqadam.org/crm/sponsors           (pipeline view — Sprint 3.2a)
workspace.aiqadam.org/cms                    (Directus CMS scoped)
workspace.aiqadam.org/analytics              (Metabase widgets scoped)
workspace.aiqadam.org/analytics/compare      (cross-country comparison — Sprint 2.6)
workspace.aiqadam.org/queue                  (operator approval queue — Sprint 3.4)
workspace.aiqadam.org/queue/lapsed           (T+7 personal-nudge queue — Sprint 1.1+2.4)
workspace.aiqadam.org/playbook               (operator playbook — Sprint 0.7)
workspace.aiqadam.org/countries              (super-admin only — provisioning wizard, Sprint 4.2)
```

### 3.2 Navigation patterns

**Member-facing (top nav):**
- Logo (→ home)
- Events
- Leaderboard
- Account (avatar dropdown: profile / preferences / sign out)
- Country switcher (UZ / KZ / TJ / global)
- Language switcher (EN / RU)

Sticky top, blurred backdrop, height 56px. No mega-menu. No hamburger on desktop ≥ 768px.

**Cabinet (sponsor / speaker):**
- Logo (→ cabinet home)
- Section tabs (sub-pages within cabinet)
- Help (→ documentation link)
- Account (avatar → sign out / switch to member view if user is also a member)

**Workspace (operator):**
- Logo (→ dashboard)
- Left sidebar: Dashboard / Events / CRM / CMS / Analytics / Queue / Playbook / (Countries — super-admin only)
- Top right: Country switcher (if multi-country lead) / Notifications / Account

**Breadcrumbs:** only on workspace deep pages (≥3 levels deep). Member-facing surfaces are flat enough that breadcrumbs are noise.

**Back navigation:** every page that's reachable from a parent has a small "← Back to {parent}" link at top-left of main content. Browser back must always work too.

### 3.3 URL structure conventions

- **Public, indexable:** `/events`, `/events/{id}`, `/u/{handle}` — clean, no query strings, sitemap-listed
- **Authenticated, ephemeral:** `/me/*`, `/app/*` — no SEO requirement, can have query strings
- **Operator:** `workspace.aiqadam.org/*` — separate subdomain, never indexed (robots.txt disallow)
- **API:** `/api/v1/*` — never directly user-facing
- **Token-authenticated single-use:** `/me/feedback/csat/{token}` — tokens expire after submission OR 30 days

### 3.4 Content hierarchy + relationships

```
COUNTRY (uz / kz / tj / ...)
  └── EVENT
        ├── PUBLICATION_STATUS (independent state machine)
        ├── VENUE
        ├── EVENT_SPEAKERS (junction, per-speaker state)
        │     └── SPEAKER (Directus collection)
        ├── EVENT_SPONSORS (per-sponsor state)
        │     └── SPONSOR (Directus collection)
        │            └── SPONSORSHIP_DELIVERABLES (per-event checklist)
        ├── REGISTRATIONS
        │     └── MEMBER (directus_users)
        └── EVENT_RETROSPECTIVE (operator notes)

MEMBER
  ├── PROFILE (interests, bio, visibility prefs)
  ├── CONSENTS (per-topic toggles)
  ├── EULA_ACCEPTANCES
  ├── BADGES (earned, displayed)
  └── INTERACTIONS (received messages — audit trail)
```

### 3.5 Search vs browse

- **Member-facing:** browse-first (events list, leaderboard, profile pages). Search added in Phase ζ (W1.x discovery pages) when content density justifies it.
- **Operator-facing:** search + filter from day 1 (event list filters, CRM search, member search) — operators query, members explore.

---

## 4. UX heuristics + rulesets

Adapted from Nielsen's 10 heuristics + Cialdini + community-specific principles. Use when no explicit spec exists.

### 4.1 The 13 rulesets

1. **Visibility of system status.** Always show what's happening. Forms submitting → button disabled + "Saving…". Long async → per-step status. Never silent.
2. **Match the real world.** "Cancel your spot" not "deregister entity." "What didn't work?" not "Submit dissatisfaction feedback."
3. **User control + freedom.** Undo where possible (1-click undo toast for non-destructive). Cancel always reachable. No forced multi-step modals when one screen would do.
4. **Consistency + standards.** Same word for same action everywhere (§15). Same component for same purpose. No bespoke UI for things that exist as standard patterns.
5. **Error prevention > error recovery.** Disable submit until form is valid. Confirm destructive actions. Suggest valid inputs rather than only rejecting invalid ones.
6. **Recognition > recall.** Show the user what they're doing (event title in every step of registration). Don't make them remember between pages.
7. **Flexibility + efficiency.** Power users (operators, frequent members) get keyboard shortcuts (Sprint 6+ — not P0). Defaults satisfy beginners.
8. **Aesthetic + minimalist.** Every visible element earns its place. No decorative emoji, no "for your convenience" filler text, no surveillance metrics.
9. **Help users recognize, diagnose, recover from errors.** Errors say WHAT failed + WHY + WHAT TO DO NEXT. "Email invalid" → "Email needs an @ — try again."
10. **Help + documentation.** Inline help text where ambiguity is likely. Documentation as a separate layer (operator playbook) not crammed into UI.
11. **(Community-specific) Trust signals visible.** Real attendance counts, real photos, real speaker names + companies. No marketing puffery.
12. **(Community-specific) Identity reinforced.** Status surfaces — badges, leaderboard, profile — present at moments members care about (see §11).
13. **(Community-specific) Operator-light, member-friendly.** Operator tools have density + power; member surfaces have warmth + simplicity. Don't apply the same density to both.

### 4.2 Decision rules when heuristics conflict

When two principles point opposite directions:
- **Member surface:** safety > speed > delight > density
- **Operator surface:** correctness > efficiency > consistency > novelty
- **Public surface:** trust > clarity > brand expression > visual polish

### 4.3 The "is this surface ready to ship?" checklist

Before any user-facing surface ships, verify:

- [ ] All 13 heuristics applied (or deviation noted with reason)
- [ ] Empty state defined (§14)
- [ ] Loading state defined (§14)
- [ ] Error states defined per known failure mode (§14)
- [ ] Success state reinforces identity per §11
- [ ] Form fields per §9 spec
- [ ] Microcopy per §15 patterns (action verbs especially)
- [ ] No anti-patterns from §17
- [ ] RU version drafted (or noted as pending with plan)
- [ ] Keyboard navigation works (§6.2)
- [ ] Mobile breakpoint works (§7)
- [ ] Manually tested with a screen reader for critical paths (§6.4)

---

## 5. Design system usage rules

> **The visual design system is already provided** — tokens, components, portal compositions, brand assets, and 22 designed screens are the source of truth (see §0 references). This section does NOT re-specify visual styles. It tells implementers **when** to reach for which token/component and **why**.
>
> If a USAGE rule below conflicts with what the visual design specifies, the visual design wins — update this doc to match, not the other way around.

### 5.1 Typography usage rules

Sizes + weights are defined in [`design-system/tokens.css`](../design-system/tokens.css) (Geist for display, Inter for body, JetBrains Mono for technical data). Usage discipline:

- **One h1 per page** — the page title. Skipping it breaks screen-reader landmark traversal (§6.4).
- **Never** use `var(--font-display)` for body paragraphs (display fonts have looser kerning that hurts long-form readability).
- **Never** use `var(--font-mono)` for prose (mono is for technical data: handles, IDs, code, timestamps).
- **Never** stack 4+ font weights on one screen — picks lose meaning when everything is "important".
- Heading hierarchy must match document outline (no h1 → h3 jumps for visual reasons; use CSS to size-tweak if needed).

### 5.2 Color usage rules

Tokens defined in `design-system/tokens.css`. Usage:

| Token | Use for | Don't use for |
|---|---|---|
| `--primary` (teal) | Primary CTAs, brand accents, active states | Backgrounds for large areas, body text |
| `--foreground` | Body text | Decorative elements |
| `--muted-foreground` | Secondary text, captions, placeholders | Required text, errors |
| `--background` | Page background | Buttons |
| `--card` | Container backgrounds | Body text background |
| `--border` | All borders, dividers | Decorative shapes |
| `--destructive` | Destructive actions (delete, ban), error states | Cancel buttons (use `--muted`) |
| `--success` | Confirmation states, "you're in" | Decorative |
| `--warning` | Soft warnings ("filling fast"), warning banners | Errors (use destructive) |

**Color blind safety:** never communicate state through color alone. Always pair with text/icon. "Cancelled" badge has both color AND the word.

### 5.3 Spacing scale

8px base unit. Use 8/12/16/20/24/32/48/64. Don't use 7, 11, 13, 17. **No arbitrary pixel values in CSS** outside design tokens.

### 5.4 Button hierarchy

| Variant | Use | Visual rule |
|---|---|---|
| **Primary** (`btn btn-primary`) | One per page — the main action | Filled teal, white text |
| **Secondary** (`btn`) | Alternate actions | Outlined, neutral |
| **Ghost** (`btn btn-ghost`) | Tertiary, in-list actions | No border, text-only |
| **Destructive** (`btn btn-destructive`) | Delete, ban, remove | Filled red, white text |
| **Outline** (`btn btn-outline`) | Toggle states, low-emphasis | Outlined, no fill |

Sizes: `btn-sm`, `btn` (default), `btn-lg`. **Never** use 4 sizes on one page.

**One primary CTA per page** — discipline. If a page has 3 primary buttons, two of them are wrong.

### 5.5 Icon use rules

- **Library:** Lucide only (per F1 design brief). No mixing icon sets.
- **Size:** match adjacent text size; default 16px in buttons, 20px in nav, 24px in feature contexts.
- **Color:** inherit from text color (currentColor). Don't tint icons separately.
- **Decorative icons:** `aria-hidden="true"`. Semantic icons: explicit `aria-label`.
- **Never** use an icon as the only signifier of an action — always pair with text on primary surfaces. Icon-only is OK for very common toolbar actions (close, expand).

### 5.6 Image + media rules

- **No AI-generated faces.** Real photos of real people only.
- **Stock photos discouraged.** If used, must be relevant (not "diverse team smiling at laptop"). Prefer locally-shot event photos.
- **Profile photos:** square, min 200px, max 1MB upload, JPEG/PNG/WebP.
- **Event hero images:** 16:9, min 1200×675, max 2MB.
- **Sponsor logos:** SVG preferred, PNG with transparent background acceptable, max 200KB.
- **Alt text required** on every img tag — see §6.5.

### 5.7 Component library (Astro + React islands)

Reuse before building. Existing components in `apps/web/src/components/`:
- `Nav.astro` — top nav
- `MeDashboard.tsx` — member dashboard
- `EventsTimeline.astro` / `EventsGrid.astro` / `UpcomingEventsGrid.astro` — event listings
- `RegistrationSidebar.tsx` — event detail registration island
- `PreferencesForm.tsx` — consent toggles
- `CheckinForm.tsx`, `SignInForm.tsx` — auth/checkin

New components for upcoming sprints (naming convention):
- `WorkspaceShell.astro` — workspace layout (Sprint 2.1)
- `AppLauncherCard.tsx` — launcher card with role/country gating (Sprint 2.3)
- `RBACBadge.tsx` — show user's roles + countries
- `EventLifecycleStatus.tsx` — multi-workstream mini-status (Sprint 2.4)
- `SponsorPipelineBoard.tsx` — kanban view (Sprint 3.2a)
- `CSATForm.tsx` — Likert + free text (Sprint 1.2)
- `CountryProvisioningWizard.tsx` — step-by-step provisioning (Sprint 4.2)
- `OperatorApprovalQueueItem.tsx` — queue list item

---

## 6. Accessibility (WCAG 2.2 AA target)

**Conformance bar:** WCAG 2.2 Level AA. Above-AA enhancements (e.g., AAA contrast on long-form text) where cheap.

### 6.1 Color contrast

- **Normal text:** 4.5:1 minimum contrast against background
- **Large text (≥18px or ≥14px bold):** 3:1 minimum
- **UI components + graphical objects:** 3:1 minimum
- **Brand teal `--primary` MUST pass against white + against `--background` (dark mode default)** — if it doesn't in any context, use a darker shade for that context

Test tool: WebAIM contrast checker; automated via Lighthouse in CI (M5.1 OG followup adds this).

### 6.2 Keyboard navigation

- **Every interactive element reachable via Tab.** No mouse-only widgets.
- **Logical tab order** — top-to-bottom, left-to-right; matches visual reading order.
- **Visible focus indicator** — outline 2px in `--primary` color, never `outline: none` without replacement.
- **Skip-to-main-content link** at top of every page (visually hidden until focused).
- **Escape closes modals, dialogs, popovers.**
- **Enter submits forms; Space activates buttons.** Standard behavior.

### 6.3 Form labels + error association

- **Every input has a `<label for>` — no orphaned placeholders.**
- **Required fields marked visually AND announced** (`aria-required="true"`).
- **Errors associated with inputs via `aria-describedby`** so screen readers announce them.
- **Live regions** (`aria-live="polite"`) for async error/success messages.

### 6.4 Screen reader behavior

- **Headings hierarchy** — one h1 per page; don't skip levels.
- **Landmarks** — `<header>`, `<nav>`, `<main>`, `<footer>` semantic tags. Not just divs.
- **Alt text:** decorative `alt=""`, informative alt describes content (not "image of"); functional (icon-buttons) alt = action.
- **Tables** use `<th scope="col|row">` and `<caption>` for complex data.
- **Lists** use `<ul>` / `<ol>` semantics, not div lists.
- **Dynamic content** updates via `aria-live` regions.
- **Test:** at minimum, run VoiceOver (macOS/iOS) or NVDA (Windows) through the critical paths — registration, profile edit, CSAT submit, workspace navigation — before each sprint ships.

### 6.5 Alt text rules

| Image type | Alt text |
|---|---|
| Decorative (background pattern, divider) | `alt=""` |
| Brand mark in nav | `alt="AI Qadam"` |
| Profile photo (member) | `alt="{first_name} {last_initial}"` — avoid full name for privacy |
| Event hero image | `alt="{event_title}"` |
| Speaker photo on event page | `alt="{speaker_name}, {speaker_role_one_line}"` |
| Sponsor logo | `alt="{company_name}"` |
| Functional icon button | `alt="{action verb}"` — e.g., "Close", "Open menu" |

### 6.6 Captions + transcripts

- **Event recordings (Phase ζ.1):** captions REQUIRED. Auto-generated via Whisper, then human-reviewed (operator task).
- **In-app video** (e.g., onboarding tutorial): captions + transcript.

### 6.7 Reduced motion

- Respect `prefers-reduced-motion: reduce` — disable parallax (none in our design anyway), avoid auto-playing carousels (none planned), shorten animation durations to ≤ 100ms.

---

## 7. Responsive design rules

### 7.1 Breakpoints

| Name | min-width | Typical device |
|---|---|---|
| `sm` | 0 | Phones (iPhone SE → Pro Max) |
| `md` | 640px | Tablets portrait, large phones landscape |
| `lg` | 1024px | Tablets landscape, small laptops |
| `xl` | 1280px | Standard laptop / desktop |
| `2xl` | 1536px | Large monitors |

**Mobile-first** for member-facing surfaces. **Desktop-first** for operator workspace (operators almost always on laptops with multi-monitor setups).

### 7.2 Per-surface responsive priority

| Surface | Mobile priority | Notes |
|---|---|---|
| Homepage | Critical | Most marketing-driven traffic is mobile |
| Event detail | Critical | Members register on phones during commute |
| Registration flow | Critical | Must work on slow 3G in Tashkent transit |
| /me dashboard | High | QR code shown for check-in |
| /u/{handle} public profile | High | Shared on LinkedIn, opened on mobile |
| Member preferences | Medium | Members go to a laptop for serious settings |
| Sponsor cabinet | Medium | Sponsor reps typically on laptops |
| Speaker cabinet | Medium | Speakers may check schedule on phone |
| **Operator workspace** | Low | Desktop-first; tablet OK; phone graceful-degrade only |
| Telegram WebApp views | Mobile-only | Sized for Telegram's bottom-sheet viewport |

### 7.3 Touch targets

- **Minimum target size: 44×44 px** (WCAG 2.5.5 enhanced).
- Adjacent targets separated by ≥ 8px to prevent fat-finger errors.
- Form fields min height 44px on mobile.

### 7.4 Telegram WebApp specifics (Sprint 5.5+)

- **Viewport:** Telegram provides height via `window.Telegram.WebApp.viewportHeight`. Use it; don't assume 100vh.
- **Theming:** Telegram exposes user's theme params; respect via `Telegram.WebApp.themeParams.bg_color`.
- **MainButton:** use Telegram's native MainButton API for primary action (renders at bottom, matches user's UI).
- **Closing the WebApp:** never assume user can close — provide explicit "Close" button.
- **Auth:** verify `initData` HMAC server-side; never trust client.

---

## 8. Interaction patterns + state management

### 8.1 Form submission

| Form type | Pattern | Rationale |
|---|---|---|
| Registration (event) | **Optimistic** — show success immediately, reconcile if server fails | Speed matters; user expects instant feedback |
| Profile edit | **Wait-for-server** with inline saved indicator | User cares about confirmation |
| CSAT submit | **Wait-for-server**, show "Submitting…" | Important to confirm the answer landed |
| Sponsor onboarding | **Wait-for-server** with step-by-step status | Multi-step, server-side validation |
| /me/preferences toggle | **Optimistic** with rollback on error | Toggles feel snappy when optimistic |

### 8.2 Save patterns

| Surface | Save mode |
|---|---|
| /me/profile | **Explicit Save button** — fields can be edited freely before commit |
| /me/preferences | **Auto-save on toggle** with subtle indicator |
| Workspace settings | **Explicit Save** — operator changes need intent |
| CMS content edit (Directus) | **Explicit Save + Publish** (Directus's own pattern) |

### 8.3 Confirmation patterns

| Action | Pattern |
|---|---|
| Cancel registration | Modal with reason field (optional) + clear consequence shown |
| Delete event (operator) | Modal: "Type the event title to confirm" — destructive + irreversible |
| Bulk operations (cancel 10 registrations) | Modal with count + checkbox list summary |
| Toggle preference | No confirmation — undo via toggle back |
| Send broadcast to N members | Modal with count + audience summary + "I understand this sends now" checkbox |

**No "Are you sure?" interrogatives.** Use action-language: "Yes, cancel my spot." / "Yes, delete event."

### 8.4 Loading patterns

| Wait time | Pattern |
|---|---|
| < 200ms | No indicator — instant feels broken if signaled |
| 200ms – 1s | Spinner inline |
| 1s – 10s | Skeleton screen mirroring final content layout |
| 10s – 60s | Per-step status with named steps |
| > 60s | Polling page with email-when-done option |

### 8.5 Toast / banner / modal — when to use

| Pattern | Use |
|---|---|
| **Toast** (auto-dismiss 4s) | Confirmation of completed action ("Saved"), low-priority update |
| **Banner** (persistent, dismissible) | Important info that doesn't block action (e.g., "EULA updated — review before next event") |
| **Modal** (blocks until dismissed) | Destructive confirmation, multi-step process, terms acceptance |
| **Inline message** (in form context) | Validation errors, contextual help |

**Never** show a modal on page load without user-initiated trigger. **Never** stack modals (one at a time).

### 8.6 Empty state vs loading state

When the user just loaded a page, two states look similar but mean different things:
- **Loading:** "we're fetching your data" — short, indicates progress
- **Empty:** "you have no data yet, here's what to do" — informative, actionable

Always distinguish. Loading must transition to either content or empty within timeout — never indefinite spinner.

### 8.7 Undo

For non-destructive actions (toggle preference, archive registration), provide toast with "Undo" button visible for 6 seconds. For destructive actions (delete event, ban member), use confirmation modal instead — no undo.

---

## 9. Form structures (field-level specs)

For each member-facing form: purpose, surface, every field's type + required-ness + validation + dependencies + conditional display, submit behavior, success state, error states.

### 9.1 Registration form (event)

**Purpose:** convert event-page visitor → registered attendee.
**Surface:** `/events/{id}` (event detail page sidebar).

**Sub-flow A: user not authenticated**
- Component: single button "Sign in to register" → Authentik OIDC handoff
- No form fields here; auth comes first

**Sub-flow B: user authenticated, event has no EULA**
- Single button: "Register"
- IF this event is sponsor-eligible: one checkbox above button:
  - Label: "Share my contact with this event's sponsors"
  - Type: checkbox
  - Required: NO (default unchecked)
  - Help text: "Sponsors get only opted-in attendee contacts. You can change this later."

**Sub-flow C: user authenticated, event has EULA (Sprint 5.5/7)**
- EULA preview (collapsible expanded by default if first time, collapsed if previously accepted): title, scrollable text, "Read full version" link
- For each `required_consent` from the EULA: a checkbox
  - Label: human-readable consent name (e.g., "I agree to the Code of Conduct")
  - Type: checkbox
  - Required: YES
  - Help text: short clarification of what this consent covers
- Same sponsor-contact checkbox as Sub-flow B (if applicable)
- Submit button: "Accept and register"

**Validation rules:**
- All required consents must be checked → button disabled until checked
- Server-side: re-verify `acceptance.eulaId` matches event's resolved EULA + all required consents are present (Sprint 5.5/7 API enforces)

**Submit behavior:** optimistic — disable button, show "Registering…", redirect to success page on 200, restore form + show error on 4xx/5xx

**Success state:** redirect to event detail page with success banner: "You're in. See you at {event_title} on {date}. Check your email for confirmation."

**Error states:**
- Capacity exceeded: replace button with "Join waitlist" → one-click
- EULA mismatch: banner "Terms updated since you last visited. Please re-review and accept."
- Auth expired: redirect to sign-in, return to event after
- Network: inline error, retry button

### 9.2 Profile editor (`/me/profile`)

**Purpose:** member self-describes to enable matching, public profile, identity reinforcement.

**Section 1 — Basics**
- First name — type: text — required: YES — pre-filled from Authentik — max 50 char
- Last name — type: text — required: YES — pre-filled — max 50 char
- Handle — type: text (kebab-case) — required: YES — unique — pattern `/^[a-z0-9][a-z0-9_-]{2,29}$/` — used in `/u/{handle}` URL
  - Placeholder: "your-handle"
  - Help text: "Lowercase, dashes or underscores, 3–30 chars. Used in your profile URL."
  - Validation: real-time check against API for uniqueness on blur
- Country — type: select (read-only) — value: from tenant
- City — type: text — required: NO — max 50 char — placeholder: "Tashkent / Almaty / Dushanbe / …"
- Languages spoken — type: multi-select — required: NO — options: EN, RU, UZ, KK, TJ, KG, other
- Avatar — type: file upload — required: NO — max 1MB — types: JPEG/PNG/WebP — square, auto-cropped

**Section 2 — Professional**
- Job title — type: text — required: NO — max 80 char — placeholder: "ML engineer / AI founder / Researcher"
- Company — type: text — required: NO — max 80 char — help text: "Visible only if you enable 'show company' in Visibility section below."
- LinkedIn URL — type: url — required: NO — pattern: must start with `https://www.linkedin.com/in/` or `https://linkedin.com/in/`
- GitHub username — type: text — required: NO — max 39 char (GitHub limit)
- Telegram username — type: text — required: NO — pre-filled if bot linked — pattern `/^@?[a-z0-9_]{5,32}$/`

**Section 3 — Identity**
- One-line bio — type: textarea — required: NO — max 140 char — placeholder: "ML engineer at a fintech, working on RAG for KZ legal docs."
  - Help text: "What you're working on, in one line. Members find you by this. 140 char limit (like a tweet)."
- Interests — type: multi-select tag picker — required: NO — min 0, max 8 tags — controlled vocabulary (LLMs, RAG, computer vision, MLOps, NLP, founders, hiring, infrastructure, etc.)
  - Help text: "Pick 3–5. We use these to suggest people you might want to meet at events. (Sprint 1.5)"

**Section 4 — Visibility** (Sprint 5.6)
- Each as toggle (default value in brackets):
  - "Appear on attendee lists for events I'm registered for" [ON]
  - "Appear on the public leaderboard" [ON]
  - "Appear in 'people you might meet' matches" [ON]
  - "Show my company on my public profile" [OFF]
  - "Show my GitHub username on my public profile" [ON if filled]
  - "Show my LinkedIn URL on my public profile" [ON if filled]
- (Sponsor-contact opt-in is per-event at registration, not here — see §9.1)

**Save behavior:** Section-level "Save" button at bottom of each section + global "Save all" at top. Inline "Saved {timestamp}" indicator after each save. Browser tab title prefixed "● " when unsaved changes exist.

**Validation:**
- All max-length errors inline, real-time
- Handle uniqueness checked on blur (debounced 500ms)
- LinkedIn URL pattern checked on blur
- File upload size + type checked on file selection

### 9.3 CSAT form (Sprint 1.2)

**Purpose:** capture event quality signal, anonymously.
**Surface:** linked from post-event email (`/me/feedback/csat/{token}`) — token-authenticated single-use.

**Fields:**
- (Header, not a field): "{event_title} — {full_date}"
- (Sub-header): "Your honest answer makes the next one better. ~60 seconds."

- **Q1 — Overall, how was the event?**
  - Type: radio group (1–5)
  - Required: YES
  - Labels: "1 — Not for me", "2 — Meh", "3 — OK", "4 — Good", "5 — Excellent"
  - Display: horizontal radio buttons with label below each

- **Q2 — What didn't work?** (conditional: shown if Q1 ≤ 3)
  - Type: textarea
  - Required: YES when shown
  - Max length: 2000 char (but show "two sentences is plenty" hint)
  - Placeholder: "What would have made this worth your time?"

- **Q3 — What would make the next one better?**
  - Type: textarea
  - Required: NO
  - Max length: 2000 char

- **Q4 — Anyone we should invite as a speaker?**
  - Type: textarea
  - Required: NO
  - Max length: 500 char
  - Placeholder: "Name + one line about why"

**Anti-pattern reminder:** NEVER show name/email fields here. Token-authenticated, anonymous at write-time per Sprint 1.2 spec.

**Submit behavior:** wait-for-server, disable button, "Submitting…"
**Success state:** "Thanks. Your answer landed. — {country_lead_first_name}" + (if Q1 ≤ 3) appended: "I'll personally read your comment within 48h."
**Error state:** "We couldn't save that. [Try again](#) or [email me directly](mailto:{country_lead_email})."
**Idempotency:** token can only be submitted once. Second visit → "You've already responded to this survey. Thank you."

### 9.4 Speaker propose-talk form (Sprint 3.3)

**Surface:** `/app/speaker/propose`

- **Proposed title** — type: text — required: YES — max 80 char — placeholder: "Punchy is fine. We'll workshop it together."
- **Proposed abstract** — type: textarea — required: YES — 100–500 char — placeholder: "What's the talk about? Who'd learn from it? What's one thing the audience leaves with?"
- **Format** — type: radio — required: YES — options: "25-min talk / Workshop (90 min) / Panel (45 min) / Lightning (10 min)"
- **Audience level** — type: radio — required: YES — options: "Beginner-friendly / Mid-level / Advanced"
- **Topic tags** — type: multi-select — required: YES — min 1, max 5 — controlled vocabulary (same as profile interests)
- **Preferred date window** — type: date range picker — required: NO — placeholder: "Optional. If you have constraints, tell us."
- **Anything else?** — type: textarea — required: NO — max 1000 char

**Submit:** "Send to operator"
**Success:** "Proposal sent. {country_lead_first_name} reviews proposals within ~5 days. You'll hear back via your cabinet + email."
**Validation:** all required fields shown with error inline. Title + abstract have live character counters.

### 9.5 "I want to sponsor" public form (Sprint 3.2)

**Surface:** `/sponsor` (public, unauthenticated).

- **Your name** — type: text — required: YES — max 100 char
- **Your role** — type: text — required: YES — max 80 char — placeholder: "Marketing manager / Founder / HR director"
- **Your work email** — type: email — required: YES — server-side: validate not a free email provider (gmail/yahoo/etc.) optional — IF free email: show soft warning "Work email helps us route faster, but it's OK if you don't have one."
- **Company** — type: text — required: YES — max 100 char
- **Company website** — type: url — required: NO
- **Country(ies) you'd want to sponsor in** — type: multi-select — required: YES — options: UZ / KZ / TJ / all
- **Budget range** — type: radio — required: YES — options: "Under $500 / $500–2K / $2K–10K / Above $10K / Let's talk"
- **What you'd want from sponsorship** — type: textarea — required: YES — max 500 char — placeholder: "Recruiting / brand / launching a product / hiring leads / other"
- **Timing** — type: radio — required: YES — options: "Next 1 month / Next 3 months / Exploratory"

**Anti-spam:** Cloudflare Turnstile or honeypot field — NO CAPTCHA (UX hostility).
**Submit:** "Send"
**Success state:** "Thanks. {operator_name} will reach out within 2 business days from {operator_email}. We typically start with a 30-min intro call."
**Error states:** standard.

### 9.6 Cancel registration

**Surface:** modal triggered from event detail page or /me dashboard.

- **(Optional) Why? Just helps us improve.**
  - Type: textarea
  - Required: NO
  - Max 500 char
  - Placeholder: "Schedule conflict / topic shifted / venue too far / something else"

**Buttons:** "Keep my spot" (secondary) | "Release my spot" (destructive)
**Confirmation copy in modal:** "{N} people are on the waitlist — your spot will go to the next one. You can re-register if you change your mind (subject to capacity)."

### 9.7 Operator: create event form (workspace)

**Surface:** `workspace.aiqadam.org/events/new`

**Section 1 — Basics**
- Title — type: text — required: YES — max 120 char
- Short description (≤ 300 char) — type: textarea — required: YES — counter shown — used in cards + OG
- Long description — type: rich text (Markdown) — required: YES — template-prefilled per §16.1
- Event type — type: select — required: YES — options from `event_types` collection (meetup / workshop / hackathon / conference / online)
- Country — type: select — required: YES — auto-set to operator's primary country, super-admin can change

**Section 2 — When + where**
- Starts at — type: datetime — required: YES — tz from country profile
- Ends at — type: datetime — required: YES — must be > starts_at
- Venue — type: text (autocomplete from past venues) — required: NO at draft, YES before publish
- Address — type: text — required: when Venue is set
- Capacity — type: number — required: YES — min 1 — max 10000

**Section 3 — Publication**
- Publication status — radio: Draft / Published / Cancelled — default Draft
- Visibility scope — radio: Public / Members only / Invite only — default Public
- **Hint shown below publication radio:** "You can publish before speakers are confirmed. Speakers announce incrementally as they confirm. (See lifecycle in roadmap §3.5.)"

**Section 4 — EULA**
- Per-event EULA — type: select — required: NO — options: from `eulas` collection where `status=published` — default: inherit from event_type
- (Hint): "Most events don't need a custom EULA. Leave blank to use the type's default."

**Section 5 — Speakers** (separate sub-tab/section in workspace event detail, not part of create form)
- Link to: "Add speakers →" (opens `event_speakers` management view)

**Section 6 — Sponsors** (same — separate management view)

**Submit:** "Save draft" / "Save and publish"
**Validation:**
- Title required for any save
- Venue+Address required before publish
- Capacity required for any save
- Ends_at > Starts_at server-side enforced
- Slug auto-generated from title; editable in advanced settings

### 9.8 Operator: add speaker to event (workspace)

**Surface:** within event detail in workspace — "Speakers" sub-tab.

- Search for existing speaker — type: search autocomplete against `speakers` collection
- OR: invite new speaker by email — type: email — triggers send-invite flow
- Talk title — type: text — required: NO at invite, YES at confirm
- Talk abstract — type: textarea — required: NO at invite, YES at confirm
- Slot time — type: time within event range — required: NO at invite

**State transitions** (operator updates as they happen):
- Add speaker → status: `invited` (sends invitation Interaction)
- Speaker responds in cabinet → status: `accepted`
- Operator approves abstract → status: `confirmed` → triggers Sprint 1.1 incremental announcement flow
- Cancel: → status: `cancelled` (operator must add a reason)

---

## 10. Task flows

Step-by-step for each key task, including branches.

### 10.1 Member: register for an event

```
Entry: Member sees event link (email, Telegram, social share, browse /events)
  ↓
Land on /events/{id}
  ↓
[Branch: authenticated?]
  ├─ No  → Click "Sign in to register" → Authentik OIDC → return to event
  └─ Yes → Continue
  ↓
[Branch: event has EULA?]
  ├─ No  → Click "Register" → optimistic success → redirect to confirmation page
  └─ Yes → EULA preview + consent checkboxes
           ↓
           Check all required consents (button disabled until done)
           ↓
           Optional: check "Share contact with sponsors"
           ↓
           Click "Accept and register"
  ↓
[Branch: capacity available?]
  ├─ Yes → success: "You're in" + email/Telegram confirmation fires
  └─ No  → "Event is full. Join waitlist?" → one-click join → confirmation
  ↓
Land on success page: shows event summary, calendar add buttons, "what's next" hints
  ↓
Background: T+0 → T+1h → T+3d → T-2d → T-3h → T+1d notification ladder fires (§12.1)
```

### 10.2 Member: change preferences

```
Entry: from /me dashboard OR direct link from notification email footer
  ↓
Land on /me/preferences
  ↓
For each topic toggle:
  Click → optimistic UI flips → background PATCH to API
  ↓ (success)
  Subtle "Saved" inline indicator
  ↓ (failure)
  Toggle reverts + toast: "Couldn't save — try again"
  ↓
Optional: navigate to /me/preferences/visibility (Sprint 5.6) for finer-grained control
  ↓
Exit: any nav action — no save button (auto-saved)
```

### 10.3 Speaker: respond to invitation

```
Entry: invitation email — "You've been invited to speak at AI Qadam {country} on {date}"
  ↓
Click "Open speaker cabinet" → Authentik OIDC (if first time) → speaker cabinet
  ↓
See pending invitation card with: event details, expected audience, deadline to respond
  ↓
[Branch: response]
  ├─ Accept → status: `accepted` → operator notified → cabinet shows confirmation
  │           ↓
  │           Prompt to add talk title + abstract (Sprint 3.3 form)
  │           ↓
  │           Operator reviews → approves → status: `confirmed`
  │           ↓
  │           Sprint 1.1 incremental announcement fires
  │
  └─ Decline → reason picker (optional) → status: `cancelled` → operator notified
```

### 10.4 Sponsor rep: review post-event report

```
Entry: notification email — "{event_title} — your sponsorship report" (Sprint 3.5)
  ↓
Click "Open report in cabinet" → Authentik OIDC → sponsor cabinet
  ↓
Land on /app/sponsor/reports/{event_id}
  ↓
See: numbers panel, lead list (CSV + Twenty export), photos, recording of their slot
  ↓
[Branch: actions]
  ├─ Download lead CSV → click → file downloads + audit log entry
  ├─ View attendee breakdown by company/role → expand panel
  ├─ Request renewal conversation → opens form → goes to operator queue
  └─ Close → cabinet home
```

### 10.5 Country lead: post-event close-out

```
Entry: event reached `ends_at`
  ↓
Background (Sprint 1.1): event-end flow fires
  - CSAT broadcasts to attendees
  - Thank-you to speakers (with "who next?" prompt)
  - "Next event" teaser if scheduled
  ↓
Operator workspace event detail shows: "Post-event tasks: 3 pending"
  ↓
Country lead opens /workspace/events/{id}/retrospective
  ↓
- Write retrospective (what worked, what didn't, tags for replication)
- Review CSAT results (auto-aggregated, anonymized)
- Approve any operator-assisted Interactions in the queue
- Mark sponsor deliverables checklist as complete
- Optional: trigger personal nudges for non-returner queue (T+7 flow)
  ↓
Click "Close event" → status: archived (after 90 days)
```

### 10.6 Super-admin: provision new country (Sprint 4)

```
Entry: workspace → /countries → "Activate new country"
  ↓
Wizard step 1: Country basics (code, name, primary city, time zone)
  ↓
Step 2: Country profile (locale, currency, holidays, channel routing defaults)
  ↓
Step 3: Country lead assignment (search existing user OR invite by email)
  ↓
Step 4: Review + activate
  ↓
[Click "Activate"]
  ↓
State machine runs (Sprint 4.1):
  - Register Authentik OIDC redirect URI [✓ / ✗ retry]
  - Create Directus permission policy [✓ / ✗ retry]
  - Create Twenty workspace tag [✓ / ✗ retry]
  - Create Plausible site [✓ / ✗ retry]
  - Register Coolify FQDN [✓ / ✗ retry]
  ↓
[All ✓?]
  ├─ Yes → "{country} is live. Country lead invited via email."
  │        Country lead receives welcome email (§12.4)
  │
  └─ No  → "Provisioning paused. Retry {failed step} or [contact engineer]."
```

---

## 11. Identity reinforcement moments

Per [strategic thesis #2 in the roadmap](./community-platform-roadmap.md#2-strategic-theses-read-these-before-sprinting): status > convenience. The platform must constantly reinforce "I am an AI engineer in Central Asia who belongs to this community" — not "I am a user of this app."

| Moment | What the platform does | Why it matters |
|---|---|---|
| First registration | "You're in. {event_title}, {date}, {venue}. {N} other engineers are coming." | Social proof + commitment |
| First check-in | "Welcome, {first_name}. Look for the {organizer_name} sign." | Named person reduces anxiety |
| Post-event recap | "{first_name}, you attended. 84 others did too. Recording + photos: [link]" | Cohort identity |
| Second attendance | "Your second AI Qadam event. {country lead} noticed." | Personal recognition |
| 3rd / 5th / 10th | Badge issued + post on /u/{handle} + (optionally) DM | Visible status accumulation |
| Referred a friend who attended | "Thanks for bringing {friend_first_name}. They had a great time (CSAT: 4.7)." | Pro-social reinforcement |
| Spoke at first event | New badge: "Speaker — AI Qadam {country} {year}". Public on profile. | High-status identifier |
| Anniversary | "One year ago today you registered for your first AI Qadam event." | Belonging through time |

**Never** show: total minutes spent on the platform, engagement scores, "you've been inactive" guilt prompts.

---

## 12. Onboarding scripts (per actor)

Concrete first-30-days. Each line is a real message that ships.

### 12.1 Member onboarding (T = first registration)

**T+0 (immediately after registration)** — email + Telegram if linked:

> Subject: You're in — {event_title}, {date}
>
> Hi {first_name},
>
> You're registered. Save the date:
>
> **{event_title}**
> {full_date_with_weekday} · {start_time}–{end_time}
> {venue_with_address}
>
> Add to calendar: [Google] · [Apple] · [.ics]
>
> What to expect:
> - {N} other engineers are coming
> - Topics: {topic_tags}
> - Speakers: {speaker_names_or_"announced soon"}
>
> If you can't make it, [release your spot](#) so someone on the waitlist can take it.
>
> See you there,
> {country_lead_first_name}
> AI Qadam {country}

**T+1 hour** — Telegram (or email if not linked):

> Welcome to AI Qadam, {first_name}. We're a community of AI engineers across Central Asia — 200+ members, monthly events in {cities}, conversations in our [Telegram channel](#).
>
> Two quick things:
> 1. Pin our Telegram channel so you don't miss event updates
> 2. Add a one-line bio + interests to your profile — helps you meet relevant people [Open profile](#)
>
> Questions? Reply to this email — {country_lead_first_name} reads them.

**T+3 days OR T-7 days, whichever is later** — Sprint 1.5 matching:

> Subject: 3 people you might want to meet at {event_title}
>
> Hi {first_name},
>
> Based on your interests ({user_interests_2_or_3}), here are three other people coming:
>
> - **{name_1}** · {job_title} at {company_if_opted_in_else_blank} · interested in {shared_interest_1}
> - **{name_2}** · {job_title} · interested in {shared_interest_2}
> - **{name_3}** · {job_title} · interested in {shared_interest_3}
>
> Worth saying hi when you're there. They'll all be wearing AI Qadam name tags.
>
> [Tweak who you appear as in matches](#)

**T-2 days** — reminder + question prompt:

> Subject: {event_title} in 2 days — bring a question
>
> Hi {first_name},
>
> Reminder: **{event_title}** on {date_short} at {start_time}.
> {venue_short_address} · {transit_hint}
>
> The best events have great audience questions. **What's one thing you'd want to ask {speaker_name}?** Bring it; their Q&A starts at {qa_start_time}.
>
> Can't make it? [Release your spot](#) — there are {waitlist_count} people who'd love to take it.

**T-3 hours** — Telegram-first:

> {event_title} starts at {start_time}. Doors open {doors_open_time}.
> 📍 {venue} · [Map](#)
> Look for {organizer_name}.
>
> Can't make it? [Cancel](#)

**T+1 day post-event** — CSAT delivery:

> Subject: How was {event_title}?
>
> Hi {first_name},
>
> Thanks for coming. 90 seconds of your time:
>
> [Open survey](#)
>
> Recording: [link]
> Photos: [link]
> Next event ({next_event_title}, {next_event_date}): [Register](#)
>
> Your honest answer makes the next one better.
> {country_lead_first_name}

**T+7 days, IF no second-event registration** — operator-assisted personal nudge:

> Subject: was it worth your time?
>
> Hi {first_name},
>
> {country_lead_first_name} here. I noticed you haven't registered for {next_event_title} yet — totally fine, just wanted to ask: was {prev_event_title} worth your evening?
>
> If yes-but-busy: no worries, [the calendar is here](#).
>
> If something didn't land — content too basic / too advanced / wrong topic / venue / timing — I'd love to know. One sentence reply is enough.
>
> Thanks for trying us.
> {country_lead_first_name}

### 12.2 Speaker onboarding

**T+0 — operator invitation (manual, templated)**:

> Subject: Speaker invitation — AI Qadam {country} {month}
>
> Hi {speaker_first_name},
>
> {how_we_know_them_one_sentence}. I'm reaching out because {specific_reason_referencing_their_work}.
>
> We'd love to have you speak at AI Qadam {country} on one of:
> - {date_option_1} ({event_theme_1})
> - {date_option_2} ({event_theme_2})
> - {date_option_3} ({event_theme_3})
>
> Format: 25-min talk + 15-min Q&A. Audience: ~80–120 engineers, mostly mid-to-senior. Venue: {typical_venue_description}.
>
> What we offer: an engaged audience that asks great questions, a high-quality recording you can share, professional photography, a thank-you bottle of {local_thing}. We cover transit + dinner. (No speaker fees today.)
>
> Interested? Let me know which date works and a draft talk title. I'll send the full brief once we confirm.
>
> {operator_name}
> AI Qadam {country}

**T+0 — speaker cabinet invite (auto, after accepted)**:

> Subject: Welcome to AI Qadam — speaker cabinet access
>
> Hi {first_name},
>
> You're confirmed for **{event_title}** on **{date}**.
>
> Your speaker cabinet: [link]
>
> What's there:
> - Event details + venue logistics + your slot timing
> - AV checklist (what we'll provide, what to bring)
> - Past attendance numbers + topic mix (helps you calibrate)
> - Where to upload slides + bio (optional, by T-3 days)
>
> Two days before: I'll send a final brief with attendee count, expected questions theme, and a contact for day-of issues.
>
> {operator_name}

**T+1 day post-event** — thank-you with referral prompt:

> Subject: Thank you — {event_title}
>
> Hi {first_name},
>
> {N} people attended. CSAT for your session: {csat_score}/5. Top comment: "{best_anonymized_quote}".
>
> Recording: [link]
> Photos: [link]
> Your speaker page (updated): [link to /u/handle]
>
> One ask: **is there someone you'd recommend we invite next?** Engineers you respect, working on AI in CA, who would do this audience justice. One name + context is enough.
>
> [Suggest someone](#)
>
> Thanks for sharing your time.
> {operator_name}

### 12.3 Sponsor onboarding (operator-driven, not auto)

**T+0 — welcome + cabinet invite**:

> Subject: Welcome to AI Qadam — sponsorship of {event_title} confirmed
>
> Hi {sponsor_rep_first_name},
>
> {your_company} is confirmed as {sponsorship_tier_or_role} for **{event_title}** on {date}.
>
> Your cabinet: [link] (Authentik SSO with your work email)
>
> What you'll find:
> - The agreed deliverables for this event ({N} items — see checklist)
> - Asset upload (logo, one-pager, recruiting copy if applicable)
> - Lead opt-in policy (members who explicitly opt in to share contact)
> - Reach + attendance metrics (live as registrations come in)
>
> Logistics:
> - Day-of contact: {operator_name}, {phone}
> - Setup window: {setup_window}
> - Your 5-min slot in the program: {slot_time_or_TBC}
>
> Within 48h I'll send the marketing brief draft for your approval. Let me know any tweaks.
>
> {operator_name}

**T+1 day post-event** — auto-generated report (Sprint 3.5): see §12.3 in earlier version (preserved structure).

### 12.4 Country-lead onboarding (T = Authentik group added)

> Welcome, {first_name}. You're now country lead for AI Qadam {country}.
>
> Your workspace: [link]
>
> Three things to do this week:
> 1. **Read the operator playbook** ({estimated_minutes} min) — how we run events, sponsor outreach templates, speaker invitation language.
> 2. **Open your dashboard** — events / CRM / CMS / analytics, all scoped to {country}. Empty for now.
> 3. **Sign the country-lead AUP** (acceptable use policy for member data — 4 paragraphs, 2 min).
>
> The first event you run, I'll shadow. After that, you run independently — but I'm in your Telegram if you ever want a second pair of eyes.
>
> Quarterly check-in is on the calendar (90 days from today).
>
> Welcome aboard.
> {viktor_or_senior_lead}

---

## 13. Notification copy library

Every `Interactions` intent has a templated message. Templates live in code per Sprint 1.1's `payload: { template: 'X', data: {...} }` pattern.

| Intent | Subject (email) / opener (Telegram) | Body skeleton |
|---|---|---|
| `event_announce` (publication) | "{event_title} — {date_short}, {city}" | "Hi {first_name}, the next AI Qadam {country} event is on. **{event_title}** on {full_date}. {venue_one_line}. {first_speaker_or_topic_hook}. Registration opens now: [link]. Cap at {capacity}; first-come basis. — {country_lead_first_name}" |
| `speaker_added` (incremental) | "{speaker_name} joins {event_title}" | "Hi {first_name}, **{speaker_name}** ({speaker_job_title}, {speaker_company}) just confirmed for **{event_title}** on {date_short}. They'll talk about *{talk_topic}*. You're already registered — see you there. [Full event details](#)" |
| `registered` | "You're in — {event_title}" | See §12.1 T+0 |
| `waitlisted` | "You're on the waitlist for {event_title}" | "Hi {first_name}, {event_title} is full at the moment. You're #{waitlist_position} on the waitlist. We'll auto-promote you if someone releases their spot. — {country_lead_first_name}" |
| `promoted` (from waitlist) | "You're in — {event_title}" | "Hi {first_name}, a spot opened up at {event_title}. You're now confirmed. {full_event_details}. See you there. — {country_lead_first_name}" |
| `cancelled` (user-initiated) | "Your spot at {event_title} is released" | "Got it — your spot at {event_title} is released. If you change your mind, [re-register here](#). — {country_lead_first_name}" |
| `reminder_72h` | "{event_title} in 3 days — bring a question" | See §12.1 T-2 |
| `reminder_3h` | "Doors open in 3 hours" | See §12.1 T-3h (Telegram-first) |
| `csat` | "How was {event_title}?" | See §12.1 T+1 |
| `next_event_teaser` | "{next_event_title} — {next_event_date_short}" | "Hi {first_name}, the next AI Qadam {country} event is **{next_event_title}** on {next_event_date}. Topics: {topic_hint}. {first_speaker_or_lineup_hint}. [Register](#)" |
| `lapsed_nudge` | "was it worth your time?" | See §12.1 T+7 |
| `speaker_thanks_with_referral_ask` | "Thank you — {event_title}" | See §12.2 T+1 |
| `sponsor_post_event_report` | "{event_title} — your sponsorship report" | Auto-generated, see Sprint 3.5 |
| `event_eula_update` | "{event_title} terms update" | "Hi {first_name}, the terms for {event_title} were updated ({summary_of_change_one_sentence}). [Review and re-accept](#) before the event to keep your registration active." |
| `password_reset` | "Reset your AI Qadam password" | Standard short transactional |
| `account_link_telegram` | "Link your AI Qadam account to Telegram" | "You're chatting with the AI Qadam bot. To link this Telegram to your AI Qadam profile, I'll send a one-time code to {email_hint}. Continue? [Yes] [Cancel]" |

### In-app banner notifications

| Trigger | Copy |
|---|---|
| Speaker confirmed for event you're registered for | "{speaker_name} confirmed for {event_title} — view lineup" |
| Event you're registered for changes venue/time | "{event_title} updated: {new_venue_or_time}. [Details](#)" |
| You moved up on waitlist | "You moved up to #{N} on the {event_title} waitlist" |
| New badge earned | "New badge: {badge_name}. See your profile" |
| Operator queue (operator-only) | "{N} messages awaiting your review" |
| Country-lead approval (operator-only) | "{sponsor_company} requested sponsorship — review" |

---

## 14. Empty / loading / error states

### 14.1 Empty states

| Surface | Empty state |
|---|---|
| Events list (no events) | **Headline:** "No events scheduled yet."  **Body:** "We're working on it. Want the heads-up when the next one's announced? [Subscribe to the monthly digest](#)" |
| /me dashboard (no registrations) | **Headline:** "Nothing yet."  **Body:** "Browse upcoming events: [Events](#)" |
| Speaker cabinet (no past talks) | **Headline:** "Your stage is waiting."  **Body:** "Once you speak at your first event, your past talks + attendance + recordings live here. [Submit a proposal](#)" |
| Sponsor cabinet (no events sponsored) | **Headline:** "Sponsorship dashboard."  **Body:** "Your active and past sponsored events appear here. {operator_name} will be in touch about your first event." |
| Country dashboard (new country, no data) | **Headline:** "Welcome to AI Qadam {country}."  **Body:** "Empty for now — that's normal. As you create events and members register, the dashboard fills up. Start: [Create your first event](#)" |
| Cross-country dashboard (only one country) | **Headline:** "One country active so far."  **Body:** "When KZ + TJ + others go live, this view shows how each country is doing. Comparison is healthier than ranking — we're all in the same mission." |
| CSAT page (no responses) | **Headline:** "No responses yet."  **Body:** "Responses appear here as attendees fill out the survey. Most arrive in the first 24h after the event." |

### 14.2 Loading states

| Surface | Loading message |
|---|---|
| Page load < 1s | (no message; spinner only) |
| Page load > 2s (e.g., Metabase widget) | Skeleton screen + "Loading {what}…" |
| Form submission | "{action_verb}-ing…" — "Registering…", "Saving…", "Cancelling…" |
| Long async (provisioning new country) | Per-step status: "Authentik: ✓ Directus: ✓ Twenty: in progress… Plausible: pending. Coolify: pending." |

### 14.3 Error states

| Error | Copy |
|---|---|
| Generic 500 | "Something on our side broke. Try again in a moment. If it keeps happening, [let us know](mailto:support@aiqadam.org)." |
| 404 page | "Couldn't find that page. Try: [Events](#) · [Your profile](#) · [Sign in](#)" |
| Auth session expired | "Your session expired. [Sign in again to continue](#) — you'll come back to where you were." |
| Network error during registration | "Couldn't reach our server. Check your connection and [try again](#). Your registration isn't lost." |
| Capacity error at registration | "{event_title} just filled up while you were on this page. [Join the waitlist](#)." |
| EULA mismatch | "The terms for this event were updated. [Review and re-accept](#) to register." |
| CSAT submission failed | "Couldn't save your response. Try again, or [email it to {country_lead_first_name}](mailto:{email})." |
| RBAC denied (operator workspace) | "You don't have access to this section. If that seems wrong, ping {senior_lead_name} on Telegram." |

---

## 15. Microcopy patterns (button + link + label library)

### 15.1 Action verbs (buttons)

| Action | Use | Don't use |
|---|---|---|
| Submit registration | **Register** | Sign up, Join, Get tickets |
| Save changes | **Save** | Update, Save changes |
| Cancel registration | **Release my spot** | Decline, Cancel registration |
| Open detail page | **Open** OR **View** | See more, Learn more |
| Sign in | **Sign in** | Log in, Login |
| Sign out | **Sign out** | Logout |
| Confirm risky action | **Yes, {verb}** | OK, Confirm |
| Edit | **Edit** | Modify, Change |
| Delete | **Delete** | Remove |
| Approve (operator) | **Approve** | Accept |
| Send (Interactions queue) | **Send** | Dispatch, Push |
| Open external link | **{verb} on LinkedIn / Telegram** | Visit |

### 15.2 Status badges + labels

| State | Badge text | Semantic color |
|---|---|---|
| Registration: registered | "You're in" | primary (teal) |
| Registration: waitlisted | "On waitlist" | muted |
| Registration: cancelled | "Cancelled" | muted |
| Registration: attended | "Checked in" | success (green) |
| Event: published | "Open" | primary |
| Event: filling fast | "Filling fast" | warning (amber) |
| Event: full | "At capacity" | muted |
| Event: live | "Happening now" | success |
| Event: ended | "Past event" | muted |
| Speaker: invited | "Invited" | muted |
| Speaker: confirmed | "Confirmed" | success |
| Sponsor: active | "Sponsor" | primary |

### 15.3 Form field labels (consistency)

| Field | Label | Placeholder | Help text |
|---|---|---|---|
| Email | "Email" | "you@example.com" | (none) |
| Password | "Password" | (none) | (none unless complexity rules) |
| First name | "First name" | (none) | (none) |
| Last name | "Last name" | (none) | (none) |
| Handle | "Handle" | "your-handle" | "Used in your profile URL — lowercase, dashes or underscores" |
| Bio | "Bio" | "What you're working on, in one line." | (placeholder is enough) |
| Job title | "Job title" | "ML engineer / Founder / Researcher" | (none) |
| Company | "Company" | (none) | "Shown on profile only if you opt into 'show company'" |
| LinkedIn | "LinkedIn" | "linkedin.com/in/yourhandle" | (none) |
| Telegram | "Telegram username" | "@yourhandle" | (none) |

### 15.4 Date + time formatting

| Context | Format |
|---|---|
| Future event ≥ 7 days | "Thursday, June 12 · 18:30 (UTC+5)" |
| Future event < 7 days | "In 3 days · Thursday at 18:30" |
| Today | "Today at 18:30" |
| Past event | "Tuesday, May 12 (3 weeks ago)" |
| Compact | "Jun 12 · 18:30" |
| Email subject | "{event_title} — Jun 12" |

Time zone: default to country's tz unless user has set a different home tz.

---

## 16. Content provision approach

### 16.1 Event descriptions

**Author:** country lead (with speaker assist for talk abstracts).
**Template** (Directus rich-text `description` field):

```
{Hook sentence — one line, sets the theme}

{Two-paragraph "what to expect" — what topics, who's speaking,
 what the audience will leave with}

**Speakers** (lineup updates as confirmations come in — see roadmap §3.5)
- {Speaker 1} — {short hook on their talk}
- {Speaker 2} — TBA (talk title revealed by {date})

**Agenda**
{time_1} — Doors open, networking
{time_2} — {speaker_1_name}: {talk_title}
{time_3} — Break
{time_4} — {speaker_2_name}: {talk_title}
{time_5} — Q&A panel + closing
{time_6} — Optional after-party (location announced day-of)

**For whom**
{one paragraph: who'll get the most out of this — be specific about
seniority, role, current challenges}

**Logistics**
- Venue: {venue_name + brief description}
- Address + map: [link]
- Transit: {nearest metro / parking note}
- Language: {primary language of the event} (slides may be in EN)
- Cost: free
- Capacity: {N}
```

### 16.2 Speaker bios

**Author:** speaker (read-mostly cabinet per Sprint 3.3) or pulled from LinkedIn.
**Length:** max 60 words.
**Required:** one specific accomplishment + current role.

**Template:**
> {Full name} is {role} at {company}, where they {one specific thing they ship/did}. {Optional: current focus.} {Optional: AI Qadam history.}

**Examples:**

> Aigerim Nurlanovna is an ML engineer at Kaspi.kz, where she leads the RAG system that powers the company's internal legal-document search. She's currently exploring multilingual embeddings for Kazakh + Russian + English code-switching. This is her first AI Qadam talk.

> Sardor Akmal is the founder of {company}, a Tashkent-based SaaS for restaurant inventory. He's integrating LLMs to auto-categorize supplier invoices and wants to talk about what works and what doesn't when you've got 18 months of runway.

### 16.3 Sponsor descriptions

**Author:** sponsor rep, reviewed by operator.
**Length:** max 40 words.

**Template:**
> {Company} {what they do — concrete, no jargon}. They're sponsoring AI Qadam to {reason}.

### 16.4 Past-event recaps

**Author:** country lead (within 7 days of event end).
**Length:** 200–400 words + photos.
**URL:** `/events/{id}/recap`.

**Template:**
```
# {event_title} — {date}

{Photo 1: room / audience}

{Opening paragraph: what happened, who came (number + character),
what the energy was like. Specific, not generic.}

## Talks

### {speaker_1_name}: {talk_title}
{2-3 sentences on the talk's main point + one quote or insight.
Link to recording.}

### {speaker_2_name}: {talk_title}
{same shape}

## Conversation highlights
{What questions came up? What debates? What surprised people?
This is what people who weren't there came for.}

## Thanks
{Speakers — named, with their handles/LinkedIn}
{Sponsors — by name + 1-sentence what they brought}
{Volunteers + team}

## Coming next
{next_event_title} on {next_event_date}: [Register](#)

{Photo 2-3: details}
```

### 16.5 Operator playbook (Sprint 0.7)

Lives in Directus (so country leads can search + edit) OR Notion if faster to start.

**Sections:**
1. The brand — voice, audience, what we stand for, what we don't do
2. Venue selection — checklist, sample venues, vendor relationships
3. Speaker outreach — templates, how to identify + vet + brief
4. Sponsor pipeline — deck variants, pricing logic, deliverables menu, invoicing
5. Event production day-of — run-of-show template, AV checklist, on-call contacts
6. Post-event — checklist (CSAT review, recap publishing, thank-yous), retro template
7. Member relations — when to DM personally, when to escalate, code of conduct
8. Country variants — country-specific rules (sub-sections)

### 16.6 Member-generated content (Phase ζ Discourse)

- **Encouraged:** technical write-ups, conference recaps, hiring posts, call-for-collaborator posts
- **Discouraged:** generic promotion, unrelated political content, "I'm building a side project" without context
- **Tone:** peer-to-peer
- **Moderation:** light by country lead; guidelines at top of each category; bans for code-of-conduct violations only
- **Recognition:** best member posts surface in monthly digest (operator-curated)

---

## 17. Anti-patterns (explicitly DON'T do)

1. **No popups asking for newsletter on landing.** Trust first.
2. **No artificial scarcity / FOMO theatre.** "🔥 Only 3 spots left!" when there are 50 is dishonest.
3. **No streaks that punish.** Show "3rd consecutive event" as a positive badge; never "you missed the last event" guilt.
4. **No dark-pattern unsubscribes.** One click; no gauntlet; no opt-back-in pre-checked.
5. **No engagement-time metrics shown to members.** Show outcomes (attendance count, talks given), not surveillance.
6. **No "verified" badges that create caste.** Speaker badge = earned by speaking. No paid verification.
7. **No public "10 people just registered" tickers.** Real social proof, not manufactured urgency.
8. **No AI-generated speaker photos.** Real face or no face.
9. **No machine-translated copy in production.** Hand-localized only.
10. **No "we miss you!" emails not from a person.** Lapsed-member nudge is from the country lead, signed by them.
11. **No country-lead surveillance of member behavior.** Aggregate engagement only; member sees what the country lead sees about them (transparency loop).
12. **No sponsor logo placement in members' inboxes.** Sponsors get value through events + leads + cabinets, never via member-facing email branding.
13. **No countdown timers on registration.** Capacity is shown; "register in 24h or lose your discount!" doesn't fit.
14. **No "We notice you haven't attended in 30 days" passive-aggressive copy.** Members owe us nothing.
15. **No notification spam.** Default cadence is conservative: confirmation + 3 pre-event + 1 post-event. Everything else opt-in.

---

## 18. UX quality metrics + research methods

### 18.1 Quantitative metrics (continuous)

| Metric | How measured | Target | Surfaces |
|---|---|---|---|
| Task success rate — registration | % of /events/{id} visits that result in registration (Plausible event) | ≥ 25% by Sprint 5 | Registration flow |
| Time to first key action — onboarding | Median time from sign-up → first event registration | ≤ 1 hour | Onboarding |
| Error rate per form | % of form submissions that result in validation error | ≤ 10% per form | All forms |
| Drop-off rate per funnel step | % loss between event-page-view → registration-page → confirmation | ≤ 50% per step | Registration |
| CSAT post-event | Sprint 1.2 — average score | ≥ 4.3 | Events |
| SUS (System Usability Scale) | Quarterly survey to operators (10 questions) | ≥ 70 | Workspace |
| RBAC denial rate | Operator workspace 403s logged via Plausible | < 1% of authenticated requests | Workspace |
| Page abandonment (operator workspace) | % sessions that exit without action | Watch trend; alert if > 30% | Workspace |
| Mobile vs desktop CSAT | Compare CSAT scores by device | Mobile should match desktop ± 0.3 | Member-facing |

### 18.2 Qualitative research methods + cadence

| Method | When | Who | Output |
|---|---|---|---|
| Heuristic evaluation | Once per major surface, before launch | UX researcher (self) | Heuristics checklist filled, issues filed |
| Moderated user testing | Sprint 1, then quarterly | 5 members + 3 country leads + 2 speakers + 2 sponsor reps | Recorded sessions + notes + prioritized findings |
| Unmoderated tests (e.g., Maze, UserTesting) | Post-Sprint 5 when forms multiply | Random member sample | Task success rates + heatmaps |
| Analytics review | Quarterly (Plausible dashboard) | UX researcher + PM | Anomaly notes + experiments to design |
| Operator interviews | Quarterly | All country leads | Workspace pain points + feature priorities |
| Speaker debriefs | After every event | Country lead → speaker | Captured in `event_retrospective` field (Sprint 1.1) |
| Sponsor renewal interviews | At each renewal cycle | Operator → sponsor | Captured in Twenty + roadmap influence |

### 18.3 Research → design → ship loop

1. **Identify pain** (analytics anomaly, qualitative feedback, support volume)
2. **Define hypothesis** (e.g., "registration drop-off at consent checkbox is because consents look identical")
3. **Design experiment** (A/B test if traffic allows; otherwise expert-review redesign)
4. **Ship variant** behind a feature flag (Sprint 5+ when flags exist)
5. **Measure for ≥ 2 weeks** or until statistical significance
6. **Decide** — adopt / kill / iterate
7. **Document** the decision in a UX research log (lives in Directus)

---

## 19. Implementation notes for developers

**For every member-facing surface:**

1. Copy lives in code as templated strings — `payload: { template: 'X', data: {...} }` per Sprint 1.1's Interactions pattern.
2. EN is source; RU translations live alongside in the same template registry.
3. Variables follow `{first_name}` (not `{firstName}`) — handlebars-friendly.
4. Copy changes are PR-reviewable like code.
5. Long-form copy (event descriptions, recaps) lives in Directus (editable by operators); short-form (button labels, errors) lives in i18n files (versioned with code).

**Before shipping any user-facing surface, verify:**
- [ ] All 13 heuristics (§4.1) applied or deviation justified
- [ ] Empty / loading / error states defined (§14)
- [ ] Success state reinforces identity (§11)
- [ ] Forms per §9 specs
- [ ] Microcopy per §15
- [ ] No anti-patterns (§17)
- [ ] RU translation drafted (or noted pending)
- [ ] Keyboard navigation works (§6.2)
- [ ] Mobile breakpoint works (§7)
- [ ] Screen-reader tested for critical paths (§6.4)
- [ ] Color contrast ≥ AA (§6.1)
- [ ] Touch targets ≥ 44px on mobile (§7.3)

**Reference checklist for content writers:**
- [ ] Template from §16 followed
- [ ] First sentence is concrete + specific
- [ ] No buzzword soup
- [ ] Speakers named with one-sentence hook
- [ ] Logistics block complete (venue, transit, language, cost, capacity)
- [ ] Photos planned (no AI-generated faces)

---

## 20. Open UX decisions

Need answers before specific sprints.

| Decision | Blocks | Owner |
|---|---|---|
| **Russian voice review owner** — who hand-localizes? | Any RU launch | PM + native-RU community member |
| **Country lead public attribution** — real name + photo public, or just first name? | Sprint 4.3 runbook | Privacy review + country leads |
| **Operator playbook tooling** — Notion / Directus / GitHub markdown? | Sprint 0.7 | PM |
| **Discourse moderation policy** | Sprint 6.2 | PM + senior leads |
| **Photo consent flow at events** — opt-in checkbox + signage? | Before second event in any country | PM + privacy review |
| **Onboarding video** for country leads — record one or stay docs-only? | Sprint 4.3 | UX researcher + operator |
| **Telegram WebApp scope** — which member-facing tasks move into Telegram first? | Sprint 5.5 design | UX researcher + PM |
| **Profile photo policy** — required for /u/{handle} public page or optional? | Sprint 5.6 visibility | UX researcher |

---

## 21. Cross-references

- **Strategic context:** [`community-platform-roadmap.md` §2](./community-platform-roadmap.md#2-strategic-theses-read-these-before-sprinting)
- **Actor lifecycles** copy must serve: [`community-platform-roadmap.md` §3](./community-platform-roadmap.md#3-actor-lifecycles)
- **Process flows** copy must support: [`community-platform-roadmap.md` §4](./community-platform-roadmap.md#4-process-flows-the-platform-must-support)
- **Event lifecycle** (parallel workstreams): [`community-platform-roadmap.md` §3.5](./community-platform-roadmap.md#35-event-lifecycle-parallel-workstreams-not-a-single-state-machine)
- **Behavioral risks** copy must avoid creating: [`community-platform-roadmap.md` §6](./community-platform-roadmap.md#6-behavioral-risks--mitigations)
- **Interaction dispatcher** (where templated messages live): `docs/interaction-architecture.md` §4
- **Design tokens + components:** `design-system/tokens.css`, `design-system/components.css`, `design-system/portal.css`
- **EULA / consent collections:** existing schema in `infrastructure/directus/bootstrap.sh` (`eulas`, `consent_records`, `eula_acceptances`)

When in doubt, choose **clarity over cleverness, honesty over hype, respect over warmth-theatre.** This audience can tell the difference.
