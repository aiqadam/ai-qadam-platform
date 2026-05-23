# ADR-0037: Three-tier architecture — engineering / operational / customer-facing

## Status
Proposed, 2026-05-23

> Drafted by Viktor in conversation 2026-05-23 after the OIDC RP-Initiated Logout incident forced a top-down look at how Authentik, `/workspace`, and the public web actually relate. The trigger: signing out of `/me` left the Authentik IdP session alive, so the next sign-in silently SSO'd the user back in across every Authentik-protected app. Fixing that one bug surfaced the broader architectural muddle — `/workspace/admin/users/new` was reimplementing Authentik invitations, `/workspace/admin/audit` was duplicating auth events, and there was no clear answer to "where does X belong?" for new operator-management work. This ADR is the durable answer.

## Context

### The trigger

Three things converged on 2026-05-23:

1. **Security regression discovered**: `/sign-out` cleared our local cookie + JWT but never terminated the Authentik IdP session. Across the workspace tool suite (ADR-0032: every operator tool SSOs via Authentik), this meant clicking "Sign out" anywhere logged the user out of *that* app only, while the IdP session lingered and the next sign-in was silent. Fixed via PR #234 (RP-Initiated Logout) + Authentik flow customisation 2026-05-23 — see [§Outcome](#outcome).

2. **Authentik exposes its own portal**: while debugging, the operator landing on `auth.aiqadam.org/if/user/#/library` made clear that Authentik already runs a "My Applications" launcher — branded poorly, with a dead "AI Qadam CRM" tile and zero customisation, but functionally the same shape we'd been building from scratch in `/workspace/dashboard`.

3. **Cross-layer concerns muddied the operator UI**: `/workspace/*` had become the catch-all home for everything from "create a new operator" (engineering: identity provisioning against Authentik admin API) to "queue an event announcement" (operational: business workflow) to "view auth events log" (engineering: identity audit) to "manage country profile content" (operational). One namespace, three distinct audiences, no boundary discipline.

### What changed in the team's mental model

Up to this point, the implicit model was a two-layer split: **public web** (customer) vs **`/workspace` + admin tools** (everything else). Sprint 2 (workspace shell + RBAC) and Sprint 3 (member graph cabinets) reinforced that model by adding more capabilities under `/workspace`.

The new mental model, articulated by Viktor 2026-05-23:

- **Engineering layer** — for engineers + super-admins. Authentik + every engineer-tier tool (Coolify, Directus admin, Gatus, Loki/Promtail, Plausible admin, GitHub) accessible via SSO from the Authentik portal. Break-glass paths per F-S0.2 + tool-specific runbooks for when SSO itself is down.
- **Operational layer** — for country leads, content managers, organisers, super-admins acting in ops mode. *One* UI: `aiqadam.org/workspace`, with a unified information architecture across cabinets. Business workflows, business audit, business KPIs.
- **Customer-facing layer** — for community members, the public, leads. The marketing site + per-tenant subdomains + Telegram bot + future Discord/WhatsApp/Instagram.

Three audiences. Three surfaces. One identity (Authentik, federating into all three).

### Why a sales-pipeline-shaped mental model doesn't work

The two-layer model encouraged us to file every operator-facing tool under `/workspace`, regardless of whether the work was actually operational or just engineer-needed-a-page. That produced:

- **Reimplementation of identity primitives.** `apps/api/src/modules/admin-invites/*` duplicated Authentik's invitation API + enrollment flow. ~600 LOC of code we'd have inherited for free by using Authentik's native primitives.
- **Mirrored audit trails.** `/workspace/admin/audit` was set up to ingest auth events alongside business events, requiring webhook plumbing (F-S2.2-b) we could have replaced with a link to Authentik's events log for the auth half.
- **No persona-aware navigation.** Country leads saw the same sidebar as engineers; admins saw the same launcher as content managers. No layer = no audience boundary.
- **Hard to answer "where does X go?"** New features defaulted to "another `/workspace/admin/*` route" by reflex, accelerating the muddle.

### Why three tiers, not more

We considered four-tier (engineer / admin / operator / customer) and five-tier (adding "developer" or "community moderator"). Both failed the test: every additional tier needs its own UI, its own auth policy, its own runbooks. Three is the minimum that gives:

