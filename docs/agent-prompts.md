# Agent prompts — vertical features, one PR per agent

> Supersedes the horizontal "7 stream owners" model (closed via PR #90). That model serialized 5 of 7 agents on cross-layer waits and produced a Potemkin `/press` because three agents each shipped "their slab" with no feature owner. This doc replaces it with **vertical-feature slicing**: each agent owns ONE complete feature end-to-end, opens ONE PR, then dies.

---

## 0. Model

**One feature = one agent = one PR.** No long-running stream owners. No layered waits. No bot/marketing/schema/api/web persona.

Every agent owns the full slice for its feature:
- the schema additions (one append to `infrastructure/directus/bootstrap.sh`)
- the API module (`apps/api/src/modules/<feature>/`)
- the web page or island (`apps/web/src/pages/...`, `apps/web/src/components/...`)
- the smoke spec (`apps/e2e/tests/`)
- the runbook entry (`docs/runbooks/<feature>.md`)
- the roadmap §7 "shipped" annotation

When the PR merges, the agent is done.

---

## 0.1 Canonical documents — read at kick-off

| Doc | What it gives the agent |
|---|---|
| [`docs/product-plan.md`](./product-plan.md) | Strategic 18-month view: vision, surface map (web/Telegram/email/earned), member journey, platform pillars, scaling + enrichment strategy, product menu (hackathons / HRtech / edtech / paid / mentorship), business model evolution, metrics. Read when a strategic question surfaces ("does this fit?", "what comes after?"). |
| [`docs/community-platform-roadmap.md`](./community-platform-roadmap.md) | §7 lists every feature with deliverables. §1 north-stars, §2.5 3-lane model, §3 actor lifecycles, §6 risks, §7.5 smoke catalog. |
| [`docs/ux-and-content-guidelines.md`](./ux-and-content-guidelines.md) | All user-visible copy. §9 form structures, §10 task flows, §11 onboarding scripts, §12 notification copy library, §13 microcopy, §15 empty/error states. Verbatim — do not invent. |
| [`docs/marketing-and-pr-playbook.md`](./marketing-and-pr-playbook.md) | §3 AARRR funnel, §3.5 sponsor pricing, §10 sponsor kit, §11 speaker kit, §13 founder voices, §14 per-event playbook, §15 brand assets, §16 UTM scheme + attribution. |
| `docs/agent-prompts.md` (this file) | §1 concurrency, §2 feature template, §3 gates, §4 active backlog. |

Supporting: [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`SECURITY.md`](../SECURITY.md), [`STANDARDS.md`](../STANDARDS.md), [`CLAUDE.md`](../CLAUDE.md), [`docs/interaction-architecture.md`](./interaction-architecture.md), [`docs/auth-architecture.md`](./auth-architecture.md), [`docs/adr/`](./adr/), [`docs/runbooks/`](./runbooks/).

---

## 1. Concurrency primitives

### 1.1 Worktree isolation (mandatory)

Each agent works in its OWN git worktree. **Never** edit `/home/drukker/aiqadam` directly as an agent. Today's session lost ~1 hour to index hijacks across 7 agents fighting one tree (see [memory: multi-agent-shared-tree](../../.claude/projects/-home-drukker-aiqadam/memory/feedback_multi_agent_shared_tree.md)).

Agent setup (run once per kick-off, in the agent's prompt):

```bash
cd /home/drukker/aiqadam
git fetch origin --quiet
git worktree add /home/drukker/wt/<feature-id> -b agent/<feature-id> origin/main
cd /home/drukker/wt/<feature-id>
```

When the PR merges, the worktree is dropped: `git worktree remove /home/drukker/wt/<feature-id>`. The orchestrator does this on wake-up; the agent does NOT remove its own worktree (it's already exited).

### 1.2 Append-only hot files

These files are routinely edited by every feature. **Append at the bottom only**, follow the existing `ensure()` / module-registration / sitemap-entry pattern. Conflicts on these files are trivial rebases — do not "fix" them by restructuring.

- `infrastructure/directus/bootstrap.sh` — append new `ensure "collection X"` etc. before the final echo line.
- `infrastructure/directus/flows-bootstrap.sh` — append new flow definitions.
- `apps/api/src/app.module.ts` — append the new module to the imports list.
- `apps/web/src/pages/sitemap.xml.ts` — append the new public URL.
- `apps/e2e/tests/` — add a NEW `<feature>.spec.ts` rather than editing an existing one.

If two open PRs both modify the same hot file, whichever merges first wins. The second rebases (`git rebase origin/main`) and re-pushes. No coordination needed.

### 1.3 Locked files (do not edit)

- `design-system/tokens.css`, `design-system/components.css`, `design-system/portal.css` — design owns these. Use existing classes only.
- `pnpm-lock.yaml` — only edit when you add/bump a dep deliberately. Dependabot opens dedicated PRs for routine bumps.
- `.github/workflows/ci.yml` — only edit for genuine CI changes; supply-chain + smoke + deploy live in their own files.

### 1.4 Branch + PR naming

- Branch: `agent/<feature-id>` (e.g. `agent/s11-publication-broadcast`, `agent/s16-lead-capture`).
- PR title: `<sprint-id> — <one-line summary>` (no agent persona in the title).
- PR body must reference (a) the roadmap §7 line item and (b) the canonical-doc sections cited.

### 1.5 CI gates (what must be green for auto-merge)

- `ci` — typecheck, build, unit tests
- `supply-chain` — `pnpm audit --audit-level=high` (now clean as of PR #117) + weekly Trivy
- `deploy` — Coolify build artifact ready
- `smoke` — runs on the PR (not on push-to-main) against current prod; should be green when prod is healthy. If smoke flakes, see §7.

`smoke` does NOT run on push-to-main (it raced the deploy and was always red — see PRs #118/119/120). It runs on PRs + every 30 min via cron.

---

## 2. Feature template

Every feature PR ships the same shape. Cargo-cult this list:

```
agent/<feature-id> branch on its own worktree

✅ Schema (if any): append to infrastructure/directus/bootstrap.sh
   - new collection(s) with ensure_collection() + ensure_field() helpers
   - idempotent: run twice locally against prod Directus = no-op the second time
✅ API (if any): apps/api/src/modules/<feature>/
   - controller (NestJS, @UseGuards as needed)
   - service (Drizzle/Directus calls)
   - DTOs (Zod or class-validator)
   - register in apps/api/src/app.module.ts (append to imports)
   - apps/api/test/<feature>.spec.ts with Testcontainers Postgres
✅ Web (if any): apps/web/src/{pages,components,lib}/
   - page (Astro), island (TSX) — copy from UX guidelines verbatim
   - register new public URL in apps/web/src/pages/sitemap.xml.ts (append)
✅ Smoke: apps/e2e/tests/<feature>.spec.ts
   - one happy-path Playwright scenario for the user-visible surface
   - one API-shape assertion if backend-only
✅ Runbook: docs/runbooks/<feature>.md
   - what it does, where the data lives, who to call when it breaks
✅ Roadmap mark: tick the roadmap §7 line as "shipped (#PR)"

PR title: "<sprint-id> — <summary>"
PR body: links to roadmap §7 + cited UX/marketing sections
Auto-merge: gh pr merge --auto --squash --delete-branch
```

If the feature only needs 3 of the 5 layers (e.g. a docs-only ADR or a CI-only workflow), ship those 3. Don't fake the others.

---

## 3. Gates — the only places features wait on each other

Most features are independent. The list of real gates is short. An agent that hits a gate **exits and surfaces the wait** instead of inventing dependencies that aren't real.

| Gate | What waits on it | How to resolve |
|---|---|---|
| **ADR-0021 RBAC manifest** | All workspace-cabinet features (Sprint 2.x+) | PM decision-batch flips Proposed → Accepted (weekly Monday slot per decision-batch-process.md) |
| **ADR-0025 brand-asset tooling** | S0.7 operator playbook, S0.9 real brand-asset library | Same decision-batch slot |
| **ADR-0031 cabinet routing** | Sprint 3.x cabinet features | Drafted as a feature itself, then accepted |
| **PII data-flow map (S3.0)** | Sprint 3.2 sponsor cabinet | Ship as a feature (one-PR doc) |
| **Metabase deploy (S2.4)** | S2.6 cross-country dashboard, S5.8 marketing dashboard | Ship as feature; HUMAN-only step is the Coolify create |
| **Authentik group claims (Wave-4 RBAC sync)** | S5.5 bot v0 (account link) | Feature S2.2 ships this |
| **BotFather setup** | S5.5 bot v0 | HUMAN-only, ~5 min once |
| **HUMAN: branch protection** | "audit gate required" enforcement | Requires GitHub Pro or making the repo public; until then, supply-chain gate is informational-only on PRs (still flags red, just doesn't block merge) |
| **HUMAN: prod ops** (bootstrap, Coolify deploys) | Any feature whose schema/infra runs on prod | Cached secrets at `/tmp/aiqadam-secrets-*`; runbook ships with the feature; HUMAN runs the documented step |

Cross-feature dependencies inside the same sprint (e.g. "speaker cabinet needs sponsor pipeline") are NOT gates — they are sequential feature numbers. Ship them in PR order; the second feature rebases on the first.

---

## 4. Active feature backlog

Pick the highest-priority **eligible** feature (its gate is satisfied + nobody else's PR is open on it). When you finish one, kick off the next.

**Status legend:** 🟢 ready · 🟡 gated on a HUMAN action · 🔴 gated on another PR

### Sprint 0 finish (4 features remaining)

| ID | Feature | Status | Notes |
|---|---|---|---|
| **F-S0.9b** | Real brand-asset library — wire `/press` to Directus `marketing_assets` collection (kills the Potemkin from PR #116) | ✅ shipped (#157) | Tier 1 logos stay in git; Tier 2 (`marketing_assets`) in Directus; cms.ts helper + page rewrite + smoke spec |
| **F-S0.5** | Backup-restore CI test | ✅ shipped (#155) | Host-side `aiqadam-restore-drill.sh` + monthly systemd timer (`*-*-01 04:30 UTC`) + CI shellcheck + systemd-analyze + dry-run-script; deployed on `aiqadam-prod`, first PASS recorded |
| **F-S0.14** | Content-quality CI (voice + UTM lint) | ✅ shipped (#150) | `voice-lint.mjs` + `utm-lint.mjs` + `.github/workflows/content-quality.yml`; diff-only against `origin/main` |
| **F-#113** | Plausible ops-events helper (`auth_failure`, `dispatch_failure`, `rbac_denial`) | ✅ shipped (S0.4 era) | Lib at `apps/api/src/lib/ops-events.ts`; `auth.failed` + `dispatch.failed` hooks wired; `rbac.denied` caller awaits F-S2.2 (no authorization-denial path exists yet — only authentication). Test coverage at `apps/api/test/ops-events.spec.ts`. |
| **F-S0.2** | Break-glass admin path | ✅ shipped | `scripts/provision-break-glass.sh` (idempotent rotation tooling for the Directus side) + Postgres `aiqadam_breakglass` manual rotation procedure in the runbook + filled-out [`break-glass.md`](./runbooks/break-glass.md). API-endpoint version deferred until F-S2.2 RBAC sync. |
| **F-S0.12-batch** | 8 remaining ADR drafts (0022, 0023, 0024, 0026, 0027, 0028, 0029, 0030) | ✅ shipped (#149) + ADRs Accepted/Deferred via batch #1 (#152) | All 8 drafted; PM batch-accept landed 2026-05-21 (7 Accepted, 2 to gap list) |
| **F-S0.13-runbooks** | 6 runbook scaffolds (security, auth, audit, break-glass, country-lead-activation, rbac-drift) | ✅ shipped (#148) | break-glass.md scaffold filled out by F-S0.2; lived-experience fill ongoing |
| **F-S0.11** | Prod-probe smoke (cron in place via PR #120; this adds the scheduled-failure alerting) | ✅ shipped (#151) | Cron failure emits Plausible `prod_probe_failure` event + opens GH issue (`prod-probe-failure` label); recovery closes the issue |
| **F-S0.7** | Operator playbook v0 (9 scaffolds) | ✅ shipped (#156) | 9 scaffolds at `docs/operator-playbook/` |

### Sprint 1 (6/6 features shipped — closed 2026-05-22)

~~F-S1.1a publication broadcast~~ ✅ shipped 2026-05-22 · ~~F-S1.1b speaker_added flow~~ ✅ shipped 2026-05-22 (event_speakers junction + `PATCH .../speakers/:id` fires `speaker_added` on accepted→confirmed; per-(event, speaker) idempotency in `event_announcements.speaker` FK; OG-image regen + web UI deferred — operator-API + dispatch only) · ~~F-S1.1c post-event cron~~ ✅ shipped 2026-05-22 (`POST /v1/internal/post-event/tick` dispatches `speaker_thanks_with_referral_ask` + `next_event_teaser` then sets `events.post_event_processed=true`; CSAT dispatch deferred until per-recipient template renderer lands) · ~~F-S1.2+1.3 CSAT capture + operator surface~~ ✅ shipped 2026-05-22 · ~~F-S1.4 pre-event reminders (T-2 + T-3h)~~ ✅ shipped 2026-05-22 · ~~F-S1.5 member matching (T-7)~~ ✅ shipped 2026-05-22 (`POST /v1/internal/event-matches/tick`; interest-tag overlap algorithm; `appear_in_matches` opt-out in /me/profile; T+3 post-registration trigger + job-title overlap deferred to F-S1.5b) · ~~F-S1.6 lead capture~~ ✅ shipped 2026-05-21 + ~~F-S1.6b nurture cron~~ ✅ shipped 2026-05-22 (`POST /v1/internal/lead-nurture/tick`; T+3 `lead_nurture_value` + T+7 `lead_nurture_next_event`; idempotency via new `lead_nurture_dispatches` collection; topic-personalised + city-scoped + churned re-engagement deferred to follow-ups).

Each is one vertical PR per the template in §2. None depends on another.

### Sprint 2 (7 features, 🟢 since ADR-0021 Accepted 2026-05-21)

F-S2.1 workspace shell · F-S2.2 RBAC sync · F-S2.3 app launcher · F-S2.4 Metabase + country dashboard · F-S2.5 audit log + /me/access-log · F-S2.6 cross-country dashboard (🔴 on F-S2.4) · **F-S2.7 operator invite cabinet** (3 sub-PRs per [ADR-0035](./adr/0035-admin-cabinet-and-invite-link-onboarding.md): PR-1 ADR+schema · PR-2 API · PR-3 web).

> Partial: F-S2.1 workspace shell shipped at `/workspace/*` (#125) with placeholder RBAC. F-S2.3 minimal launcher shipped (#128) with 4 cards. Per-role gates still wait on F-S2.2 RBAC sync.

### Sprint 3 — Community member graph + 5 operator cabinets (per ADR-0033)

Reshaped 2026-05-20 per [ADR-0033](./adr/0033-community-member-graph.md). Twenty CRM dropped; member relationship management lives in the Directus member graph; operators get 5 purpose-built cabinets that hide Directus admin behind the engineer-only chip.

| ID | Feature | Status | Notes |
|---|---|---|---|
| **F-S3.0** | Member graph foundation (bootstrap.sh extensions + 8 new collections + event taxonomy + Twenty Coolify deletion) | 🟢 ready (depends on no other PR; ADR-0033 is the spec) | **Blocks all subsequent Sprint 3 cabinets.** Single vertical PR per ADR-0033 Part 1 schema sketch. ~half day. Coolify deletion of Twenty is in-scope. |
| **F-S3.1** | Single-origin cabinet routing ADR (ADR-0031) | 🟢 ready | Architecture already implemented via `/workspace/*` per ADR-0032 acceleration; this ADR documents it. ~30 min. |
| **F-S3.2** | Cabinet #1 — Member directory + cohort builder at `/workspace/members` | ✅ shipped | 7 filter primitives + cohort CRUD with cached count + 7d delta + PII-light sample + runbook with 5 starter cohorts |
| **F-S3.3** | Cabinet #2 — Announcement composer at `/workspace/announce` | ✅ shipped | Cohort picker + subject/body + preview + send via dispatcher with per-recipient consent enforcement + 5000 audience cap |
| **F-S3.4** | Cabinet #3 — Event control panel at `/workspace/events/[id]` | ✅ shipped | List view + detail view; phase-aware (pre/live/post); editable metadata (title/description/status/capacity/location); registration counts + check-in rate; 4-row followup checklist with markdown notes |
| **F-S3.5** | Cabinet #4 — Partner/sponsor view at `/workspace/partners/[id]` | 🔴 on F-S3.0 + F-S3.2 + S2.4 Metabase | Cohort-aggregated analytics + kit downloads + auto quarterly digest. NEVER raw member rows. ~1 day. |
| **F-S3.6** | Cabinet #5 — Member self-service at `/me/profile` | ✅ shipped (v1 + b) | v1 (#171): profile core + 7-purpose `member_consents` + skills. F-S3.6b: interests (topic+intent, dedupe on triplet) + employments (find-or-create company on slug; `share_with_sponsors` per-row opt-in default OFF; new orgs inserted status=pending). |
| **F-S3.7** | Operator approval queue | ✅ empty-shell v1 shipped | Cabinet at `/workspace/approvals` with 3 pluggable source slots — none ready in v1 (sponsor / speaker / operator-assisted-Interaction sources land later). Each source plugs in via `approvals.service.ts` SOURCES registry when its feature ships. |
| **F-S3.8** | Auto-generated quarterly sponsor digest PDF | 🔴 on F-S3.0 + F-S2.4 Metabase | Template + cron + sponsor cabinet download. ~2 days. |
| **F-S3.9** | Referral codes schema + API + first-touch/last-touch attribution | ✅ shipped | `referral_codes` collection + `registrations.referred_by` + `.acquisition_source` jsonb; `/v1/referrals/{issue,mine,resolve}` endpoints; `/me/referrals` member UI; landing-page `captureLandingAttribution()` cookie helper; `RegistrationSidebar` wired to include attribution on register POST. Sprint 5.2/5.3 share UI + points consume this schema. |

**Sprint 3 critical path:** F-S3.0 → F-S3.2 (members cabinet unlocks cohorts) → F-S3.3 (announce uses cohorts) + F-S3.4 (events) + F-S3.5 (sponsors, also needs Metabase from S2.4) + F-S3.6 (member self-service) in parallel.

**Sprint 3 exit gate** (from roadmap): member graph live; 5 cabinets live; ≥1 country lead manages a real event end-to-end without touching Directus admin; ≥1 sponsor sees aggregated cohort analytics on their cabinet; auto quarterly digest generates for ≥1 sponsor.

### Phase ζ products (all land on the member graph per ADR-0033)

| Product | Schema extension (namespaced) | Cabinet |
|---|---|---|
| Hackathons (ζ.3) | `hack_teams`, `hack_submissions`, `hack_judges`, `hack_scores` | extends `/workspace/events/[id]` |
| HRtech | `hr_jobs`, `hr_applications`, `hr_candidate_feeds` | `/workspace/jobs` + `/workspace/talent` |
| Edtech | `edu_courses`, `edu_enrollments`, `edu_lesson_progress`, `edu_certifications` | `/workspace/courses` + `/me/learning` |
| Paid premium | `paid_subscriptions`, `paid_content` | extends `/workspace/announce` + `/me/profile` |
| Mentorship | `mentor_profiles`, `mentor_matches`, `mentor_sessions` | `/workspace/mentorship` + `/me/mentorship` |
| Sponsor talent-slice upgrade | (no new collections) | extends `/workspace/partners/[id]` |

Each is 1–2 vertical PRs on top of the graph. Detailed slicing deferred until Sprint 3 wraps.

---

## 5. Kick-off prompt — paste this to launch one agent

Replace `<feature-id>` and `<feature title>` with the row from §4. Everything else is verbatim.

```
You are Claude Code. You own ONE feature end-to-end: <feature-id> — <feature title>.

## Workspace setup (do this first)

cd /home/drukker/aiqadam
git fetch origin --quiet
git worktree add /home/drukker/wt/<feature-id> -b agent/<feature-id> origin/main
cd /home/drukker/wt/<feature-id>

You work in /home/drukker/wt/<feature-id> for the entire session. Never touch
/home/drukker/aiqadam directly. Never edit another agent's worktree.

## Read first

- docs/agent-prompts.md §0–§3 (model, canonical docs, concurrency, gates)
- docs/community-platform-roadmap.md §7 — find the row for <feature-id> and read its deliverables
- docs/ux-and-content-guidelines.md — for any user-visible copy
- docs/marketing-and-pr-playbook.md — for any funnel/brand/UTM touch
- CLAUDE.md, ARCHITECTURE.md, SECURITY.md, STANDARDS.md

## Build the feature (per agent-prompts.md §2 template)

Ship the full vertical slice in ONE PR:
- schema append (if any) to infrastructure/directus/bootstrap.sh
- API module (if any) in apps/api/src/modules/<feature>/
- Web page/island (if any) in apps/web/src/...
- Smoke spec in apps/e2e/tests/<feature>.spec.ts
- Runbook in docs/runbooks/<feature>.md
- Roadmap §7 "shipped" mark

## Open the PR

git add -A && git commit -m "<sprint-id> — <summary>" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push -u origin agent/<feature-id>
gh pr create --title "<sprint-id> — <summary>" --body "..." # reference roadmap §7 + cited UX/marketing sections
gh pr merge --auto --squash --delete-branch

## Hard rules

- Never touch /home/drukker/aiqadam directly; you work in your worktree.
- Never edit a locked file (§1.3).
- Append-only on hot files (§1.2). Rebase on conflict; do not restructure.
- All user-visible copy from UX guidelines verbatim. Do not invent.
- If your gate isn't satisfied (§3), STOP and surface the wait. Do not paper over.
- If CI is red after 2 retries, mark the PR DRAFT, write a failure analysis in
  the PR body, and exit. Coming back online is cheap.
- Never commit secrets. Never skip hooks. Never force-push to main.

## Exit

Once the PR is open with auto-merge enabled, your job is done. Print a one-line
summary ("Feature <feature-id> shipped on PR #N, auto-merge enabled, awaiting
ci+supply-chain+smoke") and exit. The orchestrator drops your worktree after
the PR merges.
```

---

## 6. Wake-up checklist

After a sleep cycle:

1. `gh pr list --state all --search "agent/" --limit 30` — see what shipped, what's pending, what's DRAFT.
2. For each merged agent PR: `git worktree remove /home/drukker/wt/<feature-id>` (cleanup).
3. For each DRAFT agent PR: read the failure analysis in the PR body, decide whether to fix manually, redirect the agent, or close.
4. Decision-batch any new ADRs (Mondays per `decision-batch-process.md`).
5. Pick the next 1–3 eligible features from §4 and kick off agents (one prompt per agent, one worktree per agent).
6. HUMAN tasks (paced by you, not blocking agents):
   - Schedule next event (every Sprint 1+ feature benefits)
   - Identify country leads (Sprint 4 blocker)
   - Sponsor outreach (Sprint 3 cabinet needs a real sponsor)
   - BotFather setup (Sprint 5.5)
   - Discourse SSO config (Phase ζ.2)
   - Coolify deploys flagged in feature runbooks
   - Branch protection promotion (needs GH Pro or public repo)
   - Prod bootstrap.sh runs (each schema feature ships a one-line documented command)

---

## 7. When things go wrong

| Scenario | Response |
|---|---|
| CI red after 2 retries | DRAFT the PR + write failure analysis in the body + exit. Human triages. |
| Merge conflict with another agent's PR on a hot file | `git rebase origin/main` + re-push. Conflicts on append-only files are trivial. |
| Smoke flaky on your PR | Re-run via Actions UI (workflow_dispatch is enabled). Smoke against prod is occasionally flaky on a 502 from a deploy elsewhere. If 3 consecutive smoke runs fail, treat as a real prod issue. |
| `pnpm audit (high+critical block)` fails on your PR | Check if Dependabot has a fix open. If not, bump the vulnerable dep yourself in a separate small PR (see PR #117 for the pattern). |
| pnpm-lock.yaml conflict | `git rebase origin/main` + `pnpm install` + commit lockfile. |
| Schema bootstrap locally fails against prod Directus | Stop. Do not push. Surface to chat with the exact error and the SQL/REST call that failed. |
| Authentik/Coolify/Directus unreachable from your dev env | Skip the integration step, use mocks for tests, document in the PR what HUMAN needs to run after merge. |
| You realise mid-implementation the feature has an unstated gate | STOP and surface the gate. Do not build around it. |

The bias: **fail loudly, don't paper over.** Today's S0.9 Potemkin (PR #116) is the cost of papering over an unstated coordination gap.
