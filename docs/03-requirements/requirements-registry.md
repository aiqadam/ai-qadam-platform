# Requirements registry

> Single-file, deliverable-level index of every planned requirement unit across
> the requirements layer. One row per milestone / sprint / delivery-plan / feature
> deliverable — **not** per sub-PR or per parity-matrix line (those live in the
> source documents linked in the *Body* column).
>
> **Sorted by implementation order** (the `#` column): shipped work first in the
> sequence it was built, then in-flight work, then the documented execution
> sequence for what remains. Where parallel tracks exist, they are interleaved by
> dependency and grouped with a note below.
>
> Generated 2026-06-19 from the Layer-3 requirement docs, cross-checked against git
> history. Status reflects reality as of that date — a few source docs still carry
> stale `Proposed` headers for work that has since shipped (noted inline).

## Functional requirements (FR files)

Individual capability-level requirements live as `FR-<MODULE>-<NNN>.md` files in this directory. Each file contains a full description, functional scope, and acceptance criteria sufficient to start development.

| Module | Abbrev | Files |
|---|---|---|
| Auth | AUTH | [FR-AUTH-001](FR-AUTH-001.md) · [002](FR-AUTH-002.md) · [003](FR-AUTH-003.md) · [004](FR-AUTH-004.md) · [005](FR-AUTH-005.md) · [006](FR-AUTH-006.md) · [007](FR-AUTH-007.md) |
| Users | USR | [FR-USR-001](FR-USR-001.md) · [002](FR-USR-002.md) · [003](FR-USR-003.md) · [004](FR-USR-004.md) · [005](FR-USR-005.md) · [006](FR-USR-006.md) · [007](FR-USR-007.md) |
| Events | EVT | [FR-EVT-001](FR-EVT-001.md) · [002](FR-EVT-002.md) · [003](FR-EVT-003.md) · [004](FR-EVT-004.md) · [005](FR-EVT-005.md) · [006](FR-EVT-006.md) · [007](FR-EVT-007.md) |
| Registrations | REG | [FR-REG-001](FR-REG-001.md) · [002](FR-REG-002.md) · [003](FR-REG-003.md) · [004](FR-REG-004.md) · [005](FR-REG-005.md) |
| Speakers | SPK | [FR-SPK-001](FR-SPK-001.md) · [002](FR-SPK-002.md) |
| Partners | PTN | [FR-PTN-001](FR-PTN-001.md) · [002](FR-PTN-002.md) |
| Gamification | GAM | [FR-GAM-001](FR-GAM-001.md) · [002](FR-GAM-002.md) · [003](FR-GAM-003.md) · [004](FR-GAM-004.md) |
| Notifications | NTF | [FR-NTF-001](FR-NTF-001.md) · [002](FR-NTF-002.md) · [003](FR-NTF-003.md) · [004](FR-NTF-004.md) · [005](FR-NTF-005.md) |
| Telegram Bot | BOT | [FR-BOT-001](FR-BOT-001.md) · [002](FR-BOT-002.md) · [003](FR-BOT-003.md) |
| CMS / Content | CMS | [FR-CMS-001](FR-CMS-001.md) · [002](FR-CMS-002.md) · [003](FR-CMS-003.md) · [004](FR-CMS-004.md) · [005](FR-CMS-005.md) · [006](FR-CMS-006.md) |
| Admin / Operator | ADM | [FR-ADM-001](FR-ADM-001.md) · [002](FR-ADM-002.md) · [003](FR-ADM-003.md) · [004](FR-ADM-004.md) · [005](FR-ADM-005.md) · [006](FR-ADM-006.md) · [007](FR-ADM-007.md) · [008](FR-ADM-008.md) · [009](FR-ADM-009.md) |
| CRM | CRM | [FR-CRM-001](FR-CRM-001.md) · [002](FR-CRM-002.md) · [003](FR-CRM-003.md) |
| Ops / Infra | OPS | [FR-OPS-001](FR-OPS-001.md) |
| Migration | MIG | [FR-MIG-001](FR-MIG-001.md) · [002](FR-MIG-002.md) · [003](FR-MIG-003.md) · [004](FR-MIG-004.md) · [005](FR-MIG-005.md) · [006](FR-MIG-006.md) · [007](FR-MIG-007.md) · [008](FR-MIG-008.md) · [009](FR-MIG-009.md) · [010](FR-MIG-010.md) · [011](FR-MIG-011.md) · [012](FR-MIG-012.md) · [013](FR-MIG-013.md) · [014](FR-MIG-014.md) · [015](FR-MIG-015.md) · [016](FR-MIG-016.md) · [017](FR-MIG-017.md) · [018](FR-MIG-018.md) · [019](FR-MIG-019.md) · [020](FR-MIG-020.md) · [021](FR-MIG-021.md) · [022](FR-MIG-022.md) · [023](FR-MIG-023.md) · [024](FR-MIG-024.md) · [025](FR-MIG-025.md) · [026](FR-MIG-026.md) · [027](FR-MIG-027.md) · [028](FR-MIG-028.md) · [029](FR-MIG-029.md) · [030](FR-MIG-030.md) · [031](FR-MIG-031.md) |
| Workflow | WORKFLOW | [FR-WORKFLOW-001](FR-WORKFLOW-001.md) · [003](FR-WORKFLOW-003.md) |

