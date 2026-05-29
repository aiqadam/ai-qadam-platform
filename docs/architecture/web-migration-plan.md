# Web migration plan — `apps/web-next/` build-aside + cutover

> Authoritative execution plan for ADR-0038. Updated as PRs land.
> Companion docs: [`blocks.md`](./blocks.md) (catalogue),
> [`wiring-map.md`](./wiring-map.md) (cabinet ↔ aggregates),
> [`parity-matrix.md`](./parity-matrix.md) (cutover gate).

> **⚠️ Status 2026-05-26 — read [`web-next-workplan.md`](./web-next-workplan.md) for the live remaining-work map.**
> Phase 1 (customer surfaces) is COMPLETE; Phase 2 (operator cabinets) has its
> read/list tier shipped (Members, Invites, Dashboard, Audit, Partners,
> Approvals, Events, Forms). A discovery sweep found one gap the original phase
> plan never scheduled: **the sitewide top-nav / header was never built in
> web-next** — `Layout.astro` has no nav, no auth-aware account menu, no
> country/locale switcher, and `<PageShell>` has no cross-cabinet nav. This is
> the parity-matrix flagship row (the inconsistent-auth-UI bug that motivated
> the rewire), so it now LEADS the remaining work as Milestone M0 in the
> workplan. Decision: full parity — port every v1 surface (no drop-list).

## Topology

```
apps/
├── web/          ← v1: keeps serving uz/kz/tj/apex.aiqadam.org until cutover
└── web-next/     ← v2: greenfield, deployed to next.aiqadam.org
```

Both apps consume the same `apps/api` + Directus + Authentik. No
backend changes for this rewrite.

## Cookie isolation during build

`apps/web-next/` issues a separate refresh cookie name during the
build window:

| Window | v1 cookie | v2 cookie |
|---|---|---|
| Build (current → cutover) | `aiqadam-refresh` | `aiqadam-next-refresh` |
| Cutover overlap (24h after flip) | accepted by API for fallback | `aiqadam-refresh` (canonical) |
| Post-cutover (T+24h) | — | `aiqadam-refresh` |

Testers can be signed in to both apps in different tabs without
collision. Authentik gets a second OAuth client registered for
`next.aiqadam.org` callback URIs.

## Phase 0 — foundations (week 1, 5 PRs)

| PR | Files | Acceptance | Depends |
|---|---|---|---|
| **0a** Locks + ADR | `docs/adr/0038-*.md`, `docs/architecture/{web-migration-plan,blocks,wiring-map,parity-matrix}.md`, `tools/architecture-check.ts`, `.husky/pre-commit`, `.github/workflows/ci.yml` (arch-check job), `.github/pull_request_template.md`, `packages/biome-config/biome.json` (path rules), `docs/agent-prompts.md` (Pre-Flight Gate 0) | (i) `tools/architecture-check.ts` rejects a planted `fetch('/api/...')` in a new `apps/web-next/src/pages/foo.astro`. (ii) Existing `apps/web/` passes (grandfathered). (iii) ADR file in repo as Proposed. | nothing |
| **0b** Scaffold `apps/web-next/` shell | `apps/web-next/package.json`, `astro.config.mjs`, `tsconfig.json`, `src/styles/globals.css` (token imports), `src/middleware.ts` (port from web/, swap cookie name to `aiqadam-next-refresh`), `src/layouts/Layout.astro` (port), `src/env.d.ts`, Coolify deploy config for `next.aiqadam.org` (engineer-only via forward-auth) | (i) `pnpm --filter @aiqadam/web-next dev` boots. (ii) `next.aiqadam.org` resolves + serves a "Hello AI Qadam (next)" page behind Authentik. (iii) `robots.txt: Disallow: /` + `<meta name="robots" content="noindex">`. | 0a |
| **0c** L2 kit — shadcn-based atoms | `apps/web-next/components.json` (shadcn config), `src/kit/{Button,Input,Card,Badge,Tabs,Toast,Dialog,Select}.tsx`, `src/kit/index.ts` (barrel) | Each atom renders in light + dark theme. No raw colors. Storybook (0d) shows them. | 0b |
| **0d** L1 runtime — apiClient + useAuth + TanStack Query | `src/lib/api-client.ts` (typed, retry-on-401), `src/lib/use-auth.ts`, `src/lib/api-queries.ts` (3 reference hooks: `useMyProfile`, `useEvent`, `useRegistrations`), `src/lib/query-client.ts`, Layout mounts `<QueryClientProvider>` | (i) `useAuth()` returns the SSR blob. (ii) A test page calls `useMyProfile()` and renders the email. | 0b |
| **0e** Storybook + generators | `apps/storybook/` workspace (Storybook 8 + Vite), 8 stories (one per atom), `tools/gen/{page,cabinet}.ts` + templates, `package.json` scripts `gen:page` + `gen:cabinet`, Coolify deploy to `design.aiqadam.org` (engineer-only) | (i) Storybook boots locally + at `design.aiqadam.org`. (ii) `pnpm gen:cabinet test` creates a working page that passes arch-check. | 0c, 0d |

