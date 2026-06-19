# ADR-0031: Single-origin role-routed cabinets, not separate-subdomain SSO maze

## Status
Accepted, 2026-05-21

> Set by Viktor in conversation on 2026-05-21 after the F-S3.0 / ADR-0033 work confirmed that all operator workflows would live in `/workspace/<concern>` cabinets rather than per-cabinet subdomains. This ADR codifies the routing pattern that was already implemented during the [ADR-0032 acceleration on 2026-05-20](./0032-operator-tools-must-sso-or-embed.md) (PR #125 workspace shell + PR #128 app launcher) and locks it in for the five Sprint-3 cabinets (F-S3.2 → F-S3.6) and every future cabinet that lands on the member graph.

## Context

### The choice

When ADR-0032 mandated that operator-facing tools must either SSO via Authentik or embed in the workspace, two routing patterns were possible:

**Option A — Separate subdomain per cabinet:**
- `members.aiqadam.org` (member directory)
- `announce.aiqadam.org` (announcement composer)
- `events.aiqadam.org` (event control panel)
- `partners.aiqadam.org` (sponsor view)
- …each its own Coolify app, its own Authentik OIDC client, its own Astro deploy.

**Option B — Single origin, role-routed:**
- `workspace.aiqadam.org/members`
- `workspace.aiqadam.org/announce`
- `workspace.aiqadam.org/events/[id]`
- `workspace.aiqadam.org/partners/[id]`
- …all on one Astro app, one Authentik OIDC client (the existing `aiqadam-platform-provider` pk=1), one shared cookie/session, one RBAC layer.

(Today the cabinets live under `aiqadam.org/workspace/*` until the `workspace.aiqadam.org` subdomain is registered in Coolify; the routing model is identical.)

### Why this matters now

[ADR-0033](./0033-community-member-graph.md) Part 3 commits to **five operator cabinets** in Sprint 3 (F-S3.2 → F-S3.6) and an open-ended series of cabinets in Phase ζ (hackathons, HRtech, edtech, paid premium, mentorship). Cabinet count grows over time. The routing pattern picked now is the one we live with for years; getting it wrong means re-platforming when we have 12 cabinets and an active country-lead team in two countries.

### Why separate subdomains lose

Each new subdomain adds:

- **Authentik OIDC client config** (provider + application + group claims). ADR-0032 already named "auth island" as the failure mode; a per-cabinet OIDC client is the auth-island problem at a smaller scale — each cabinet's session can drift, each redirect URI is a separate registration to maintain.
- **Coolify deploy** (separate app, separate FQDN, separate Traefik routing).
- **Cookie scope friction**. Shared `aiqadam.org` SameSite=Lax cookies work for `*.aiqadam.org` subdomains today, but adding a cabinet at `<x>.aiqadam.org` still requires explicit Cookie Domain handling in our auth code; getting that wrong breaks SSO silently on one cabinet while the others work.
- **DNS + cert overhead** at country provisioning time. Sprint 4's country-onboarding state machine ([roadmap §4.1](../01-business/community-platform-roadmap.md)) already touches Authentik + Directus + Plausible + Coolify FQDN per country. Adding "N more cabinet subdomains" multiplies that.
- **Search / sitemap fragmentation.** Operators bookmark per-cabinet URLs and forget the rest exists.
- **Telemetry split.** Plausible site per subdomain means cross-cabinet funnel analysis becomes a join across sites.

### Why single-origin wins

Single-origin `/workspace/<concern>` was the pattern PR #125 picked on 2026-05-20 (the workspace shell that ADR-0032 mandated). It's the same pattern Reforge, Linear, Vercel, Notion, and every other modern operator-tool product converged on. Concretely it gives us:

- **One Authentik OIDC client.** The `aiqadam-platform-provider` (pk=1, client_id in `OIDC_CLIENT_ID` per [reference-secrets-cache](../../.claude/projects/-home-drukker-aiqadam/memory/reference_secrets_cache.md)) authenticates every cabinet. RBAC differentiates *what* the operator can see, not *whether* they can log in.
- **One session cookie.** [auth-architecture.md](../04-development/architecture/auth-architecture.md) already documents the JWT-in-HttpOnly-cookie model; every cabinet reads the same cookie, no per-cabinet refresh-token dance.
- **One RBAC layer.** ADR-0021 (Proposed) names the role manifest; the F-S2.2 RBAC sync service applies it once for all cabinets. New cabinet = new permission row, not a new auth setup.
- **One Coolify deploy.** New cabinet = new file under `apps/web/src/pages/workspace/`. No infra PR.
- **Per-cabinet entitlement reads through the SAME data layer.** Per [ADR-0033](./0033-community-member-graph.md) sponsor PII boundary, the sponsor cabinet (F-S3.5) reads through `partner_audiences` × cohorts; the same Directus permission policy applies whether the cabinet renders at `/workspace/partners/[id]` or anywhere else.
- **One Plausible site, one funnel.** Cross-cabinet operator workflows (e.g., "country lead created a cohort → composed an announcement → sent to 380 members") render as one funnel without joins.
- **Cookie / CSRF model already proven** in PRs #125 + #128 + #129 — `/workspace/*` works today with our auth flow.

### Why this is NOT just "we already built it that way"

The architectural alternative (separate subdomains) is genuinely tempting because:

- It's how a lot of B2B SaaS dashboards are presented to end customers (sometimes `*.example.com/<tenant>`).
- A future "white-label per country" UX feels like it argues for `kz.workspace.aiqadam.org`.
- Per-cabinet ownership feels easier to grant ("you own announce.aiqadam.org").

Each of those is real. The counter-argument:

- White-label-per-country is already solved by tenant-aware routing (`country` in URL or subdomain prefix routing to the same Astro app). That's an orthogonal axis from cabinet routing.
- Per-cabinet ownership becomes folder-ownership inside the Astro app (`apps/web/src/pages/workspace/announce/` is the announce team's). That's GitHub `CODEOWNERS`, not a separate deploy.
- Customer dashboards multiply because each customer is a separate auth namespace; operators are NOT separate auth namespaces — they're one team with different role chips.

## Decision

**All operator cabinets land as routes under a single origin — today `aiqadam.org/workspace/<concern>`, to be moved to `workspace.aiqadam.org/<concern>` when that subdomain is provisioned in Coolify (Sprint 2.x). Routing model identical either way.**

### What this means concretely

- **One Astro app** hosts every cabinet. `apps/web/src/pages/workspace/<concern>/index.astro` (+ optional `[id].astro` for per-record cabinets like events / partners).
- **One Authentik OIDC client** (`aiqadam-platform-provider`, pk=1). New cabinet = no new OIDC config.
- **One session cookie + JWT verification middleware** per [auth-architecture.md](../04-development/architecture/auth-architecture.md). Every cabinet sees `req.user`; RBAC checks `user.roles + user.country` against the per-cabinet entitlement.
- **One Plausible site** (`aiqadam.org`). Cabinets emit events with a `cabinet:<id>` prop so funnel analysis works without cross-site joins.
- **One Astro middleware** at `apps/web/src/middleware/workspace-auth.ts` (already shipped in PR #125 as the placeholder; F-S2.2 wires real RBAC).
- **Per-cabinet entitlement happens at the data layer**, not the route layer. The sponsor cabinet (F-S3.5) doesn't render a different *route* per sponsor — it renders the same route with a `partner_audiences`-filtered view per the signed-in user's sponsor binding.

### What does NOT belong in the cabinet

- **Member-facing pages.** `/me/profile` (F-S3.6) is technically inside the workspace shell for layout but is conceptually the member's own surface, with member-only permissions. Public pages (`/events`, `/leaderboard`, `/press`) stay on the marketing tree.
- **Engineer admin tools.** Coolify, Authentik admin, Directus admin — these stay at their own subdomains, accessed via the launcher card with an `engineer` chip per ADR-0032 §Exceptions.
- **Read-only marketing surfaces** stay outside `/workspace/*`. The country home, leaderboard, sponsor public profiles ([roadmap §7 ζ.4](../01-business/community-platform-roadmap.md)) live at the country root.

### Naming convention

Concern slugs are nouns, lowercase, hyphenated:

- `/workspace/members` — member directory + cohort builder (F-S3.2)
- `/workspace/announce` — announcement composer (F-S3.3)
- `/workspace/events/[id]` — event control panel (F-S3.4)
- `/workspace/partners/[id]` — partner/sponsor view (F-S3.5)
- `/workspace/approvals` — operator approval queue (F-S3.7)
- `/workspace/observability` — Gatus + Loki (F-S0.4 / ADR-0032)
- `/workspace/analytics` — Plausible embed
- `/workspace/cms` — Directus iframe for content editors

Per-record cabinets use `[id]` (Astro dynamic route). Cohort-aware cabinets read the user's role + country to scope the underlying query — there is no separate `/workspace/kz/events/[id]` route.

## Consequences

### Positive

- **Zero per-cabinet auth config.** Country provisioning (Sprint 4.1) doesn't need an "and now register OIDC redirect URIs for the N cabinets" step.
- **One place to grep.** `apps/web/src/pages/workspace/` is the directory tree future agents read to understand the operator surface.
- **Cross-cabinet workflows are trivial.** Operator clicks "send announcement" from a cohort card on `/workspace/members` → flows to `/workspace/announce?cohort=<id>` with the cohort pre-loaded. No cross-origin redirect, no cookie repropagation.
- **Phase-ζ products land cheaply.** Hackathon cabinet = `apps/web/src/pages/workspace/hackathons/[id].astro` + a few API endpoints. No new deploy, no new auth, no new DNS.
- **RBAC stays one layer.** F-S2.2 RBAC sync service applies `country_lead_*`, `sponsor_rep_*`, `board_*` groups → permission policies; the cabinet middleware reads those once and decides per request.

### Negative

- **A single Astro deploy is the blast radius for every cabinet.** A bad web deploy takes down all cabinets at once. Mitigated by: same blast radius the marketing site has today; Astro builds are fast (<1 min) so rollback is cheap; Lane-2 smoke catalog catches regressions.
- **One cookie scope.** A vulnerability in any cabinet potentially exposes the shared session. Mitigated by: server-side rendering keeps tokens off the client; every cabinet goes through the same middleware; OWASP-shaped review checklist enforced per cabinet PR.
- **Operator URL gets nested** (`aiqadam.org/workspace/partners/<uuid>` is longer than `partners.aiqadam.org/<uuid>`). Mitigated by: workspace launcher gives cards a 1-click target; operators bookmark `/workspace` and navigate via sidebar.

### Neutral

- Future `workspace.aiqadam.org` subdomain move is a DNS + Astro base-URL flip; no routing model change.
- Future white-label-per-country can be layered on top (e.g., `kz.workspace.aiqadam.org` proxies to same Astro app with `tenant=kz` context).

## What this ADR does NOT do

- It does NOT decide whether cabinets ship as Astro pages with React islands vs. a separate SPA shell. The current pattern (Astro page + React island) is documented in [ADR-0033](./0033-community-member-graph.md) Part 3 ("same stack as `/workspace` today (Astro + React island + Tailwind via design tokens + NestJS API endpoints proxying Directus with our auth)"). Changing that stack is a different ADR.
- It does NOT change how engineer-only tools (Coolify, Authentik admin, Directus admin) are accessed. Those stay engineer-only at their own subdomains per ADR-0032 §Exceptions.
- It does NOT lock the URL of the operator landing surface to `aiqadam.org/workspace/*` forever — the move to `workspace.aiqadam.org` is a DNS + base-URL change with no routing-model impact.

## References

- [ADR-0032 — Operator tools must SSO via Authentik or embed in workspace](./0032-operator-tools-must-sso-or-embed.md) — the policy this ADR implements at the routing layer
- [ADR-0033 — Community member graph on Directus](./0033-community-member-graph.md) — the data layer cabinets read; Part 3 names the cabinet sequence
- [ADR-0021 — RBAC manifest](./0021-rbac-manifest.md) (Proposed) — the role manifest cabinet middleware reads
- [`docs/04-development/architecture/auth-architecture.md`](../04-development/architecture/auth-architecture.md) — the cookie + JWT model every cabinet shares
- [`docs/01-business/community-platform-roadmap.md` §7 Sprint 3](../01-business/community-platform-roadmap.md) — the cabinet sequence
- PR #125 — workspace shell at `/workspace/*` (the implementation this ADR documents)
- PR #128 — minimal app launcher
- PR #129 — workspace auto-redirect + Directus card deep-link into OIDC
