# Forum adoption brief — Discourse (Phase ζ.2)

> **Status:** Research note, not a commitment. Forum work is deferred per [ADR-0037 §Defer-list](../adr/0037-three-tier-architecture.md) and [product-plan §6.2](../01-business/product-plan.md). This brief is the playbook you reach for when the entry gate fires.
>
> **Audience:** PM (decide go/no-go), engineer-tier agents (execute the deployment).
>
> **Drafted:** 2026-05-24, as part of the customer-channels uplift session (PR `docs/web-uplift-7-forum-prep-brief`).

---

## TL;DR

- **Adopt Discourse, self-hosted at `community.aiqadam.org`.** OIDC SSO against Authentik. Coolify stack. ~500MB RAM additional footprint.
- **Don't deploy yet.** Entry gate is `~200 daily-active members` per [product-plan §6.2](../01-business/product-plan.md) — that gate is not currently met.
- **One pre-requisite from the three-tier rewire:** [ADR-0037 Phase A](../adr/0037-three-tier-architecture.md) must complete first. Authentik provider creation + portal tile + OIDC scope mapping all live in the engineering layer; Phase A is the rewire that owns it.
- **Scope when triggered:** 2 PRs + a de-risk spike. PR-1 deploys + SSO. PR-2 wires the inbound webhook + outbound dispatcher intent.
- **What Discourse gives us out of the box (saving ~5 sprints of build-from-scratch):** per-country/per-topic categories, threaded posts, likes + reactions, @mentions, notifications inbox, badges, trust levels 0–4 (= our ambassador foundation for free), moderation tooling, native search.

---

## Why Discourse — and why not now

### Why Discourse (vs Flarum / NodeBB / build-from-scratch)

| Option | Verdict | Rationale |
|---|---|---|
| **Discourse** | ✅ Adopt | GPL OSS, mature (~10 years), free self-host, native OIDC SSO, used by Mozilla + every credible OSS project, biggest ecosystem of plugins. Trust-level system covers our ambassador-graph foundation for free. |
| Flarum | ❌ Skip | Lighter but less mature; smaller plugin ecosystem; trust-level / moderation tooling thinner. |
| NodeBB | ❌ Skip | JS-based (matches our stack) but less mature than Discourse; smaller community. |
| Build in-house | ❌ Skip | ~5 sprints of inferior work per [critical-review §12](../05-other/critical-review.md). Member-to-member discussion is not where our domain expertise sits. |

### Why not deploy now

