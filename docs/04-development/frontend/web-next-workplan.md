# Web-next workplan — from current state to cutover

> **Live execution map for the remaining `apps/web-next/` rewire (ADR-0038).**
> Complements [`web-migration-plan.md`](web-migration-plan.md) (the original
> phase plan), [`blocks.md`](../architecture/blocks.md) (catalogue),
> [`wiring-map.md`](../architecture/wiring-map.md), and [`parity-matrix.md`](../../03-requirements/parity-matrix.md)
> (cutover gate). Updated as PRs land.
>
> Authored 2026-05-26 after a parity/API/block/cutover discovery sweep once
> Phase 1 + the first wave of Phase 2 cabinets had merged. Decision: **full
> parity — port every v1 surface** (no drop-list).

## Current state (2026-05-26)

**Shipped (merged to main):**
- **Phase 1 customer surfaces — COMPLETE:** `/`, `/events`, `/events/[id]`
  (+ sidebar + forum), `/leaderboard`, `/u/[handle]`, `/me/profile` +
  sitewide `<AppFooter>` / `<MarkdownBody>` / `<DateTime>` / `<TimeRange>`.
- **Phase 2 operator cabinets — list/read tier:** shell (`<PageShell>` +
  `<Breadcrumbs>`), generic `<DataTable>`, Members list, Operator invites
  (+ create-form), Dashboard (`<KpiTile>` grid), Audit log, Partners list,
  Approvals queue, Events list, Forms list.
- **26 L3 blocks**, 8 L2 kit atoms.

