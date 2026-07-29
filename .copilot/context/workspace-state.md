# Workspace State

**Last updated:** 2026-07-29 — `wf-20260729-feat-150`.
**FR-ADM-011 (admin user/role management screen) implemented — closes the GitHub issue #107 silent-failure gap.**
[FR-ADM-011](../../docs/03-requirements/FR-ADM-011.md): `/workspace/admin/users`
generalized from invite-list-only into "Invites" + "Manage users" tabs
(`AdminUsersCabinet.tsx` composing the existing `InvitesListInner` and a
new `UserRolesManagerInner`). New API surface in the `admin-invites`
module: `AdminUserRolesController`/`AdminUserRolesService`
(`GET /v1/admin/users`, `GET/PATCH /v1/admin/users/:id/roles`), all
guarded by the existing `AuthGuard`+`SuperAdminGuard` chain. Every
grant/revoke does a read-merge-write against `AuthentikClient.setUserGroups()`
(REPLACE semantics), then re-reads and returns the actually-applied
state — never an optimistic assumption, closing the exact class of bug
GitHub issue #107 reported. Extracted a shared
`AuthentikClient.getSuperAdminCount()` primitive (plus `MAX_SUPER_ADMINS = 3`)
that both `AdminBootstrapService` (bootstrap's `>=1` check, refactored to
use it) and the new grant/revoke path (`>3` cap, symmetric `<=1`
self-lockout floor) read through — single source of truth per FR-ADM-010's
own deferred-responsibility note. Added `roleLabel()`/`roleLabels()`
plain-language mapping to `apps/web-next/src/lib/roles.ts` (e.g.
"Country Lead — Uzbekistan", not `aiqadam-country-lead-uz`) — did not
previously exist despite the FR text assuming it did (roles.ts held only
boolean predicates). **Security-review-caught fix during this same
workflow:** `AuthentikClient.resolveGroupNames()` silently drops
unresolvable group names; `changeRole()` now verifies the resolved count
before writing, refusing with `ConflictException` instead of risking a
silent partial-group-loss write — a new instance of the #107 failure
class would have been ironic to ship inside the FR meant to close it.
1349/1350 `apps/api` tests pass (1 pre-existing, already-tracked flake,
`wf-20260704-fix-096-pre-existing-api-test-flakes`), 946/946
`apps/web-next` tests pass. Per `business_process: [BP-UAT-021]`, the
workflow protocol mandates a same-session post-merge `uat-verification`
run against `BP-UAT-021` before this workflow is considered complete —
check this file's own next entry (or `wf-20260729-feat-150`'s task
directory at `.copilot/tasks/completed/wf-20260729-feat-150/`) for the
outcome. **Known inherited gap, not introduced by this workflow:**
`BP-UAT-021`'s own file documents an unresolved `three-super-admins`
live-fixture gap for its Negative-001 scenario (AC-3's live 3-admin
cap-block test) — the cap logic itself is exhaustively unit-tested at
every boundary (count=2/3), so this only affects the DEPTH of live E2E
coverage, not whether AC-3 is verified.

`wf-20260728-feat-148` — **FR-ADM-010 (platform admin bootstrap) implemented — no more manual Authentik console steps.**
[FR-ADM-010](../../docs/03-requirements/FR-ADM-010.md): new `AdminBootstrapService`
(`apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`, `OnModuleInit`)
seeds exactly one `admin@aiqadam.org`-style super-admin directly in Authentik
on boot when `aiqadam-super-admin` has zero members, idempotent on every
later boot (keyed on live group-membership count, not seeded-email
existence, to avoid a dangling-zero-admin state on partial failure).
Replaces the manual procedure at ADR-0021 §9 step 3 (already marked
superseded there). Status flipped `Implemented`/`Shipped` in
`FR-ADM-010.md` and `requirements-registry.md`. **Known unverified gap,
by design:** the forced-password-change-on-next-login mechanism
(`AuthentikClient.patchAttributes()` with `ak_login_password_change_required`)
has not been confirmed against a live Authentik instance in this
workflow — no Testcontainers-Authentik double exists in this repo. Per
`business_process: [BP-UAT-020]` in `handoff.yaml`, the workflow protocol
mandates a same-session post-merge `uat-verification` run against
`BP-UAT-020` before this workflow is considered complete; check this
file's own next entry (or `wf-20260728-feat-148`'s task directory at
`.copilot/tasks/completed/wf-20260728-feat-148/`) for the outcome.