- A clear engineer/operator split (mostly tooling vs mostly business UX)
- A clear operator/customer split (authenticated business work vs public + member self-service)
- A consolidation of "moderator" inside operator (a role within the operational layer, not a layer)
- A consolidation of "developer" inside engineering (a role within the engineering layer)

Roles are inside layers. Layers are not roles.

## Decision

**The AI Qadam platform is a three-tier system. New features are designed by triaging which layer(s) they touch.**

### Layer definitions (canonical)

| Layer | Primary surface | Identity entry point | Audience | What lives here |
|---|---|---|---|---|
| **Engineering** | `auth.aiqadam.org` (Authentik portal) + tools linked from it | Authentik sign-in | Engineers, super-admins | Identity (users, groups, roles, policies), auth flows, RBAC source-of-truth, OIDC providers per app, MFA, recovery, invitations, infra controls (Coolify, Directus admin, Gatus, Loki/Promtail, Plausible admin, GitHub), break-glass procedures, **all engineer-only telemetry** |
| **Operational** | `aiqadam.org/workspace` (one unified console) | Authentik SSO redirect | Country leads, content managers, organisers, super-admins acting in ops mode | Members directory, events, approvals queue, partners, telegram cabinets, country profiles, business audit, cross-country analytics, every operator-facing tile |
| **Customer-facing** | `aiqadam.org` + `*.aiqadam.org` (per-tenant subdomains) + Telegram bot + future Discord/WhatsApp/Instagram | Optional Authentik sign-in (for `/me`) or anonymous | Community members, public visitors, leads | Marketing site, /me, /events, /leaderboard, sign-up, lead capture, bot conversations, social presence |

### Layer ownership rules

1. **Identity is engineering-owned.** Authentik is the source of truth for user existence, group membership, and role bindings. All other systems mirror — they never originate.

2. **Business state is operational-owned.** Members (relations + profiles), events, registrations, approvals, partners, country profiles, telegram bot configs, business audit events — all live in our Directus + Postgres, surfaced via `/workspace`. Engineering never originates these.

3. **Customer state is customer-facing-owned, scoped to its audience.** Lead capture, member-self profile edits, registrations, points displays, bot interactions — these are member-initiated or anonymous-public. The engineering and operational layers consume this state (via business rules) but don't author it.

4. **Each layer has exactly ONE primary UI.**
   - Engineering: Authentik portal + linked tools (one launcher, many destinations — but the launcher is canonical).
   - Operational: `/workspace` (one console, many cabinets — but the console is canonical).
   - Customer-facing: per-surface (web has one site; Telegram has one bot; future channels each add one). Customer surfaces are necessarily plural because channels are plural, but each channel has exactly one home within its surface.

5. **Cross-layer flows are explicit contracts.** When data or events cross layers, the contract is documented at the layer boundary, not inside one of the layers' modules. Examples:
   - Authentik group change → RBAC sync to Directus + Plausible (ADR-0021): contract is the Authentik webhook payload + the RBAC manifest.
   - Operator approves a member application (operational) → email sent to applicant (customer-facing): contract is the `member_approval_granted` audit event + the Interactions dispatch payload.
   - Customer signs up (customer-facing) → operator sees them in directory (operational): contract is `directus_users` schema + the lead-to-member conversion flow.

### The three-layer triage (development workflow)

**Every new feature, before any code, runs the layer triage:**

```
Feature: <name>

Layer triage:
  [ ] Engineering — does it need new identity/auth/role/policy/infra/tooling?
  [ ] Operational — does it need a new cabinet, control, audit event, KPI?
  [ ] Customer-facing — does it produce a member-visible surface or message?

For each touched layer: 1 paragraph of intent + 1-bullet user story.

Cross-layer contracts (only required when >1 layer touched):
  - SSO/role-gating enforced by engineering
  - audit/business-event emitted by operational
  - customer-visible artifact + the data feed that produces it
```

This becomes the first triage section of every new feature spec in [`docs/agent-prompts.md`](../agent-prompts.md) §2 going forward. A feature that touches one layer ships through that layer's owner; a feature that touches more is explicitly multi-layer with documented contracts.

### What this ADR does NOT decide

