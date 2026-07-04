# Step 1 — Issue Lookup (ISS-UAT-SEED-002)

| Field | Value |
|---|---|
| `workflow_id` | `wf-20260704-fix-089` |
| `type` | `issue-resolution` |
| `issue_ref` | `ISS-UAT-SEED-002` |
| `related_issues` | None with the same root cause (verified across all 41 rows of `registry.md`) |
| `severity` | bug |
| `fix_complexity` | trivial (one-line late-bound default + bats regression + comment edit) |

---

## Current state (verified against live source)

- **Issue cites line:** `scripts/uat-seed.sh:243`
- **Actual line:** `scripts/uat-seed.sh:269` — off-by-26 from the issue text, but the quoted code block matches verbatim. Same defect, different line number.
- **Current default literal:** `local api_base="${API_BASE_URL:-http://host.docker.internal:3001}"` (`scripts/uat-seed.sh:269`).
  - The issue's reproduction captures the older `"${API_BASE_URL:-http://localhost:3001}"` shape — the live default has since been re-shaped to use `host.docker.internal` (a stale WSL/Docker-Desktop rationale), but **the port `:3001` is still wrong**.
- **Actual API port:** `apps/api/.env:5` `PORT=3000` (also `apps/api/.env.example:5`, `apps/api/Dockerfile:52` `ENV PORT=3000`). No production artifact binds the API to `:3001`.
- **Misleading comment** at `scripts/uat-seed.sh:264-268` claims `host.docker.internal` "instead of localhost:3001" — wrong in three ways:
  1. The actual API process runs directly on the host, not in a container the seed needs to bridge into.
  2. `uat-seed.sh` runs on the host shell (PowerShell or WSL bash on Windows), not inside Docker — `host.docker.internal` and `localhost` resolve to the same address in that context.
  3. The "override example" `localhost:3001` is itself wrong (should be `:3000`).
- **Symptom:** `api_ensure_directus_user_link` returns HTTP 000 (connection refused) on every call against the documented default; the seed then `fail`s on the first `ensure_test_user` that needs the bridge.

## Duplicate-scan (related ISS files)

| File | Overlap? |
|---|---|
| `ISS-UAT-013-1` (`port 3000 occupied by foreign ai-dala-next`) | Different: causes API NOT running on 3000. Closed by `wf-20260629-fix-033`. |
| `ISS-UAT-013-4` (seed doesn't provision `operator_invites`) | Different: seed gap, not port gap. Closed. |
| `ISS-UAT-013-5` (Directus 503 retry) | Different: backend reliability. Closed. |
| `ISS-UAT-SEED-001` (uat-seed step 4 Directus readonly bug) | Different logic path, same file. Closed. |
| `scripts/uat-preflight-email.sh:44,116` + `scripts/uat-env-setup.sh:261` | Both hard-code `:3001` — analogous bugs **but not registered as ISS-***. Out of scope for this fix (would create a 2nd concern in one PR; AGENTS.md §4 small-PR rule). |

**No other ISS-* shares this root cause.** Single-incident.

## Recommendation

A single diff hunk to `scripts/uat-seed.sh` plus one new bats case is sufficient. No DB impact, no security delta, no new dependency. Changing the default literal to match `apps/api/.env`'s `PORT=3000`, fixing the misleading comment to state the real rationale (no `host.docker.internal`, no `:3001` example), and adding a structural-regression bats test that asserts the default port matches `apps/api/.env`'s `PORT` (idempotent across renames).

The queued follow-up `wf-20260703-fix-066-seed-port` (queue position 1) named in `.copilot/context/workspace-state.md` has been picked up by this workflow (`wf-20260704-fix-089`).

## Gate Result

gate_result:
  status: passed
  summary: "Step 1 (issue lookup) is fully validated — single-incident, trivial scope; one-line default + comment edit + one bats case recommended."
  findings:
    - "Issue's cited line number is off-by-26 but the quoted code matches the live source verbatim."
    - "Default literal is `${API_BASE_URL:-http://host.docker.internal:3001}` on `scripts/uat-seed.sh:269`; both the `host.docker.internal` prefix and the `:3001` port are wrong."
    - "Actual API port is `3000` per `apps/api/.env:5` and every other artifact in the repo."
    - "Comment block at `scripts/uat-seed.sh:264-268` is misleading in three ways and must be edited in the same hunk."
    - "Same `:3001` typo appears in `scripts/uat-preflight-email.sh` and `scripts/uat-env-setup.sh` — analogous bugs but NOT registered ISS files and out of scope for this PR (AGENTS.md §4 small-PR rule)."
    - "No other ISS file shares this root cause."
