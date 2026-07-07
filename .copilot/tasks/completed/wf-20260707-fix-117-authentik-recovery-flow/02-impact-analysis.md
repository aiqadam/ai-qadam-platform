# 02 — Impact Analysis — ISS-USR-PWRESET-001 (Path A: Authentik Recovery Flow)

**Workflow:** wf-20260707-fix-117-authentik-recovery-flow
**Agent:** ImpactAnalyzer (subagent produced full report; Orchestrator persisted to file because subagent sandbox lacked `write_file`)
**Date:** 2026-07-07

## Validated requirement

**ISS-USR-PWRESET-001** — Thin wiring of Authentik's built-in Recovery Flow (Path A, user-selected 2026-07-07). Five workstreams:

1. Enable Recovery Flow in IdP (Authentik).
2. Brand the recovery-email template (`"Reset your AI Qadam password"` per `ux-and-content-guidelines.md:1251`).
3. Expose "Forgot password?" link to members.
4. End-to-end verify against a seeded identity (`uat-member@example.com`).
5. Ship a `BP-USR-PWRESET` doc + Playwright spec.

## ⚠ Critical correction to the issue text (surfaced before CodeDeveloper)

The issue I wrote earlier says "Add a 'Forgot password?' link from `apps/web/src/pages/auth/sign-in.astro`". But:

- `apps/web/src/pages/auth/sign-in.astro:1-14` is a **redirect-only page** — no rendered UI, it issues a 302 to `/api/v1/auth/login`.
- `apps/web-next/src/pages/auth/sign-in.astro:1-19` — same.

There is no HTML surface here to attach a link to. The actual user-visible sign-in surface is **Authentik's own login form** at `${AUTHENTIK_URL}/if/flow/default-authentication-flow/`. When a Recovery Flow is **bound to the brand** (via `Brand.flow_recovery`), Authentik renders a "Forgot password?" link **automatically** on that form.

So the "Add a link" AC is satisfied by binding the flow on the Authentik side, **not** by editing either Astro sign-in page. **CodeDeveloper must NOT edit `sign-in.astro`** — the file is redirect-only and the visible UI lives in the IdP.

Orchestrator will surface this to the user as a Concern before CodeDeveloper starts.

## Affected files (exact paths)

| # | File | Action | Reason |
|---|---|---|---|
| 1 | `scripts/provision-authentik-recovery-flow.sh` | **CREATE** | New idempotent provisioning script (pattern: mirror `scripts/provision-authentik-rbac-groups.sh`). Reads `AK_API_TOKEN`, `AUTHENTIK_URL` from env. Resolves brand UUID + recovery-flow UUID via API calls, then `PATCH /api/v3/core/brands/<brand-uuid>/` with `{ "flow_recovery": "<flow-uuid>" }` and updates the `default-email-recovery` template subject to `"Reset your AI Qadam password"`. |
| 2 | `scripts/uat-env-setup.sh` | **MODIFY** | After STEP 7 (RBAC groups, lines ~432-460), invoke the new provision script so UAT stacks come up with recovery flow enabled. |
| 3 | `apps/api/.env.example` | **MODIFY** | Document the new script's env-var contract (no API-process change — env vars are read by the shell script, not NestJS). Lines 84-91 of the existing file. |
| 4 | `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` | **CREATE** | New Playwright spec (pattern: `apps/e2e/tests/uat/BP-UAT-009.spec.ts`). Covers AC-1 (flow resolves at `/if/flow/recovery/`), AC-3 (happy path: uat-member submits email → Mailpit receives → follow link → set password → sign in), AC-4 (negative: unknown email → neutral copy), AC-5 regression assertion. |
| 5 | `docs/02-business-processes/operations/member-password-reset.md` | **CREATE** | DocWriter deliverable. Member-facing runbook for "how to recover your password". |
| 6 | `docs/02-business-processes/uat/BP-USR-PWRESET.md` | **CREATE** | DocWriter deliverable. Process doc referenced by the Playwright spec frontmatter (`process_ref:`). Mirror `BP-UAT-009.md` structure (frontmatter + Steps). |
| 7 | `docs/04-development/architecture/auth-architecture.md` | **MODIFY** | §6.6 (lines 332-339) — promote the recovery-flow bullet from "TODO/intent" to "Wired via `scripts/provision-authentik-recovery-flow.sh`. See `BP-USR-PWRESET.md`." DocWriter's job. |

**Files explicitly NOT to change:**
- `apps/web/src/pages/auth/sign-in.astro` — redirect-only, no UI.
- `apps/web-next/src/pages/auth/sign-in.astro` — same.
- `apps/api/src/modules/auth/*` — no API change. Authentik owns the recovery flow UI; we don't proxy it.
- `apps/api/src/config/env.ts` — no new env var in the API process.
- Drizzle schemas — no DB change.