- **Specific UI re-organisation inside `/workspace`** — that's the operational-layer rewire (Phase B below), out of scope for this ADR.
- **Whether to consolidate engineering tools further** (e.g., embed Coolify inside Authentik portal vs link out) — those are per-tool decisions; this ADR just establishes the layer.
- **Whether Phase ζ products extend operational, customer-facing, or both** — answered per-product when the product is specced; the layer triage forces the question.
- **Sequencing of the rewire work** — captured in the [Rewire phases](#rewire-phases) section but those become individual roadmap items, not part of this ADR's decision.

## Rewire phases

The decision above does not require immediate rewire of all existing code. The rewire happens in three phases, each one or more PRs:

### Phase A — Engineering layer consolidation (foundation)

A1. **Brand Authentik** so the portal feels like AI Qadam (logo, title, favicon, custom CSS, color palette). Done via Authentik admin API + the Brands feature. One PATCH.

A2. **Curate the Authentik portal Applications list:** delete dead "AI Qadam CRM" tile, add explicit "Workspace" tile pointing at `/workspace`, add tiles for Coolify (`coolify.aiqadam.org`), Gatus, Directus admin (engineer-only binding). Set role-based visibility bindings.

A3. **Replace the `admin-invites` module with Authentik invitations + custom enrollment flow.** Build a flow: `identification → prompt(country, role) → user_write → email_confirm → done`. The workspace `/workspace/admin/users/new` becomes a thin wrapper that POSTs to Authentik's `/api/v3/stages/invitation/invitations/`. Saves real code.

A4. **Demote `/workspace/admin/rbac-sync` and `/workspace/admin/users`** to engineer-only routes (gated by `engineer` role). Operators don't see them in nav.

A5. **Document break-glass paths for each engineering tool** beyond Directus + Postgres (which F-S0.2 already covers): extend the break-glass runbook with Coolify (SSH + manual docker-compose), Authentik (Postgres user table direct edit + recovery-via-cli script), Gatus (config-only, no break-glass needed).

### Phase B — Operational layer unification

B1. **Workspace IA rework:** one unified shell with persona-aware sidebar. Group cabinets into intuitive sections (Community / Events / Content / Integrations / Admin). Top-bar shows operator's country + role.

B2. **Remove engineering-leak items from operator nav** (per A4).

B3. **Add cross-cabinet search** ("find member", "find event") so operators don't bounce between cabinets to locate things.

B4. **Make `/workspace/dashboard` a true operational home** with KPIs, not just a launcher.

### Phase C — Customer-facing audit

C1. **Audit `aiqadam.org/*` for any leaked operator surfaces.** (Currently looks clean — this is a verification phase.)

C2. **Make the customer-facing nav explicit about what's public vs member vs operator.** Today the `/workspace` link is exposed from the public nav for signed-in users; that should be conditional on the operator role.

C3. **Document the "guest → lead → member → engaged" journey** so we know which surface each event maps to. Touches `docs/product-plan.md` + `docs/community-platform-roadmap.md` §3.

### Sequencing

Phase A must complete before Phase B (operational layer depends on engineering identity primitives being in place). Phase C can run in parallel with B but should not start until A4 is shipped so we know what's "operator nav" vs "engineer nav".

## Defer-list — work paused pending the rewire

To prevent the rewire's value from being eroded by piling more cross-layer mess on the current namespace, the following work is **DEFERRED — pending three-tier rewire (ADR-0037)** until at least Phase A ships. Documented for traceability and re-trigger logic:

| Item | Layer it touches | Re-trigger |
|---|---|---|
| **Sprint 4** — Self-serve country provisioning past UZ | Engineering (Authentik OIDC URI registration) + Operational (provisioning wizard) | G-1 country-lead-comp closed + Phase A done |
| **Phase ζ.1** Talk recordings + transcripts | Operational (upload UI) + Customer (player) | Phase B done |
| **Phase ζ.2** Discourse adoption | Engineering (yet another auth-island candidate; needs an ADR on adoption vs self-host vs skip) | Standalone ADR on Discourse |
| **Phase ζ.3** Hackathon teams | Operational (cabinet) + Customer (team join flow) | Phase B done |
| **Phase ζ.4** Public discovery pages | Customer-facing | Phase C done |
| **Phase ζ.5** Telegram bot full feature set | Customer (commands) + Operational (config) | Phase B done (unified telegram cabinet) |
| **Phase ζ.6** i18n (RU + UZ-Latn + KK across workspace + cabinets) | Cross-cutting all three layers | Phase A + B + C done |
| **Phase ζ.7** Win-back flow for lapsed members | Operational (triggering) + Customer (messaging) | Phase B done |
| **Phase ζ.8** Blog + RSS + posts | Operational (authoring) + Customer (reading) | Phase B done |
| **F-S1.1b** OG-image regen on speaker_added + web UI | Operational (regen UI) | Phase B done |
| **F-S1.1c** CSAT dispatch with per-recipient template renderer | Operational + Customer | Phase B done |
| **F-S1.5 follow-up** controlled-vocab job-title taxonomy + member_connections history dedup | Operational + data quality | Phase B done |
| **F-S1.6b** topic-personalised + city-scoped + churned re-engagement | Operational targeting + Customer messaging | Phase B done |

**Already-shipped sprints stay shipped.** This deferral only pauses NEW work. Bug fixes always continue.

## Active-list — work that continues in parallel with the rewire

| Item | Why it continues |
|---|---|
| **Bug fixes** | Always |
| **Sprint 2 exit gate** — Viktor's KZ test login (~10 min, HUMAN) | Doesn't conflict with rewire |
| **Sprint 3 exit gate** — first country lead + first sponsor + first digest (HUMAN, business-side) | Doesn't conflict |
| **Sprint 5 exit gate** — event-3 metrics (referred_by ≥ 20%, bot-linked ≥ 30%) | Needs event 3 to happen, HUMAN-paced |
| **The rewire itself** (Phases A → B → C) | The new active line of engineering work |

## Consequences

### Positive

- **Single durable mental model for new work.** "Which layer does this touch?" becomes the first design question for every feature, replacing ad-hoc placement.
- **Identity reimplementations stop.** Authentik becomes the explicit source-of-truth for users + roles; we stop building our own invitation UIs, our own audit trails for auth events, our own user lists.
- **Persona-aware UX.** Operators see operator nav. Engineers see engineer nav (or use Authentik portal directly). Customers see customer surface. No one navigates through the wrong layer's chrome.
- **Cleaner per-layer scaling.** Adding a new bot channel scales customer-facing without touching operational. Adding a new cabinet scales operational without touching engineering. Adding a new infra tool scales engineering without touching operational.
- **Cross-layer contracts are documented, not assumed.** When a feature spans layers, the contract is explicit — making future changes safer (and migrations possible).
- **Recovery from upstream Authentik bugs is layered too.** Engineering owns the Authentik fight; operational just consumes the identity output. The OIDC RP-Initiated Logout incident is the canonical example.

### Negative

- **Phase A is foundational work that touches a lot.** Branding Authentik, replacing the invite module, demoting routes — non-trivial, must ship before the operational rewire can begin in earnest.
- **The defer-list is long.** A meaningful chunk of Phase ζ + several Sprint 1 follow-ups are now paused. The cost of NOT pausing them is worse (rebuilding under the new model anyway), but the visible velocity drops.
- **Authentik upstream bugs become more visible.** OIDC RP-Initiated Logout was buggy; we have a working flow now but the engineering layer's reliability is now visibly tied to Authentik's release cadence. Mitigation: documented break-glass + the option to fork or replace later (treated as a Phase ζ+ decision).
- **Some operators will see UX shifts during Phase A.** Moving "Add user" out of `/workspace/admin/users/new` into the Authentik invitation flow is a workflow change for super-admins. Communicated via the operator playbook update.

### Neutral

- **No change to ADR-0032 ("operator tools must SSO or embed").** Three-tier reinforces it: operator tools still SSO via Authentik (engineering federates identity into the operational layer); embedded tools that aren't worth their own tier (e.g., Directus admin for engineers) are linked from the Authentik portal.
- **No change to ADR-0033 ("community member graph on Directus").** Three-tier reinforces it: members live in Directus, the operational layer is the UI over that graph; Authentik is identity-source, not graph-source.
- **No change to ADR-0021 (RBAC manifest).** Three-tier names the layers; RBAC binds roles within and across them.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Phase A consumes a session or two and reveals more Authentik upstream bugs | Medium | The work is bounded — five concrete tasks (A1–A5). If we hit walls, document them, ship the parts that work, defer the rest. |
| Defer-list grows informally as more cross-layer work surfaces | Medium | Defer-list is captured in this ADR + the [roadmap doc](../community-platform-roadmap.md) §7 inline marks; PM (Viktor) reviews additions to it weekly per decision-batch process. |
| Operators get confused during the Phase B re-org | Medium | One operator-facing change at a time; each cabinet move documented in the operator playbook; pre-announce before any nav move. |
| "Cross-layer contract" becomes a fig leaf — agents skip documenting it | Medium | The three-layer triage section in `docs/agent-prompts.md` §2 makes contracts a PR-checklist item; gate enforced at review time. |
| We over-correct and try to move things that should stay where they are | Low | Defer-list + the rule "rewire only items in the defer-list, leave shipped surfaces alone unless they're actively broken." |
| Authentik becomes a single point of failure for the engineering layer | Low | F-S0.2 break-glass already mitigates for Directus + Postgres. Phase A5 extends break-glass to Coolify + Authentik itself. |

## What changes in the roadmap

| Roadmap item before | After this ADR |
|---|---|
| Sprint 4 — Self-serve country provisioning (HARD-BLOCKED by G-1) | **DEFERRED — pending Phase A + G-1.** Re-evaluate when both resolve. |
| Phase ζ.1–ζ.8 | **DEFERRED — pending rewire.** Each item re-evaluated against the layer triage when un-deferred. |
| Sprint 1 follow-ups (1.1b, 1.1c, 1.5, 1.6b) | **DEFERRED — pending Phase B.** Workspace IA rework changes where they should live. |
| `docs/agent-prompts.md` §2 (feature template) | Gets a new top section: "Layer triage" — every feature spec runs the triage before any layer-specific work. |
| New roadmap section: Phase rewire | Phases A, B, C become tracked roadmap items with their own PR sequencing once this ADR Accepts. |

## Outcome — what already shipped (2026-05-23)

This ADR was drafted *after* the trigger work was already in progress. The following landed this session:

- **PR #234** — OIDC RP-Initiated Logout (id_token capture at callback, sign-out returns `logoutUrl`, browser navigates through Authentik's `end_session_endpoint`).
- **Authentik invalidation flow rewire** — new `aiqadam-provider-invalidation` flow (User Logout stage + Redirect stage → `/auth/signed-out`) assigned to OIDC provider pk=1. Browser now lands cleanly on `/auth/signed-out` after sign-out; Authentik IdP session is killed; next sign-in requires password. Recorded in [[reference-tenant-onboarding-checklist]].
- **5 new redirect URIs added to provider pk=1** (one `/auth/signed-out` per current subdomain) so the post-logout redirect resolves.

These are early Phase A engineering-layer work. The remaining Phase A tasks (A1 branding, A2 portal curation, A3 invite-module replacement, A4 nav demotion, A5 break-glass docs) become individual roadmap items when this ADR Accepts.

## References

- [ADR-0032](./0032-operator-tools-must-sso-or-embed.md) — every operator tool SSOs or embeds; this ADR generalises that into the three-tier model
- [ADR-0033](./0033-community-member-graph.md) — community member graph on Directus; this ADR places the graph in the operational layer
- [ADR-0021](./0021-rbac-manifest.md) — RBAC manifest; the role-to-layer mapping
- [ADR-0035](./0035-admin-cabinet-and-invite-link-onboarding.md) — admin cabinet + invite-link onboarding; partially superseded by Phase A3 (the invite-link flow moves into Authentik's native enrollment flow)
- [`docs/agent-prompts.md`](../agent-prompts.md) §2 — feature template that gains the three-layer triage
- [`docs/community-platform-roadmap.md`](../community-platform-roadmap.md) §7 — sprints and Phase ζ; deferred items marked inline
- [Authentik docs — Brands](https://docs.goauthentik.io/branding/) — Phase A1 reference
- [Authentik docs — Single Logout (SLO)](https://docs.goauthentik.io/add-secure-apps/providers/single-logout/) — engineering-layer SLO behaviour referenced in Outcome
- [Authentik issue #10430](https://github.com/goauthentik/authentik/issues/10430) — known upstream bug on `post_logout_redirect_uri`; the reason Phase A includes redirect stages in our custom invalidation flow
- Memory: [[project-roadmap-state]] (where each sprint stands), [[reference-tenant-onboarding-checklist]] (Authentik per-tenant URLs), [[feedback-decision-batch-process]] (Proposed → Accepted)
