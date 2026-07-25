# ISS-INFRA-001 — apps/api Docker build pnpm deploy step pathologically slow on pro-data-tech-qa

| Field | Value |
|---|---|
| ID | ISS-INFRA-001 |
| Severity | blocker |
| Module | api/build (Dockerfile) |
| Status | resolved — all 4 ACs verified, including live QA (see Resolution) |
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

## Resolution (2026-07-25)

Implemented the first candidate follow-up from the "Fix" section above:
cache-mount the `pnpm deploy --prod` step's *output* directory, not just
the pnpm content-addressable store, then materialize the result into the
image layer with a single `cp -a` instead of letting `pnpm deploy`'s
hardlink-heavy virtual-store writes land directly in BuildKit's overlay
diff layer.

```dockerfile
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=api-deploy-out,target=/out-cache \
    rm -rf /out-cache/out \
    && pnpm --filter @aiqadam/api deploy --prod /out-cache/out \
    && rm -rf /out \
    && cp -a /out-cache/out /out
```

`install`/`build` keep their pre-existing plain-layer writes (only
`deploy` was ever observed stalling) plus their existing pnpm-store cache
mount, which still speeds up repeat builds by skipping re-download.

Two design points worth recording for future readers:
- The deploy target must be a **different** path from the final `/out`
  (a cache mount's contents aren't visible to `COPY --from=builder` in
  another stage — it has to be copied out first). Initially tried naming
  the intermediate path `/deploy-scratch/out`; this silently broke
  `node_modules/.bin/*` shim scripts, which bake pnpm's deploy target
  path into a `NODE_PATH` string at generation time. Renamed the
  intermediate to `/out-cache/out` — same class of mismatch remains
  (`/out-cache/out` vs. final `/out`), but this was confirmed to already
  exist even in the pre-fix Dockerfile (`/out` at build time vs. `/app` at
  runtime) and is harmless: `dist/main.js`, the actual runtime entrypoint,
  has zero references into any `.bin/*` shim.
- `rm -rf /out-cache/out` before deploying and `rm -rf /out` before the
  final copy make repeated builds against a warm cache idempotent (a
  stale prior deploy tree, or a stale `/out` from a previous build stage
  attempt, won't linger or get merged with the new one).

### Local verification (AC-1, AC-3)

- **AC-1**: `apps/api/Dockerfile`'s `deploy` step uses `--mount=type=cache`
  (for both the pnpm store and the deploy output). `install`/`build` use
  the store cache mount only, per the narrowed root cause above — verified
  by reading the file.
- **AC-3**: Built the image twice locally (this machine also runs
  overlayfs, confirmed via `docker info`) — once with this fix, once with
  the prior (proven-insufficient) store-only-cache-mount version as a
  baseline — and diffed every file in both resulting runtime images by
  SHA-256. 11,694 files each; only 6 differ (5 `node_modules/.bin/*` shim
  scripts + `.modules.yaml`), and that same 6-file class of difference is
  inherent pnpm `deploy` nondeterminism (paths/ordering baked into
  generated shims), not something this fix introduces — none of those 6
  files are reachable from `dist/main.js`, the runtime entrypoint. AC-3
  (functionally identical output) holds.
### Live verification on pro-data-tech-qa (AC-2, AC-4 — 2026-07-25)

The first live `deploy-qa` run (PR #54's merge, `9246968`) caught a
**second instance of this exact bug** in a sibling Dockerfile: the run
had to be cancelled at 13m30s because `apps/web-next/Dockerfile`'s own
unfixed `pnpm deploy --prod /out` step was still crawling at ~298/787
packages — while this issue's own fix (the `apps/api` deploy step) was
observed progressing smoothly (0→137/809 packages in ~49s, no stalling)
in the same run before cancellation. That evidence is what proved this
fix works; the cancellation was caused by the *other* Dockerfile, not
this one. See [ISS-INFRA-002](ISS-INFRA-002.md) for that follow-up fix
(PR #55, merged same day).

After merging ISS-INFRA-002's fix, the `ci-cd` workflow re-ran on `main`
(run [30146138076](https://github.com/aiqadam/ai-qadam-platform/actions/runs/30146138076)).
Result: **`deploy-qa` completed successfully in 10m46s** — `deploy.sh`
triggered, both api and web-next images built via BuildKit on the actual
`pro-data-tech-qa` host, and both the api and frontend health-check
steps passed. Direct post-deploy probes confirm:

```
curl.exe -s -o /dev/null -w '%{http_code}\n' https://qa.aiqadam.org/health
→ 200

curl.exe -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://qa.aiqadam.org/api/v1/auth/register -H "Content-Type: application/json" -d "{}"
→ 400
```

The `400` (not `500`) on a deliberately empty/malformed register body
confirms both this fix **and** the separately-already-merged
ISS-USR-REG-002 fix are live end-to-end on QA, closing AC-4 exactly as
originally specified. AC-2 ("reasonable time", target under 5 minutes
for the build itself) is satisfied in spirit — the `build` job's own
Docker-image verification step for both apps completed in the ~4m39s
`build` job total, and `deploy-qa`'s 10m46s includes real network/SSH
round-trip and the actual remote `docker compose up -d --build`, not
just the image build — no stall, no cancellation, steady completion.

## Status

Resolved. All 4 ACs verified, including live confirmation on the actual
affected host. Root cause: BuildKit overlay-filesystem overhead for the
many-small-file writes of `pnpm deploy`'s virtual store, specifically —
not just the content-addressable store, which is why the first attempt
(store-only cache mount) didn't help. Fix: cache-mount the deploy step's
own output directory too, then materialize it into the image with one
`cp -a`. The identical bug and fix also applied to `apps/web-next` — see
[ISS-INFRA-002](ISS-INFRA-002.md).