## Authentik API specifics (CodeDeveloper cite these exactly)

| Concern | Endpoint | Body | Notes |
|---|---|---|---|
| Resolve default brand UUID | `GET /api/v3/core/brands/?default=true` | — | Returns `{ results: [{ pk: "<uuid>", ... }] }`. |
| Resolve default Recovery Flow UUID | `GET /api/v3/flows/instances/?slug=default-recovery-flow` | — | Returns `{ results: [{ pk: "<uuid>", ... }] }`. The flow **already exists**; it ships disabled-by-binding. |
| Bind recovery flow to brand | `PATCH /api/v3/core/brands/<brand-uuid>/` | `{ "flow_recovery": "<flow-uuid>" }` | This is what actually **enables** the flow for end-users. |
| Locate recovery email template | `GET /api/v3/core/email-templates/?name=default-email-recovery` | — | Returns `{ results: [{ pk: "<uuid>", subject: "Password Recovery", ... }] }`. |
| Brand the email subject | `PATCH /api/v3/core/email-templates/<template-uuid>/` | `{ "subject": "Reset your AI Qadam password" }` | Matches copy in `docs/04-development/design-system/ux-and-content-guidelines.md:1251`. |
| Verify local UAT | `curl -fsS http://localhost:9000/if/flow/recovery/` | — | Should return 200 (HTML page) — not 404 — once bound. This is the AC-1 assertion. |

**Pattern reference:** `scripts/provision-authentik-rbac-groups.sh:50-97` (the `ak_post` / `ak_patch` helpers + the `group_pk_by_name` shape — copy verbatim). Use the **same `superuser_full_list=true&page_size=200` jq-match-in-process idiom** when querying brands and templates (the `?name=` filter on those endpoints has the same Authentik bug as `/core/groups/?name=` per `scripts/provision-storybook-authentik.sh:80-83`).

## Env var contract

The new provision script reads:
- `AK_API_TOKEN` (or `AK_TOKEN_PATH=/tmp/aiqadam-secrets-AK_API_TOKEN`) — matches every other `provision-*-authentik.sh`.
- `AUTHENTIK_URL` — defaults to `https://auth.aiqadam.org` (prod) but is overridden to `http://localhost:9000` by `scripts/uat-env-setup.sh` per line 442.

`AUTHENTIK_BRAND_UUID` is **not required** as input — it is resolved on first run via `GET /api/v3/core/brands/?default=true` and cached to `/tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID` (same shape as the existing `EMBEDDED_OUTPOST_PK` cache in `provision-web-next-authentik.sh:34`).

## Sign-in link: where the visible UI lives

There is no Authentik-URL env var exposed to the browser today. `grep` for `import.meta.env.PUBLIC_AUTHENTIK_URL` across `apps/web/src/**/*.astro` and `apps/web-next/src/**/*.astro` returns **0 matches**. The current sign-in flow goes through the API (`/api/v1/auth/login`) which reads `OIDC_ISSUER_URL` server-side (`apps/api/src/config/env.ts:28`). The browser never needs to know the Authentik hostname.

**However**, Authentik's login UI (after the redirect from `/api/v1/auth/login`) is where the "Forgot password?" link surfaces, and that URL is on `${AUTHENTIK_URL}/if/flow/default-authentication-flow/`. **No browser-side code change is needed** for the link to appear — it is rendered by Authentik itself once the brand has `flow_recovery` bound.

If the issue's author later wants a "Forgot password?" link visible **before** the user is redirected to Authentik (e.g. on a separate landing page), that would require a new public env var (`PUBLIC_AUTHENTIK_URL`) + a new Astro page. **That is out of scope for Path A** — flag as a deferred follow-up in the issue's Resolution section.

## apps/api: zero changes

The API never handles passwords directly — that's the entire point of OIDC redirect per `auth-architecture.md §2`. Recovery is owned by the IdP. The only API surface arguably affected (`POST /v1/auth/forgot` or similar) is **not needed** for Path A — Authentik's `/if/flow/recovery/` form POSTs directly to itself.

## apps/web-next: zero changes

Same reasoning as apps/web. The sign-in.astro is redirect-only; the link is rendered by Authentik's login UI once bound.

## Tests

