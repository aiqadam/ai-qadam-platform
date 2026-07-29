# ISS-UAT-020-1 — BP-UAT-020 has no safe, executable fixture for its "zero-super-admin" precondition

| Field | Value |
|---|---|
| ID | ISS-UAT-020-1 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/125 |
| Severity | blocker (for BP-UAT-020 verification only — does not affect FR-ADM-010's shipped status) |
| Module | uat/environment, admin/ADM |
| Status | resolved |
| Reported | 2026-07-28 |
| Reporter | BusinessAnalyst (`wf-20260728-uat-149`, Step 1 UAT script validation) |
| Related | FR-ADM-010 (shipped, PR #110), BP-UAT-020 (Draft, blocked by this issue) |
| Business-Process | BP-UAT-020 |

## Symptom

`docs/02-business-processes/uat/BP-UAT-020.md`'s frontmatter declares
`seed_required: true`, but its "Seed Fixtures Required" section does not
describe an executable fixture — it describes an open design question the
script's own author explicitly deferred at draft time:

> Requires a dedicated fixture path: either a fresh/isolated Authentik
> realm for this run, or removing all `aiqadam-super-admin` members before
> Step 001 and restoring after teardown. CodeDeveloper/TestDesigner to
> confirm the exact isolation mechanism once FR-ADM-010 is implemented —
> flagged here as a known gap, not resolved by this draft.

No `scripts/uat-fixtures/BP-UAT-020.json` manifest exists (only
`BP-UAT-001.json` and `BP-UAT-013.json` are present) to compensate.

This was caught by BusinessAnalyst's Step 1 validation
(`.copilot/tasks/active/wf-20260728-uat-149/01-uat-script-validation.md`,
`gate_result: failed-retry`) when `wf-20260728-feat-148` (FR-ADM-010's
implementation workflow) spawned the protocol-mandated post-merge
`uat-verification` run against BP-UAT-020, per
`.copilot/schemas/protocol.md` "Business-Process Linkage & Post-Merge UAT."

## Impact

BP-UAT-020's Step 001 ("Bootstrap runs against a zero-admin environment")
requires the shared local dev environment to have **zero**
`aiqadam-super-admin` members — the opposite of the standard `pnpm
uat:seed` fixture, which pre-binds `uat-operator@example.com` to
`aiqadam-super-admin`. Satisfying this precondition as the script is
currently written would require either:

1. Infrastructure that does not exist today (an isolated/fresh Authentik
   realm scoped to this UAT run), or
2. A destructive action against the shared local dev environment's
   existing seeded state — removing `aiqadam-super-admin` group members
   that other UAT fixtures and engineers may depend on — with no
   concretely specified, guaranteed restore step beyond the vague
   "restoring after teardown" in the fixture table.

Improvising option 2 inside a single UATRunner session was judged unsafe
by BusinessAnalyst and is not being attempted. This means:

- **FR-ADM-010's live-Authentik behavior remains genuinely unverified**
  in an automated/repeatable way: specifically, whether
  `AuthentikClient.patchAttributes(userPk, { ak_login_password_change_required:
  true })` actually forces Authentik's password-change screen on next
  login (AC-1's live half, AC-3's forced-screen half — both already
  disclosed as unverified in `FR-ADM-010.md`'s Notes section, the
  `admin-bootstrap.service.ts` code comment, and `auth-architecture.md`
  §9.5).
- This does **not** block or reverse FR-ADM-010's `Implemented`/`Shipped`
  status. The code-level behavior (correct Authentik API calls attempted,
  idempotency, no password logging) is fully unit-tested and verified per
  `wf-20260728-feat-148`'s own test suite. What remains unverified is
  strictly the live-Authentik enforcement half, which was always
  understood to require BP-UAT-020 and was never claimed as verified.

## Proposed resolution

Design a safe, repeatable fixture-isolation mechanism for BP-UAT-020
before it can run, e.g.:

- A dedicated Authentik test realm/tenant, provisioned and torn down per
  UAT run (heaviest option, cleanest isolation).
- Or: a documented, guaranteed remove-and-restore sequence (snapshot the
  existing `aiqadam-super-admin` membership before Step 001, remove
  members, run the script, restore the exact prior membership in
  teardown) with real rollback verification, run only against a local
  dev stack that no other in-flight workflow is using concurrently.
- Or: a manual, human-supervised one-time verification (not
  agent-autonomous) against a genuinely fresh environment (e.g. a
  throwaway `docker compose` stack with an empty Authentik volume) —
  lower automation value but avoids both the infra gap and the
  shared-state risk.

Whichever mechanism is chosen, author it into BP-UAT-020.md's Seed
Fixtures table with a concrete, executable description (not an open
question) and, if warranted, a `scripts/uat-fixtures/BP-UAT-020.json`
manifest, per BusinessAnalyst's Step 1 checklist. Also close the
secondary gap BusinessAnalyst found in the same validation pass: AC-5
(seeded credentials documented identically in `.env.example` and
`auth-architecture.md`) has no step or negative-scenario reference
anywhere in the script.

## Acceptance criteria

- [x] AC-1: BP-UAT-020's Seed Fixtures table describes a concrete,
      executable, safe fixture-isolation mechanism for the
      zero-super-admin precondition (not an open design question).
- [x] AC-2: The chosen mechanism does not require destructive action
      against a shared local dev environment's existing state without a
      verified, automatic restore.
- [x] AC-3: BP-UAT-020 passes BusinessAnalyst's Step 1 validation
      checklist (`seed_fixture` non-empty check specifically).
- [x] AC-4: AC-5 (credential-documentation consistency) is mapped to a
      step or negative scenario in the script.
- [x] AC-5: BP-UAT-020 successfully runs end-to-end via UATRunner against
      `local`, producing a real pass/fail/partial verdict — this is the
      actual live verification of FR-ADM-010's forced-password-change
      mechanism that this issue exists to unblock. **Result: partial —
      AC-1/AC-2/AC-4/AC-5 of BP-UAT-020 verified MATCH; AC-3 verified
      MISMATCH, filed as [ISS-ADM-010-1](ISS-ADM-010-1.md).** This
      issue's own AC-5 only requires the run to happen and produce a
      real verdict, which it did — the verdict itself surfacing a defect
      is success for this fixture-mechanism issue, not failure.

## Resolution

- **Workflow:** wf-20260729-fix-153
- **PR:** <pending>
- **Root cause:** BP-UAT-020's Seed Fixtures table left the zero-super-admin
  isolation mechanism as an open design question at draft time (before
  FR-ADM-010 existed) and it was never resolved once FR-ADM-010 shipped.
- **Fix:** Chose snapshot-remove-restore over a dedicated Authentik
  realm/tenant, based on reading `AdminBootstrapService.hasSuperAdminMember()`
  (`apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`) — it is
  checked exactly once, at API process `OnModuleInit`, never on a live
  request, so the zero-admin window a fixture needs to open only has to
  span one local `api` process restart, not the whole UAT session. New
  `scripts/uat-bp-uat-020-fixture.sh` (`setup`/`teardown`/`verify-restored`)
  snapshots `aiqadam-super-admin`'s exact live member pks, empties the
  group, restarts the local api process so bootstrap fires against zero
  admins, and on `teardown` restores the exact snapshotted pk array with an
  automatic post-restore verification (fails loudly, preserves the
  snapshot file, if the restored membership doesn't match) rather than
  trusting the PATCH call's status code alone — satisfies AC-2's "no
  destructive action without a verified, automatic restore." New manifest
  `scripts/uat-fixtures/BP-UAT-020.json`. `BP-UAT-020.md` rewritten: Seed
  Fixtures table now names the concrete mechanism; new Step 000 wires
  `setup` in before Step 001; new Teardown section wires `teardown` in
  after the negative scenarios; new Negative 002 maps AC-5
  (credential-documentation consistency) to an explicit check — confirmed
  `apps/api/.env.example` and `auth-architecture.md` §9.5 already agree
  on `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_DEFAULT_PASSWORD`, so this
  was a "script coverage gap," not a real documentation drift.
- **Regression test:** `scripts/tests/uat-bp-uat-020-fixture.bats` (11
  cases, all passing) — covers the localhost-only guard refusing a
  non-local `AK_URL` before any mutation, `setup` refusing to run over an
  un-torn-down snapshot, `teardown` refusing to run with no snapshot
  present, and a full `setup` → `teardown` → `verify-restored` cycle
  confirming the snapshot file (the durable "a restore is still owed"
  signal) is created and removed at the right points. These would have
  failed before the fix (the script did not exist) and pass after.
- **Merged:** <pending>

### AC-5 live verification

Ran `scripts/uat-bp-uat-020-fixture.sh setup`, then a Playwright agent-driven
session (`apps/e2e/tests/uat/BP-UAT-020.session.spec.ts`, run id
`wf-20260729-uat-154`, evidence at
`apps/e2e/uat-results/BP-UAT-020/wf-20260729-uat-154/`), then
`scripts/uat-bp-uat-020-fixture.sh teardown`. Real, corroborated per-step
verdicts:

| Step | AC | Verdict | Evidence |
|---|---|---|---|
| 001 — bootstrap fires against zero admins | AC-1 | **MATCH** | Direct Authentik API: `admin@aiqadam.org` created (pk varied per run), assigned to `aiqadam-super-admin`, `ak_login_password_change_required: true`. Confirmed independently via API before the browser session AND via the session's own precondition check. |
| 002 — forced password-change screen | AC-3 | **MISMATCH** | Sign-in with the seeded credentials succeeds normally and redirects straight to the app (`/me`), no password-change stage shown. Filed as [ISS-ADM-010-1](ISS-ADM-010-1.md) — a genuine product defect, not a fixture/script problem. |
| 003 — admin reaches `/workspace/admin/countries` | AC-4 | **MATCH** | Countries admin table rendered with `Edit`/`Provision` actions — confirms full super-admin access despite AC-3's failure (the two are independent). |
| Negative 001 — idempotent no-op | AC-2 | **MATCH** | Exactly 1 matching Authentik user both before and after a second `api` boot with the group non-empty — no duplicate created. |
| Negative 002 — credential docs consistency | AC-5 | **MATCH** | `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` present with identical names in both `apps/api/.env.example` and `auth-architecture.md`. |

**AC-5 of this issue (BP-UAT-020 runs end-to-end producing a real verdict)
is satisfied** — the session ran, produced real screenshots and
API-corroborated verdicts, and correctly surfaced a genuine product defect
(AC-3) rather than a false pass. Per `uat-verification.md`'s triage rule,
a defect found during live verification is registered separately
([ISS-ADM-010-1](ISS-ADM-010-1.md)) and does not block this issue's own
completion — this issue was about building the fixture mechanism and
proving it works, which it does.

### Debugging notes (kept for future maintainers, not part of the fix itself)

Getting to the clean run above required fixing two additional real bugs
discovered only by running the mechanism for real (not visible in
mock-mode bats):

1. `restart_api_and_wait_boot()` originally only polled the health
   endpoint without ever terminating the running process (reported
   success against an already-healthy api without bootstrap re-running
   at all), then a second version assumed `nest start --watch`'s
   supervisor would auto-respawn a force-killed child (false — the whole
   watch chain dies with it). Both fixed; see the function's own header
   comment in `scripts/uat-bp-uat-020-fixture.sh` for the full history.
   A `cmd.exe start /b` / PowerShell `Start-Process` detached-launch
   alternative was also tried and abandoned as unreliable in practice.
2. Repeated debugging cycles (deleting/recreating the seeded Authentik
   admin many times while iterating on the session script) left a stale
   `public.users` row in Postgres keyed on the OLD `authentik_subject`
   but the SAME `email` — `AuthController.callback()`'s upsert
   (`ON CONFLICT (authentik_subject)`) doesn't match a differing subject,
   so it attempted a fresh INSERT that collided with the stale row's
   `users_email_unique` constraint, 500ing `GET /api/v1/auth/callback`
   for every subsequent sign-in attempt. Not a fixture-design gap (a
   single clean run never creates two different Authentik subjects for
   the same seeded email) — cleaned up manually
   (`DELETE FROM public.users WHERE email = 'admin@aiqadam.org'`) and
   confirmed the callback succeeds cleanly afterward. Recorded here in
   case a future BP-UAT-020 run hits the same 500 after an interrupted
   prior session — the fix is deleting the stale local mirror row, not a
   code change.

### Honesty disclosures

1. This issue does **not** indicate a defect in FR-ADM-010's shipped
   code — `wf-20260728-feat-148`'s own test suite (48/48 tests,
   independently re-run by TestRunner and cited by QualityGate) fully
   verifies the code-level behavior. What remains open is strictly the
   live-Authentik enforcement verification, which both the FR file and
   this issue are explicit was never claimed as verified pre-BP-UAT-020.
2. `wf-20260728-feat-148` (FR-ADM-010's requirement-development workflow)
   is considered **complete** despite this open finding, per
   `.copilot/schemas/protocol.md`'s "Business-Process Linkage & Post-Merge
   UAT" outcome-handling rule for a `uat-verification` run that hits
   `failed-escalate` at Step 1 (env/script gap, not a product finding):
   this issue is registered, the deferral is disclosed here and in
   `FR-ADM-010.md`, and the parent workflow completes rather than
   blocking indefinitely on a UAT-script authoring gap unrelated to the
   code itself.
3. No follow-up workflow is queued yet for this issue's own resolution —
   designing a safe fixture-isolation mechanism is nontrivial (three
   real options, no obviously-correct default) and was judged out of
   scope to improvise inside this post-merge verification session. This
   is flagged honestly here rather than silently left unqueued.
