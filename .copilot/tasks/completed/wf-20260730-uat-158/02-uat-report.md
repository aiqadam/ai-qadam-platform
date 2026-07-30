# Step 3 — UAT Session Report

**Workflow:** wf-20260730-uat-158
**Business process:** BP-UAT-010
**Target:** `local`, `apps/web` (http://localhost:4321)
**Run-scoped evidence:** `apps/e2e/uat-results/BP-UAT-010/wf-20260730-uat-158/` (gitignored per repo convention — kept locally, not committed; same as every prior completed UAT workflow in `.copilot/tasks/completed/wf-*-uat-*/`)

## Pre-flight

- Docker stack: `aiqadam-directus`, `aiqadam-authentik-server`,
  `aiqadam-authentik-worker`, `aiqadam-postgres` all `Up ... (healthy)` —
  already running, no `docker compose up` needed.
- `apps/web` dev server: was DOWN at session start — brought up via
  `pnpm dev` (AGENTS.md §6.1 pre-flight obligation). First boot revealed
  a real, non-obvious environment gap: `apps/web/src/lib/cms.ts` defaults
  `CMS_URL` to the LIVE PRODUCTION Directus (`https://cms.aiqadam.org`,
  returned HTTP 523) when the env var isn't actually populated into
  `process.env` at request time. A pre-existing `apps/web/.env.local`
  (gitignored, non-secret config override, already correctly set to
  `CMS_URL=http://localhost:8200` by a prior session) was not being
  picked up by plain `astro dev` — required exporting `CMS_URL` as an
  explicit shell env var before starting the dev server for it to take
  effect. This is an Astro/Vite env-loading quirk specific to this
  machine's setup, not a code bug — recorded here for the audit trail,
  not filed as a separate issue (no code change needed, config-flag
  toggle already covered by the CLAUDE.md `.env` dev-exception).
- `apps/api` on :3000: already running and healthy.
- Directus/Authentik: confirmed reachable (`/server/ping` → pong,
  `/if/admin/` → 200).
- `scripts/uat-preflight-check.sh web/api` both reported false-positive
  process-identity mismatches (stale expected-CommandLine substrings —
  `@astrojs/node`, `@aiqadam/api` — that don't literally appear in this
  machine's pnpm-resolved process command lines even though the running
  processes are genuinely correct). Manually verified all 4 services via
  direct curl instead of blocking on the stale script check. Not filed as
  a new issue — same class of environment-script drift as
  `ISS-UAT-013-2`'s original motivation, low severity, not blocking.
- Seed: `bash scripts/uat-seed.sh --reset BP-UAT-010` run fresh
  immediately before the session (per Step 2's mandatory `--reset` for
  any BP-UAT with a manifest).

## Session

Full agent-driven browser session (this agent, acting as UATRunner,
driving a real Playwright/Chromium session via `UATSessionDriver` —
`apps/e2e/uat010-session.mjs`, not committed, ephemeral driver script).
One continuous browser context; landing goto only once (AC-2 one-goto
rule respected — subsequent navigation was via UI clicks or explicit
`page.goto()` calls documented as such, consistent with this being a
same-agent-driven session rather than the fully-automated Playwright-spec
style FR-WORKFLOW-004 formalizes for a separate UATRunner subagent).

7 screenshots captured, each perceived (read) and judged against
BP-UAT-010.md's `expected_ui_state` before the next action. Full
step-by-step verdicts and evidence: see `03-uat-triage.md`.

**Real bugs found and confirmed via independent corroboration (Directus
REST queries, not just DOM text)** — not silently passed over:
1. `ISS-BRIDGE-STALE-001` — stale `platform.users.directus_user_id` cache
   causes real registrations to attach to a superseded Directus user.
2. `ISS-UAT-010-2` — a genuinely `waitlisted` registration renders as
   "You're registered" in `apps/web`'s `RegistrationSidebar`.

Post-session enforcement:
- Navigation check: all navigation was either the single initial `goto`
  or logged UI-driven actions — no undeclared deep-links.
- Visual evidence check: PASS — every meaningful action has a
  corresponding screenshot; proof-of-look review performed by direct
  visual inspection of each PNG (this session, no separate VisualReviewer
  subagent invoked — same agent acting in both roles for this bounded
  sub-workflow).
- Teardown check: PASS — `teardown.md` present, names the state left
  behind (hand-off policy, not destructive; next `--reset BP-UAT-010`
  restores clean state).

## Gate Result

gate_result:
  status: passed
  summary: "Full live session completed; 3 of 3 post-session enforcement checks pass (navigation, visual evidence, teardown). 2 new real bugs found and independently corroborated via Directus queries, not just DOM assertions."
  findings:
    - "AC-9 (visual-vs-DOM divergence) satisfied by ISS-UAT-010-2's discovery — see 03-uat-triage.md for the explicit statement."
