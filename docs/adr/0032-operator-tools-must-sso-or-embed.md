# ADR-0032: Operator-facing tools must SSO via Authentik or embed in workspace

## Status
Accepted, 2026-05-20

> Set by Viktor in conversation on 2026-05-20 after the S0.4 Uptime Kuma deploy
> surfaced the auth-island problem. Authoritative going forward — no PR adds an
> operator-facing tool that violates this rule without an explicit exception in
> the PR description.

## Context

Today the platform runs several engines, each historically picked tool-first and auth-later:

| Tool | What it does | Operator-facing? | Auth today | Notes |
|---|---|---|---|---|
| Authentik | OIDC IdP | engineer | self (source of truth) | ✅ canonical |
| Coolify | platform host UI | engineer | OIDC (GitHub OAuth) | ✅ engineer-only, auth island acceptable |
| Directus admin | CMS admin UI | engineer + content editor | OIDC via Authentik | ✅ in spec |
| Twenty CRM | sales pipeline | sponsor pipeline, eventually country leads | local username/password | 🔴 OIDC is Enterprise-gated (see [PR #73](https://github.com/viktordrukker/aiqadam/pull/73)) |
| Plausible | web analytics | engineer + future operator | local (locked-down post-bootstrap) | 🟡 OIDC plugin exists but not configured |
| **Uptime Kuma** | uptime probes | operator | **local username/password** | 🔴 **OIDC will never be supported** ([upstream issue](https://github.com/louislam/uptime-kuma/issues/2434)) |
| Listmonk (future) | newsletter + transactional templates | operator | local | 🟡 OIDC plugin exists |
| Discourse (Phase ζ) | community forum | member-facing + operator-moderation | OIDC via Authentik (planned) | ✅ in spec |

Pattern: every tool shipped before today's ADR was picked by an agent or an engineer on "what's easiest to deploy" criteria. None of them speak Authentik out of the box without configuration; many can't speak OIDC at all. The result is **a growing number of auth islands** — each one a separate username/password for an operator to remember, a separate admin page to bookmark, a separate place to forget about when a country lead leaves.

The [authentik-should-be-wrapped memory](../../.claude/projects/-home-drukker-aiqadam/memory/feedback_authentik_should_be_wrapped.md) already names the principle: operators never visit a separate admin site. This ADR formalises it as a hard rule and lays out the remediation for the tools already shipped.

The trigger was [S0.4 observability deploy](https://github.com/viktordrukker/aiqadam/pull/112): Uptime Kuma went live at `https://status.aiqadam.org` with a public first-boot signup. Viktor immediately asked "why this and not something with SSO?". Correct question; this ADR is the answer.

## Decision

### Rule

**Every operator-facing tool added to the platform must satisfy one of:**

1. **SSO via Authentik (OIDC).** The tool authenticates against Authentik. Operator logs in once to `workspace.aiqadam.org` and the tool's UI is reachable without a second prompt. Acceptable for tools whose UI we genuinely need operators to see directly (Directus admin for editors, Coolify for engineers).

2. **Embedded in the workspace.** The tool's data is fetched server-side or iframe-embedded inside `workspace.aiqadam.org`, gated by our own RBAC (per [ADR-0021](./0021-rbac-manifest.md)). The tool itself may have any auth model — operators never touch it.

**A tool that satisfies neither is a policy violation.** It MUST be replaced or wrapped before it lands in production.

### Exceptions

- **Engineer-only tools** (Coolify admin, Authentik admin, Directus admin for engineers, Plausible admin) are exempt — engineers are expected to carry credentials. These tools' URLs are not bookmarked or shared with operators.
- **Bootstrap moments** are exempt for the duration of the bootstrap step only. A tool that requires a first-time admin-account creation may be hit directly to claim that account; after that the credentials live in the team password manager and the tool gets wrapped or replaced per the rule.

### What "the workspace" means

`workspace.aiqadam.org` (or, until that subdomain ships in Coolify, `/workspace/*` on the main site) is the **single landing surface for operators**. It hosts:
- A role-aware dashboard
- An app-launcher with cards to the tools the viewer is authorised for
- Per-domain pages that embed/proxy each tool's data (`/workspace/observability`, `/workspace/analytics`, `/workspace/cms`, `/workspace/crm`, etc.)
- Operator workflows native to our codebase (event approval queue, registration list, check-in scanner, etc.)

Tools that need to display in the workspace must support either an iframe embed (with our cookies / our headers passed through) or a server-side API the workspace can call.

### Tool portfolio under this rule

| Tool | Current state | Action |
|---|---|---|
| **Uptime Kuma** | 🔴 deployed at `status.aiqadam.org`, no OIDC, never will | **Replace with Gatus** — speaks OIDC natively, supports iframe embed, same HTTP/TCP/DNS probes, single Go binary. New compose at `infrastructure/gatus/`. Tear-down Uptime Kuma in the same PR. |
| **Plausible** | 🟡 local auth, locked-down post-bootstrap | **Wrap, not OIDC-plug.** Embed Plausible's `analytics.aiqadam.org` dashboards iframe-style in `/workspace/analytics`. Plausible's stats are read-only-per-operator anyway; the iframe carries our auth cookie via a shared-domain trick, the Plausible login page never shows. Plausible admin URL stays engineer-only. |
| **Twenty CRM** | 🔴 local auth (OIDC is Enterprise) | **Embed in workspace cabinet** per the existing Sprint 3.2 sponsor-cabinet plan. CRM data flows via API (`/v1/sponsors/...`), operators never see Twenty's UI. Twenty's own admin URL stays for engineer config only. Per [PR #73](https://github.com/viktordrukker/aiqadam/pull/73) we already abandoned Twenty OIDC — this ADR confirms the embed path is right. |
| **Listmonk** (future) | not deployed | **Either** install with OIDC plugin (preferred) **or** embed-only like Plausible. Decided in the Listmonk deploy PR per this rule. |
| **Discourse** (Phase ζ) | not deployed | **SSO** via Authentik OIDC (already planned in [roadmap §7 ζ.2](../01-business/community-platform-roadmap.md#section-7-phase-z)). Embed not feasible for forum UX. |
| **Directus admin** | OIDC ✅ | Keep. Engineers + content editors only. |
| **Coolify admin** | OIDC ✅ (GitHub OAuth) | Keep. Engineers only. |
| **Authentik admin** | self ✅ | Keep. Engineers only. |

### Sequencing (what gets done when)

1. **This ADR** (today) — sets the policy.
2. **Workspace shell** (today, F-S2.1) — ships at `/workspace/*` with placeholder RBAC (just "is logged in"; per-role gates land when [ADR-0021](./0021-rbac-manifest.md) is Accepted + S2.2 RBAC sync ships).
3. **Gatus swap** (today, F-S0.4-revisit) — tear down Uptime Kuma, deploy Gatus with Authentik OIDC, claim its first sign-in as our normal flow.
4. **App launcher in workspace** (today, F-S2.3-min) — cards for Gatus, Plausible (iframe page), Directus admin (link, engineer-only visible), Authentik admin (link, engineer-only visible).
5. **Workspace embed pages** (Sprint 2.x) — `/workspace/analytics` (Plausible iframe), `/workspace/observability` (Gatus iframe + Loki query view), `/workspace/cms` (Directus iframe for editors), `/workspace/sponsors` (Twenty-data via API per Sprint 3.2 cabinet).

## Consequences

**Positive:**
- One credential per operator (their Authentik account). No password sprawl.
- One URL to bookmark (`workspace.aiqadam.org`). No tour of admin URLs at onboarding.
- Off-boarding is a single Authentik group remove → revokes everything in minutes (cf. today: forget to remove someone from Uptime Kuma and they keep editing probes).
- Future tools are evaluated against the rule before adoption — no more "ship first, integrate later" auth islands.

**Negative:**
- Workspace shell is on the critical path for every operator-facing capability. If the workspace breaks, every cabinet breaks. Mitigated by keeping the shell shallow and the cabinets independent.
- Some tools we'd otherwise want (anything by Better Stack, etc.) are off-limits because they're SaaS and the OSS-only constraint precludes paid tiers for SCIM/SSO. Acceptable trade.
- Iframe embeds need shared-cookie or token-injection plumbing for each tool. Per-tool plumbing cost. Spread across vertical features that need each embed.

**Neutral:**
- This ADR does not block engineers from using tools' native UIs (Coolify, Authentik, Directus admin). It blocks **operators** from being routed there.
- The "embed-in-workspace" option is a get-out clause for tools whose own auth model is intractable (Twenty Enterprise gate, anything closed-source). Use it where SSO is genuinely unavailable, not as the default.

## Verification

- New tool deploys: PR description must answer "How does this satisfy ADR-0032?" — either "SSO via Authentik with the following provider config" or "Embedded in workspace at `/workspace/<path>` via the following API/iframe pattern".
- Periodic audit (quarterly during the operator-playbook review): list every public-facing tool URL, check each against this ADR. New islands get fixed.

## References

- [feedback-authentik-should-be-wrapped](../../.claude/projects/-home-drukker-aiqadam/memory/feedback_authentik_should_be_wrapped.md) — the original principle, now formalised here
- [ADR-0021 — RBAC manifest](./0021-rbac-manifest.md) — what gates what inside the workspace
- [PR #73 — Twenty Enterprise OIDC gate](https://github.com/viktordrukker/aiqadam/pull/73) — the lesson that triggered the embed-as-fallback clause
- [PR #112 — Uptime Kuma deploy](https://github.com/viktordrukker/aiqadam/pull/112) — the deploy that surfaced the gap
- [Uptime Kuma OIDC will-not-implement](https://github.com/louislam/uptime-kuma/issues/2434) — why Uptime Kuma fails the policy
- [Gatus OIDC docs](https://gatus.io/docs/security#oidc) — why Gatus passes
- [`docs/01-business/community-platform-roadmap.md` §7 Sprint 2.1](../01-business/community-platform-roadmap.md) — workspace shell spec