**Phase 0 done-when:** every lock is enforced, every L1 + L2 primitive
exists, Storybook is live, generators work. `next.aiqadam.org` shows
a "ready for content" landing page. Zero customer-facing parity yet.

## Phase 1 — customer-facing surface (week 2-3, 8 PRs)

Each PR migrates **one** page from v1 → v2, delivers the blocks the
page needs, updates the catalogue, updates the wiring map. Mostly
parallelizable via separate worktree agents (shared atoms are stable
after Phase 0).

| PR | Page in v2 | Blocks delivered | Wiring map update |
|---|---|---|---|
| **1.1** | `/` (homepage) | `<Hero>`, `<PageHead>` | Hero reads `site_settings` singleton. Aggregates: `homepage_stats.live_members_count` → future cabinet dashboard KPI 4. |
| **1.2** | `/events` (list) | `<EventCard>`, `<EventsGrid>`, `<EmptyState>` | Reads `events`. Aggregates: `events_this_month` → cabinet dashboard KPI 1+2. |
| **1.3** | `/events/[id]` body | `<EventDetail>`, `<SpeakerGrid>`, `<SponsorWall>`, `<MaterialsList>` | Reads `event_speakers/_sponsors/_materials`. Cabinet event-detail edits the same rows. |
| **1.4** | `/events/[id]` sidebar | `<RegistrationCTA>`, `<ShareButtons>`, `<AuthGate>` | Writes `registrations`. Aggregates: per-event `registered_count`. |
| **1.5** | `/me/profile`, `/u/[handle]` | `<ProfileCard>`, `<ConsentList>`, `<SkillTagger>` | Reads/writes `directus_users` + `member_skills/_interests/_employments`. |
| **1.6** | `/leaderboard` | `<Leaderboard>`, `<AvatarStack>` | Reads `point_awards` + `member_badges`. Aggregates: `top_10_per_country`. |
| **1.7** | `/events/[id]?tab=forum` | `<ForumThread>` | Reads `event_questions`. Aggregates: `pending_questions_count`. |
| **1.8** | site-wide cleanup | `<AppFooter>`, `<MarkdownBody>`, `<DateTime>` | Catalogue freeze for Phase 1. |

**Phase 1 done-when:** every customer-facing URL on v1 has a v2
equivalent at `next.aiqadam.org`. E2E parity tests pass for every
customer journey. Lighthouse perf ≥ 90 on homepage + events list.
Inline `style=` count in `apps/web-next/` = 0.

## Phase 2 — operator cabinets (week 4-5, 10 PRs)

| PR | Cabinet | New blocks | Notes |
|---|---|---|---|
| **2.1** | shell foundation | `<PageShell>`, `<Breadcrumbs>`, `<EmptyState>`, `<Toast>` | Reusable across every cabinet |
| **2.2** | Members directory | `<DataTable>`, `<AsyncSelect>` | The big one — most reuse |
| **2.3** | Operator invites | `<Form>`, `<Drawer>` | Form pattern proven |
| **2.4** | `/workspace` dashboard | `<KpiTile>`, `<ActionBar>` | Wires every aggregate from Phase 1's wiring map |
| **2.5** | Audit + Partners + Approvals | DataTable migration round 2 | Three cabinets, one PR |
| **2.6** | Country provisioning + Broadcast composer | `<Wizard>` | Multi-step flow pattern |
| **2.7** | Events list + Forms list | DataTable migration round 3 | |
| **2.8** | Audit cabinet | `<AuditLogList>` | Timeline pattern |
| **2.9** | Telegram cabinet (segments + broadcasts) | | |
| **2.10** | Forms cabinet (builder + responses) | `<FormBuilder>` | |

