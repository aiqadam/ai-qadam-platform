# Step 6 — Security Review

**Workflow:** wf-20260705-fix-101-bp-uat-013-seed-reset
**Agent:** SecurityReviewer
**Date:** 2026-07-05
**Issue:** ISS-UAT-013-14

---

## Invariants checked

| Invariant | Verdict | Reasoning |
|---|---|---|
| **Tenant isolation** | **N/A** | The change is in `scripts/uat-seed.sh` (UAT-environment seed layer). Tenant data is not produced or read. The `operator_invites` table is a singleton-per-tenant UAT fixture; this fix simply adds two derived columns to the POST that were already required by Directus's NOT-NULL constraint. |
| **Auth at controller level** | **N/A** | No API controller is touched. The change is bash-side. |
| **Zod validation at boundaries** | **N/A** | No HTTP boundary. The bash `jq` reads `.token_plain // empty` from a known manifest file (`scripts/uat-fixtures/<bp-uat>.json`) under the repo's git-tracked fixture directory. There is no external input boundary — the manifest is a build-time artifact. |
| **No secrets in code** | **Pass** | The four `token_plain` strings (`uat-onboard-token`, `uat-onboard-used-token`, `uat-onboard-expired-token`, `uat-onboard-no-user-token`) are hard-coded test tokens, not secrets. They have lived in `scripts/uat-fixtures/BP-UAT-013.json` since `wf-20260629-fix-036` (PR #68) and are explicitly flagged as "test tokens" in their semantics (used by `apps/api/src/modules/admin-invites/admin-invites.service.ts::consumeInvite()` to drive the API's negative-path coverage). No new tokens are introduced. |
| **No cross-schema queries** | **Pass** | The change posts to a single Directus collection (`operator_invites`) — same collection the unconditional path already posts to. No schema cross-talk. |
| **Rate limiting** | **N/A** | No new HTTP endpoints. |
| **CSRF** | **N/A** | Browser-side CSRF only; this is server-side bash. |
| **N+1 queries** | **N/A** | Single POST per fixture. The loop over `existing_ids` for DELETE is unchanged from before the patch. |
| **gitleaks** | **Pass** (manual review) | The patch adds a SHA-256 derivation (`sha256_hex "$token_plain"`) that produces 64-char hex strings from the literal `token_plain`. The literals are already in the repo's tracked manifest. No secret-like patterns (`AKIA`, `ghp_`, `Bearer `, `-----BEGIN`, etc.) appear in the diff. |
| **Row-level security (Directus policies)** | **Pass** | No RLS policy change. The POST uses `DIRECTUS_TOKEN` (already in `apps/api/.env` and required to be valid). The Directus schema's existing role permissions (set by `infrastructure/directus/bootstrap.sh`) continue to apply unchanged. |
| **Authentik user lookup branch** | **Equivalent to reference impl** | The reference implementation in `ensure_operator_invite` (lines 510-514) conditionally looks up the Authentik user pk and includes it as `authentik_user_id`. The new `reset_domain_fixture` block does NOT mirror this branch — `authentik_user_id` is intentionally left out of the JSON merge. **This is consistent with the manifest** (`scripts/uat-fixtures/BP-UAT-013.json` does not declare `authentik_user_id` per fixture row). The unconditional path's `ensure_operator_invite()` continues to handle the `authentik_user_id` enrichment when an Authentik token is configured. Adding it to `--reset` would have been over-engineering for the BP-UAT-013 manifest shape. |
| **Parameterised / safe curl** | **Pass** | The new code adds no new curl invocations. The patch's `jq -c --arg` / `--arg` patterns prevent JSON injection (no string interpolation into JSON values). |
| **`fail` invocation on bad fixture** | **Pass** | The `else` branch calls the existing `fail()` helper with a message containing `${id}` (the fixture id) and a path-shaped hint. The `${bp_uat}` token in the comment is a literal in the message string, not an unquoted variable — there is no command-injection vector. |
| **Idempotency** | **Improved** | The original `--reset` POST failed and left `operator_invites` empty; reruns hit the same failure. With the patch, the POST succeeds and a subsequent `--reset` is correct: the DELETE prelude removes the prior rows, and the new POST recreates them with the same `token_hash` (since `token_plain` is constant per fixture). |

---

## Findings

**No blocking findings.**

The change is a strictly local fix that mirrors an already-reviewed reference
implementation in the same file. All derived field values are deterministic
from inputs that the file already consumes. There are no new external
interactions, no new dependencies, no new auth requirements, no new
schema-level constraints, and no new attack surface.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "No new security surface introduced. The fix mirrors an already-reviewed reference impl in the same file. Single-line clearance appropriate for this scope."
  blocking_findings: []
  advisory_findings: []
  force_pushed_to_review_queue: false
  comments:
    - "ISS-UAT-013-14 = pure fixture-load-layer correction. No API/auth/tenant delta."
    - "token_plain values are UAT-test tokens (purpose-built, not production secrets)."
    - "The fix's --arg-based jq merge is injection-safe by construction."
```
