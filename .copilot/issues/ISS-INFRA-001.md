# ISS-INFRA-001 — apps/api Docker build pnpm deploy step pathologically slow on pro-data-tech-qa

| Field | Value |
|---|---|
| ID | ISS-INFRA-001 |
| Severity | blocker |
| Module | api/build (Dockerfile) |
| Status | in-progress |
| Reported | 2026-07-24 |
| Workflow | wf-20260724-fix-129 |
| Reporter | tvolodi (chat), discovered while verifying ISS-USR-REG-002 on QA |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/53 |

## Symptom

Discovered while attempting to rebuild `apps/api`'s Docker image on
`pro-data-tech-qa` (95.46.211.230) to pick up the merged ISS-USR-REG-002 fix
(PR #51). Four separate build attempts over ~90 minutes all stalled inside
the `RUN pnpm --filter @aiqadam/api deploy --prod /out` step of
`apps/api/Dockerfile`, stuck somewhere between 60-180 of 810 packages,
either dying outright or making almost no further progress even after
restarts with a freshly-pruned build cache.

## Root cause (proven via direct diagnostic)

Ran the identical `pnpm --filter @aiqadam/api deploy --prod <dir>` command
directly against a plain `node:22.14.0-alpine` container with the repo
bind-mounted (not `COPY`'d into BuildKit's overlay filesystem) — completed
in **under 21 seconds**. This conclusively isolates the cause to BuildKit's
`overlayfs` storage driver (confirmed via `docker info` on the host), which
has well-documented poor performance for workloads creating/hardlinking
many small files — exactly what `pnpm deploy`'s content-addressable-store
virtual-store linking does across 810 packages.

Ruled out:
- **Host disk hardware** — a raw `cp -a` of the full repo directory took
  2.8 seconds; `iostat` during the final stall showed the disk was not
  actually saturated by that point.
- **A specific problematic package** — the exact same lockfile/command
  completes near-instantly outside the overlay filesystem.
- **Host resource exhaustion** — `free -h` showed 12GB available memory,
  no swap in use, throughout every attempt.

## Fix — attempted, INCOMPLETE (see "Live test result" below)

Added a BuildKit cache mount for the pnpm content-addressable store to the
`install`, `build`, and `deploy` `RUN` steps in `apps/api/Dockerfile`:

```dockerfile
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false
...
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @aiqadam/api build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @aiqadam/api deploy --prod /out
```

### Live test result on pro-data-tech-qa (2026-07-24) — fix is insufficient alone

Applied this change directly to the host's checkout (test-only, reverted
after) and ran a real build. **Result: the `install` step (the first step
to get the cache-mount treatment) exhibited the SAME disk-I/O-bound
slowdown pattern as the original bug** — confirmed via `iostat` showing
`%iowait` 82%, disk `%util` 99%, write-queue depth 19 during the stall,
identical to pre-fix measurements. Only reached ~304 of 984 packages after
~114 seconds before the test was stopped.

**Corrected root-cause understanding:** the earlier ~21-second isolated
diagnostic (bind-mounted repo, no Docker layer/overlay involved at all —
neither for the pnpm store NOR for the output) was fast because it avoided
BOTH the store materialization AND the *virtual store* (the actual
`node_modules/.pnpm/...` hardlinked package layout `pnpm deploy` writes to
its output directory) going through the overlay filesystem. Cache-mounting
only `/root/.local/share/pnpm/store` (the content-addressable store) does
NOT cover the virtual store — that still gets written into BuildKit's
regular overlay-backed layer, which is the same many-small-file write
pattern that was slow before. This explains why the fix as originally
proposed didn't resolve the measured symptom despite correctly identifying
overlayfs-vs-many-small-files as the general problem class.

**Status:** this issue is not yet resolved. The `--mount=type=cache` change
may still be a reasonable, low-risk, additive improvement (it doesn't make
anything worse, and may help other/future scenarios where the store itself
is the bottleneck), but it should not be represented as a fix for the
measured 90+-minute stall until a version that also addresses the virtual
store's write path is tested and proven. Candidate follow-ups, not yet
attempted:
- Also cache-mount the `pnpm deploy` output directory itself (`/out`), if
  BuildKit's cache-mount semantics for a `RUN`'s own output can be made to
  interoperate with a later `COPY --from=builder /out ...` (needs
  investigation — cache mounts are normally scratch space private to the
  RUN, not something a later stage can `COPY --from` directly).
- Investigate whether this host's Docker daemon can be configured with a
  different storage driver (e.g. `overlay2` variants, or checking if a
  faster underlying filesystem is available) — a host-level change, out of
  this repo's scope, would need to go through `ai-qadam-infra`.
- Accept that first-time/cold-cache builds on this specific host are
  simply slow (tens of minutes) and plan around it (e.g. build on a
  different, faster machine and push the resulting image, rather than
  building in-place on `pro-data-tech-qa`).

## Regression test

No new automated test added — this is a build-infrastructure change with
no application-code behavior change. Verification is operational: a full
rebuild of `apps/api`'s Docker image on `pro-data-tech-qa` completing in a
reasonable time (see Resolution for actual timing), and the resulting
image being deployed and functionally verified live (registration endpoint
returns 302/400, not 500).

## Status

Not resolved. Root cause correctly narrowed to BuildKit overlay-filesystem
overhead for many-small-file writes, but the specific fix attempted
(cache-mounting only the pnpm content-addressable store) was tested live
on the affected host and does not resolve the measured symptom — the
*virtual store* (actual package file writes) still goes through the slow
overlay path. Awaiting a decision on which follow-up approach to pursue
(see "Fix" section's candidate list) before further engineering effort.
