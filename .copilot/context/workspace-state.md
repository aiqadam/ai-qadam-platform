# Workspace State

**Last updated:** 2026-07-27 — `wf-20260727-fix-135`. Verified the backups
against the **live hosts** for the first time and found the ISS-INFRA-003
diagnosis was wrong: restic was never installed on either pro-data.tech host
([ISS-INFRA-004](../issues/ISS-INFRA-004.md)). Prod has run unbacked since
provisioning. Manual dumps taken on both hosts as a stopgap; two further
script defects fixed and verified live.> **Contract — read before editing.** This file answers exactly one question:
> **what is true right now?** It is a snapshot, not a log.
>
> - **Do not prepend close-out narrative.** Workflow history belongs in
>   [`workflow-history.md`](workflow-history.md); the durable record is git.
> - **Update in place.** Replace the rows and the `**Last updated:**` line;
>   do not accumulate.
> - `scripts/check-workflow-state.sh` parses the `**Last updated:**` line and
>   the `| wf-… |` rows in **Active Workflows**. Keep both well-formed.

---

## Active Workflows

| Workflow ID | Type | Feature/Issue | Branch | Status |
|---|---|---|---|---|
| wf-20260726-docs-132 | issue-resolution | ISS-WF-STATE-001 — workspace-state reconciliation | chore/wf-20260726-docs-132-workspace-state-reconcile | in review ([PR #68](https://github.com/aiqadam/ai-qadam-platform/pull/68)) |
| wf-20260727-docs-133 | issue-resolution | ISS-WF-STATE-002 — ADR deployment-target supersession | chore/wf-20260727-docs-133-adr-deployment-supersede | in review ([PR #69](https://github.com/aiqadam/ai-qadam-platform/pull/69)) |
| wf-20260727-fix-134 | issue-resolution | ISS-INFRA-003 — backups broken by Coolify removal | chore/wf-20260727-docs-134-coolify-prose-sweep | running |

### Queued follow-up workflows

- **wf-20260723-fix-128-deploy-qa-permission-fix** — `deploy-qa` CI has failed on
  every push to `main` since PR #45 (`unable to unlink old 'package.json':
  Permission denied` on the QA deploy host). QA is pinned to PR #44's code, so
  ISS-USR-REG-002's AC-4 (live verification) cannot be closed until this lands.
  Handoff: `.copilot/tasks/queued/wf-20260723-fix-128-deploy-qa-permission-fix/handoff.yaml`.
- **wf-20260704-fix-096-pre-existing-api-test-flakes** — 3 `apps/api` test-design
  bugs unmasked by `wf-20260704-fix-095` (`users.spec.ts:65` timestamp race;
  `telegram-auth-controller.spec.ts:161` reflect-metadata; `port-guard.spec.ts`
  cases 4+8 Linux-only mocks).
- **uat-bp-uat-coverage-batch** — 17 workflows queued at
  `.copilot/tasks/queued/uat-bp-uat-coverage-batch/handoff.yaml`.

---

## Open Issues

Only genuinely open items belong here. Resolved issues live in
[`../issues/registry.md`](../issues/registry.md).

- [ISS-USR-REG-002](../issues/ISS-USR-REG-002.md) — code fix **merged**
  2026-07-23 (PR [#51](https://github.com/aiqadam/ai-qadam-platform/pull/51),
  squash `e3edfa7`). Remains open only on **AC-4 (live QA verification)**,
  blocked by the `deploy-qa` failure above.
- [ISS-UAT-BRIDGE-001](../issues/ISS-UAT-BRIDGE-001.md) (blocker,
  api/directus-bridge) — `ensureLinkedByEmail` returns `null` for seed users
  with no `platform.users` row. Blocks AC-2/3 of
  [ISS-UAT-001-1](../issues/ISS-UAT-001-1.md).

---

## Documentation state

A staleness audit on 2026-07-26 found four infrastructure pivots recorded in one
place each and never propagated. Tracked, not yet resolved:

- ✅ **ADR log reconciled** 2026-07-27 (`wf-20260727-docs-133`).
  [`ADR-0040`](../../docs/adr/0040-deployment-target-pro-data-tech.md) now
  records the real deployment target (pro-data.tech QA `95.46.211.230` + prod
  `95.46.211.224`, Compose + Nginx + GH Actions SSH) and supersedes ADR-0002,
  which no longer contradicts ADR-0007. ADR-0038 flipped `Proposed` →
  `Accepted` (it was already machine-enforced by `tools/architecture-check.ts`).
- 🚨🚨 **No backup system exists on either host** — verified by direct
  inspection 2026-07-27 ([ISS-INFRA-004](../issues/ISS-INFRA-004.md)). `restic`
  is not installed, `/etc/restic` is absent, zero timers are configured. Prod
  has had **no backups since it was provisioned**. Manual `pg_dumpall` taken on
  both hosts as a stopgap (local disk only — not a backup system). Standing up
  the real thing is **blocked on a decision**: ADR-0017 specifies Cloudflare R2,
  but the sibling `ai-dala-infra` project mandates *no off-site storage of any
  kind*. That conflict needs resolving before the timers can be enabled.
- ⚠️ **ISS-INFRA-003's diagnosis was wrong** — it said backups "silently broke"
  when Coolify was removed, inferred from code rather than observed. Corrected
  in place. Its code fixes were correct but insufficient.
- ~~**Backups were silently broken**~~ — superseded; found while sweeping Coolify
  prose, fixed in `wf-20260727-fix-134`
  ([ISS-INFRA-003](../issues/ISS-INFRA-003.md)). Both `aiqadam-db-dump.sh` and
  `aiqadam-backup.sh` ran `docker exec coolify-db` under `set -euo pipefail`, so
  each aborted **before** `restic backup`. **Not verified on the hosts** — the
  scripts must be re-installed and a snapshot confirmed; expect a gap from
  2026-07-23. Follow-up: `wf-20260727-fix-135-verify-backups-live`.
- ✅ **Operational runbooks swept** 2026-07-27: `coolify-bootstrap.md` and
  `coolify-app-stacks.md` moved to `runbooks/_archive/` with ⛔ banners;
  `snapshot-restore.md` and `restic-backups.md` rewritten against the real
  hosts; `observability.md`, `secret-rotation-pending.md`, and
  `architecture.md`'s "hardening posture" given scoped correction headers.
  `runbooks/README.md` no longer holds up the dead Coolify runbook as the model
  to imitate.
- **Coolify prose remains in non-operational docs** (~40 files: requirements,
  roadmap, plans, completed task artifacts). Lower risk — none is a procedure an
  operator would follow. Not yet swept.
- ⚠️ **`secret-rotation-pending.md` is a still-open security obligation** whose
  rotation steps all route through the removed Coolify UI. Header added; needs a
  real rewrite before the launch rotation pass.
- **Host `212.20.151.29` is gone** (commit `ef50eba`) — still referenced in
  19 docs.
- **ADR-0037** left `Proposed` deliberately. It is operationally in force (it
  defers Sprint 4 + all of Phase ζ, and `agent-prompts.md` §2.0 makes its layer
  triage mandatory), but its own Outcome section says the remaining Phase A
  tasks "become individual roadmap items when this ADR Accepts" — and no such
  items exist. Accepting it is a roadmap decision, not a docs fix.
- **16 broken internal doc links** (down from 44 in the 2026-06-19 audit).

---

## Git State

- **Default branch:** `main` (repository ruleset id `18687633` requires a PR;
  check via `gh api repos/aiqadam/ai-qadam-platform/rulesets`, not the classic
  branch-protection endpoint).
- **Origin:** `https://github.com/aiqadam/ai-qadam-platform.git` (migrated per
  `ISS-MIGRATE-001`; if `gh` misresolves, run
  `gh repo set-default aiqadam/ai-qadam-platform`).
- **Last commit on `main`:** `866f83f` — *chore(ci): remove smoke-pr.yml* (#67),
  2026-07-26.
- **Deployment:** `deploy/docker-compose.{qa,prod}.yml` + nginx, deployed by
  `.github/workflows/ci-cd.yml` over SSH. **Not Coolify.**

## Next Workflow ID

Authoritative source is [`../meta/next-workflow-id`](../meta/next-workflow-id)
— currently `133`. Always read that file; never infer the counter from this
document.

---

## Notes

**2026-07-26:** Five workflows were sitting in `.copilot/tasks/active/` after
merging — `wf-20260720-feat-125` and `wf-20260723-fix-126` still carried
`status: in-progress` despite merging as `77e21ed` and `d0536ac`. All five moved
to `.copilot/tasks/archived/`. Root cause is the archive step being skipped at
close-out, not a tooling failure; the durable fix is CI enforcement, tracked in
the documentation-state section above.
