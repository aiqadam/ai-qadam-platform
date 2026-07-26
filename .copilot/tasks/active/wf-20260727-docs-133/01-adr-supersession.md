# 01 — ADR deployment-target supersession

**Workflow:** `wf-20260727-docs-133`
**Issue:** ISS-WF-STATE-002 (ADR log contradicts itself on deployment target)
**Status:** passed
**Stacked on:** `wf-20260726-docs-132` (PR #68) — that branch is the base, so
this diff stays clean on the shared `next-workflow-id` / `workspace-state.md`.

---

## Problem

Two ADRs made mutually exclusive claims, both carrying full authority:

| ADR | Status before | Claim |
|---|---|---|
| 0002 | **Accepted** | *"Coolify v4.0.0 orchestrates every stack"* on host `212.20.151.29` |
| 0007 | Superseded 2026-07-23 | Coolify removed; replaced by Compose + Nginx + GH Actions SSH |

ADR-0002 is the lower number and the one linked from the architecture docs, so
an agent resolving the conflict by convention would pick the **wrong** one. Both
of its claims are false: Coolify was removed in PR #45, and commit `ef50eba`
records the host itself as gone.

Separately, ADR-0038 sat at `Proposed` for two months while
`tools/architecture-check.ts` — a file whose header reads *"ADR-0038
enforcement"* — failed builds citing its §Locks by name. `Proposed` told agents
the decision was open for debate; the build says otherwise.

## Ground truth established before writing

Read from live config, not inferred:

| Fact | Source |
|---|---|
| QA host `95.46.211.230`, prod host `95.46.211.224` | `.github/workflows/ci-cd.yml` |
| `deploy-qa` auto on `main`; `deploy-prod` manual `workflow_dispatch` with a validated 7–40 hex SHA | same |
| SSH forced command `deploy:<ref>` as `deploy@<host>`, `StrictHostKeyChecking=yes` | same |
| Health checks retry 5× / 10 s against `/health` and `/` | same |
| Prod services: `postgres`, `oidc-stub`, `api`, `web-next` | `deploy/docker-compose.prod.yml` |
| Prod runs an **`oidc-stub`**, not real Authentik | same |
| Directus deliberately disabled in prod (`INTERNAL_DIRECTUS_URL: http://127.0.0.1:1`) | same |
| Domains `aiqadam.org`, `qa.aiqadam.org`, `auth.qa.aiqadam.org` | `deploy/nginx/*.conf` |

## Changes

| # | Change |
|---|---|
| 1 | **New [`ADR-0040`](../../../docs/adr/0040-deployment-target-pro-data-tech.md)** — records the two-host pro-data.tech topology, the Compose + Nginx stack, and the `ci-cd.yml` deploy pipeline. Supersedes ADR-0002. |
| 2 | **ADR-0002 → `Superseded, 2026-07-27`** with a pointer to 0040 and an explicit "nothing in the Decision section below is still true" warning. Decision text left untouched per the append-only rule. |
| 3 | **ADR-0038 → `Accepted, 2026-07-27`**, citing the enforcement that already existed. Original `Proposed` status preserved in the note. |
| 4 | **`adr/README.md` index** updated for all three, plus a new 0040 row. |
| 5 | `workspace-state.md` documentation-state section updated to reflect what is now fixed vs. still outstanding. |

ADR-0040 deliberately records the **⚠️ consequences that are currently broken**
rather than presenting a clean story: the dead `snapshot-restore.md` DR path,
the `deploy-qa` permission failure since PR #45, prod running `oidc-stub`, and
ADR-0008's UFW policy example pointing at a host that no longer exists.

## Deliberately NOT changed

**ADR-0037 stays `Proposed`.** The audit listed it alongside 0038 as
"shipped but Proposed", and on closer reading that was too quick a call:

- It **is** operationally in force — `community-platform-roadmap.md` defers
  Sprint 4 and all of Phase ζ on its authority, and `agent-prompts.md` §2.0
  makes its layer triage mandatory before any feature work.
- But its own Outcome section states the remaining Phase A tasks (A1–A5)
  *"become individual roadmap items when this ADR Accepts"* — and a grep shows
  **no such roadmap items exist**.

Flipping it would therefore trigger a roadmap commitment, not just correct a
label. That is a product decision for the user, not a documentation fix.
Recorded in `workspace-state.md` for an explicit call.

## Verification

- All ADR status lines parse against the `README.md` legend
  (`Accepted` / `Proposed` / `Deferred` / `Superseded`) — **31/31 clean**,
  including the previously stray `Proposed, 2026-05-25.` on 0038.
- Every link in ADR-0040 resolves on disk (7/7 checked).
- Reverse links present: 0002 → 0040, README → 0040 (×2).
- No remaining `Accepted` ADR asserts Coolify as the live orchestrator.
- `pnpm arch:check` → passed.
- `check-workflow-state.sh --base origin/main` → exit 0, no drift.

## Residual risk

Low — documentation only; no code, schema, or CI config touched. ADR-0040
asserts infrastructure facts, so the risk is that a fact is wrong rather than
that something breaks; each was read from committed config and is cited above.

The Coolify **prose** sweep (~63 files, including the broken DR runbook) is
explicitly *not* in this workflow. The ADR layer is now correct and can serve
as the reference for that sweep.