`wf-20260728-fix-145` — **QA's Directus environment-parity gap closed — QA now matches local.**
[ISS-INFRA-QA-DIRECTUS-SCHEMA-001](../issues/ISS-INFRA-QA-DIRECTUS-SCHEMA-001.md):
ran `infrastructure/directus/bootstrap.sh` + `flows-bootstrap.sh` against
QA's Directus live (29 → 79 collections, all 7 ADR-0021 RBAC policies +
`policy.member`'s permission rows, 3 registration-lifecycle flows). Also
found and fixed a second, independent, compounding bug while verifying:
`aiqadam-qa-api-1`'s `DIRECTUS_TOKEN` was a literal placeholder — a
different env var (`DIRECTUS_ADMIN_TOKEN`) held the real token, but
`docker-compose.qa.yml`'s `api` service never wired the two together, so
the API could not talk to Directus at all regardless of schema state.
Fixed the compose file (repo-tracked, prevents regression on next
deploy) + QA's live `.env` (backed up first) + enabled
`RBAC_SYNC_WRITE_ENABLED=true` there too. Live-verified:
`qa.aiqadam.org/me/profile` → 200, `/api/v1/leaderboard` → real Directus
round-trip, anonymous `directus_users` read still correctly denied (the
PII-leak fix from `wf-20260728-fix-144` did not regress). **Known
remaining gap:** no real signed-in QA member session was tested (no test
credentials available this session) — next QA UAT touch should verify a
live human sign-in → profile-load round trip. Infra-only workflow, no
PR (direct SSH changes to `pro-data-tech-qa` + one `docker-compose.qa.yml`
line landed via the normal branch/PR path for the repo-tracked part).

