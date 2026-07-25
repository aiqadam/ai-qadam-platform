# ISS-INFRA-002 — apps/web-next Docker build pnpm deploy step shares ISS-INFRA-001's overlayfs slowness

| Field | Value |
|---|---|
| ID | ISS-INFRA-002 |
| Severity | blocker |
| Module | web-next/build (Dockerfile) |
| Status | in-progress |
| Reported | 2026-07-25 |
| Workflow | wf-20260725-fix-130 |
| Reporter | tvolodi (chat), discovered live during ISS-INFRA-001's `deploy-qa` verification run |
| GitHub-Issue | (none — discovered mid-verification of #53, no separate GitHub issue filed) |

## Symptom

While live-verifying ISS-INFRA-001's fix via the `deploy-qa` GitHub Actions
job (triggered by merging PR #54 to `main`), the job ran 13+ minutes and was
cancelled by the user before completing. Inspecting the run log
(`gh run view <id> --log --job <deploy-qa-job-id>`) showed the `api` image's
fixed deploy step progressing smoothly (0→137/809 packages in ~49s, no
stalling) right up to cancellation — the fix works. But
`apps/web-next/Dockerfile`'s own `pnpm --filter @aiqadam/web-next deploy
--prod /out` step (line 37) was still crawling after 786+ seconds (~13 min),
stuck around 250-298 of 787 packages — the exact same symptom ISS-INFRA-001
diagnosed for `apps/api`.

## Root cause

Identical to ISS-INFRA-001: `apps/web-next/Dockerfile` never received the
cache-mount treatment (ISS-INFRA-001's scope was `apps/api/Dockerfile`
only — the original bug report only mentioned the api image). web-next's
`pnpm deploy --prod /out` still writes its hardlinked virtual-store tree
(node_modules/.pnpm/...) straight into BuildKit's overlay-backed layer on
`pro-data-tech-qa`, which is pathologically slow for many-small-file writes
on that host's overlayfs storage driver.

## Fix

Apply the same proven pattern from ISS-INFRA-001 (see
`.copilot/issues/ISS-INFRA-001.md`'s Resolution section) to
`apps/web-next/Dockerfile`: deploy into a cache mount instead of directly
into the overlay layer, then `cp -a` the result into `/out` in one
operation.

## Acceptance criteria

- AC-1: `apps/web-next/Dockerfile`'s `deploy` step uses
  `--mount=type=cache` for both the pnpm store and the deploy output,
  matching the pattern already shipped in `apps/api/Dockerfile`.
- AC-2: Local build produces a runtime image functionally identical to a
  build without the fix (SHA-256 file diff, same method as ISS-INFRA-001).
- AC-3: A full `deploy-qa` GitHub Actions run completes without being
  cancelled/timing out — both `api` and `web-next` deploy steps finish in
  a reasonable time.

## Regression test

None — build-infrastructure-only change, no application-code behavior
change, same as ISS-INFRA-001.

## Status

In progress — see workflow `wf-20260725-fix-130`.
