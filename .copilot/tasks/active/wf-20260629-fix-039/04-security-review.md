# Step 5 — Security Review (wf-20260629-fix-039)

**Date:** 2026-06-29
**Issue:** ISS-UAT-013-8
**Agent:** SecurityReviewer

---

## Gate Decision

```
status: passed
attempt: 1
timestamp: 2026-06-29T21:45:00Z
summary: This is a tightly scoped UAT seed-layer fix plus its corresponding
  Playwright negative test. No apps/api/ code is touched. No new endpoints,
  controllers, roles, or auth boundaries are introduced. All bash/JQ
  interactions with Directus are fully parameterised via jq --arg; no string
  concatenation in SQL. The new test fixture token is identical in shape to
  the three existing UAT tokens (deterministic, no real privilege). The new
  fourth row (`uat-onboard-no-user-token`) keeps
  `invite_missing_authentik_user` exercised end-to-end and fails closed —
  Authentik refuses the absent user. Logging scope (token_prefix only) is
  unchanged. Bats + tsc + biome checks green. Stale-row risk in
  already-seeded Directus is documented in the impact analysis; mitigation
  lives in the PR description, not in this commit.
next_action: invoke TestStrategist (Step 6)
```

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | n/a (read-only of unchanged code) | PASS-by-reference | `lookupByToken` keys on full-SHA256 `token_hash`, not on `email` / `tenant_id`. Single-tenant UAT fixture; no cross-tenant data path in the changed code. |
| INV-2 Secrets by reference | yes | PASS | New env token `uat-onboard-no-user-token` is a deterministic test fixture, same shape as the three pre-existing `uat-onboard-*-token` values. No real credential, no API key, no password is added. |
| INV-3 Auth at controller level | n/a (read-only) | PASS-by-reference | The unchanged `consumeInvite` (line 357) and `previewInvite` (line 319) sit behind the `/v1/onboard/*` controller in unchanged api code. No new controller / role. |
| INV-4 Validation at boundaries | yes | PASS | The seed body's only outbound call is `POST /items/operator_invites` via `curl … -d "$body"`. `$body` is built exclusively from `jq --arg` values; no shell-glue concatenation. |
| INV-5 No cross-schema queries | yes | PASS | Diff touches Directus only (no new Authentik call paths). |
| INV-6 Rate limiting | yes | PASS | No new public endpoints added. |
| INV-7 CSRF protection | n/a | PASS | `POST /v1/onboard/accept` is unchanged. The e2e test calls it via `page.request` (inherits the page's authed session + same-origin context), not via a forged cross-origin request. |
| INV-8 No `dangerouslySetInnerHTML` | yes | PASS | Zero occurrences in the diff. No new JSX added. |
| INV-9 No N+1 queries | n/a | PASS-by-reference | The seed writes 4 rows; each goes through one `GET token_hash` (existence check) + one `POST` on miss. |
| INV-10 Drizzle parameterization | n/a | PASS-by-reference | No changes to the api's data layer. The Directus REST payload is built via `jq --arg` only. |
| INV-11 HttpOnly tokens (web) | n/a (read-only) | PASS-by-reference | No web / web-next changes. |

---

## Findings

### BLOCKER / MAJOR / MINOR

**None** (no MAJOR/MINOR findings).

### INFO (non-blocking, educational)

- **I-1:** Sentinel-driven jq swap pattern is idiomatic and maintains AGENTS.md §1.4 (function ≤ 60 LOC). The function shrank from 63 → 56 lines in the same commit.
- **I-2:** Neg 005 correctly asserts BOTH `GET /v1/onboard/preview` (expecting 200) AND `POST /v1/onboard/accept` (expecting 409 + `invite_missing_authentik_user`). This is the lockstep API + UI assertion required by the wf-20260629-fix-038 template rule.
- **I-3:** Test fixture `ONBOARD_NO_USER_TOKEN = process.env.UAT_ONBOARD_NO_USER_TOKEN ?? 'uat-onboard-no-user-token'` falls back to a hardcoded literal. Identical pattern to the three pre-existing tokens; the env override is plumbed via `scripts/uat-env-setup.sh:474`. Both layers in lockstep.
- **I-4:** Honesty-notes header at BP-UAT-013-signup.spec.ts:57-71 was rewritten to drop the obsolete `+valid` mismatch note and replace it with a "Resolved in wf-20260629-fix-039" pointer.

### Stale-Row Risk (M-1, MINOR, documented)

Already-seeded UAT environments will still carry the old `+valid/+used/+expired` rows from prior runs. The new code does NOT retro-clean stale rows from Directus. **Mitigation:** the PR description (Step 12) must call this out with a one-line migration step. Sample text provided to the Orchestrator.

---

## Checklist Verdicts

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | Secrets in code | PASS | Only `uat-onboard-no-user-token` added — deterministic test fixture, same shape as pre-existing UAT tokens. |
| 2 | Parameterized queries only | PASS | `ensure_operator_invite` body uses `jq -nc --arg e "$email" --arg dn "$display_name" …` — every field via `--arg`. |
| 3 | Auth boundaries | PASS | `get_changed_files` shows zero files under `apps/api/` modified. |
| 4 | CSRF / state-changing from browser | PASS | Neg 005 uses `page.request.get` + `page.waitForResponse` — rides the page's authed session. |
| 5 | Rate limiting | PASS | No new endpoints. |
| 6 | Tenant isolation / `token_hash` scope | PASS-by-reference | `lookupByToken` filters by `filter[token_hash][_eq]=…`. |
| 7 | Test fixture safety | PASS | `uat-onboard-no-user-token` fails closed — no matching Authentik user, even if api guards removed. |
| 8 | Logging | PASS | No new log stmt that might leak email/token/password. |
| 9 | Idempotency on re-seed | PASS | Guard at `scripts/uat-seed.sh:281-289` is unchanged structurally. |
| 10 | Stale-row risk | PASS-with-doc | Mitigation lives in PR description, not in code. |

---

## Recommendations (non-blocking)

1. **Step 12 (PR description)** must include a "How to apply this fix" paragraph instructing UAT operators to `DELETE FROM operator_invites WHERE token_prefix LIKE 'uat-onboard%'` before re-running `pnpm uat:seed`. Single source of truth — the PR description, not a shell comment.
2. **Neg 005 (optional):** Add `expect(previewBody).not.toHaveProperty('token_hash')` as defence-in-depth. Non-blocking.
3. **OperatorInviteSeedContract (optional, future work):** Document the "all four rows are static test fixtures, never used in production" contract under `docs/04-development/testing/`. Out of scope for this PR.

---

## Links

- [handoff.yaml](handoff.yaml)
- [03-code-summary.md](03-code-summary.md)
- [02-impact-analysis.md](02-impact-analysis.md)
- [01-issue-lookup.md](01-issue-lookup.md)
- [ISS-UAT-013-8.md](../../../issues/ISS-UAT-013-8.md)
- [scripts/uat-seed.sh](../../../scripts/uat-seed.sh)
- [scripts/uat-env-setup.sh](../../../scripts/uat-env-setup.sh)
- [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats)
- [apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts](../../../apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts)
- [docs/02-business-processes/uat/BP-UAT-013.md](../../../docs/02-business-processes/uat/BP-UAT-013.md)
- [apps/api/src/modules/admin-invites/admin-invites.service.ts](../../../apps/api/src/modules/admin-invites/admin-invites.service.ts) (read-only, unchanged)