`wf-20260728-fix-144` — **`/me/profile` 500 fixed (user-reported live from `qa.aiqadam.org`) +
a critical PII leak found and closed + a much larger QA infra gap
discovered.** [ISS-USR-PROFILE-002](../issues/ISS-USR-PROFILE-002.md):
`MeProfileService.getProfile()` unconditionally requested `onboarded_at`;
`policy.member` had zero `directus_permissions` rows (ISS-RBAC-PERMS-001),
so Directus 403'd the field and the whole request crashed unhandled for
every real member. Fixed two ways: (1) `getProfile()` now retries without
`onboarded_at` on a field-level 403 instead of losing the whole response;
(2) `bootstrap.sh` now seeds `policy.member`'s own-row grants on
`directus_users`/`member_consents`/`member_skills`/`member_interests`/
`member_employments` (14 rows, new `ensure_perm_for_policy` helper).
Verified live via a real Authentik login locally. **While
security-reviewing the permission grants, found and fixed a critical,
unrelated, pre-existing bug:** Directus's built-in Public policy had an
unrestricted `directus_users` read grant — any anonymous request could
read every member's full profile (email, bio_md, telegram_user_id, all
of it) and enumerate every user. Local-only (confirmed via live SSH
check: QA's Public policy has zero `directus_users` rows, so QA was never
exposed to this specific leak). Fixed via new idempotent
`revoke_public_read()` in `bootstrap.sh`. Filed
[ISS-SEC-DIRECTUS-USERS-PUBLIC-001](../issues/ISS-SEC-DIRECTUS-USERS-PUBLIC-001.md)
(resolved). **Also discovered, NOT fixed this session:** QA's Directus
has no application schema at all — only Directus's own built-in system
collections exist; `bootstrap.sh` has apparently never been run against
QA. This is very likely the actual root cause of the original bug
report (much bigger than a missing-permissions gap). Filed
[ISS-INFRA-QA-DIRECTUS-SCHEMA-001](../issues/ISS-INFRA-QA-DIRECTUS-SCHEMA-001.md)
(open, not yet scheduled — running the full `bootstrap.sh` against a live
shared environment needs its own deliberate review pass, per explicit
user instruction not to do it as a same-session drive-by). Prod has no
Directus deployed at all yet (placeholder `DIRECTUS_URL`/`DIRECTUS_TOKEN`
config on `aiqadam-prod-api-1`) — confirmed expected/known state, not a
gap. PR [#102](https://github.com/aiqadam/ai-qadam-platform/pull/102),
merged.

`wf-20260728-fix-143` — **Local RBAC sync fixed to actually attach Directus policies to seeded UAT
users — two stacked bugs.** [ISS-UAT-RBAC-001](../issues/ISS-UAT-RBAC-001.md):
(1) `RBAC_SYNC_WRITE_ENABLED` defaulted `false` locally, undocumented;
(2) once enabled, `DirectusPolicyApplier.apply()` sent a flat UUID array
for the `policies` M2M alias field on `directus_users`, which Directus
rejects with a generic 403 even for a true `admin_access: true` token —
confirmed against `directus/directus` GitHub issue #25108 and
`directus/docs` issue #520; the field requires the nested
`{create, update, delete}` relational envelope instead. Fixed both; live
`POST /v1/internal/rbac/poll` now flips all 4 scanned UAT users to
`rbac_sync_jobs.directus_status: applied`, confirmed directly against
Directus that `uat-member@example.com` holds a real `directus_access` row.
Regression test rewritten (the old version asserted the buggy shape).
**Does not fully unblock BP-UAT-003/016** — live verification surfaced a
separate, pre-existing gap: all 7 ADR-0021 §4.1 policies have zero
`directus_permissions` rows anywhere in the codebase, so a correctly
attached policy currently grants nothing. Filed
[ISS-RBAC-PERMS-001](../issues/ISS-RBAC-PERMS-001.md), queued as
`wf-20260728-fix-144` (see Queued follow-up workflows below). Also: the
user explicitly relaxed `.claude/CLAUDE.md`'s blanket "never modify `.env`"
rule mid-workflow to permit direct edits to local dev/test `.env` files
(config flags only, never secrets/prod) — recorded in CLAUDE.md with
rationale. PR [#100](https://github.com/aiqadam/ai-qadam-platform/pull/100),
merged.

`wf-20260728-fix-141` — **`MeProfileService` fixed to resolve Directus ids via the bridge — was
breaking `/me/profile`, `/me/preferences`, and (partly) `/me/referrals`
on QA.** Reported via [GitHub issue #94](https://github.com/aiqadam/ai-qadam-platform/issues/94)
("Profile data errors"). Root cause: `MeProfileService` queried Directus
directly using the platform `users.id` (JWT `sub`) as if it were
`directus_users.id` — two different UUID spaces. It never called
`DirectusUsersBridgeService.ensureLinked()` the way `ReferralsService`
already correctly does, so every Directus call 404s/errors against the
wrong primary key. Fixed by injecting the bridge and resolving the real
Directus id in all 15 methods; also fixed an independent, latent shape
mismatch in `GET /v1/referrals/mine/stats` (controller returned the body
unwrapped; the frontend hook expected `{ stats: ... }`). 77/77 targeted
tests + 1293/1294 full `apps/api` suite (1 pre-existing, unrelated,
already-tracked flake). See [ISS-USR-PROFILE-001](../issues/ISS-USR-PROFILE-001.md),
PR [#95](https://github.com/aiqadam/ai-qadam-platform/pull/95), merged
`313365f`.

`wf-20260728-fix-140-recovery-flow-redirect` (`createRecoveryLink()`
field-name bug, [ISS-USR-REDIRECT-002](../issues/ISS-USR-REDIRECT-002.md))
merged earlier the same day via PR #92 — the row below had gone stale
showing it still `running`; corrected here since this file is a
snapshot, not a log.
> **Contract — read before editing.** This file answers exactly one question:
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

- **(no workflow id assigned yet — not yet a task directory)** pick up by
  starting issue-resolution for
  [ISS-RBAC-PERMS-001](../issues/ISS-RBAC-PERMS-001.md) — `policy.member`'s
  own-row grants shipped via `wf-20260728-fix-144` (and now also live on
  QA via `wf-20260728-fix-145`); still needed: `policy.member`'s
  public-read + create-own-registration halves, and all 6 other
  ADR-0021 §4.1 policies (`speaker` through `svc_worker`) — on BOTH
  local and QA now that QA has caught up to local's schema baseline.
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

- [ISS-UAT-020-1](../issues/ISS-UAT-020-1.md) (blocker, uat/environment +
  admin/ADM) — BP-UAT-020 has no safe, executable fixture for its
  "zero-super-admin" precondition (only an unresolved design question:
  isolated Authentik realm vs. destructive remove-and-restore against
  shared local dev state). Blocks live verification of FR-ADM-010's
  forced-password-change mechanism only — does not affect FR-ADM-010's
  `Implemented`/`Shipped` status, which is fully unit-verified. No
  follow-up workflow queued yet.
- [ISS-USR-REG-002](../issues/ISS-USR-REG-002.md) — code fix **merged**
  2026-07-23 (PR [#51](https://github.com/aiqadam/ai-qadam-platform/pull/51),
  squash `e3edfa7`). Remains open only on **AC-4 (live QA verification)**,
  blocked by the `deploy-qa` failure above.
- [ISS-UAT-BRIDGE-001](../issues/ISS-UAT-BRIDGE-001.md) (blocker,
  api/directus-bridge) — `ensureLinkedByEmail` returns `null` for seed users
  with no `platform.users` row. Blocks AC-2/3 of
  [ISS-UAT-001-1](../issues/ISS-UAT-001-1.md).
- [ISS-USR-REDIRECT-003](../issues/ISS-USR-REDIRECT-003.md) (blocker,
  api/auth + infra/authentik) — self-registration's welcome-email link
  does not actually sign new members in (Authentik's recovery link isn't
  a real one-time-login mechanism). Needs design input; no workflow
  scheduled yet.

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
- ✅ **Backups live** ([ISS-INFRA-004](../issues/ISS-INFRA-004.md)) — resolved
  2026-07-27 by cross-host replication: prod ⇄ QA, nightly 03:00 UTC, systemd
  timers enabled and green on both hosts. Restore verified (prod's dump reads
  back cleanly from QA). Prior state: **no backup system existed at all** —
  restic was never installed on either host, and prod had run unbacked since
  provisioning.
- ⚠️ **ADR-0017 now contradicts reality** — it is `Accepted` and specifies
  Cloudflare R2, but the deployed model is cross-host replication with no
  external provider (the `ai-dala-infra` no-off-site rule forbids R2). Needs a
  superseding ADR.
- ⚠️ **Residual backup limitation:** both hosts are KVM guests at the same
  provider on adjacent IPs. Protects against disk failure, bad migrations and
  loss of one VM; does **not** protect against provider-level loss.
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
