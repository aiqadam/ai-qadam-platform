# Step 4: Security Review — wf-20260629-fix-036

**Workflow:** wf-20260629-fix-036
**Issue:** ISS-UAT-013-4
**Date:** 2026-06-29
**Agent:** SecurityReviewer

---

## Code Changes Reviewed

| File | Change type | New surface |
|---|---|---|
| `scripts/uat-seed.sh` | Modified | `sha256_hex()`, `date_offset()`, `ensure_operator_invite()`, `UAT_SEED_DIRECTUS_MOCK` guard, step [4/4] with 3 call sites |
| `scripts/uat-env-setup.sh` | Modified | 3 `UAT_ONBOARD_*` lines added to `.env.uat` heredoc (step 8) |
| `scripts/tests/uat-seed.bats` | Created | 7-case bats regression suite (mock mode + structural grep) |

---

## Addressed Security Questions

### Q1 — Plaintext tokens as test fixtures: appropriate?

**Yes — appropriate by design.** The same token strings (`uat-onboard-token`, etc.) already appear as `??` fallbacks in the committed E2E spec (`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts:80`). They operate only against a `localhost:8200` Docker Directus instance. Consistent with pre-existing convention (`UatMember1!`, `uat-directus-static-admin-token-32c`).

### Q2 — Is `apps/e2e/.env.uat` in `.gitignore`?

**Yes.** Root `.gitignore` `.env.*` glob covers `.env.uat`. Not tracked by git.

### Q3 — Does `ensure_operator_invite` use safe URL/query construction?

**Yes.** `token_hash` in the GET URL is `[0-9a-f]{64}` — URL-safe by construction. POST JSON body uses `jq --arg` for all fields (fully escaped). No shell variable interpolation into JSON string literals.

### Q4 — Does `UAT_SEED_DIRECTUS_MOCK=1` introduce production risk?

**No.** Default is `0`, absent from all CI workflows, no production pathway. Only affects `uat-seed.sh`.

### Q5 — Injection risks in curl calls?

**None.** All JSON via `jq --arg`. `token_hash` is hex-only. `DIRECTUS_TOKEN` validated non-empty before use.

---

## Invariant Check Results

All applicable INV-1..11 invariants passed. No NestJS, DB, or browser surface modified.

---

### Observations (non-blocking)

**OBS-1** — UAT fixture tokens committed: intentional per pre-existing convention. No action required.
**OBS-2** — `token_hash` bare in URL is safe (hex charset). No fix needed.
**OBS-3** — `date_offset()` BSD fallback lacks `|| true` guard — robustness issue only, out of scope.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "All 5 security questions verified. No BLOCKER or MAJOR findings. Three non-blocking observations documented."
  findings:
    - "Q1/OBS-1: Committed UAT fixture tokens are intentional and consistent with pre-existing convention. No action required."
    - "Q2: apps/e2e/.env.uat covered by root .gitignore .env.* glob. Confirmed not tracked."
    - "Q3: ensure_operator_invite uses jq --arg for all JSON fields; token_hash in URL is SHA-256 hex (URL-safe)."
    - "Q4: UAT_SEED_DIRECTUS_MOCK defaults to 0, absent from all CI workflows, no production pathway."
    - "Q5: No injection risks. All JSON via jq --arg. Token validated non-empty before use."
```
