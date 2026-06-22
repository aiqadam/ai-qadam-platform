# Migration status — `apps/web` → `apps/web-next`

> **What this is.** A progress tracker for the Astro v1 → v2 architectural rewrite
> (ADR-0038). Complements the [`parity-matrix.md`](../../03-requirements/parity-matrix.md)
> (cutover gate — all rows must be ✅ before go-live) and the
> [`web-next-workplan.md`](web-next-workplan.md) (execution map).
>
> **Legend:** ✅ Done (file exists + wired) · 🔄 Partial (file exists, incomplete) ·
> ❌ Not started

---

## Shell / infrastructure

| Item | Status | Notes |
|---|---|---|
| `Layout.astro` base structure | ✅ | noindex + aiqadam-next-refresh cookie until cutover |
| `<AppNav>` customer header | ✅ | Wired into Layout.astro |
| `<CountrySwitcher>` + `<LocaleSwitcher>` | ✅ | Embedded in AppNav |
| `<AppFooter>` | ✅ | |
| `<PageShell>` + `<WorkspaceNav>` (operator shell) | ✅ | Cross-cabinet nav wired |
| `<AuthGate>` + `middleware.ts` (SSR auth) | ✅ | |
| `api/[...path].ts` proxy | ✅ | |
| `<Form>` (Zod-driven, gates all write cabinets) | ❌ | M1 — blocks M2.2, M2.4, M2.5, M2.6+ |
| `<AsyncSelect>` (server-search dropdown) | ❌ | M1 — blocks M2.2, M2.4, M2.7, M2.8 |
| `<ActionBar>` (contextual action row) | ❌ | M1 — blocks M2.2, M2.4, M2.8 |
| `<FormBuilder>` (drag/reorder, 7 field types) | ❌ | M1 — blocks M2.6, M2.7, M3.3 |
| OG image generator (`/events/[id]/og-card.png.ts`) | ❌ | Not scheduled in any milestone |
| SEO / analytics (OG, canonical, Plausible) | ❌ | Stripped intentionally — re-enable at M4 cutover |
| Auth/cookie parity (`aiqadam-next-refresh` → `aiqadam-refresh`) | ❌ | M4 step 1 |

---

## Kit atoms (L2)

| Atom | Status |
|---|---|
| `<Button>` | ✅ |
| `<Input>` | ✅ |
| `<Card>` | ✅ |
| `<Badge>` | ✅ |
| `<Tabs>` | ✅ |
| `<Toast>` | ✅ |
| `<Dialog>` | ✅ |
| `<Select>` | ✅ |
| `<Drawer>` | ✅ |
| `<Wizard>` | ✅ |
| `<Tooltip>` | ❌ | 

---

## Customer-facing pages

| Route | v1 file | Status | Milestone |
|---|---|---|---|
| `/` (homepage) | `index.astro` | ✅ | Phase 1 |
| `/events` (list) | `events.astro` | ✅ | Phase 1 |
| `/events/[id]` (detail + sidebar + forum) | `events/[id].astro` | ✅ | Phase 1 |
| `/leaderboard` | `leaderboard.astro` | ✅ | Phase 1 |
| `/u/[handle]` (public profile) | `u/[handle].astro` | ✅ | Phase 1 |
| `/me/profile` | `me/profile.astro` | ✅ | Phase 1 |
| `/auth/sign-in` | `auth/sign-in.astro` | ❌ | M3.1 |
| `/auth/signed-out` | `auth/signed-out.astro` | ❌ | M3.1 |
| `/me` (hub) | `me.astro` | ❌ | M3.2 |
| `/me/preferences` | `me/preferences.astro` | ❌ | M3.2 |
| `/me/access-log` | `me/access-log.astro` | ❌ | M3.2 |
| `/me/referrals` | `me/referrals.astro` | ❌ | M3.2 |
| `/forms/[slug]` (public form renderer) | `forms/[slug].astro` | ❌ | M3.3 |
| `/onboard` | `onboard.astro` | ❌ | M3.4 |
| `/welcome/[slug]` | `welcome/[slug].astro` | ❌ | M3.4 |
| `/checkin` | `checkin.astro` | ❌ | M3.5 |
| `/events/[id]/survey` | `events/[id]/survey.astro` | ❌ | M3.6 |
| `/feedback/csat` | `feedback/csat.astro` | ❌ | M3.6 |
| `/leads/thank-you` | `leads/thank-you.astro` | ❌ | M3.6 |
| `/leads/verified` | `leads/verified.astro` | ❌ | M3.6 |
| `/leads/verify-failed` | `leads/verify-failed.astro` | ❌ | M3.6 |
| `/press` | `press.astro` | ❌ | M3.7 |
| `/global` | `global.astro` | ❌ | M3.7 |
| `/marketing/url-builder` | `marketing/url-builder.astro` | ❌ | M3.7 |

---

## Operator workspace pages

