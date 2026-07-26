# ADR-0040: Deployment target — QA + prod hosts on pro-data.tech, Compose + Nginx + GitHub Actions

## Status
Accepted, 2026-07-27

**Supersedes:** [ADR-0002](0002-deployment-target.md) (Deployment target — single
host on hyperapp.cloud). Complements [ADR-0007](0007-coolify-orchestration.md),
which retired Coolify as the orchestration layer on 2026-07-23 but did not
restate where we deploy or on what topology.

## Context

ADR-0002 recorded a single hyperapp.cloud host (`aiqadam-web`, `212.20.151.29`)
with Coolify v4 orchestrating every stack. Both halves of that decision have
since been reversed, in two separate steps, neither of which updated ADR-0002:

1. **Coolify was removed** from CI/CD on 2026-07-23 (PR #45) after repeated CI
   interference and agent session drift. Recorded in ADR-0007 as `Superseded`.
2. **The hyperapp.cloud host is gone.** Commit `ef50eba` (PR #46) deleted the
   `deploy-web-next` workflow with the note *"212.20.151.29 gone"*.

The result was a documentation fault rather than an infrastructure one:
ADR-0002 remained `Accepted` while asserting *"Coolify v4.0.0 orchestrates every
stack"* on a host that no longer exists. It therefore **directly contradicted**
ADR-0007, and an agent reading the ADR log had no way to tell which record won —
both carried full authority, and ADR-0002 is the lower number and the one linked
from the architecture docs.

A 2026-07-26 documentation audit found this pattern repeated across 63 files
that still describe Coolify as live. This ADR fixes the root of that tree: the
deployment-target record itself.

Per the immutability rule in [`README.md`](README.md) — *"once accepted, an ADR
is never edited to change its decision"* — ADR-0002 is **not** edited to say
something new. It is superseded here.

## Decision

**Topology:** two hosts, one per environment, both on pro-data.tech.

| Environment | Host | Domains |
|---|---|---|
| QA | `95.46.211.230` | `qa.aiqadam.org`, `auth.qa.aiqadam.org` |
| Production | `95.46.211.224` | `aiqadam.org` |

**Orchestration:** plain `docker compose`, not a PaaS.

- `deploy/docker-compose.qa.yml` and `deploy/docker-compose.prod.yml` define the
  stacks.
- `deploy/nginx/*.conf` terminates TLS and routes `/` to `web-next:4322` and the
  API by path.
- Prod services are currently `postgres`, `oidc-stub`, `api`, `web-next`.
  Note the `oidc-stub` — production does **not** yet run a real Authentik; QA
  does. This is deliberate for the current stage, not an oversight.
- Directus is **deliberately out of scope in prod**:
  `INTERNAL_DIRECTUS_URL` is pinned to `http://127.0.0.1:1` so the CMS fetch
  fails fast instead of hanging ~10 s per request. See
  [`migration-to-directus-centric.md`](../04-development/architecture/migration-to-directus-centric.md),
  which describes a target state, not today's prod.

**Deploy pipeline:** `.github/workflows/ci-cd.yml`.

- `build` is the hard gate — lint, typecheck, build, test, plus Docker image
  builds for `api` and `web-next` as verification (images are not pushed).
- `deploy-qa` runs automatically on `main` after `build` passes.
- `deploy-prod` is **manual only** (`workflow_dispatch`) and takes a validated
  7–40 hex-char commit SHA, so production ships a deliberately chosen ref rather
  than whatever last landed.
- Both deploy jobs SSH as `deploy@<host>` with `StrictHostKeyChecking=yes`
  against a pinned host key, invoking the remote forced-command `deploy:<ref>`.
  The runner never gets an interactive shell on either host.
- Both jobs finish with health checks (`/health` and `/`) that retry 5× at 10 s
  and fail the job if the service does not come back.

**Multi-host split beyond QA/prod remains deferred**, on the same triggers
ADR-0002 named: Postgres replication, mail isolation, or an observability stack
outgrowing its box.

## Consequences

- ✅ **QA and prod are genuinely separate hosts**, so a QA deploy can no longer
  take production down. This was the main structural weakness of the ADR-0002
  single-host topology.
- ✅ **The deploy path is inspectable in-repo.** Compose files, Nginx config, and
  the workflow are all version-controlled and reviewable in a PR. Under Coolify
  the equivalent state lived in a web UI and drifted invisibly.
- ✅ **Production promotion is explicit and auditable** — a human dispatches a
  specific SHA, and the SHA format is validated before any SSH occurs.
- ✅ **Blast radius on the deploy key is bounded** by the forced command; a
  compromised runner can request a deploy, not run arbitrary commands.
- ⚠️ **Two hosts to patch, back up, and monitor** instead of one. The restic
  schedule and firewall policy now need to be correct twice.
- ⚠️ **Restic and observability were configured for the Coolify host.** Several
  runbooks — notably
  [`snapshot-restore.md`](../04-development/infrastructure/runbooks/snapshot-restore.md)
  — still depend on `COOLIFY_TOKEN` and therefore **cannot work as written**.
  This is a live gap in the disaster-recovery path, not merely stale prose.
- ⚠️ **`deploy-qa` has been failing since PR #45** with
  `unable to unlink old 'package.json': Permission denied` on the QA host, so QA
  is pinned to PR #44's code. Tracked as
  `wf-20260723-fix-128-deploy-qa-permission-fix`.
- ⚠️ **Prod runs `oidc-stub`, not Authentik.** Any reasoning about production
  auth must account for this; QA is the environment with real OIDC.
- 📝 ADR-0008's Docker/UFW port-publishing policy was written against the
  Coolify host. The policy itself still applies — Docker still bypasses UFW —
  but its worked example refers to a host that no longer exists.

## Supersedes

[ADR-0002](0002-deployment-target.md) in full: the host, the provider, the
sizing, and the single-host topology. ADR-0002 remains in the log as the
historical record of why a single hyperapp.cloud box was chosen in May 2026.

## References

- [ADR-0007](0007-coolify-orchestration.md) — retires Coolify as the
  orchestration layer.
- [ADR-0009](0009-email-stack-saas-exception.md) — email stack; its PTR argument
  was tied to the hyperapp.cloud IP and should be re-checked against the new
  hosts.
- `.github/workflows/ci-cd.yml` — the pipeline described above.
- `deploy/docker-compose.{qa,prod}.yml`, `deploy/nginx/*.conf` — the stacks.
- [`github-access.md`](../04-development/github-access.md) — deploy secrets
  (`QA_SSH_DEPLOY_KEY`, `PROD_SSH_DEPLOY_KEY`, and the host-key pins).
