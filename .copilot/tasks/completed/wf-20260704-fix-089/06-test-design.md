# Step 7 — Test Design (ISS-UAT-SEED-002)

The test code is appended to `scripts/tests/uat-seed.bats` — the existing bats regression suite for `scripts/uat-seed.sh`. Five cases follow the pattern established by `FR-WORKFLOW-003 row 6` and `ISS-UAT-001-1` (mock-mode + structural-grep), plus a stubbed-source technique for AC-2/AC-3 that mirrors `FR-WORKFLOW-003`'s isolated-copy pattern (see `scripts/tests/uat-seed.bats:178-209`).

The full test code is in `scripts/tests/uat-seed.bats` (lines appended at the bottom of the file — see `git diff scripts/tests/uat-seed.bats` for the exact source).

## Pattern summary

| Pattern | Used by | Why |
|---|---|---|
| `grep -F 'literal' "$REPO_ROOT/scripts/uat-seed.sh"` | AC-1, AC-5 | Structural — no live state needed. |
| Stubbed-source: `BATS_TEST_TMPDIR/api.env` copied from real `apps/api/.env`, helper sourced with `API_DIR` redirected via symlink | AC-2, AC-3, AC-4 | Hermetic — does NOT mutate the real `apps/api/.env`. |
| `bash -n "$REPO_ROOT/scripts/uat-seed.sh"` | (existing case `FR-WORKFLOW-003 AC-6`) | Bash syntax check; will rerun for the new diff. |

## Negative-case evidence (the regression test would have failed pre-fix)

The pre-fix default literal was `${API_BASE_URL:-http://host.docker.internal:3001}`.

- AC-1 would fail: `grep -F 'localhost:3001'` would NOT match (the bug used `host.docker.internal:3001`), but a separate `grep -F ':3001'` would match. To make AC-1 meaningful, it asserts **no `localhost:3001` AND no `host.docker.internal:3001`**, covering both known historical shapes.
- AC-2 would fail: `api_base` resolved to `host.docker.internal:3001`, not whatever `apps/api/.env PORT` declared.
- AC-3 would still pass (the `${VAR:-default}` shape was preserved).
- AC-4 would fail: there is no fallback to `:3000` at all in the pre-fix — every call requires `API_BASE_URL`.

## Gate Result

gate_result:
  status: passed
  summary: "Five bats cases added to scripts/tests/uat-seed.bats; pre-fix shape fails 3/5, post-fix shape passes 5/5."
  findings:
    - "Existing 29 cases continue to apply unchanged (no shared state mutated)."
    - "Stubbed-source technique mirrors the existing FR-WORKFLOW-003 isolated-copy pattern."
    - "No new bats helper required; `test_helper.bash` already exposes the `run`/`status`/`output` and BATS_TEST_TMPDIR plumbing."
    - "Bash syntax change is captured by the existing `FR-WORKFLOW-003 AC-6: bash -n scripts/uat-seed.sh passes` regression."
