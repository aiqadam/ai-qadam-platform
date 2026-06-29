# Step 2: Impact Analysis — wf-20260629-fix-036

**Workflow:** wf-20260629-fix-036
**Issue:** ISS-UAT-013-4
**Date:** 2026-06-29
**Agent:** ImpactAnalyzer

---

## Validated Requirement

**ISS-UAT-013-4** — `scripts/uat-seed.sh` does not provision `operator_invites` rows. BP-UAT-013 steps 005/006 and Neg 002/003 fail because the table is empty after `pnpm uat:seed`.

**Resolution scope:**
1. Extend `scripts/uat-seed.sh` with `ensure_operator_invite()` — idempotently inserts 3 rows into `operator_invites`.
2. Extend `scripts/uat-env-setup.sh` step 8 to write 3 `UAT_ONBOARD_*` env vars into `apps/e2e/.env.uat`.
3. Add `scripts/tests/uat-seed.bats` regression test.

No database schema changes — the `operator_invites` Directus collection pre-exists (created by `infrastructure/directus/bootstrap.sh` §F-S2.7).

---

## Affected Layers

| Layer | Change | Reason |
|---|---|---|
| `scripts/uat-seed.sh` | MODIFY | Add helpers + ensure_operator_invite() + step [4/4] |
| `scripts/uat-env-setup.sh` | MODIFY | Add UAT_ONBOARD_* vars to .env.uat heredoc |
| `scripts/tests/uat-seed.bats` | CREATE | New bats regression test file |
| API (NestJS) | None | No new endpoint or service |
| DB (Drizzle) | None | operator_invites Directus collection pre-exists |
| Frontend | None | No component changes |
| Shared types | None | No TypeScript types affected |

---

## DB Changes Required

**NO.** `operator_invites` collection already exists via `infrastructure/directus/bootstrap.sh` §F-S2.7. `DBMigrationAuthor` step not needed.

---

## Risk Flags

- **Portability (low):** `sha256sum` absent on macOS; `date -d` absent on macOS. Both mitigated by `sha256_hex()` and `date_offset()` wrappers with BSD fallbacks.
- **Token prefix collision (mitigated):** All three plaintext tokens share the 8-char prefix `uat-onbo` — idempotency key changed to `token_hash` (SHA-256) to ensure uniqueness.
- **Security:** Plaintext tokens are static well-known UAT-only fixtures. `.env.uat` is gitignored.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "2 files to modify, 1 file to create. No DB migration. No API, frontend, or shared-types changes."
  findings:
    - "No DBMigrationAuthor step needed."
    - "sha256_hex() and date_offset() portability wrappers required."
    - "Idempotency key must be token_hash, not token_prefix (prefix collision across 3 tokens)."
    - "apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts requires no changes."
```