**Phase 2 done-when:** every cabinet from v1 has a v2 equivalent.
Median cabinet < 250 LOC. No cabinet defines its own `Shell`.

## Phase 3 — new cabinets (week 6, 6 PRs)

Cabinets the platform's purpose demands but v1 never built — drawn
from the 49 Directus collections + ADR-0032 obligations.

| PR | Cabinet | What |
|---|---|---|
| **3.1** | Sponsors cabinet | Manage sponsor rows (tier, contract, share-with-aggregate consent). Collection exists; no UI today. |
| **3.2** | Site-settings cabinet | `site_settings` singleton — homepage hero, footer, contact info. Closes the [event-detail-operator-UI-debt] memory. |
| **3.3** | Press / marketing-asset cabinet | `marketing_assets` + `press_page`. Operators manage without Directus admin. |
| **3.4** | Points & badges cabinet | `badge_definitions` + `point_awards` + `member_badges`. Grant + audit. |
| **3.5** | Country-lead onboarding cabinet | Wraps `operator_invites` + `countries` provisioning into one flow. |
| **3.6** | Members directory uplift | Search + filter + segment-builder (extends the basic table from 2.2). |

**Phase 3 done-when:** every "operator-needed" action has a Layer-4
page. Zero operator falls back to Directus admin or Authentik admin
for routine tasks. ADR-0032 fully enforced.

## Phase 4 — hardening + cutover (week 7-8, 5 PRs + cutover)

| PR | What |
|---|---|
| **4.1** | E2E parity test suite — every customer journey + every cabinet covered by Playwright; runs against v1 + v2 nightly. |
| **4.2** | Server-side rotation overlap (Okta default 30s grace on `RefreshTokenService.consume`) — defense-in-depth for the residual cross-tab race. |
| **4.3** | `users.min_access_iat` for active access-token revocation after sign-out / family-revoke (Topic 3 from the original auth investigation). |
| **4.4** | Performance + accessibility audit. Lighthouse, axe-core. |
| **4.5** | Parity matrix check-off + cutover dry run on a single test FQDN. |

**Cutover D-day** (estimated week 9):

1. **T-3 days:** final E2E parity, Backrest snapshot, freeze window
   communicated.
2. **T-0:** Coolify swap FQDN bindings from `aiqadam-web` (v1) →
   `aiqadam-web-next` (v2). Cookie name swap: API now issues
   `aiqadam-refresh` from v2; accepts `aiqadam-next-refresh` for 24h
   overlap (any tab signed in to v2 during build rotates to the
   canonical cookie on first refresh).
3. **T+30min:** smoke E2E (sign-in, register-for-event, recovery,
   `/workspace`). Watch Plausible + error logs.
4. **T+24h:** drop `aiqadam-next-refresh` acceptance from API.
5. **T+2 weeks:** delete `apps/web/`, rename `apps/web-next/` →
   `apps/web/`, free the v1 Coolify service.

**Rollback at any point within the first 24h:** flip FQDNs back to
v1. Users get logged out once (same cookie collision dynamics in
reverse). `apps/web-next/` stays running on `next.aiqadam.org` for
the next attempt.

## Estimated total

| Phase | PRs | Wall-clock (parallel agents possible) | Net LOC delta |
|---|---|---|---|
| 0 | 5 | 1 week | +~800 (new infra under web-next/) |
| 1 | 8 | 1-2 weeks | +~3,000 (new customer surface) |
| 2 | 10 | 1.5-2 weeks | +~5,000 (cabinets, but each ~half the size of v1's) |
| 3 | 6 | 1 week | +~2,500 (new cabinets) |
| 4 + cutover | 5 PRs + cutover | 1 week | +~500 (tests + hardening) |
| **Total** | **34 PRs + 1 cutover** | **~5-6 weeks of focused work** | **+~11,800 LOC in `web-next/`; `web/` deleted post-cutover (-~25,000 LOC)** |

Net: roughly **-13,200 LOC** at the end, despite a richer feature set
and full Phase 3 cabinets.