## FR implementation order

All 61 FR files sorted by implementation dependencies. Items with no FR dependencies can start immediately; each subsequent item requires the listed FRs to be complete first. Items at the same dependency depth can be worked in parallel.

| # | Code | Name | Status | Depends on |
|---|------|------|--------|------------|
| 1 | [FR-OPS-001](FR-OPS-001.md) | Backup / restore (restic + Backrest) | Shipped | — |
| 2 | [FR-AUTH-001](FR-AUTH-001.md) | Email / password sign-in | Shipped | — |
| 3 | [FR-CMS-006](FR-CMS-006.md) | UTM URL builder | Shipped | — |
| 4 | [FR-ADM-009](FR-ADM-009.md) | Cron health dashboard | Shipped | — |
| 5 | [FR-CMS-001](FR-CMS-001.md) | Homepage + site CMS content | Shipped | — |
| 6 | [FR-CRM-001](FR-CRM-001.md) | Twenty CRM deployment + SSO | Shipped | — |
| 7 | [FR-ADM-005](FR-ADM-005.md) | Operator invites | Shipped | AUTH-001 |
| 8 | [FR-USR-001](FR-USR-001.md) | Signup / first-time experience | Shipped | AUTH-001 |
| 9 | [FR-AUTH-002](FR-AUTH-002.md) | Telegram sign-in | In Progress | AUTH-001 |
| 10 | [FR-AUTH-004](FR-AUTH-004.md) | Magic-link sign-in | Planned | AUTH-001 |
| 11 | [FR-AUTH-003](FR-AUTH-003.md) | Google / GitHub OAuth | Planned | AUTH-001 |
| 12 | [FR-ADM-006](FR-ADM-006.md) | Country provisioning | Shipped | ADM-005 |
| 13 | [FR-ADM-007](FR-ADM-007.md) | RBAC sync | Shipped | ADM-005, AUTH-001 |
| 14 | [FR-ADM-008](FR-ADM-008.md) | Audit log | Shipped | USR-001 |
| 15 | [FR-GAM-001](FR-GAM-001.md) | Points engine | Shipped | USR-001 |
| 16 | [FR-NTF-001](FR-NTF-001.md) | Notification dispatcher / transactional email | Shipped | USR-001 |
| 17 | [FR-USR-002](FR-USR-002.md) | Profile editing | Shipped | USR-001 |
| 18 | [FR-USR-005](FR-USR-005.md) | Referral programme | Shipped | USR-001 |
| 19 | [FR-USR-006](FR-USR-006.md) | Access log | Shipped | USR-001 |
| 20 | [FR-ADM-002](FR-ADM-002.md) | Member directory | Shipped | USR-001 |
| 21 | [FR-CRM-002](FR-CRM-002.md) | Contact sync to Twenty | Planned | CRM-001, USR-001 |
| 22 | [FR-EVT-001](FR-EVT-001.md) | Event CRUD | Shipped | CMS-001 |
| 23 | [FR-CMS-002](FR-CMS-002.md) | Landing pages | Shipped | CMS-001 |
| 24 | [FR-CMS-003](FR-CMS-003.md) | Form builder | Shipped | CMS-001 |
| 25 | [FR-GAM-002](FR-GAM-002.md) | Badges | Shipped | GAM-001 |
| 26 | [FR-EVT-002](FR-EVT-002.md) | Event i18n | Shipped | EVT-001 |
| 27 | [FR-EVT-003](FR-EVT-003.md) | Event discovery list | Shipped | EVT-001 |
| 28 | [FR-SPK-001](FR-SPK-001.md) | Speaker profiles | Shipped | USR-001, EVT-001 |
| 29 | [FR-PTN-001](FR-PTN-001.md) | Partner profiles | Shipped | EVT-001 |
| 30 | [FR-GAM-003](FR-GAM-003.md) | Leaderboard | Shipped | GAM-001, USR-001 |
| 31 | [FR-USR-007](FR-USR-007.md) | Public member profile | Shipped | USR-001, GAM-001, GAM-002 |
| 32 | [FR-REG-001](FR-REG-001.md) | Registration flow | Shipped | AUTH-001, EVT-001, NTF-001, GAM-001 |
| 33 | [FR-SPK-002](FR-SPK-002.md) | Speaker management | Shipped | SPK-001, GAM-001 |
| 34 | [FR-ADM-001](FR-ADM-001.md) | Operator dashboard | Shipped | EVT-001, REG-001 |
| 35 | [FR-EVT-004](FR-EVT-004.md) | Event detail page | In Progress | EVT-001, REG-001, SPK-001 |
| 36 | [FR-EVT-005](FR-EVT-005.md) | Event operator control panel | Shipped | EVT-001, REG-001 |
| 37 | [FR-USR-003](FR-USR-003.md) | Member dashboard (/me) | Shipped | USR-001, REG-001, GAM-001, GAM-002 |
| 38 | [FR-ADM-003](FR-ADM-003.md) | Announcement composer | Shipped | ADM-002, NTF-001 |
| 39 | [FR-ADM-004](FR-ADM-004.md) | Approvals queue | Shipped | EVT-001, REG-001 |
| 40 | [FR-NTF-003](FR-NTF-003.md) | 24 h pre-event reminder | Planned | NTF-001, REG-001 |
| 41 | [FR-REG-002](FR-REG-002.md) | Waitlist | Shipped | REG-001, NTF-001 |
| 42 | [FR-REG-003](FR-REG-003.md) | Cancellation | Shipped | REG-001, REG-002, GAM-001 |
| 43 | [FR-REG-004](FR-REG-004.md) | QR check-in | Shipped | REG-001, GAM-001 |
| 44 | [FR-USR-004](FR-USR-004.md) | Notification preferences | Shipped | USR-001 |
| 45 | [FR-CRM-003](FR-CRM-003.md) | Activity sync to Twenty | Planned | CRM-002, REG-001 |
| 46 | [FR-GAM-004](FR-GAM-004.md) | Streaks | Shipped | GAM-001, REG-004 |
| 47 | [FR-REG-005](FR-REG-005.md) | No-show tracking | Shipped | REG-001, REG-004, GAM-004 |
| 48 | [FR-EVT-006](FR-EVT-006.md) | Post-event survey | Shipped | EVT-001, CMS-003, NTF-001 |
| 49 | [FR-PTN-002](FR-PTN-002.md) | Partner onboarding workflow | Not Started | PTN-001, CRM-002 |
| 50 | [FR-EVT-007](FR-EVT-007.md) | Topic tagging | Planned | EVT-001 |
| 51 | [FR-NTF-005](FR-NTF-005.md) | Notification preferences + topic interests | Planned | USR-004, EVT-007 |
| 52 | [FR-NTF-002](FR-NTF-002.md) | Event announcement fan-out | Planned | NTF-001, EVT-007, NTF-005 |
| 53 | [FR-CMS-005](FR-CMS-005.md) | Audience segment builder | Shipped | ADM-002, EVT-007 |
| 54 | [FR-CMS-004](FR-CMS-004.md) | Telegram broadcast composer | Shipped | CMS-005, ADM-002 |
| 55 | [FR-BOT-001](FR-BOT-001.md) | Telegram bot scaffold | Planned | AUTH-002 |
| 56 | [FR-AUTH-005](FR-AUTH-005.md) | Account linking | Planned | AUTH-002, BOT-001 |
| 57 | [FR-AUTH-006](FR-AUTH-006.md) | Temporary account upgrade | Planned | AUTH-002, AUTH-004, GAM-001 |
| 58 | [FR-BOT-002](FR-BOT-002.md) | Member bot commands | Planned | BOT-001, REG-001, GAM-003, EVT-003 |
| 59 | [FR-BOT-003](FR-BOT-003.md) | Operator runtime commands | Planned | BOT-001, REG-004 |
| 60 | [FR-NTF-004](FR-NTF-004.md) | Telegram channel notification adapter | Planned | NTF-001, BOT-001, AUTH-002 |
| 61 | [FR-AUTH-007](FR-AUTH-007.md) | Linked identity surface | Planned | AUTH-002, AUTH-003, AUTH-005 |
| 62 | [FR-WORKFLOW-001](FR-WORKFLOW-001.md) | Context drift guard for the agentic workflow layer | Shipped | — |
| 63 | [FR-WORKFLOW-003](FR-WORKFLOW-003.md) | UAT fixture state reset — order-independent, re-entrant UAT runs | Shipped | WORKFLOW-002 (UAT infra, shipped) |

