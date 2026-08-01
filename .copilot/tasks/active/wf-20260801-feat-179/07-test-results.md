# 07 — Test Results: FR-AUTH-004 (Magic-link authentication)

Executed directly by the Orchestrator (terminal access), per
`.copilot/agents/test-runner.md`'s execution order, against the real
local infrastructure — Authentik, Mailpit, Postgres, Directus, and the
API were already running and pre-flight-confirmed healthy at workflow
start; `apps/web-next` was brought up fresh for this step (see
Infrastructure Pre-Flight below).

## Infrastructure Pre-Flight

```
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep aiqadam
```
All required containers already `Up ... (healthy)`:
`aiqadam-authentik-server`, `aiqadam-authentik-worker`, `aiqadam-postgres`,
`aiqadam-directus`, `aiqadam-mailpit`, `aiqadam-redis`, plus others
unrelated to this FR.

Pre-flight curl (all 200 before proceeding):
- `http://localhost:9000/if/flow/default-authentication-flow/` → 200 (Authentik)
- `http://localhost:8025` → 200 (Mailpit)
- `http://localhost:3000/health` → 200 (API, already running)
- `http://localhost:4322` → 200 (web-next — brought up fresh this step;
  `astro dev` auto-selected 4322 since 4321 was free but the project's
  own `astro.config.mjs` pins `server.port: 4322` by design, see that
  file's own comment: "Port 4322 (web-next) avoids collision with
  apps/web's 4321")

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit (`apps/api` vitest, full repo suite) | 1497 | 1496 | 1 (pre-existing, unrelated) | 0 |
| Unit (this workflow's 4 new/modified files, isolated run) | 45 | 45 | 0 | 0 |
| Integration (controller-level, mocked collaborators — this repo's convention for non-DB-touching AuthModule routes, confirmed by TestDesigner's research into `telegram-auth-controller.spec.ts`) | included in the 45 above | — | — | — |
| E2E (Playwright, `magic-link-form-submission.spec.ts`, both projects) | 2 | 2 | 0 | 0 |

## Type Check

`pnpm --filter api typecheck` → clean, 0 errors.
`pnpm --filter web-next typecheck` (`astro check`) → 0 errors, 0 warnings, 43 pre-existing hints in files untouched by this workflow.

## Lint / Format Check

`pnpm biome check .` (apps/api) → "Checked 316 files in 98ms. No fixes applied." Clean.
Biome was already run with `--write` during each commit's pre-commit hook (`lint-staged`) throughout this workflow — no dirty files at any commit.

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| `updates email + displayName + lastLoginAt for an existing subject (no duplicate row)` | `apps/api/test/users.spec.ts` | `AssertionError: expected <ts1> to be greater than <ts2>` — a clock-resolution race in a `Date.now()`-based monotonicity assertion | **Pre-existing, confirmed independently** — reproduced identically on a `git stash`-clean tree (i.e. with none of this workflow's changes applied), file is untouched by this workflow's diff. This exact flake is documented repeatedly across prior workflow history in `.copilot/context/workspace-state.md` (e.g. `wf-20260801-feat-177`, `wf-20260801-feat-176`, `wf-20260731-feat-174`, and many earlier ones) as an already-known, already-tracked timing flake unrelated to any single feature. Not a code-bug introduced here; no action taken. |

One additional test file (`telegram-admin-status-service.spec.ts`) has a documented sibling clock-flake in the same history but did NOT fail on this run's execution (timing-dependent, intermittent) — noted for completeness, not counted as a failure since it passed.

## Flaky Tests

None newly introduced by this workflow. The one environment-level flake
hit during E2E investigation (see below) was diagnosed and resolved, not
worked around.

### Investigation note: initial Playwright E2E failures were an environment issue, not a code or test-authoring bug

On first run, both `magic-link-form-submission.spec.ts` projects
(chromium-desktop, chromium-mobile) failed with
`page.waitForResponse: Test timeout of 30000ms exceeded` waiting for
`POST /api/v1/auth/magic-link`. Root-caused via a standalone debug script
with full console/network tracing (not just re-running blindly): the
React island never hydrated —
`[astro-island] Error hydrating /src/blocks/customer/index.ts TypeError:
Failed to fetch dynamically imported module`, preceded by several
`504 Outdated Optimize Dep` responses on Vite-bundled dependency chunks
(`lucide-react.js`, `@tanstack/react-query.js`, `clsx.js`,
`tailwind-merge.js`, `class-variance-authority.js`, two `@radix-ui/*`
chunks). This is Vite's dev-server dependency-optimization cache going
stale relative to the currently-running module graph — a known class of
Vite dev-server issue, unrelated to `MagicLinkForm.tsx`'s own code (the
submit button was correctly still `disabled` because `phase` state was
never reachable — the component literally never finished loading client-
side). Confirmed the fix, not just guessed: stopped the dev server
(`astro dev stop`), deleted `apps/web-next/node_modules/.vite` (the stale
optimize-dep cache directory), restarted the dev server fresh (forces
Vite to re-run its dependency pre-bundling step), and re-ran — both
projects passed cleanly on the very next attempt, no retries needed
(3.6s each). This is a local dev-loop restart with zero revert cost per
AGENTS.md §16's own worked example ("a local dev process I didn't
start is running stale code — should I rebuild and restart it?" is
explicitly listed as a case that should NOT require asking) — handled
directly rather than pausing.

## Coverage

Not separately measured via `--coverage` for this step (the existing
1496/1497-passing full-suite run plus the 45 new/modified tests already
demonstrate the required happy-path + all distinct failure-path coverage
per `06-test-design.md`'s own Self-Check — 18 tests for
`MagicLinkService.requestMagicLink()`'s 7 branches, 8 controller tests
including the anti-enumeration regression, 2 `AuthentikClient` tests, 2
`callback()` funnel-regression tests). No new business logic is left
untested — `06-test-design.md`'s own Acceptance Criteria Coverage table
already maps every AC to either an automated test or an explicitly-scoped
live-UAT-only item.

## CRITICAL FINDING — live end-to-end verification surfaced a real bug not caught by any mocked test

Per AGENTS.md §6.1 ("no deferred tests" — a magic-link mechanism that has
never been proven to actually deliver and complete a working link is not
done), the Orchestrator went beyond this step's mocked/unit/integration
coverage and performed a real live request against the running local
Authentik instance:

1. Restarted the local API dev server in watch mode (the previously-running
   process on port 3000 was a stale `node dist/main.js` predating this
   workflow's code changes — confirmed via `Get-Process`/`StartTime`,
   restarted per AGENTS.md §16's zero-revert-cost dev-loop-restart rule).
2. `POST http://localhost:3000/v1/auth/magic-link` with a real test email
   → `{"ok":true}`, HTTP 200, as designed.
3. Queried Mailpit's real API (`GET /api/v1/search?query=to:<email>`) →
   the email arrived within seconds, correct branded subject ("Sign in to
   AI Qadam").
4. **Read the actual email body** (not just confirmed delivery) —
   **the link inside points to `/if/flow/default-recovery-flow/`, NOT
   `magic-link-login`**, and the body copy is the generic Authentik
   password-reset template ("You recently requested to change your
   password for your authentik account...").

**Root cause, confirmed by reading Authentik's own server source directly**
(`docker exec aiqadam-authentik-server`, `authentik/core/api/users.py`):
`recovery_email()`'s only use of the passed `email_stage` UUID is to
source the email's **subject and template** — the link itself is always
built by `_create_recovery_link()`, which is **hardcoded to
`brand.flow_recovery`** with no flow parameter anywhere in the call
chain. `02b-authentik-spike-findings.md`'s conclusion (based on reading
the OpenAPI schema's I/O shape alone, never a live send-and-inspect) was
**incomplete** — the endpoint's shape looked like a per-stage-scoped
send, but its actual server-side behavior is "send using this stage's
copy, but always link into the Brand's global recovery flow." This is
exactly the kind of gap AGENTS.md §6.1's live-verification requirement
exists to catch — a schema/shape read is not the same as watching the
real artifact (the email) arrive and inspecting its real content.

**A real, supported fix exists** (also confirmed by reading Authentik's
source, `authentik/brands/middleware.py` + `authentik/brands/utils.py`):
`Brand` resolution is **per-request `Host` header** (`get_brand_for_request()`
matches `request.get_host()` against `Brand.domain` via `iendswith`, not
a single global singleton) — so a **second, purpose-built `Brand`** with
its own `domain` and its own `flow_recovery` bound to `magic-link-login`
lets `AuthentikClient.sendMagicLinkEmail()` reach the correct flow by
sending the request with a distinct `Host:` header matching that second
Brand's domain, while the existing default Brand's `flow_recovery`
stays bound to `default-recovery-flow`, completely unaffected — the
mechanism the existing `provision-authentik-recovery-flow.sh` already
proves out for the default Brand, just applied to a second one.

**This is a `failed-retry-code` finding** — the code (provisioning
script + `AuthentikClient.sendMagicLinkEmail()`'s request shape) needs a
real change, not a test-authoring fix. Routed back to CodeDeveloper (see
Gate Result below) rather than silently patched by the Orchestrator,
since it changes both the provisioning script's design and the
`AuthentikClient` request shape — implementation-layer work, not
infrastructure pre-flight.

Test artifacts (the one live-created Authentik user) were cleaned up
immediately after diagnosis (`DELETE /api/v3/core/users/{pk}/` → 204,
confirmed).

## Gate Result

```yaml
gate_result:
  status: failed-retry-code
  summary: "Type-check, lint, unit (1496/1497, 1 pre-existing unrelated flake), and E2E (2/2, after fixing an unrelated stale-Vite-cache environment issue) all pass. HOWEVER, a live end-to-end verification (request magic link -> inspect real Mailpit email content, not just delivery) surfaced a genuine bug no mocked test could catch: the email's link points to default-recovery-flow, not magic-link-login, and uses the generic password-reset template copy -- confirmed by reading Authentik's own server source (recovery_email()'s email_stage param only controls subject/template, never the link's target flow, which is unconditionally brand.flow_recovery). A real fix exists using Authentik's per-request-Host brand resolution (a second Brand with its own domain + flow_recovery=magic-link-login) -- routed back to CodeDeveloper as a code/config change, not silently patched here."
  findings:
    - "1 pre-existing test failure (users.spec.ts clock-race), confirmed independently reproducible on an unmodified tree via git stash -- not caused by this workflow, no action taken."
    - "Initial E2E failures were a stale Vite optimize-dep cache in the local web-next dev server, not a MagicLinkForm.tsx or endpoint bug -- diagnosed and fixed, confirmed resolved."
    - "CRITICAL: live-verified magic-link email's link targets default-recovery-flow (wrong flow) with password-reset copy (wrong template) -- root-caused to Authentik's recovery_email endpoint being cosmetic-only for the email_stage parameter (subject/template only), with the link always sourced from Brand.flow_recovery regardless of which email_stage UUID is passed. Confirmed by reading authentik/core/api/users.py directly inside the running container, not inferred."
    - "Real fix identified and confirmed via source read: Brand resolution is per-request Host header (authentik/brands/middleware.py + utils.py), so a second Brand object with its own domain and its own flow_recovery=magic-link-login lets AuthentikClient.sendMagicLinkEmail() reach the correct flow by setting a distinct Host header on the outbound request, without disturbing the existing default Brand's recovery-flow binding used by password-reset."
    - "retry_target: code-developer -- provisioning script (scripts/provision-authentik-magic-link-flow.sh) needs a second-Brand provisioning step; AuthentikClient.sendMagicLinkEmail() needs to send the request with a Host header matching that Brand's domain (or an equivalent mechanism CodeDeveloper determines after re-reading this finding); 02b-authentik-spike-findings.md should be corrected/superseded to prevent this gap recurring in a future workflow."
```

## SECOND retry finding — CodeDeveloper's Brand/Host-header fix was necessary but not sufficient; a real click-through test found the flow topology itself is wrong

CodeDeveloper's retry (see `03-code-summary.md`'s "Step 8 Retry" section)
correctly fixed the wrong-flow-target bug: the Orchestrator independently
re-verified this by reading the real email link (`http://magic-
link.aiqadam.internal/if/flow/magic-link-login/?flow_token=...` —
confirmed target is `magic-link-login`, not `default-recovery-flow`).
**However, the Orchestrator went one step further than "does the link
target the right flow" and actually clicked the link end-to-end via a
live Playwright session** — the exact "click it and see if a session
gets issued" proof AC-4/AC-2 require, which neither the original spike
nor this retry had yet performed. This surfaced a SECOND, deeper bug:

**Symptom:** clicking a fresh, never-used magic-link URL does NOT issue
a session in one hop. It lands on `ak-stage-identification` (asking the
user to re-enter their email), and submitting that advances to
`ak-stage-email` ("check your inbox") — triggering a **second** email
send, confirmed by observing two distinct Mailpit messages for the same
test address. This is not a magic-link UX at all; it's "enter email,
then check email again for a second link."

**Root cause, confirmed by reading Authentik's flow-executor source**
(`authentik/flows/views/executor.py`'s `_check_flow_token()` /
`dispatch()`): a `FlowToken`'s pickled `FlowPlan` is built ONCE, in full,
at `_create_recovery_link()` time, covering the flow's ENTIRE stage list
from the start. Clicking the emailed link restores that plan and resumes
it from its first stage — which, in the originally-provisioned topology,
was the Identification stage (order 10), not the `UserLoginStage`
(order 30). The token does not mean "you already verified this address";
it means "resume this specific pre-planned run of the whole flow from
the top."

**The fix, empirically verified by the Orchestrator (not just designed
on paper):** the `magic-link-login` flow's own stage-binding list must
contain **ONLY the `UserLoginStage`** — no Identification stage, no
Email stage bound into the flow itself. (The Identification/Email stage
*objects* still need to exist and remain resolvable-by-name for
`recovery_email`'s `email_stage` query param to reference, and for the
provisioning script's existing idempotent-create logic — they are just
no longer BOUND into the flow's own plan.) `PLAN_CONTEXT_PENDING_USER`
is already set on the token's plan at `_create_recovery_link()` time
(from `for_user` in `recovery_email()`), so `UserLoginStage` (which only
needs that context key) can act immediately with no re-identification
step.

Verified live by the Orchestrator via direct Authentik admin-API calls
(temporarily unbinding the order-10/order-20 stage bindings from the
live `magic-link-login` flow instance — pks recorded, fully reversible)
followed by a real Playwright click-through:

```
Before fix: click -> ak-stage-identification -> submit -> ak-stage-email (2nd email sent!) -> never authenticated
After fix:  click -> component: xak-flow-redirect, to: "/"  -> GET /api/v3/core/users/me/ -> 200, correct user, session cookies set
Reuse of the same (now-consumed) token: ak-stage-access-denied, /me -> 403 (AC-2 still holds under the new topology)
```

Both test users created during this investigation were cleaned up
(`DELETE /api/v3/core/users/{pk}/` -> 204, confirmed for each).

**This is a second `failed-retry-code` finding**, on top of (not
replacing) the first. The live Authentik instance currently has the
order-10/order-20 bindings REMOVED (this was necessary to prove the
hypothesis) — CodeDeveloper must make this change durable in
`scripts/provision-authentik-magic-link-flow.sh` (the script currently
still contains the `ensure_flow_stage_binding ... 10` / `... 20` calls
that created the wrong topology in the first place; these must be
removed, not left creating bindings the flow shouldn't have) and confirm
the script remains idempotent against the CURRENT (already-corrected)
live state.

### Gate Result (second retry)

```yaml
gate_result:
  status: failed-retry-code
  summary: "CodeDeveloper's Brand/Host-header fix correctly resolved the FIRST bug (wrong flow target) -- independently re-verified. A live Playwright click-through (not just reading the email link) then surfaced a SECOND, deeper bug: the flow's own stage topology (Identification+Email+UserLogin bound in sequence) means a FlowToken always resumes from stage 1, re-triggering identification and a second email send rather than issuing a session in one click. Root-caused via Authentik's flow-executor source (FlowToken restores the WHOLE pre-planned stage list from the top, not a mid-plan position) and empirically fixed by removing the Identification/Email stage BINDINGS from the flow (keeping the stage objects, since recovery_email's email_stage param still needs to reference the Email stage by UUID) -- leaving ONLY UserLoginStage in the flow's own plan. Verified live end-to-end: single click -> xak-flow-redirect -> authenticated session (GET /me -> 200, correct user) -> reuse of the same token correctly denied (403, AC-2 intact)."
  findings:
    - "Live Authentik state currently reflects the FIX (order-10/order-20 bindings removed from magic-link-login flow, pks 5cf995f2-03f3-4ad5-abd1-8046dd383e05 / 1a151190-939b-4ff3-b17a-8a3a60da8dc9 -- recorded here in case a revert is ever needed, though the fix is confirmed correct and should be made durable in code, not reverted)."
    - "scripts/provision-authentik-magic-link-flow.sh MUST be updated to stop binding the Identification/Email stages into the flow (remove the order-10/order-20 ensure_flow_stage_binding calls) while KEEPING the ensure_identification_stage/ensure_email_stage calls that create/resolve the stage OBJECTS -- recovery_email's email_stage query param still needs a real Email stage UUID to reference, it just must not be part of the flow's own bound sequence."
    - "AC-2 (single-use) re-confirmed holding under the corrected topology -- a consumed token shows ak-stage-access-denied and /me returns 403, not a regression from this fix."
    - "retry_target: code-developer -- make the flow-topology fix durable in the provisioning script; re-run it live to confirm idempotency against the already-corrected live state; update 03-code-summary.md's Step 8 Retry section (or add a new section) documenting this second finding and fix; update any code comments describing the flow's stage sequence that still describe the old (wrong) 4-stage-including-Identification-and-Email topology."
```
