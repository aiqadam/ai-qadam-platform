---
code: FR-WORKFLOW-003
name: UAT fixture state reset — order-independent, re-entrant UAT runs
status: Implemented
module: Workflow (WORKFLOW)
phase: DevEx
---

## Description

UAT scripts (BP-UAT-001…018) are designed to be order-independent — only
BP-UAT-000 (environment health) is a declared hard prerequisite. In practice
they are **not re-entrant**: `scripts/uat-seed.sh` is idempotent in the
*create-if-missing* sense only, while the scripts themselves mutate the
seeded fixtures. Examples: BP-UAT-001 publishes `uat-event-draft-uz`
(fixture contract requires `status='draft'`), BP-UAT-013 consumes
operator-invite tokens, several scripts create registrations. After one run,
fixtures no longer match their declared preconditions, so re-running the
same script — or running any script that assumes a fixture's initial
state — fails for state reasons, not product reasons. `FORCE_REGEN=1`
resets only Authentik users, not domain rows.

This FR makes the seed *reset-to-declared-state* per UAT script, so any
BP-UAT can run at any time, any number of times, on a stack of unknown
history. This is a precondition for fully autonomous scheduled UAT
(nightly re-verification of all business processes) and for the
`uat-verification` pilot re-run planned in
`docs/04-development/testing/visual-testing.md` (Rollout step 4).

## Users

The UATRunner agent and the Orchestrator (uat-verification workflow
Step 2 pre-flight). Human operators re-running a single BP-UAT locally.

## Functional scope

1. **Per-BP reset mode in the seed script:**
   `pnpm uat:seed --reset BP-UAT-NNN` (and `--reset all`). For the named
   script, delete and recreate every **mutable domain fixture** it declares
   (events, registrations, `member_consents`, `operator_invites`,
   `event_announcements` ledger rows) to the exact initial state in the
   BP-UAT file's "Seed Fixtures Required" table. Without `--reset`, behavior
   is unchanged (create-if-missing) — existing callers are unaffected.
2. **Fixture manifest as machine-readable source of truth:** each BP-UAT
   file's fixture table gains a stable fixture `id` column matching a
   manifest in `scripts/uat-fixtures/<BP-UAT-NNN>.json` (fixture id →
   collection, filter, initial payload). The seed script iterates the
   manifest; fixture drift between doc and manifest is a validation error
   in BusinessAnalyst Step 1 (script validation). **v1 scope:** only
   `BP-UAT-001` and `BP-UAT-013` get the `id` column and a manifest file
   in this FR — both already have well-documented, non-trivial fixture
   sets, and BP-UAT-013 already has plus-addressing precedent (item 4).
   The remaining BP-UAT files get manifests in follow-up FRs as needed;
   converting all 18 doc files plus the script change in one PR would
   exceed this repo's small-PR discipline (AGENTS.md §4).
3. **Identity fixtures are reset, never recreated:** Authentik users keep
   their PKs (deleting identities would invalidate sessions and RBAC
   group history); reset means restoring group membership and consents,
   equivalent to today's `FORCE_REGEN=1` but scoped per BP.
4. **Non-deletable state uses run-unique values:** where a consumed
   artifact cannot safely be deleted (e.g. verification emails), fixtures
   are generated run-unique (plus-addressing suffix with run id — pattern
   already established in BP-UAT-013 / ISS-UAT-013-8).
5. **Production guard:** `--reset` refuses to run (exit 4, no side
   effects) unless the target Directus/Authentik URLs resolve to
   localhost. Reuses the environment guard pattern from the UAT config
   ("never target production").
6. **Workflow integration:** `uat-verification.md` Step 2 pre-flight
   changes from `pnpm uat:seed` to `pnpm uat:seed --reset <BP-UAT-NNN>`.
   `.copilot/agents/business-analyst.md`'s Step 1 validation checklist
   gains an 8th row: `manifest matches doc fixture table (if BP-UAT has
   a scripts/uat-fixtures/<NNN>.json) | PASS/FAIL/N/A | diff named on
   FAIL` — this is what AC-5 is checked by.
7. **Tests:** bats coverage for the reset path under
   `UAT_SEED_DIRECTUS_MOCK=1` — manifest parsing, delete-then-create
   ordering, localhost guard, unknown BP-UAT id (exit non-zero),
   `--reset all` iteration.

## Acceptance criteria

- [x] AC-1: Running the same BP-UAT twice in a row (seed --reset between
      runs) passes both times with no manual cleanup.
- [x] AC-2: Running BP-UAT-001 (mutates the draft event) then
      BP-UAT-002 (assumes operator panel fixtures) passes — cross-script
      state leakage eliminated for the reset fixtures.
- [x] AC-3: `--reset BP-UAT-NNN` touches only fixtures in that script's
      manifest — rows created by other BP-UATs and non-UAT data are
      untouched (verified by row-count diff on unrelated collections).
- [x] AC-4: `--reset` against a non-localhost target exits 4 with no
      writes performed.
- [x] AC-5: A BP-UAT whose doc fixture table and JSON manifest disagree
      fails BusinessAnalyst Step 1 validation with the diff named.
- [x] AC-6: `bash -n scripts/uat-seed.sh` passes; bats suite green under
      mock mode; existing no-flag seed behavior byte-identical in mock runs.
- [x] AC-7: `uat-verification.md` Step 2 documents the reset invocation and
      its failure semantics (`failed-escalate` on non-zero exit).

## Out of scope (v1)

- **Parallel execution** of multiple BP-UATs against one stack — requires
  run-scoped tenancy or namespaced fixtures for *all* collections; revisit
  after nightly sequential runs are stable.
- Resetting Directus schema/RBAC (owned by `bootstrap.sh`, already
  idempotent).
- Snapshot/restore of the whole database (heavier alternative considered
  and rejected: hides fixture drift instead of surfacing it, and couples
  UAT to backup infrastructure).
- Migrating `uat-seed.sh` to TypeScript (explicitly declined in the
  script's header rationale; unchanged here).