| Route | v1 file | Status | Milestone | Blocking blocks |
|---|---|---|---|---|
| `/workspace` (index) | `workspace/index.astro` | ✅ | Phase 2 | — |
| `/workspace/dashboard` | `workspace/dashboard.astro` | ✅ | Phase 2 | — |
| `/workspace/events` (list) | `workspace/events/index.astro` | ✅ | Phase 2 | — |
| `/workspace/events/[id]` (control panel + PATCH) | `workspace/events/[id].astro` | 🔄 | M2.2 | `<Form>`, `<AsyncSelect>`, `<ActionBar>` |
| `/workspace/announce` (full composer) | `workspace/announce/index.astro` | 🔄 | M2.4 | `<AsyncSelect>`, `<ActionBar>`, rich-text |
| `/workspace/approvals` | `workspace/approvals/index.astro` | ✅ | Phase 2 | — |
| `/workspace/members` (list) | `workspace/members/index.astro` | ✅ | Phase 2 | — |
| `/workspace/members` (filter + cohort save) | same file | 🔄 | M2.3 | `<Form>` wiring complete |
| `/workspace/partners` (list) | `workspace/partners/index.astro` | ✅ | Phase 2 | — |
| `/workspace/partners/[slug]` (read-only) | `workspace/partners/[slug].astro` | ✅ | M2.1 | — |
| `/workspace/forms` (list) | `workspace/forms/index.astro` | ✅ | Phase 2 | — |
| `/workspace/forms/[id]` (builder) | `workspace/forms/[id].astro` | ❌ | M2.6 | `<FormBuilder>` |
| `/workspace/forms/[id]/responses` | `workspace/forms/[id]/responses.astro` | ❌ | M2.6 | `<DataTable>` |
| `/workspace/admin/users` (list + create) | `workspace/admin/users/index.astro` | ✅ | Phase 2 | — |
| `/workspace/admin/users/new` | `workspace/admin/users/new.astro` | ✅ | Phase 2 | — |
| `/workspace/admin/audit` | `workspace/admin/audit/index.astro` | ✅ | Phase 2 | — |
| `/workspace/admin/countries` (list) | `workspace/admin/countries.astro` | ❌ | M2.5 | — |
| `/workspace/admin/countries/[code]/provisioning` | `workspace/admin/countries/[code]/provisioning/index.astro` | ✅ | Phase 2 | — |
| `/workspace/admin/cron` | `workspace/admin/cron.astro` | ❌ | M2.9 | — |
| `/workspace/admin/rbac-sync` | `workspace/admin/rbac-sync.astro` | ❌ | M2.9 | — |
| `/workspace/integrations/telegram` | `workspace/integrations/telegram/index.astro` | ❌ | M2.7 | — |
| `/workspace/integrations/telegram/segments` | `workspace/integrations/telegram/segments/index.astro` | ❌ | M2.7 | `<FormBuilder>` |
| `/workspace/integrations/telegram/broadcasts` | `workspace/integrations/telegram/broadcasts/index.astro` | ❌ | M2.8 | — |
| `/workspace/integrations/telegram/broadcasts/new` | `workspace/integrations/telegram/broadcasts/new.astro` | ❌ | M2.8 | `<AsyncSelect>`, `<ActionBar>`, rich-text |
| `/workspace/integrations/telegram/broadcasts/[id]` | `workspace/integrations/telegram/broadcasts/[id].astro` | ❌ | M2.8 | — |

---

## Phase 3 — new cabinets (not in v1, required before cutover)

| Route | What it does | Status |
|---|---|---|
| `/workspace/site-settings` | Homepage hero / footer / contact singletons | ❌ |
| `/workspace/sponsors` | Manage sponsor rows | ❌ |
| `/workspace/press` | Manage press/marketing assets | ❌ |
| `/workspace/badges` | Grant badges + award history | ❌ |
| `/workspace/country-leads` | Country-lead onboarding (wraps operator invites) | ❌ |
| `/workspace/members` uplift | Segment builder integrated into filter panel | ❌ |

---

## Cutover sequence (M4)

| Step | Status | Notes |
|---|---|---|
| Parity matrix all-✅ | ❌ | Gate condition — run after all pages done |
| Auth/cookie parity (`aiqadam-next-refresh` → `aiqadam-refresh`, 24h overlap) | ❌ | M4 step 1 |
| Re-enable SEO (remove noindex, add canonical, OG cards, Plausible, Google Fonts preconnect) | ❌ | M4 step 2 |
| Authentik OAuth client repoint (`next.aiqadam.org` → apex/tenant URIs) | ❌ | M4 step 3 |
| Playwright parity E2E green (24h cron, both `aiqadam.org` + `next.aiqadam.org`) | ❌ | M4 step 4 |
| Lighthouse ≥ 90 on `/`, `/events`, `/leaderboard` | ❌ | M4 step 4 |
| Backrest snapshot (within 1 hour before flip) | ❌ | M4 step 5 |
| Coolify FQDN flip — **web UI only, human step** | ❌ | M4 step 5 — API write wipes Traefik labels (see ops incident 2026-05-24) |
| 30-min smoke (sign-in, register, recovery, `/workspace`) | ❌ | M4 step 6 |
| PM sign-off in decision-batch entry | ❌ | M4 gate |
| v1 standby (2 weeks, instant rollback if needed) | ❌ | M4 step 7 |
| Delete `apps/web/`, rename `apps/web-next/` → `apps/web/` | ❌ | M4 teardown |

---

## Recommended execution order

```
M1{Form, AsyncSelect, ActionBar, Drawer}
  → M2.2 events/[id] control panel
  → M2.3 members filter + cohort
  → M2.4 announce composer
  → M3.1 auth pages
  → M3.2 /me hub + preferences + access-log + referrals
  → M1{Wizard (done), FormBuilder}
  → M2.5 countries list
  → M2.6 forms builder + responses
  → M2.7 Telegram segments
  → M2.8 Telegram broadcasts
  → M2.9 cron + rbac-sync
  → M3.3 public form renderer
  → M3.4 onboard + welcome
  → M3.5 checkin
  → M3.6 csat + survey + leads pages
  → M3.7 press + global + url-builder
  → Phase 3 (new cabinets — reuse existing blocks)
  → M4 cutover
```

Constraint: every PR ≤ 5 code files, ≤ 400 LOC, one logical change.
`pnpm arch:check` + `astro check` + `pnpm build` + `biome check` must
pass before push. Every block change updates `blocks.md` in the same PR.
