# Parity matrix — v1 → v2 cutover gate

> Cutover is gated on every row here being ✅. ADR-0038 owns this
> file. The cutover D-day plan lives in
> [`web-migration-plan.md` §Phase 4](../04-development/frontend/web-migration-plan.md#phase-4--hardening--cutover).

## How to use

Each row is a verifiable assertion about `apps/web-next/` matching
(or improving on) `apps/web/`. Phase 1+2 PRs flip rows from ❌ to ✅
as they migrate. Phase 4.5 is the final check.

Acceptance criteria are concrete: an E2E test, a URL probe, or a
visual diff in Storybook.

## Customer-facing surface

| URL / Flow | v1 behaviour | v2 behaviour | Status |
|---|---|---|---|
| `GET /` (anon) | Renders hero + upcoming events + sponsors | Same content, composed via `<Hero>` + `<EventsGrid>` + `<SponsorWall>` | ❌ |
| `GET /` (signed in) | Same + nav shows account chip | Same; SSR auth blob populated | ❌ |
| `GET /events` | Lists upcoming events filtered by country | Same; via `<EventsGrid>` | ❌ |
| `GET /events/[id]` (public) | Renders event detail + sidebar | Same; via `<EventDetail>` + `<RegistrationCTA>` | ❌ |
| `GET /events/[id]` (members-only, anon) | Renders gate + sign-in CTA | Same; via `<AuthGate>` | ❌ |
| `POST register-for-event` (signed in) | Adds row to `registrations`; sidebar updates optimistically | Same; via `<RegistrationCTA>` + TanStack mutation | ❌ |
| `POST cancel registration` | Removes row | Same | ❌ |
| `GET /leaderboard` | Renders global + per-country top N | Same; via `<Leaderboard>` | ❌ |
| `GET /me/profile` (signed in) | Loads consents + skills + interests + employments editors | Same; via `<ProfileCard>` + `<ConsentList>` + `<SkillTagger>` | ❌ |
| `GET /me/preferences` | Email frequency + opt-outs | Same | ❌ |
| `GET /me/access-log` | Recent auth events | Same | ❌ |
| `GET /me/referrals` | User's referral code + history | Same | ❌ |
| `GET /u/[handle]` (public profile) | Renders public-mode ProfileCard | Same | ❌ |
| `GET /auth/sign-in` | Redirects to Authentik login | Same | ❌ |
| `GET /auth/signed-out` | Renders signed-out landing | Same; respects tenant cookie from L1 middleware | ❌ |
| `GET /events/[id]?tab=forum` | Q&A thread | Same; via `<ForumThread>` | ❌ |
| `GET /onboard` | New-attendee onboarding form | Same | ❌ |
| `GET /welcome/[slug]` | Per-source welcome page | Same | ❌ |
| `GET /checkin` | Event check-in flow | Same | ❌ |
| `GET /forms/[slug]` | Public forms renderer | Same | ❌ |
| `GET /events/[id]/survey` | Post-event CSAT | Same | ❌ |
| `GET /feedback/csat` | Standalone CSAT submission | Same | ❌ |
| `GET /leads/{thank-you,verified,verify-failed}` | Lead-magnet conversion pages | Same | ❌ |
| Lighthouse perf — `/` | ≥ 85 | ≥ 90 | ❌ |
| Lighthouse perf — `/events` | ≥ 85 | ≥ 90 | ❌ |

## Operator surface

| Cabinet | v1 capability | v2 capability | Status |
|---|---|---|---|
| `/workspace` dashboard | KPIs: events upcoming, members this month, registrations pending | Same KPIs + structured aggregate registry | ❌ |
| `/workspace/events` (list) | Filterable table | Same via `<DataTable>` | ❌ |
| `/workspace/events/[id]` | Edit metadata + counts + followups | Same via `<Form>` + `<KpiTile>` | ❌ |
| `/workspace/announce` | Compose + queue event announcement | Same | ❌ |
| `/workspace/approvals` | Pending registrations + member flags | Same | ❌ |
| `/workspace/members` | Searchable directory | Same + segment-builder (Phase 3) | ❌ |
| `/workspace/partners` | Manage partner rows | Same | ❌ |
| `/workspace/admin/users` (super-admin) | Create operator invites | Same via `<Form>` + `<Drawer>` | ❌ |
| `/workspace/admin/users/new` | Invite-link generator | Same | ❌ |
| `/workspace/admin/audit` (super-admin) | View audit_events stream | Same via `<AuditLogList>` | ❌ |
| `/workspace/admin/countries` | Country provisioning wizard | Same via `<Wizard>` | ❌ |
| `/workspace/admin/rbac-sync` | Trigger RBAC sync job | Same | ❌ |
| `/workspace/integrations/telegram` | Telegram cabinet root | Same | ❌ |
| `/workspace/integrations/telegram/segments` | Segment builder | Same | ❌ |
| `/workspace/integrations/telegram/broadcasts` | Broadcast list | Same via `<DataTable>` | ❌ |
| `/workspace/integrations/telegram/broadcasts/new` | Compose broadcast | Same via `<Wizard>` | ❌ |
| `/workspace/forms` | Forms list | Same | ❌ |
| `/workspace/forms/[id]` | Form builder | Same via `<FormBuilder>` | ❌ |
| `/workspace/forms/[id]/responses` | Form responses table | Same | ❌ |

## New cabinets (Phase 3 — must exist BEFORE cutover to close ADR-0032 debt)

| Cabinet | What it does | Status |
|---|---|---|
| `/workspace/site-settings` | Singleton form for homepage hero / footer / contact | ❌ |
| `/workspace/sponsors` | Manage sponsor rows | ❌ |
| `/workspace/press` | Manage marketing_assets + press_page | ❌ |
| `/workspace/badges` | Grant badges + audit award history | ❌ |
| `/workspace/country-leads` | Country lead onboarding wraps operator_invites | ❌ |
| `/workspace/members` (uplift) | Search + filter + segment-builder | ❌ |

## Cross-cutting

| Concern | v1 behaviour | v2 behaviour | Status |
|---|---|---|---|
| Top nav identity consistency | "Account" vs "Sign in" sometimes mismatch (Topic 1 bug) | Always agrees with body; SSR-verified | ❌ |
| Sign-out kills Authentik session | Yes (PR #234) | Same | ❌ |
| Recovery email link landing | Lands on identification stage (bug) | Lands on password-prompt | already fixed in v1 + v2 |
| `/auth/refresh` race on multi-island pages | Possible | Eliminated by SSR middleware + `useAuth()` | ❌ |
| Inline `style=` count in `apps/web-next/` | n/a | = 0 | ❌ |
| Raw `fetch('/api/...')` outside `lib/api-*.ts` | n/a | = 0 | ❌ |
| `architecture-check` passes on `apps/web-next/` | n/a | yes | ❌ |
| Storybook hosts every L2 atom + L3 block | n/a | yes | ❌ |
| TanStack Query devtools shows expected cache keys | n/a | yes (per `wiring-map.md`) | ❌ |
| i18n: every visible string flows through `t()` | partial | full | ❌ |
| Accessibility (axe-core, no critical violations) | partial | full | ❌ |

## Sign-off

Cutover is approved when:

1. Every row above is ✅.
2. E2E parity suite (Playwright) is green on a 24h cron run against
   both `aiqadam.org` (v1) and `next.aiqadam.org` (v2).
3. Lighthouse perf on v2 ≥ 90 on `/`, `/events`, `/leaderboard`.
4. Backrest snapshot taken within the last hour.
5. PM sign-off in a decision-batch entry.
