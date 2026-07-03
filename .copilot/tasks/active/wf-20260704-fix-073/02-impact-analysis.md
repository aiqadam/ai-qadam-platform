# Step 2 — Impact Analysis

**Workflow:** wf-20260704-fix-073
**Issue:** ISS-UAT-009-1
**Date:** 2026-07-04

## Validated Requirement

ISS-UAT-009-1 — Sign-out lands on Authentik's RP-Initiated Logout confirmation
interstitial instead of auto-redirecting to `/auth/signed-out`, despite a
valid `id_token_hint`.

**Resolution path chosen: Path B** — Accept the Authentik confirmation
interstitial as the expected UX (matches the architectural trade-off made on
2026-05-23 when PR #234 shipped the `end_session_endpoint` integration) and
update the misleading comment + BP-UAT-009 Step 004 expected state + AC-7
wording to reflect reality.

## Affected Layers

| Layer | Change? | Details |
|---|---|---|
| API (NestJS) | No runtime change | Code comment in `apps/api/src/modules/auth/auth.service.ts` `buildLogoutUrl()` lines 175–213 only — no logic change. The URL construction logic is correct per spec and per the existing `auth-logout-url.spec.ts` regression tests. |
| DB | No | No schema change. |
| Shared Types | No | No new Zod schemas; no DTO changes. |
| Frontend (`apps/web-next`) | No runtime change | The client `signOut()` already navigates to `logoutUrl` returned by the API; the landing page (interstitial vs `/auth/signed-out`) is determined by Authentik, not by the client. No client code change needed. |
| Bot | No | Not in scope. |
| Workers | No | Not in scope. |
| Documentation | **Yes** | (1) `docs/02-business-processes/uat/BP-UAT-009.md` — Step 004 expected state + AC-7 wording. (2) `docs/04-development/architecture/auth-architecture.md` §5.3.7 — stale "We don't today" sentence now contradicts PR #234. (3) `apps/api/src/modules/auth/auth.service.ts` `buildLogoutUrl()` comment block — replace "MAY skip" (aspirational) with accurate description of Authentik 2024.x default behaviour. |
| Tests | **Yes** | One regression test to be added in `apps/api/test/auth-logout-url.spec.ts` (unit) asserting the comment/doc change is consistent with the URL construction. **The BP-UAT-009 Step 004 Playwright spec already exists** (`apps/e2e/tests/uat/BP-UAT-009.spec.ts`) and will be the live verification of the spec update. |

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| _(none)_ | — | No endpoint contract change. | — |

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| _(none)_ | — | No service call changes. |

## Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| Comment edit could be reverted by future PR | Low | Add regression test pinning the comment text via a doc-coverage grep test. |
| Spec change widens acceptance — could mask real regressions | Low | Add explicit visual-rev sentinel: AC-7 must still require **AI Qadam-branded** signed-out UX **after** the user clicks "Log out of authentik" (i.e., the interstitial is the IdP confirmation; the platform's own `/auth/signed-out` page still renders post-confirmation). |
| Live re-run of BP-UAT-009 Step 004 requires full stack (api + web-next + Authentik + Mailpit) | Medium | Per AGENTS.md §6.1, the Orchestrator MUST run pre-flight (`docker compose up -d` + `curl` per service) before declaring the test "deferred" — see `.copilot/agents/orchestrator.md §Infrastructure Pre-Flight`. |

### Security Review Required?

**No.** This is a documentation-only change. No code path that handles secrets,
tokens, cookies, auth, or tenant scoping is modified. The existing
`apps/api/test/auth-logout-url.spec.ts` already covers the URL construction
invariant that matters for security (id_token_hint always passed when available,
post_logout_redirect_uri dropped when no hint per OIDC RP-Initiated Logout 1.0 §3).

## Test Scope

| Level | What | Where |
|---|---|---|
| Unit | Doc-coverage regression: assert `auth.service.ts` `buildLogoutUrl` comment block no longer asserts "MAY skip" as a guarantee | `apps/api/test/auth-logout-url.spec.ts` (extend existing file) |
| E2E (Playwright, live) | Re-run BP-UAT-009 Step 004 against live stack to confirm the updated expected state is met | `apps/e2e/tests/uat/BP-UAT-009.spec.ts` (already exists, just re-run) |

No new integration tests, no new unit suites beyond the doc-coverage assertion,
no DB-touching tests.

## Architectural Alignment

- Module boundaries: unaffected.
- Cross-schema queries: unaffected.
- Approved stack: unaffected.
- No new dependencies.

## Gate Result

gate_result:
  status: passed
  summary: "Documentation-only fix; no code path, DB, or API contract changes. Affected files: 1 comment block, 1 spec doc, 1 architecture doc, 1 regression test."
  findings:
    - "Authentik invalidation flow is built-in `default-provider-invalidation-flow` (PK in bootstrap-oidc.sh); no IaC-managed custom flow exists for this"
    - "Architecture doc §5.3.7 contradicts current code (it says 'we don't today' but PR #234 ships end_session)"
    - "Live UAT re-run requires full stack; Orchestrator pre-flight per AGENTS.md §6.1"