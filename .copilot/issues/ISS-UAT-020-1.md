# ISS-UAT-020-1 — BP-UAT-020 has no safe, executable fixture for its "zero-super-admin" precondition

| Field | Value |
|---|---|
| ID | ISS-UAT-020-1 |
| Severity | blocker (for BP-UAT-020 verification only — does not affect FR-ADM-010's shipped status) |
| Module | uat/environment, admin/ADM |
| Status | open |
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

- [ ] AC-1: BP-UAT-020's Seed Fixtures table describes a concrete,
      executable, safe fixture-isolation mechanism for the
      zero-super-admin precondition (not an open design question).
- [ ] AC-2: The chosen mechanism does not require destructive action
      against a shared local dev environment's existing state without a
      verified, automatic restore.
- [ ] AC-3: BP-UAT-020 passes BusinessAnalyst's Step 1 validation
      checklist (`seed_fixture` non-empty check specifically).
- [ ] AC-4: AC-5 (credential-documentation consistency) is mapped to a
      step or negative scenario in the script.
- [ ] AC-5: BP-UAT-020 successfully runs end-to-end via UATRunner against
      `local`, producing a real pass/fail/partial verdict — this is the
      actual live verification of FR-ADM-010's forced-password-change
      mechanism that this issue exists to unblock.

## Resolution

_Open — not yet scheduled. No follow-up workflow ID assigned at time of
filing; picked up by whoever next works BP-UAT-020 or the broader ADM
module's UAT coverage._

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
