#!/usr/bin/env bash
# Step 0 helper: activate queued workflow by mutating handoff.yaml.
set -euo pipefail
HANDOFF=".copilot/tasks/active/wf-20260705-fix-101-bp-uat-013-seed-reset/handoff.yaml"

sed -i '
  s/current_step: 0/current_step: 1/;
  s/current_step_name: "Initialize"/current_step_name: "Issue Lookup"/;
  s/workflow_status: "queued"/workflow_status: "active"/;
  s/last_updated_at: "2026-07-05T00:30:00Z"/last_updated_at: "2026-07-05T01:00:00Z"/;
' "${HANDOFF}"

echo "--- updated head of handoff.yaml ---"
head -10 "${HANDOFF}"
echo "--- queued directory (should be empty / gone) ---"
ls -la .copilot/tasks/queued/ 2>/dev/null || echo "(no queued dir)"
echo "--- next-workflow-id ---"
cat .copilot/meta/next-workflow-id