- **No critical mass.** [product-plan §6.2](../01-business/product-plan.md) gates Discourse on `~200 daily-active members`. Below that threshold the forum sits empty, which actively damages perception ("AI Qadam is dead" → opposite of the goal). Deploy when there are enough members that any given visitor finds activity within the past 24h.
- **Three-tier rewire incomplete.** Per [ADR-0037](../adr/0037-three-tier-architecture.md), Phase ζ items are deferred pending Phase A (engineering layer rewire). Discourse needs an Authentik OIDC provider, scope mapping, and a portal tile — all engineering-layer work that should land via the rewire pattern, not bypass it.
- **Ops ceiling.** Prod host RAM is finite; the Discourse stack adds ~500MB. Per [interaction-architecture §OPS](../04-development/architecture/interaction-architecture.md#sprint-9--operator-tools--polish-3-prs), we cap at 12GB used. Check current headroom before adding another container.

---

## Entry gate

**Trigger:** all of:

1. **≥200 daily-active members** sustained over a 14-day window (Plausible WAM × 0.5 as a rough proxy, or `bi.dam` view once Metabase is wired).
2. **ADR-0037 Phase A is `Complete`** in the [Phase tracker](../adr/0037-three-tier-architecture.md). This guarantees the engineering layer can host the Discourse OIDC provider + portal tile cleanly.
3. **Prod RAM headroom ≥1GB** after Stalwart-mail (F-S2.12) + Authentik 2025.10.4 + Plausible + planned Metabase footprint. Confirm via `ssh aiqadam-prod 'free -m'`.

If 1 + 3 fire before 2, re-evaluate: the rewire may be the bottleneck and forum is the highest-value Phase ζ slice to pull.

---

## Deployment plan (2 PRs + 1 spike)

### Spike (1 day, not a PR — runbook + decision)

- Stand up Discourse in a local Docker compose with placeholder OIDC config (or an Authentik dev instance) to confirm:
  - Discourse's built-in OIDC2 plugin works against Authentik (no custom OIDC adapter needed)
  - Authentik group claim → Discourse trust-level mapping behaves
  - Email sending via existing Stalwart mailserver works (Discourse heavily depends on email — sign-up confirmations, notifications, mention emails, weekly digests)
- Output: a short runbook page (`docs/runbooks/discourse-deployment.md`) capturing config keys + gotchas, OR a "stop, switch to NodeBB/Flarum" decision if Discourse-on-Authentik proves fragile.

### PR-1 — Deploy Discourse at community.aiqadam.org

- **Coolify Docker-Compose stack** (`discourse/discourse:<stable-tag>`)
- **Discourse Postgres** — share the existing pgvector cluster (separate database `discourse`); the cluster is overprovisioned and Discourse fits comfortably
- **Discourse Redis** — dedicated container; do NOT share with the existing app Redis (Discourse uses `KEYS *`-style scans that thrash a shared instance)
- **OIDC SSO** via Discourse's `discourse-openid-connect` plugin against Authentik provider `pk=N` (TBD at deploy time per [reference-tenant-onboarding-checklist](../../.claude/projects/-home-drukker-aiqadam/memory/reference_tenant_onboarding_checklist.md))
- **Authentik scope mapping** — emit `groups: aiqadam-country-* + member-*` for trust-level seed
- **Engineering Deck tile** — add Discourse to the Authentik default_application library so engineers (and only engineers, gated by group) see the launcher tile
- **Acceptance** — sign in via "Continue with AI Qadam" works; create test post in `#uz` category; default trust level 0 assigned

### PR-2 — Discourse ↔ AI Qadam bridges

- **Inbound webhook** (Discourse → API):
  - `user_created` → ensure `users` row exists (idempotent against `directus_users`)
  - `post_created` → record as a low-priority `interactions` row so the post shows in the member's timeline
- **Outbound intent** (dispatcher → Discourse):
  - New intent `discourse_mention` posts to a user's Discourse inbox via Discourse API
  - Wired into the existing `Interactions dispatcher` per [interaction-architecture §3.4](../04-development/architecture/interaction-architecture.md)
- **Acceptance** — post in Discourse → member timeline updates; dispatch `discourse_mention` → Discourse inbox notification appears

---

## Cost / footprint

| Resource | Estimate | Notes |
|---|---|---|
| Prod RAM | ~500MB (Discourse) + ~150MB (Discourse Redis) | Cap remains 12GB host; verify headroom at trigger time |
| Postgres | +50MB initially, grows with content | Shared cluster — no new container |
| Backup | Discourse handles its own dump via `discourse-data-backup` plugin | Daily backup to S3 (Hyperapp Object Storage) |
| Engineer time | ~3-5 days incl. spike + 2 PRs | One agent, vertical-feature pattern |
| Recurring cost | $0 | OSS + self-hosted; transfer/storage falls under existing host budget |

---

## Risks

1. **Discourse + Authentik OIDC plugin fragility.** Discourse's OIDC2 plugin works against generic OIDC but has historically broken on Authentik scope-mapping edge cases. The spike de-risks; if it fails, NodeBB (also OIDC-capable) is the fallback. Worst-case time loss: 1 spike day.
2. **Empty-forum dynamic.** Deploying before 200 DAU produces a ghost town. Mitigation: gate strictly; if you launch early, seed with 3-4 sticky topics (intro, weekly thread, country-specific) and have community managers post daily for the first 2 weeks.
3. **Email reputation.** Discourse sends a LOT of email (notifications, digests, mentions). Routes through Stalwart (F-S2.12) — needs DKIM + SPF healthy before Discourse goes live, or the IP reputation tanks. Cross-reference [project-stalwart-mail-deployment-status](../../.claude/projects/-home-drukker-aiqadam/memory/project_stalwart_mail_deployment_status.md).
4. **Moderation load.** Discourse moderation tools are good, but they only work if someone moderates. PM should appoint 1-2 country-leads as moderators before launch + write a 1-page moderation policy. Out of scope for the deployment PRs.
5. **SEO cannibalisation.** Discourse pages can outrank our own marketing pages for ambient queries. Mitigation: `noindex` on early threads until volume justifies indexing; revisit when WAM > 500.

---

## Success metrics (when do we know it worked)

Per [interaction-architecture Phase 2 advance gate](../04-development/architecture/interaction-architecture.md):

- **30% of new sign-ups return within 30 days**
- **≥10% of new sign-ups make at least one Discourse post within 60 days**

Reported via Metabase tile (wired in Sprint 2.4 once that lands).

If at 90 days neither is hit, the forum is a leak (resource-consumer, not return-driver). Roll back or de-prioritise.

---

## Open questions for PM

1. **Categories on day 1** — one per country (uz/kz/tj), plus `general`, `events`, `help`, `jobs`? Or simpler `general + events + help`?
2. **Moderator pool** — who? Country leads + super-admins? Or also community managers (operational tier)?
3. **Content seed** — does Binali write the first 3-4 sticky threads (intro, code of conduct, weekly thread, AMA), or do we recruit one founding member to do it?
4. **Trust-level → workspace permissions** — TL3+ members get any operational privileges (e.g. submit event ideas via cabinet)? Probably no for v1, revisit at TL3 sample size ≥10.
5. **Anonymous read** — public threads readable without sign-in (SEO + word-of-mouth) or members-only?
6. **Cross-post automation** — post Discourse threads to Telegram channel automatically, or keep the two channels distinct?

These don't block the spike but are required before PR-1 merges.

---

## Cross-references

- [ADR-0037 — Three-tier architecture](../adr/0037-three-tier-architecture.md) — Phase A unblocks this
- [product-plan §6.2](../01-business/product-plan.md) — 200 DAU gate
- [community-platform-roadmap §6 (Phase ζ)](../01-business/community-platform-roadmap.md) — original Sprint 6.2 plan
- [interaction-architecture §3.4](../04-development/architecture/interaction-architecture.md) — webhook + dispatcher wiring detail
- [critical-review §12](../05-other/critical-review.md) — the "Discourse vs build-it" decision