**The critical gap discovery surfaced:** the **sitewide top-nav / header was
never built in web-next.** `Layout.astro` mounts only `<PageHead>` + `<slot/>`
+ `<AppFooter>` — no nav, no auth-aware account menu, no country/locale
switcher. The operator `<PageShell>` has no cross-cabinet navigation either.
This is the literal motivation for the whole rewire (the inconsistent-auth-UI
nav-bar bug, parity-matrix flagship row "top-nav identity always agrees with
body, SSR-verified") — so it leads the remaining work.

## Milestones

### M0 — Sitewide shell (the original motivation) ⭐ first

| PR | Scope | New blocks | Cx |
|----|-------|-----------|-----|
| **M0.1** | `<CountrySwitcher>` + `<LocaleSwitcher>` common blocks (subdomain nav + locale cookie) | 2 | S |
| **M0.2** | `<AppNav>` customer header + `<AccountChip>` island (SSR auth from `Astro.locals.auth`; role-gated Workspace link; sign-out) → wire into `Layout.astro` | 2 | M |
| **M0.3** | Operator shell nav — cabinet menu/sidebar in `<PageShell>` so operators move between cabinets inside the shell | — | S–M |

v1 reference: `apps/web/src/components/Nav.astro` + `NavAccountMenu.tsx`.

### M1 — Foundational block library (gates everything after)

Catalogue-declared-but-unbuilt blocks. Build just-in-time; these are hard
dependencies for later PRs.

| Block | Folder | Cx | Gates |
|-------|--------|-----|-------|
| `<Form>` (Zod-driven) | workspace | M | every write-cabinet |
| `<Drawer>` (kit atom — Radix side panel) | kit | S | filter/edit panes |
| `<AsyncSelect>` (server-search dropdown) | workspace | M | event-edit, broadcasts, announce, segments |
| `<ActionBar>` (contextual action row) | workspace | S | broadcasts, provisioning, event-edit |
| `<Wizard>` (step machine) | workspace | L | country provisioning, onboarding |
| `<FormBuilder>` (drag/reorder, 7 field types) | workspace | L | forms builder, segment criteria |
| `<Tooltip>` (kit atom) | kit | S | hints (non-blocking) |

### M2 — Operator cabinet completion

| PR | Scope | Needs | Auth | Cx |
|----|-------|-------|------|-----|
| **M2.1** | `partners/[slug]` detail (**read-only — no PATCH endpoint exists**) | — | AuthGuard | S |
| **M2.2** | `events/[id]` control panel (PATCH metadata + followups checklist + regen-social-card) — operator's core day-of tool | Form, AsyncSelect (survey form), ActionBar | AuthGuard | M |
| **M2.3** | Members filter panel + cohort save/load (`/workspace/cohorts`) | Drawer, Form, criteria editor | AuthGuard | M |
| **M2.4** | Announce composer (`/workspace/announce`) — subject + 20k body + cohort + consent toggle + preview-then-send | rich-text, AsyncSelect (cohort), ActionBar | AuthGuard | M |
| **M2.5** | Country provisioning (`/workspace/admin/countries` + `[code]/provisioning`) — idempotent step machine + activate gate | Wizard, ActionBar | **SuperAdminGuard** | L |
| **M2.6** | Forms builder (`forms/[id]`) + responses inbox (`[id]/responses`) + per-field aggregate | FormBuilder, DataTable, chart widgets | AuthGuard | L |
| **M2.7** | Telegram segments builder (`/workspace/integrations/telegram`, segments) — `_and`/`_or` criteria + live preview | FormBuilder-pattern, AsyncSelect (event), debounced preview | AuthGuard | L |
| **M2.8** | Telegram broadcasts composer + actions (send-now/test/cancel/duplicate, ≤8 inline buttons, scheduler) | rich-text, AsyncSelect (segment), ActionBar, button-repeater | AuthGuard | L |
| **M2.9** | admin/cron status table + admin/rbac-sync list (+ retry) | DataTable | AuthGuard | S each |

### M3 — Customer cutover-blocking pages

| PR | Scope | Cx |
|----|-------|-----|
| **M3.1** | `/auth/sign-in` + `/auth/signed-out` (RP-logout landing — SLO flow depends on it per Authentik invalidation config) | S |
| **M3.2** | `/me` hub + `/me/preferences` (wires existing `<ConsentList>` — GDPR-load-bearing) + `/me/access-log` + `/me/referrals` | M |
| **M3.3** | `/forms/[slug]` public submission (renders FormBuilder schema as a fillable form; honours `allow_anonymous`) | M |
| **M3.4** | `/onboard` + `/welcome/[slug]` new-member flow (Telegram acquisition funnel lands here) | M |
| **M3.5** | `/checkin` event-day check-in | M |
| **M3.6** | `/leads/{thank-you,verified,verify-failed}` funnel + `/feedback/csat` + `/events/[id]/survey` | S |
| **M3.7** | Static/marketing: `/press`, `/global`, `/marketing/url-builder` (UTM builder) | S–M |

### M4 — Cutover (Phase 4)

Gated on parity-matrix all-✅ + PM sign-off. Sequenced:

1. **Auth/cookie parity** — canonical `aiqadam-refresh` issued from v2; API
   accepts `aiqadam-next-refresh` for 24h overlap then drops it; 30s
   server-side rotation grace; `users.min_access_iat` for active-token
   revocation.
2. **Re-enable for prod** — remove `<meta robots noindex>` + `robots.txt
   Disallow: /`; re-add `<link rel="canonical">`, full OG/Twitter card block,
   the **Plausible** analytics script, Google-Fonts preconnect, and the
   `captureLandingAttribution` script. All four were stripped in build-aside.
3. **Authentik OAuth client** — repoint the `next.aiqadam.org` client to
   apex/tenant callback URIs.
4. **Parity verification** — Playwright parity E2E green on a 24h cron run
   against both `aiqadam.org` (v1) and `next.aiqadam.org` (v2); Lighthouse
   perf ≥ 90 on `/`, `/events`, `/leaderboard`.
5. **Coolify FQDN flip** — ⚠️ **WEB-UI-ONLY, HUMAN STEP.** Per the
   Coolify-custom-labels incident, the API cannot re-run the Traefik label
   generator; doing the FQDN swap via API replaces `custom_labels` and wipes
   routing (caused a 40-min prod outage 2026-05-24). Flip via Coolify UI →
   Save (re-runs generator) → Deploy. Freeze all other Coolify writes during
   the window.
6. **Snapshot + flip + smoke** — Backrest snapshot within the hour → flip →
   30-min smoke (sign-in, register-for-event, recovery, `/workspace`) →
   watch Plausible + error logs.
7. **Fallback + teardown** — v1 stays on standby 2 weeks (re-flip = instant
   rollback); then delete `apps/web/`, rename `web-next/` → `web/`.

## Block dependency graph (what unblocks what)

```
M0.1 CountrySwitcher/LocaleSwitcher ──> M0.2 AppNav (needs both + AccountChip)
M1 Form + AsyncSelect + ActionBar ──> M2.2 event-edit, M2.4 announce, M2.3 cohorts
M1 Drawer ──> M2.3 members filter pane
M1 Wizard ──> M2.5 country provisioning, M3.4 onboarding
M1 FormBuilder ──> M2.6 forms builder, M2.7 TG segments, M3.3 public form render
rich-text composer ──> M2.4 announce, M2.8 TG broadcasts
```

Phase 3 (the **new** cabinets v1 never built — Sponsors, Site-settings,
Press/marketing-asset, Points & badges, Country-lead onboarding, Members
uplift) ships **no new blocks** in the original plan: it reuses `<DataTable>`,
`<Form>`, `<Wizard>`, `<FormBuilder>`. So Phase 3 is gated on M1 landing.

## Recommended execution order

```
M0 → M1{Form,AsyncSelect,ActionBar,Drawer} → M2.1–2.3 → M3.1–3.2
   → M1{Wizard,FormBuilder} → M2.4–2.9 → M3.3–3.7 → Phase 3 → M4
```

Front-loads the nav (motivation + every page benefits) and the cheap-but-broad
blocks; defers the two heavy blocks (Wizard, FormBuilder) until their cabinets
are next; ends on cutover. ~28–32 PRs at the ≤5-file / ≤400-LOC cadence.

## Constraints (every PR)

- ≤ 5 code files, ≤ 400 LOC, one logical change (docs/config/tests exempt).
- `pnpm arch:check` + `astro check` + `pnpm build` + `biome check` all green
  before push; GitHub Actions green before merge.
- Every block add/edit updates [`blocks.md`](../architecture/blocks.md) in the SAME PR
  (enforced by `architecture-check`).
- Every new data wiring updates [`wiring-map.md`](../architecture/wiring-map.md).
- New pages created via `pnpm gen:cabinet` / `pnpm gen:page` (carry the
  `@generated-from` marker).
- Worktree per feature under `/home/drukker/wt/<feature>/`.

## Division of labour

- **Claude can drive M0–M3 + Phase 3 autonomously** (PRs + CI + merge).
- **PM required for M4:** the Coolify FQDN flip (web-UI-only) +
  the parity-gate sign-off in a decision-batch entry.
