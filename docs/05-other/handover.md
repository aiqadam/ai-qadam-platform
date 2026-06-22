# AI Qadam — Engineering & Product Handover

> **Status:** Work on the platform and the Telegram bot was **paused on 2026-05-30** by the owner. This document is the single hand-off artifact for whoever picks the project up next.
>
> **Audience:** the next developer (or the next session of an AI coding agent). It assumes you know general web engineering but nothing about this codebase. Read it top-to-bottom once, then use the index in §16 to dive into the canonical docs.
>
> **What this document is:** a synthesis — business objectives, the architectural decisions and *why* they were made, what actually shipped, the hiccups and hard-won lessons, the security/debt backlog, and the roadmap that was planned next. It does **not** replace the canonical docs in [`.claude/`](../../.claude) and [`docs/`](..); it tells you which of them to read and in what order, and it captures the tacit knowledge that lives between the lines.
>
> **Authored:** 2026-05-30. Treat every "as of" statement as true on that date; verify before relying on a specific file/flag/token.

---

## 0. The 60-second orientation

- **What:** AI Qadam is a **multi-tenant community-as-platform for AI engineers across Central Asia** (Uzbekistan, Kazakhstan, Tajikistan, and growing). The audience graph — people ↔ events ↔ skills ↔ employers ↔ interests ↔ consents — *is* the product. Everything else is a thin consumer of that graph.
- **Who:** **Binali Rustamov — Founder.** **Viktor Drukker — COO + Head of Vibe Code & Platform Operations** (and, in practice, the sole human contributor). Country leads run their countries.
- **How it was built:** essentially **one person (Viktor) pair-building with Claude Code**, ~**420 squash-merged PRs in ~15 days** (first commit 2026-05-15). Cadence was 20–30 PRs/day, vertical-feature slices, ≤400 lines each. This is the single most important fact for calibrating the codebase: it is broad, fast-moving, heavily documented, and occasionally ahead of its own docs.
- **Where it runs:** a **single VM** (Hyperapp Cloud, Frankfurt, 8 vCPU / 31 GiB / 2 TB), orchestrated by **Coolify v4**. Production is live at `aiqadam.org` + per-country subdomains.
- **State:** infrastructure is mature and battle-tested; the customer- and operator-facing product is mid-rebuild (V1 `apps/web` → V2 `apps/web-next`). The Telegram bot's platform side (outbox/delivery contract) is in this repo; the bot consumer is a separate repo. Both are paused.

---

## 1. Business objectives (why this exists)

### 1.1 Vision & thesis
AI Qadam is a **community-as-platform**, not a single community and not a CRM. The bet: in Central Asia the professional async channel is **Telegram, not LinkedIn**, and a regional AI-engineering community has no good owned home. Whoever builds the member graph + events engine + consent model owns the substrate every future product sits on.

Comparable archetypes that made this play work: Reforge, DEV.to/Forem, MLH/Devpost, pre-acquisition Indie Hackers. The anti-pattern (a stitched-together cluster of SaaS tools with no shared identity) is explicitly what AI Qadam refuses to become — see [ADR-0033 (community member graph)](../adr/0033-community-member-graph.md) and [ADR-0032 (operator tools must SSO or embed)](../adr/0032-operator-tools-must-sso-or-embed.md).

### 1.2 Revenue model (phased)
- **Today:** sponsor-led (5–15 sponsors/year per country, Bronze→Platinum tiers). See [ADR-0023](../adr/0023-sponsor-invoicing.md), [ADR-0036](../adr/0036-sponsor-digest-rollups.md).
- **Year 2:** paid workshops + a premium content tier.
- **Year 3:** talent-marketplace revenue share + a cohort-course catalogue.
- Each layer needs the previous one to be dense enough to justify it. Future revenue phasing is captured in [ADR-0024](../adr/0024-future-revenue-phasing.md).

### 1.3 Hard operating constraint that shapes everything
**Zero recurring spend** until customer launch. This single rule explains a huge fraction of the architecture decisions:
- self-hosted Authentik instead of Auth0/Clerk;
- self-hosted Directus instead of a SaaS CMS;
- **docker-mailserver (DMS)** stood up to replace Resend for transactional email;
- **in-platform cron** (`@nestjs/schedule` + a DB tick-lock) instead of GitHub Actions cron or external schedulers;
- a single VM instead of managed/multi-host.

When you evaluate any new dependency or service, the first filter is "does this add a recurring bill?" If yes, it almost certainly needs the owner's explicit sign-off. The deferred money/hiring decisions are tracked in [`docs/02-business-processes/business-process-gaps.md`](../02-business-processes/business-process-gaps.md).

