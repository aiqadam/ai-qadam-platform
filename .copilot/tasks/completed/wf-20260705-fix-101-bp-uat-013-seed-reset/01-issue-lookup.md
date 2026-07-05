# Step 1 — Issue Lookup

**Workflow:** wf-20260705-fix-101-bp-uat-013-seed-reset
**Agent:** Orchestrator (direct, per `.copilot/workflows/issue-resolution.md` Step 1)
**Date:** 2026-07-05
**Step 1.0 — registry search:**

Searched `.copilot/issues/registry.md` for keywords: `seed reset`, `operator_invites`, `token_hash`, `token_prefix`, `--reset`. Results:

| Match | Status | Reason to consider |
|---|---|---|
| [ISS-UAT-SEED-001](../issues/ISS-UAT-SEED-001.md) | resolved (wf-20260702-fix-055) | Different symptom — `consumed_at: null`, CRLF, `authentik_user_id` missing, undocumented `AUTHENTIK_ADMIN_TOKEN`. Same script family (`scripts/uat-seed.sh`) but unrelated to reset path. **Not a candidate to merge.** |
| [ISS-UAT-SEED-002](../issues/ISS-UAT-SEED-002.md) | resolved (wf-20260704-fix-089, PR #106) | `api_base` default points to 3001, not 3000. Same script family. **Not a candidate to merge.** |
| [ISS-UAT-013-4](../issues/ISS-UAT-013-4.md) | resolved (wf-20260629-fix-036) | `uat-seed.sh` did not provision `operator_invites` rows unconditionally (the call-site path). The unconditional path was the fix there; this issue is symmetrically about the `--reset` call site. Different code paths, same constraint (Directus requires the row). Worth noting as a related-but-distinct precedent. |
| [ISS-UAT-013-14](../issues/ISS-UAT-013-14.md) | open | **The target issue.** Same constraint (Directus `operator_invites.token_hash/token_prefix` required), but discovered in the `--reset` code path. Filed 2026-07-05 by `wf-20260705-uat-100` Step 2 pre-flight `failed-escalate`. |

**Step 1.1 — similarity assessment:**

[ISS-UAT-013-14](../issues/ISS-UAT-013-14.md) is **not** the same as any resolved issue. The constraint was added after `wf-20260629-fix-036`'s fix and after `wf-20260704-fix-092`'s last-successful `--reset` run (`69f2b3f`). The closest analogue is the unconditional path documented in `ensure_operator_invite` (lines 500-595 of `scripts/uat-seed.sh`) — the reference implementation we must mirror.

**Step 1.2 — prior attempts:**

None. The issue is a newly-discovered UAT-blocker. No failed code approach is recorded. The fix path is uniquely constrained by:
1. The reference implementation already exists at `scripts/uat-seed.sh::ensure_operator_invite` (lines 500-595).
2. The manifest shape is fixed (carries `token_plain` top-level).
3. The fix is local to one file (`scripts/uat-seed.sh::reset_domain_fixture`).
4. A bats assertion pattern already exists at `scripts/tests/uat-seed.bats` row 6 (per FR-WORKFLOW-003 fix, `wf-20260704-fix-092` — must take care not to regress that row).

**Step 1.3 — gate:**

`gate_result: passed`

`issue_ref` is `ISS-UAT-013-14`. No new issues created. Proceed to Step 2.

---

## Step 1 outcome

- **Issue confirmed:** ISS-UAT-013-14 (`open` → will flip to `resolved` at workflow close).
- **No related-issue merging** required.
- **No failed prior attempts** to repeat-avoid.
- **Reference implementation:** `scripts/uat-seed.sh::ensure_operator_invite` (lines 500-501, 558-595).