> **Note on CMS-004 / CMS-005:** both shipped in V1 against the existing `tg.dispatch.v1` notifier infrastructure (ADR-0034), not the planned aiogram bot (BOT-001). Their position above reflects this — they are independent of the BOT track.

## FR-MIG implementation order

31 migration-specific FRs covering the `apps/web` → `apps/web-next` rewrite. Sorted by dependency. Each file has full acceptance criteria usable by an AI agent or engineer without further context.

| # | Code | Name | Status | Depends on |
|---|------|------|--------|------------|
| 1 | [FR-MIG-001](FR-MIG-001.md) | Sitewide customer nav shell | Shipped | — |
| 2 | [FR-MIG-002](FR-MIG-002.md) | Operator shell nav | Shipped | — |
| 3 | [FR-MIG-008](FR-MIG-008.md) | /workspace/partners/[slug] detail (read-only) | Shipped | — |
| 4 | [FR-MIG-007](FR-MIG-007.md) | Tooltip kit atom | Shipped | — |
| 5 | [FR-MIG-003](FR-MIG-003.md) | Form block (Zod-driven) | Shipped | — |
| 6 | [FR-MIG-004](FR-MIG-004.md) | AsyncSelect block (server-search dropdown) | Shipped | — |
| 7 | [FR-MIG-005](FR-MIG-005.md) | ActionBar block (contextual action row) | Shipped | — |
| 8 | [FR-MIG-009](FR-MIG-009.md) | /workspace/events/[id] control panel with PATCH | Shipped | MIG-003, MIG-004, MIG-005 |
| 9 | [FR-MIG-010](FR-MIG-010.md) | /workspace/members filter panel + cohort save/load | Shipped | MIG-003 |
| 10 | [FR-MIG-011](FR-MIG-011.md) | /workspace/announce full composer | Shipped | MIG-003, MIG-004, MIG-005 |
| 11 | [FR-MIG-012](FR-MIG-012.md) | /workspace/admin/countries list + provisioning wizard | Shipped | MIG-003, MIG-005 |
| 12 | [FR-MIG-017](FR-MIG-017.md) | /auth/sign-in + /auth/signed-out pages | Shipped | MIG-001 |
| 13 | [FR-MIG-018](FR-MIG-018.md) | /me hub + preferences + access-log + referrals | Shipped | MIG-001, MIG-017 |
| 14 | [FR-MIG-006](FR-MIG-006.md) | FormBuilder block (drag/reorder, 7 field types) | Shipped | — |
| 15 | [FR-MIG-013](FR-MIG-013.md) | /workspace/forms/[id] builder + responses | Shipped | MIG-006, MIG-005 |
| 16 | [FR-MIG-014](FR-MIG-014.md) | /workspace/integrations/telegram root + segments | Shipped | MIG-004, MIG-006 |
| 17 | [FR-MIG-015](FR-MIG-015.md) | /workspace/integrations/telegram/broadcasts list + composer | Shipped | MIG-004, MIG-005 |
| 18 | [FR-MIG-016](FR-MIG-016.md) | /workspace/admin/cron + /workspace/admin/rbac-sync | Shipped | — |
| 19 | [FR-MIG-019](FR-MIG-019.md) | /forms/[slug] public form renderer | Shipped | MIG-006 |
| 20 | [FR-MIG-020](FR-MIG-020.md) | /onboard + /welcome/[slug] new-member flow | Shipped | MIG-017 |
| 21 | [FR-MIG-021](FR-MIG-021.md) | /checkin event-day QR check-in | Shipped | — |
| 22 | [FR-MIG-022](FR-MIG-022.md) | /events/[id]/survey + /feedback/csat + /leads/* | Shipped | MIG-019 |
| 23 | [FR-MIG-023](FR-MIG-023.md) | /press + /global + /marketing/url-builder | Shipped | — |
| 24 | [FR-MIG-024](FR-MIG-024.md) | /workspace/site-settings singleton editor | Implemented | MIG-003, MIG-005 |
| 25 | [FR-MIG-025](FR-MIG-025.md) | /workspace/sponsors management | Shipped | MIG-003, MIG-004, MIG-005 |
| 26 | [FR-MIG-026](FR-MIG-026.md) | /workspace/press asset manager | Shipped | MIG-003, MIG-005 |
| 27 | [FR-MIG-027](FR-MIG-027.md) | /workspace/badges grant + award history | Shipped | MIG-003, MIG-004, MIG-005 |
| 28 | [FR-MIG-028](FR-MIG-028.md) | /workspace/country-leads onboarding cabinet | Shipped | — |
| 29 | [FR-MIG-029](FR-MIG-029.md) | /workspace/members uplift — segment builder | Shipped | MIG-010, MIG-003 |
| 30 | [FR-MIG-030](FR-MIG-030.md) | Parity verification — E2E suite + Lighthouse | Implemented | MIG-001 through MIG-029 |
| 31 | [FR-MIG-031](FR-MIG-031.md) | Production cutover — cookie parity, SEO, FQDN flip | Implemented | MIG-030 |

> **Execution constraint:** every PR is ≤ 5 code files, ≤ 400 LOC. `pnpm arch:check` + `astro check` + `pnpm build` + `biome check` must pass before push. Every block add/edit updates `blocks.md` in the same PR.

## Status legend

- **Shipped** — merged to `main` and live.
- **In progress** — partially merged; remaining sub-items open.
- **Not started** — planned, no implementation yet.
- **Planned** — plan drafted, awaiting sign-off / sequencing.
- **Deferred** — deliberately parked behind a gate (see *Body*).

## Track legend (Stage / Phase column)

Two different "Phase 2"s exist in the source docs, so this registry disambiguates:

- **Rebuild Mx / Phase 1–4** — the `apps/web` → `apps/web-next` frontend rewrite
  (ADR-0038), tracked in [`web-next-workplan.md`](../04-development/frontend/web-next-workplan.md).
- **Roadmap Sprint 5–8** — the Phase-2 backend track (CRM, Telegram, multi-IdP),
  tracked in [`sprint-5-to-8-plan.md`](sprint-5-to-8-plan.md).
- **V1 finish-line / Phase ζ** — `apps/web` polish and deferred bets.

## Registry

| # | Code | Name | Status | Module | Stage / Phase | Body |
|---|------|------|--------|--------|---------------|------|
| 1 | F-OPS1 | Snapshot + restore + UI for the operational layer (restic + Backrest) | Shipped | Ops / Infra | V1 ops (issues #298–#337) | [f-ops1-snapshot-restore-ui.md](plans/f-ops1-snapshot-restore-ui.md) |
| 2 | #326 | Event content translations (i18n read + write path) | Shipped | CMS / Telegram | V1 (issues #352–#363) | [326-event-content-i18n.md](plans/326-event-content-i18n.md) |
| 3 | #294 | Broadcast composer + scheduling + segments (producer side) | Shipped | Telegram / Operator | V1 (issues #369–#376) | [294-broadcast-composer.md](plans/294-broadcast-composer.md) |
| 4 | RB-P1 | Phase 1 — customer read surfaces (`/`, `/events`, `/events/[id]`, `/leaderboard`, `/u/[handle]`, `/me/profile`) | Shipped | Web — customer | Rebuild Phase 1 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 5 | RB-P2 | Phase 2 — operator list/read cabinets (Members, Invites, Dashboard, Audit, Partners, Approvals, Events, Forms) | Shipped | Web — operator | Rebuild Phase 2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 6 | M0.1 | `<CountrySwitcher>` + `<LocaleSwitcher>` common blocks | Shipped | Web — shell | Rebuild M0 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 7 | M0.2 | `<AppNav>` customer header + `<AccountChip>` (SSR auth) | Shipped | Web — shell | Rebuild M0 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 8 | M0.3 | Operator shell nav (cross-cabinet menu in `<PageShell>`) | Shipped | Web — shell | Rebuild M0 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 9 | M1 | Foundational block library (Form, Drawer, AsyncSelect, ActionBar, Wizard, FormBuilder, Tooltip) | In progress | Web — blocks | Rebuild M1 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 10 | M2.1 | `partners/[slug]` detail (read-only) | Shipped | Web — operator | Rebuild M2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 11 | M2.2 | `events/[id]` control panel (PATCH metadata + followups) | Shipped | Web — operator | Rebuild M2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 12 | M2.3 | Members filter panel + cohort save/load | Shipped | Web — operator | Rebuild M2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 13 | M2.4 | Announce composer (cohort + body + consent + preview/send) | Shipped | Web — operator | Rebuild M2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 14 | M2.5 | Country provisioning (idempotent step machine + activate gate) | Shipped | Web — operator | Rebuild M2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 15 | M2.6 | Forms builder + responses inbox + per-field aggregate | Not started | Web — operator | Rebuild M2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 16 | M2.7 | Telegram segments builder (criteria + live preview) | Not started | Web — operator | Rebuild M2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 17 | M2.8 | Telegram broadcasts composer + actions (send/test/cancel/schedule) | Not started | Web — operator | Rebuild M2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 18 | M2.9 | admin/cron status table + admin/rbac-sync list (+ retry) | Not started | Web — operator | Rebuild M2 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 19 | M3.1 | `/auth/sign-in` + `/auth/signed-out` (RP-logout landing) | Not started | Web — customer | Rebuild M3 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 20 | M3.2 | `/me` hub + `/me/preferences` + `/me/access-log` + `/me/referrals` | Not started | Web — customer | Rebuild M3 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 21 | M3.3 | `/forms/[slug]` public submission (FormBuilder schema render) | Not started | Web — customer | Rebuild M3 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 22 | M3.4 | `/onboard` + `/welcome/[slug]` new-member flow | Not started | Web — customer | Rebuild M3 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 23 | M3.5 | `/checkin` event-day check-in | Not started | Web — customer | Rebuild M3 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 24 | M3.6 | `/leads/*` funnel + `/feedback/csat` + `/events/[id]/survey` | Not started | Web — customer | Rebuild M3 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 25 | M3.7 | Static / marketing: `/press`, `/global`, `/marketing/url-builder` | Not started | Web — customer | Rebuild M3 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 26 | RB-P3 | Phase 3 — net-new operator cabinets (Sponsors, Site-settings, Press, Points & badges, Country-lead onboarding, Members uplift) | Not started | Web — operator | Rebuild Phase 3 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 27 | PARITY | v1 → v2 parity-matrix cutover gate (every row ✅ required) | Not started | Web — platform | Rebuild Phase 4 gate | [parity-matrix.md](parity-matrix.md) |
| 28 | M4 | Cutover — auth/cookie parity, re-index, Authentik repoint, Coolify FQDN flip (human step) | Not started | Web — platform | Rebuild Phase 4 | [web-next-workplan.md](../04-development/frontend/web-next-workplan.md) |
| 29 | S5 | Sprint 5 — Twenty CRM | Planned | CRM | Roadmap Phase 2 / Sprint 5 | [sprint-5-to-8-plan.md](sprint-5-to-8-plan.md) |
| 30 | S5.5 | Sprint 5.5 — topics + interests + announcement fan-out | Planned | Telegram / CMS | Roadmap Phase 2 / Sprint 5.5 | [sprint-5-to-8-plan.md](sprint-5-to-8-plan.md) |
| 31 | S6 | Sprint 6 — Telegram bot + Telegram auth | Planned | Telegram / Auth | Roadmap Phase 2 / Sprint 6 | [sprint-5-to-8-plan.md](sprint-5-to-8-plan.md) |
| 32 | S7 | Sprint 7 — Google + GitHub auth providers | Planned | Auth | Roadmap Phase 2 / Sprint 7 | [sprint-5-to-8-plan.md](sprint-5-to-8-plan.md) |
| 33 | S8 | Sprint 8 — E2E flow polish (bidirectional state mirroring) | Planned | Platform | Roadmap Phase 2 / Sprint 8 | [sprint-5-to-8-plan.md](sprint-5-to-8-plan.md) |
| 34 | CSF | Customer-surface finish line (C-1 homepage CMS, C-2 leaderboard, C-3 press, C-4 account + badges) | Planned | Web — customer (V1) | V1 finish-line | [customer-surface-finishline.md](plans/customer-surface-finishline.md) |
| 35 | FORUM | Forum adoption — Discourse | Deferred | Community | Phase ζ.2 | [forum-adoption-brief.md](forum-adoption-brief.md) |

## Notes & caveats

1. **Ordering is documented sequence, not a strict timeline.** Rows 1–14 are
   shipped (ordered by build sequence / issue numbers). Rows 15–28 follow the
   *recommended execution order* in `web-next-workplan.md` (`M0 → M1 → M2 → M3 →
   Phase 3 → M4`). Rows 29–35 are parallel/owned tracks not yet sequenced against
   the rebuild — grouped by track.

2. **Stale source headers.** `294-broadcast-composer.md`, `326-event-content-i18n.md`,
   and `f-ops1-snapshot-restore-ui.md` still open with `Status: Proposed`, but git
   shows all three fully merged (PR-a…PR-e for #294; PR-a…PR-c for #326; PR-a…d +
   finalize for F-OPS1). Their status here reflects git, not the header. Worth
   updating the headers in the source docs.

3. **V1 vs V2 overlap.** `#294` (broadcast composer) and `#326` (i18n) shipped
   against `apps/web` (V1). Their `apps/web-next` (V2) equivalents are M2.7/M2.8
   (Telegram segments/broadcasts) and an unscheduled i18n port — separate rows
   because the rebuild re-implements them under ADR-0038.

4. **CSF may be partially superseded.** The customer-surface finish line targets
   `apps/web` (V1); the V2 rebuild (rows 4–28) is the path to cutover, so some CSF
   items may land only in V2. Confirm scope before scheduling.

5. **Granularity.** Sub-PRs (e.g. `#294 PR-a…PR-e`, `M2.x`), parity-matrix rows,
   and the V1 coverage matrix in [`web-v1-feature-surface.md`](web-v1-feature-surface.md)
   are intentionally **not** expanded here — open the linked *Body* doc for the
   line-item breakdown.