### 1.4 North-star metrics (what "good" means)
From [`docs/01-business/community-platform-roadmap.md`](../01-business/community-platform-roadmap.md) §1. The headline ones:
- **Operator hours per event** ≤ 4h (was ~20h on Event 1) — *with a hard quality floor: CSAT must stay ≥ 4.3.*
- **% events fully automated end-to-end** ≥ 95% (CSAT floor still applies).
- **Median days between a member's 1st and 2nd event** ≤ 35.
- **Time to provision a new country** < 10 min, **0 engineering touches** post-Sprint 4.
- **% registrations from existing-member referral** ≥ 25% by month 6.

The guiding thesis: **automation is leverage, not a goal.** Some operator-heavy flows are *good* because they build relationship density — so the Interactions dispatcher supports both pure automation and operator-assisted ("platform prepares, operator reviews and sends") modes via a `requires_operator_approval` flag and an approval queue.

---

## 2. Current status snapshot (2026-05-30)

| Area | State | Notes |
|---|---|---|
| **Infrastructure** | ✅ Mature | Single VM + Coolify, hardened iptables/UFW, hourly snapshots to R2, monitoring (Gatus), analytics (Plausible). |
| **Identity (Authentik)** | ✅ Live | OIDC IdP, custom logout/SLO flow, LDAP outpost, obscurity hardening. **Owned by Viktor — out of scope for feature agents.** |
| **Email (DMS)** | ✅ Live | docker-mailserver, LDAP-backed, full DKIM/SPF/DMARC + PTR/FCrDNS. Replaced Resend for transactional. |
| **CMS / member graph (Directus)** | ✅ Live | Single source of truth for all customer-facing content + the member graph. |
| **API (NestJS)** | ✅ Live | Per-country routing (`<country>.aiqadam.org/api/*`). Rate-limiting shipped in *observe-before-enforce* mode (PR #486). |
| **Web V1 (`apps/web`, Astro)** | ✅ Live, frozen | Customer surface live; grandfathered, no new feature work — being superseded by V2. |
| **Web V2 (`apps/web-next`, Next.js)** | 🚧 In progress | Greenfield 4-layer rebuild ([ADR-0038](../adr/0038-web-4-layer-architecture.md)). Operator cabinets being rebuilt (Members, Cohorts, Announce, Country provisioning). **This is where work stopped.** |
| **Telegram (platform side)** | 🚧 Partial | Outbox + delivery contract in this repo (recent PRs #468, #475, #488). |
| **Telegram bot (consumer)** | ⏸ Separate repo | `viktordrukker/aiqadam-telegram-bot`, aiogram 3. Paused. |
| **Backups / DR** | ✅ Live | Hourly restic snapshots → Cloudflare R2; Backrest UI; restore runbook. |

> **Important doc-drift warning.** `README.md` still says *"Phase 1 (infrastructure foundation complete; product code starting now)"* and lists email as "Resend outbound" and frontend as "Astro 5 only." All three are stale: ~420 PRs shipped since, email migrated to DMS, and a Next.js V2 web is mid-build. The most current state lives in [`docs/01-business/community-platform-roadmap.md`](../01-business/community-platform-roadmap.md) §7 and the architecture docs, **not** the README. Updating the README/tech-stack table is a good first cleanup task (see §15).

---

## 3. Architecture

### 3.1 The architectural floor (will not change)
- **Authentik** = identity (one IdP, one login, OIDC).
- **Directus** = entity store / CMS (the member graph + all customer content).
- **NestJS API** = orchestration.
- **Web** (Astro V1 / Next.js V2) = presentation.

The pillars *compose*; products never replace any of them. Every surface routes the actor to **one identity** and **one consent model** (`member_consents`, per purpose). New surfaces never create a parallel identity store. This is the load-bearing invariant — internalize it before touching anything.

### 3.2 Three-tier platform model — [ADR-0037](../adr/0037-three-tier-architecture.md) (Proposed)
The platform is conceptually split into three tiers:
1. **Engineering** — infra services (Coolify, Authentik, Directus admin, Listmonk) — engineer-only.
2. **Operational** — operator cabinets at `<tenant>.aiqadam.org/workspace`.
3. **Customer-facing** — members at `<tenant>.aiqadam.org/`.

Every new feature is supposed to run through a **layer-triage** step before anything else (see [`docs/05-other/agent-prompts.md`](agent-prompts.md) §"Layer triage"). The web V2 rewrite is the "Phase A rewire" that this ADR gates; a lot of Sprint 4 + later work was deliberately *deferred* behind it.

> ⚠️ **`workspace.aiqadam.org` is DEPRECATED.** It was decommissioned during the three-tier rewire. Operators now land at `<tenant>.aiqadam.org/workspace` (e.g. `uz.aiqadam.org/workspace`); members at `<tenant>.aiqadam.org/`. Some older docs (including the roadmap's §0) still reference the old subdomain — do not link or redirect to it; it returns a 404.

### 3.3 Web V2 — 4-layer architecture — [ADR-0038](../adr/0038-web-4-layer-architecture.md)
`apps/web-next/` is a **locked greenfield build**. `apps/web/` is grandfathered and exempt. The discipline (enforced by `tools/architecture-check.ts`):
- **L1 tokens → L2 atoms → L3 blocks → L4 pages/cabinets.**
- Before writing any V2 code: read the ADR + [`docs/04-development/architecture/blocks.md`](../04-development/architecture/blocks.md), search for an existing block, and either reuse it or open a **block-proposal PR first** (block + Storybook story + catalogue entry).
- New pages/cabinets are **generated** (`pnpm gen:page <slug>` / `pnpm gen:cabinet <slug>`) — hand-written files under `apps/web-next/src/pages/` are rejected by the arch-check because they lack the `@generated-from` marker.

This is unusually strict for a project this young; it exists because the V1 web accreted islands ad-hoc and the rebuild is the chance to make the component system enforce itself.

### 3.4 Tech stack (canonical)
| Layer | Choice |
|---|---|
| Frontend V1 | Astro 5 + React 19 islands + Tailwind 4 + shadcn/ui |
| Frontend V2 | Next.js (`apps/web-next`), 4-layer block system |
| Backend API | NestJS 11 + Drizzle ORM + Zod ([ADR-0013](../adr/0013-orm-drizzle-over-prisma.md)) |
| CMS / graph | Directus 11 |
| Bot | Python 3.12 + aiogram 3 (separate repo) |
| Background jobs | BullMQ on Redis + in-platform `@nestjs/schedule` cron |
| Database | PostgreSQL 16 + pgvector |
| Cache / queues / streams | Redis 7 (also the cross-service ESB) |
| Object storage | MinIO (S3-compatible) |
| Identity | Authentik (OIDC) |
| Web auth | HttpOnly refresh + in-memory access token ([ADR-0016](../adr/0016-web-auth-flow.md)) |
| Lint + format | Biome ([ADR-0014](../adr/0014-lint-format-biome.md)) |
| Orchestration | Coolify v4 ([ADR-0007](../adr/0007-coolify-orchestration.md)) |
| Email | docker-mailserver (DMS), LDAP-backed — *replaced Resend* |
| Off-site backups | restic → Cloudflare R2 ([ADR-0017](../adr/0017-backup-architecture.md)) |
| Monorepo | pnpm workspaces + Turborepo |

### 3.5 Repository layout
```
.claude/         Operating docs — READ FIRST (CLAUDE.md, PROJECT.md, ARCHITECTURE.md,
                 STANDARDS.md, WORKFLOW.md, SECURITY.md, AI_COLLAB.md, GLOSSARY.md)
apps/
  api/           NestJS API (modules per feature)
  web/           V1 web (Astro) — frozen, grandfathered
  web-next/      V2 web (Next.js) — active rebuild, ADR-0038 rules apply
  bot/           Bot workspace (Telegram platform-side glue)
  workers/       Background workers
  e2e/           Playwright smoke specs
  storybook/     Component workshop (V2 blocks)
packages/        shared-types, ui, biome-config, tsconfig
infrastructure/  directus, dms, backrest, restic, gatus, observability,
                 plausible, postgres, scripts, web-next
docs/
  adr/           Architecture Decision Records (0001–0038)
  runbooks/      Operational procedures (the most valuable ops knowledge)
  architecture/  blocks, parity matrix, migration plan, wiring map, V1 feature surface
  policies/, operator-playbook/, integrations/, plans/
tools/gen/       Page/cabinet generators
```

### 3.6 Multi-tenancy & data ownership
- Tenants are **countries**: `uz`, `kz`, `tj`, plus `xx` (a global/neutral tenant). New countries are meant to be self-serve provisionable (the country-provisioning cabinet, web-next M2.5, was the last thing being built).
- Postgres hosts **four databases**: `platform`, `directus`, `authentik`, `listmonk`. `platform` carries `pgvector`.
- The API is routed **per-country** with `PathPrefix(/api)` — i.e. `uz.aiqadam.org/api/*`, `kz.aiqadam.org/api/*`. **`api.aiqadam.org` does not exist and returns 503 by design** — do not mistake that 503 for an outage (this cost a 30-minute phantom-outage chase once).

---

## 4. Infrastructure & operations

Everything below is documented in depth under [`docs/runbooks/`](../04-development/infrastructure/runbooks/). Highlights and the non-obvious bits:

- **Host:** single Hyperapp Cloud VM, Frankfurt. SSH alias `aiqadam-prod` (`aiqadam-admin@212.20.151.29`). *Do not* use any `hetzner-cx13` host config — that is a different project.
- **Coolify v4** orchestrates every stack. Admin at `coolify.aiqadam.org`. **Critical operational landmine:** Coolify stores Traefik labels as base64 `custom_labels` in its DB, and there is **no API endpoint that re-runs the label generator**. Any FQDN/label change must be done **in the Coolify web UI → Save → Deploy** — a direct API `PATCH` on `custom_labels` *replaces* (not merges) and wipes routing. This caused a 40-minute prod outage once. During any Traefik recovery, **freeze all Coolify writes.**
- **Deploys:** a webhook returning HTTP 200 ≠ a build started. Deploys can stick in `queued`/`in_progress`; reach for `force=true` when prod SHA lags `main` by 30+ min after a "successful" webhook.
- **Coolify source:** use an **SSH deploy key**, not the GitHub-App source — the App token silently revokes and breaks every deploy with "Repository not found."
- **Migrations:** run from the API's `main.ts` bootstrap, **not** from Coolify `pre_deployment_command` (that runs on the *old* container, which can't see new migrations and, if it crashloops, blocks all future deploys).
- **Backups / DR:** hourly restic snapshots (Coolify + Directus + Authentik + platform DB) → Cloudflare R2; Backrest UI at `ops.aiqadam.org` (super-admin only via Authentik forward-auth). **First move for any "I broke prod" scenario** → [`docs/04-development/infrastructure/runbooks/snapshot-restore.md`](../04-development/infrastructure/runbooks/snapshot-restore.md).
- **Identity (Authentik):** custom invalidation/SLO flow (works around upstream Authentik bugs where `post_logout_redirect_uri` is ignored), an LDAP outpost backing DMS-mail identity, and obscurity hardening (members see `login.aiqadam.org`, not `auth.aiqadam.org`). **Authentik IdP config and identity CRUD are the owner's scope, not a feature agent's** — enforce rules in platform code (e.g. the plus-addressing ban in `apps/.../lib/email-schema.ts`) and surface the SSO part for the owner to action.
- **Email (DMS):** fully live, LDAP-backed (`cn=mail-svc` bind), webmail at `webmail.aiqadam.org`, DKIM/SPF/DMARC pass inbound+outbound, PTR + FCrDNS confirmed. There's a `infrastructure/dms/smoke.sh` smoke test (open item: wire it into Gatus). The Postfix LDAP configs must filter on `mailboxEmail`, not the recovery `mail` attribute — getting this wrong caused silent bounces.
- **Cron:** no external schedulers. Recurring in-platform work uses `@Cron(...)` + `TickLockService.withLock(name, ttlSec, fn)` for multi-replica safety. Runbook: [`docs/04-development/infrastructure/runbooks/internal-cron.md`](../04-development/infrastructure/runbooks/internal-cron.md).

---

## 5. Implementation highlights (what actually shipped)

The platform is built as **vertical features**, one PR each. The substantial subsystems live, as of pause:

- **Identity & consent:** Authentik OIDC + Directus members + per-purpose `member_consents` + `partner_audiences` entitlement chain. Registration-time EULA + consent prompt. `/me/preferences` consent UI.
- **Member graph (F-S3.0):** rich profiles, skills, employments, interests, connections, cohorts. Member profile, referrals, badges, gamification.
- **Events engine:** plan → publish → register → check-in → CSAT → follow-up, with per-event audience + status taxonomy; `event_outcomes` + `event_followups` rollups. Pre-event reminders, member-matches, CSAT, publication broadcast, speaker pipeline — each with its own runbook under [`docs/runbooks/`](../04-development/infrastructure/runbooks/).
- **Interactions dispatcher:** multi-channel messaging gated by per-purpose consent + audience cohorts; `EmailAdapter` live; Telegram/push adapters planned. Two modes (pure vs operator-assisted) with an approval queue.
- **Operator cabinets:** approvals queue, cohort builder, announce composer, event control, email send-as, country-lead activation. These are being **rebuilt in web-next** (Members list + saved cohorts, Announce composer, Country provisioning wizard were the latest).
- **Telegram (platform side):** outbox pattern with a stable `delivery_key` and a documented [delivery contract](../04-development/architecture/telegram-outbox-delivery-contract.md). The bot is **acquisition-first**: `/register` must work *without* `/link` first — the bot creates community members using Telegram as an IdP. (Framing it as "link-first" has been rejected repeatedly — it's friction.)
- **Cross-service messaging (ADR-0034, Proposed):** Redis Streams with versioned envelopes + the outbox pattern, *not* point-to-point HTTP. Applies to any new cross-service channel.

---

## 6. Hiccups, gotchas & hard-won lessons

This is the section that saves the next developer the most time. These are *real* incidents and the rules that came out of them. Most are also encoded in the project's operating memory.

### 6.1 Process & shipping
- **"Done" = visible in prod, not "PR open."** The full chain is: merge → Coolify auto-deploy → run prod schema bootstrap if any → seed/populate data → probe the live URL yourself. Reporting "shipped" while the live URL still shows the old thing is the single most-corrected mistake.
- **Reproduce old bugs before fixing them.** At 20–30 PRs/day + infra deploys, a bug filed N days ago is often *already fixed* by an unrelated change. Hit the failing endpoint against current prod first; the right output is frequently a regression-guard smoke test + close-with-evidence, not a new fix.
- **Vertical features, not horizontal slabs.** One agent owns one full feature in one PR. The earlier "7 horizontal stream owners" model serialized everyone on cross-layer waits and produced a Potemkin `/press` page (three agents each shipped "their slab," nobody owned the feature). Closed via PR #90.
- **Worktree per agent.** Every feature PR is built in `/home/drukker/wt/<feature-id>`; never edit the main checkout mid-feature. Born from a multi-agent shared-tree collision.
- **Check parallel sessions before manual prod ops.** For anything spanning this repo + the bot repo, do a 60-second `gh api commits` / `gh pr list` check on the *other* repo first — twice a parallel agent shipped the exact work being done by hand.
- **Try everything yourself before escalating.** Execute via API/SSH/tokens; only surface to the owner for irreversible actions, product trade-offs, or genuine hard-blocks. He's the COO/PM, not the sysadmin.

### 6.2 CI / merge / deploy
- **Auto-merge is unavailable** (GitHub free tier, private repo). Use plain `gh pr merge --squash --delete-branch`. Branch protection is informational-only on this tier.
- **"No checks reported" usually means a merge conflict.** When `gh pr checks` shows an empty `statusCheckRollup`, the cause is almost always `mergeStateStatus=DIRTY` — GitHub skips `pull_request` workflows on conflicted PRs. Rebase + force-push; don't chase empty commits or close/reopen.
- **Smoke runs on PR + cron only**, never push-to-main (push raced the Coolify deploy; the web container lags the API by 30–90s and returned plaintext "no available server" to the GHA runner).
- **Astro dynamic routes** (`[slug].astro`) need `export const prerender = false;` (or `getStaticPaths`) — typecheck and Biome miss it; only `pnpm --filter @aiqadam/web build` catches it.
- **Run the web typecheck for React islands.** Touching `apps/web/src/components/**/*.tsx`? Run `pnpm --filter @aiqadam/web typecheck` before pushing — the API typecheck doesn't catch web tsconfig strictness (e.g. TS4111 on `Record<string, unknown>` index access).
- **Nest module cycles need `forwardRef`.** Adding `AuthModule` to a module already reachable via the `AuthModule→LeadsModule→InteractionsModule` chain creates an unresolvable cycle; guard with a `Test.createTestingModule` compile (service-level tests miss it).
- **SSR uses the internal Directus URL** (`http://directus:8055`), not the public `cms.aiqadam.org` — ~7× TTFB win. Requires the Directus app to have `custom_network_aliases: "directus"` and a redeploy *before* setting `CMS_URL`.
- **web-next SSR proxy:** it must be same-origin `/api` and must **strip `Content-Encoding`** (undici auto-decompresses) — both bit the sign-in flow (PRs #479, #480, #483).

### 6.3 Architecture rules people keep wanting to break
- **No auth islands** ([ADR-0032](../adr/0032-operator-tools-must-sso-or-embed.md)): every operator tool SSOs via Authentik *or* embeds in the workspace. "Easiest to ship" without checking the auth model is forbidden.
- **Directus is the single source of truth for content.** No shadow Postgres tables in the Nest API for customer-facing fields. Workspace cabinets *wrap* Directus; they don't duplicate it.
- **Directus FKs use the bridge UUID.** Any Directus column FK'd to `directus_users.id` must be set via `DirectusUsersBridgeService.resolveDirectusId(req.user.sub)`. The local `users.id` and `users.directusUserId` are different UUIDs; passing the wrong one silently 500s.
- **No plus-addressed emails** at account creation (a `+`-account once created a phantom `/me`). Enforced in `lib/email-schema.ts`. Don't reintroduce `+` via direct Authentik API writes — the API gate doesn't cover the SSO path.

### 6.4 The meta-rule
**Always write the lessons down.** Every non-obvious lesson is persisted to the operating memory *and* the relevant repo doc/runbook before a session closes. Verbal acknowledgement is not enough — this handover exists because of that rule.

---

## 7. Security posture & outstanding hardening

The baseline (parameterized queries, input validation at boundaries, no secrets in logs/commits, output encoding, auth at controller level) is defined in [`docs/04-development/security/security.md`](../04-development/security/security.md) and largely honored.

A verified 11-dimension industrial-standards audit was run on 2026-05-29 → `docs/platform-hardening-assessment-2026-05-29.md`. **Top risks (read this before proposing hardening work — several gaps are simply execution of standards already written):**
1. **Edge controls** — rate-limiting was only just shipped in *observe-before-enforce* mode (PR #486); security headers, CSRF, and secret-scanning were thin (gitleaks added in PR #473). Finish the enforce flip + headers/CSRF.
2. **No operator country-scoping** — operators are not yet constrained to their own country's data. This is a real authorization gap.
3. **Dual-web migration double-spend** — V1 + V2 running in parallel is expensive in attention and risk; finishing or formally pausing the migration matters.
4. **ADRs shipping while "Proposed"** — features depend on decisions (ADR-0034, -0037) that were never formally Accepted via the weekly PM review. Reconcile status.

### ⚠️ Secrets pending rotation (do this at customer launch)
Several tokens were minted and pasted into chat transcripts during setup and are **LIVE-but-exposed**, with rotation deliberately deferred to the customer-launch milestone:
- Cloudflare + Resend admin tokens (F-S2.8).
- Dedicated Coolify API token + Plausible Sites token (F-S4.1-d). `PLAUSIBLE_ADMIN_TOKEN` is now unused (Plausible CE has no Sites API) — **delete from Coolify + revoke**.
- R2 keys + restic repo password were exposed via a Coolify `GetConfig` API call (2026-05-24).

There's a planned but **not-yet-built one-command token-rotation tool** (design at [`docs/04-development/infrastructure/token-rotation-tool-design.md`](../04-development/infrastructure/token-rotation-tool-design.md)). The rotation checklist lives in [`docs/04-development/security/runbooks/secret-rotation-pending.md`](../04-development/security/runbooks/secret-rotation-pending.md). **Rotating these is a launch-blocker.**

---

## 8. Deferred capabilities (the explicit "NO"s)

So the next developer doesn't re-derive decisions already made. Full reasoning in the operating memory and [`docs/02-business-processes/business-process-gaps.md`](../02-business-processes/business-process-gaps.md):
- **Newsletter / Listmonk cadence** — deferred to "Phase ζ." Trigger to resume: ≥4 events/month across all countries, or ≥1 monthly-digest's worth of content. Until then, transactional email via DMS is enough.
- **Paid marketing spend** (G-2), **paid RU editor** (G-3), **country-lead compensation** (G-1) — all deferred under the zero-recurring-spend filter.
- **Twenty CRM** — dropped in favor of the Directus member graph ([ADR-0033](../adr/0033-community-member-graph.md)). AI Qadam is a community graph, not a CRM.
- **Second host / managed services** — no budget; single VM until the community justifies it.
- **Native mobile app** — responsive web + Telegram bot cover phone use; revisit only on a clear organizer-on-phone signal.

---

## 9. Future roadmap (what was planned next)

Authoritative sources: [`docs/01-business/community-platform-roadmap.md`](../01-business/community-platform-roadmap.md) (next-12-weeks tactical, §7 feature list), [`docs/01-business/product-plan.md`](../01-business/product-plan.md) (18-month strategic), [`docs/03-requirements/sprint-5-to-8-plan.md`](../03-requirements/sprint-5-to-8-plan.md), and [`docs/05-other/agent-prompts.md`](agent-prompts.md) (vertical-feature backlog + kickoff prompts). In rough priority order had work continued:

1. **Finish the web V2 rewrite** (`apps/web-next`) — port the remaining V1 surface. The complete V1 feature surface + a 149-item MUST-COVER checklist is in [`docs/03-requirements/web-v1-feature-surface.md`](../03-requirements/web-v1-feature-surface.md). Note: customer-surface work shipped on V1 between 2026-05-26→29 (CMS singletons, badges, `/me` uplift, plus-ban) is **not yet in V2** — hand that doc to whoever continues V2.
2. **Operator cabinets in V2** — Members/Cohorts/Announce shipped; Country provisioning was last (M2.5). Then event control, partner cabinet, `/me/profile` consent ladder.
3. **Operator country-scoping** (security gap #2 above).
4. **Finish edge hardening** — flip rate-limiting to enforce, add security headers + CSRF.
5. **Telegram channel + bot v0** — the channel (broadcast) is cheap and high-leverage for distribution; bot v0 is account-link + member commands. Both gated on a ~5-min BotFather/owner step.
6. **Sprint 4 / Phase ζ** features (hackathons, talent feeds, edtech, paid tier) — deliberately deferred behind the three-tier rewire ([ADR-0037](../adr/0037-three-tier-architecture.md)).

The active worklist at pause was effectively: **bug fixes + human exit-gates + the V2 rewire itself.** New feature ambition was intentionally frozen behind that rewire.

---

## 10. Outstanding debt & known issues

| Item | Where | Action |
|---|---|---|
| Secrets pending rotation | §7 + [secret-rotation-pending.md](../04-development/security/runbooks/secret-rotation-pending.md) | Rotate at launch (blocker). |
| Token-rotation tool not built | [token-rotation-tool-design.md](../04-development/infrastructure/token-rotation-tool-design.md) | Build before the next major rotation pass. |
| Event-detail operator-UI debt | operating memory | 6 customer fields shipped (U1–U10a) with no `/workspace` input — operators stuck in Directus admin. Bundle into one cabinet PR before shipping more customer-tier event fields. |
| V1→V2 parity incomplete | [web-v1-feature-surface.md](../03-requirements/web-v1-feature-surface.md) | 149-item checklist; V1 work from 2026-05-26→29 not yet in V2. |
| README / tech-stack drift | `README.md` | Update status, email (DMS not Resend), V2 web. |
| ADRs stuck "Proposed" | [docs/adr/](../adr) | Run them through PM review; reconcile -0034/-0037 status. |
| DMS smoke not in Gatus | [infrastructure/dms/smoke.sh](../../infrastructure/dms/smoke.sh) | Wire into monitoring. |
| Operator country-scoping | hardening assessment | Implement authorization scoping. |

---

## 11. How to work in this repo (the rules that gate every PR)

These come from [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) and [`docs/04-development/workflow.md`](../04-development/workflow.md). Non-negotiable:
- **Never commit to `main`.** Feature branch → PR → squash-merge → delete branch.
- **Small PRs:** ≤400 lines changed, ≤5 code files, one logical change. Split if bigger. (Docs-only changes like this handover are the natural exception — a single document can't be usefully split.)
- **TypeScript `strict`**, `noUncheckedIndexedAccess`, **no `any`**, no `as` without a reason comment, no `@ts-ignore` (use `@ts-expect-error` + reason as a last resort).
- **Zero warnings** — ESLint/Biome warnings are CI errors; `it.skip` is forbidden.
- **The Ten Non-Negotiables** (NASA-Power-of-Ten-inspired): simple control flow (≤3 nesting), bounded loops, no magic numbers/strings, functions ≤60 lines, ≥1 assertion per function, smallest scope, all return values checked, no dynamic imports/eval/string-SQL, flat data, zero warnings.
- **Plan before non-trivial work:** state the task, list files, name risks, get confirmation — even a 3-line plan, even when told "just do it."
- **Tests are part of the PR:** unit per public fn, integration per endpoint, E2E per user flow (Playwright); use **Testcontainers** for Postgres/Redis — never mock the DB.
- **Conventional Commits**; PR description follows the What/Why/How/Risks/Testing template.

---

## 12. First-week checklist for the next developer

1. Read, in order: [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) → [`PROJECT.md`](../01-business/project.md) → [`ARCHITECTURE.md`](../04-development/architecture/architecture.md) → [`STANDARDS.md`](../04-development/standards.md) → [`WORKFLOW.md`](../04-development/workflow.md) → [`SECURITY.md`](../04-development/security/security.md) → [`AI_COLLAB.md`](ai-collab.md) → [`GLOSSARY.md`](../01-business/glossary.md).
2. Then this doc → [`docs/01-business/product-plan.md`](../01-business/product-plan.md) → [`docs/01-business/community-platform-roadmap.md`](../01-business/community-platform-roadmap.md) §7 → [`docs/05-other/agent-prompts.md`](agent-prompts.md).
3. Skim the **runbooks** index ([`docs/04-development/infrastructure/runbooks/README.md`](../04-development/infrastructure/runbooks/README.md)) — that's where the operational truth lives.
4. Get SSH to prod working (`aiqadam-prod`) and open Coolify (`coolify.aiqadam.org`). Read the snapshot/restore runbook *before* you need it.
5. Stand up local dev (`infrastructure/docker-compose.yml` → `pnpm dev`). Confirm you can sign in via Authentik.
6. Make a trivial docs-only PR end-to-end (branch → PR → squash-merge) to prove the workflow + CI before touching code.
7. Before any prod claim: probe the live URL. "Done" = visible in prod.

---

## 13. The two things being stopped

- **The platform** (this repo, `aiqadam`): production stays live and self-healing (Coolify auto-restart, hourly R2 backups, Gatus monitoring). No new feature work. The web V2 rewrite is paused mid-stream — `apps/web-next` is functional but not yet at V1 parity; `apps/web` (V1) remains the customer surface.
- **The Telegram bot** (separate repo `viktordrukker/aiqadam-telegram-bot`, aiogram 3): paused. The platform-side outbox/delivery contract in this repo is complete and idle (no consumer pulling unless the bot runs).

Nothing needs to be torn down to pause: both are designed to sit idle safely. The one time-sensitive obligation that survives the pause is the **secrets rotation at launch** (§7) — and the launch milestone is exactly what would un-pause the project.

---

## 14. Risk register (if the project sits paused)

| Risk | Likelihood | Mitigation already in place |
|---|---|---|
| Exposed tokens abused before rotation | Low–Med | Tokens are scoped; rotate at launch; monitor Cloudflare/Coolify usage. |
| Cert expiry on subdomains | Low | Traefik DNS-01 via Cloudflare API token auto-renews the wildcard. |
| Single-VM failure | Low | Hourly restic → R2; documented restore. No HA, by design (cost). |
| Authentik/Coolify upgrade drift | Low | Versions pinned; Coolify YAML drift resolved 2026-05-24. |
| Knowledge loss | Med | This doc + runbooks + ADRs + operating memory. |

---

## 15. Suggested immediate cleanups (low-risk, high-clarity)

For whoever resumes — small PRs that pay down the most confusing drift first:
1. Update `README.md` status line + tech-stack table (email→DMS, add V2 web, drop "product code starting now").
2. Reconcile ADR statuses (move accepted-in-practice ADRs out of "Proposed").
3. Remove/redirect any lingering `workspace.aiqadam.org` references.
4. Wire `infrastructure/dms/smoke.sh` into Gatus.

---

## 16. Document index (where the real detail lives)

**Operating docs** — [`.claude/`](../../.claude): `CLAUDE.md`, `PROJECT.md`, `ARCHITECTURE.md`, `STANDARDS.md`, `WORKFLOW.md`, `SECURITY.md`, `AI_COLLAB.md`, `GLOSSARY.md`.

**Strategy & planning** — [`docs/01-business/product-plan.md`](../01-business/product-plan.md), [`docs/01-business/community-platform-roadmap.md`](../01-business/community-platform-roadmap.md), [`docs/03-requirements/sprint-5-to-8-plan.md`](../03-requirements/sprint-5-to-8-plan.md), [`docs/05-other/agent-prompts.md`](agent-prompts.md), [`docs/02-business-processes/marketing-and-pr-playbook.md`](../02-business-processes/marketing-and-pr-playbook.md), [`docs/04-development/design-system/ux-and-content-guidelines.md`](../04-development/design-system/ux-and-content-guidelines.md), [`docs/02-business-processes/business-process-gaps.md`](../02-business-processes/business-process-gaps.md).

**Architecture** — [`docs/adr/`](../adr) (0001–0038; start at 0002, 0013, 0016, 0032, 0033, 0034, 0037, 0038), [`docs/architecture/`](../04-development/architecture/) (blocks, parity-matrix, web-migration-plan, web-next-kickoff, web-v1-feature-surface, wiring-map, telegram-outbox-delivery-contract), [`docs/04-development/architecture/auth-architecture.md`](../04-development/architecture/auth-architecture.md), [`docs/04-development/architecture/interaction-architecture.md`](../04-development/architecture/interaction-architecture.md).

**Operations** — [`docs/runbooks/`](../04-development/infrastructure/runbooks/) (snapshot-restore, break-glass, coolify-bootstrap, restic-backups, internal-cron, observability, security, secret-rotation-pending, and one per event/member/operator flow).

**Security** — `docs/platform-hardening-assessment-2026-05-29.md`, [`docs/04-development/security/security.md`](../04-development/security/security.md), [`docs/policies/`](../01-business/policies/).

---

*End of handover. The codebase is broad and moves fast, but it is unusually well-documented — when in doubt, the runbook or ADR almost certainly already covers it. Verify against prod before trusting any single statement, including this one.*