| Test surface | Path | What to add |
|---|---|---|
| Playwright (UAT) | `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` (new) | Mirror `BP-UAT-009.spec.ts` structure. 4 tests minimum: (1) `/if/flow/recovery/` returns 200 HTML, (2) submit `uat-member@example.com` → 302 to "check your email", (3) read reset email from Mailpit `http://localhost:8025/api/v1/search?query=to:uat-member@example.com`, follow link, set new password, sign in with new password (4) submit unknown email → neutral copy returned. |
| bats (CI smoke) | `scripts/tests/bp-uat-template-rule.bats` (existing) | No change — the new Playwright spec already follows the `BP-*.spec.ts` convention. |
| Drizzle / Testcontainers | n/a | No DB change, no new module. |

## DB migration

**None.** This is 100% IdP config + a UI link that's actually rendered by Authentik itself. No Drizzle schema, no `pnpm db:generate`, no migration SQL.

## Blast radius + risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Brand API call rejects the recovery flow UUID because it's already bound somewhere | Low | Idempotent: skip if `Brand.flow_recovery == recovery_flow_uuid`. |
| Email-template PATCH breaks Authentik's default template (replaces Jinja body too) | Low | Use `PATCH` not `PUT` — Authentik respects partial updates; only `subject` is sent. |
| Provision script runs before RBAC groups and the brand has no users yet | None | Brands are independent of users; binding `flow_recovery` has no user prerequisite. |
| BP-USR-PWRESET.md doc is created before the provision script lands, leaving the UAT doc referencing behaviour the env doesn't have | Medium | DocWriter must depend on CodeDeveloper's PR. Orchestrator must sequence: provision script → Playwright spec → BP-USR-PWRESET.md. |
| New script's `AK_API_TOKEN` resolution runs against prod accidentally | Low | Guard with `${AUTHENTIK_URL}` host check — fail loudly if not `localhost` or `auth.aiqadam.org`. |
| 5-file PR limit (AGENTS.md §4) violated | Possible | Counted files: 1 new script + 1 modified env-setup.sh + 1 modified .env.example = 3. New Playwright spec is test (excepted). BP-USR-PWRESET.md is DocWriter (separate PR). Within limits. |

## Open questions for Orchestrator before CodeDeveloper starts

1. **Where does the "Forgot password?" link live?** Confirm with user that Authentik's auto-rendered link (after binding `flow_recovery`) is acceptable, vs. adding a separate Astro landing page first. Issue text says `sign-in.astro` but that file has no UI — the link has to be on Authentik's side.
2. **Post-reset redirect target?** User said in handoff: "Authentik default redirect to `/me` is acceptable for v1". Confirm this is Authentik's default behaviour, or whether we need to override `flow_recovery`'s `denied_action` / `post-recovery-redirect`.
3. **Should `/me/profile`'s "Change password" link be wired in this same PR?** `auth-architecture.md §6.6` says yes. Currently neither exists. Path A scope is "forgot" only; password-while-signed-in is technically a separate AC. Recommend defer to a follow-up issue and note in this PR's Resolution.

## Sequencing (Orchestrator records for Step 4)

1. **Step 4 — CodeDeveloper:** provision script + env-setup hook + .env.example update.
2. **Step 6 — TestStrategist:** plan the new Playwright spec.
3. **Step 7 — TestDesigner:** write the Playwright spec.
4. **Step 8 — TestRunner:** bring infra up (per AGENTS.md §6.1), then execute the new spec against the local stack.
5. **Step 10 — DocWriter:** BP-USR-PWRESET.md + member-password-reset.md + auth-architecture.md §6.6 promotion.
6. **Step 11 — QualityGate** → Step 12 PR → Step 12.5 auto-merge (per user CI opt-out).

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "Path A is well-bounded: 1 new provision script + 1 env-setup hook + 1 env.example doc + 1 Playwright spec + 2 DocWriter deliverables; no API/DB/UI changes; Authentik renders the link itself once flow_recovery is bound."
  findings:
    - "Critical: apps/web and apps/web-next sign-in.astro are redirect-only — the 'Forgot password?' link the issue mentions will NOT appear in either Astro page; it is rendered by Authentik's own login UI once Brand.flow_recovery is bound. Orchestrator MUST surface this to the user before CodeDeveloper starts (Open question #1)."
    - "Authentik API: PATCH /api/v3/core/brands/<uuid>/ with {flow_recovery: <uuid>} enables the flow; PATCH /api/v3/core/email-templates/<uuid>/ with {subject: 'Reset your AI Qadam password'} brands the email."
    - "No DB migration. No apps/api change. No shared-types change."
    - "5-file PR limit satisfied: 3 code files modified/created, 1 test file (excepted), 2 DocWriter files (separate PR)."
    - "Recommended sequencing: CodeDeveloper (script + env-setup hook + .env.example) → TestRunner (Playwright spec) → DocWriter (BP-USR-PWRESET.md + auth-architecture.md §6.6 promotion)."
```