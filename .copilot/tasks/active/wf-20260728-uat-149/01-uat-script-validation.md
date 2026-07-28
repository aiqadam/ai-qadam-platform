## UAT Script Validation — BP-UAT-020

**Script file:** docs/02-business-processes/uat/BP-UAT-020.md
**Process ref:** docs/02-business-processes/operator-playbook/admin-bootstrap.md

### Validation Checklist

| Check | Result | Notes |
|---|---|---|
| process_ref file exists | PASS | `docs/02-business-processes/operator-playbook/admin-bootstrap.md` confirmed on disk |
| environment URL present | PASS | `http://localhost:4321` |
| seed_required declared | PASS | `seed_required: true` present in frontmatter |
| seed_fixture non-empty (if required) | FAIL | The "Seed Fixtures Required" table has one row (`fresh-env`), but its Description column does not state an executable fixture — it states that the isolation mechanism is **undecided**: "Requires a dedicated fixture path: either a fresh/isolated Authentik realm for this run, or removing all `aiqadam-super-admin` members before Step 001 and restoring after teardown. CodeDeveloper/TestDesigner to confirm the exact isolation mechanism once FR-ADM-010 is implemented — flagged here as a known gap, not resolved by this draft." The template contract (`BP-UAT-template.md` line 68) requires this section to "list exactly what state the `pnpm uat:seed` script must create" — a row whose own text says the mechanism is unresolved does not satisfy that. The script's own Notes section restates this as "a real, unresolved gap." No `scripts/uat-fixtures/BP-UAT-020.json` manifest exists to compensate (see manifest row below) — there is no executable, repeatable way for UATRunner to establish the required zero-super-admin precondition today. |
| all steps have action + expected + label | PASS | Steps 001–003 each have Action, Expected UI state, and Screenshot label. Step 001's Action is explicitly marked "mechanism TBD by CodeDeveloper" but the three required fields are structurally present. |
| negative scenarios present | PASS | Negative 001 (bootstrap no-op on non-empty environment) present, with AC ref, precondition, action, expected rejection, API-level corroboration per template's mandatory negative-scenario rule, and screenshot label. |
| ACs mapped to steps | PARTIAL | AC-1 → Step 001; AC-2 → Negative 001; AC-3 → Step 002; AC-4 → Step 003. **AC-5** ("Seeded email/password values are documented identically in `.env.example` and `auth-architecture.md` across environments") has no step or scenario reference anywhere in the script — it is a docs-consistency check with no corresponding verification action. Not the blocking gap, but a real gap worth fixing in the same retry pass. |
| manifest matches doc fixture table (if `scripts/uat-fixtures/<NNN>.json` exists) | N/A | Confirmed no `scripts/uat-fixtures/BP-UAT-020.json` exists (directory contains only `BP-UAT-001.json` and `BP-UAT-013.json`). Per template guidance, infra/undetermined fixture rows without a manifest are exempt from the `id`-cross-check itself, but the absence of a manifest here is a symptom of the same unresolved gap, not a separate pass. |

### Summary

BP-UAT-020 is a well-structured draft against FR-ADM-010's five ACs, but it
fails the template contract on the one check that matters most for this
workflow: `seed_fixture` non-empty when `seed_required: true`. The single
fixture row does not describe a fixture — it describes an open design
question (zero-super-admin isolation mechanism: dedicated Authentik realm
vs. remove-and-restore) that the script's own author (BusinessAnalyst, in
the prior `business-process-development` workflow) explicitly flagged as
unresolved and deferred to CodeDeveloper/TestDesigner. That deferral was
appropriate at draft time, before FR-ADM-010 existed. It is not appropriate
now: FR-ADM-010 has shipped (PR #110) and this is the first live
UAT-verification run against a **shared local dev environment** that
already has other UAT fixtures seeded, including an existing super-admin
(`uat-operator@example.com` pre-bound to `aiqadam-super-admin` via the
standard `pnpm uat:seed` fixture). Running UATRunner against Step 001 as
currently written would require either standing up an isolated Authentik
realm (infrastructure that does not exist yet per this script) or directly
removing `aiqadam-super-admin` group members from the shared environment —
the latter is a destructive action against other engineers'/workflows'
seeded state with no documented restore guarantee beyond "restoring after
teardown," which is itself unspecified. That is not a safe default to
improvise inside a single UATRunner session. AC-5 is a secondary,
non-blocking gap (no step/scenario reference) that should be closed in the
same retry pass. Verdict: `failed-retry` — the script needs a concretely
specified, safe fixture-isolation mechanism (most likely a dedicated
Authentik test realm/tenant, or an equivalent scoped fixture with a
guaranteed restore step) authored into the Seed Fixtures table and, if
warranted, a `scripts/uat-fixtures/BP-UAT-020.json` manifest, before
UATRunner can be safely invoked.

## Gate Result

gate_result:
  status: failed-retry
  summary: "Seed fixture for the zero-super-admin precondition is an unresolved design gap, not an executable fixture — unsafe to run against the shared local dev environment as written; AC-5 also unmapped."
  findings:
    - "seed_fixture check FAILS: the 'fresh-env' row in Seed Fixtures Required describes an undecided isolation mechanism (dedicated Authentik realm vs. remove-and-restore super-admin members), not an executable fixture — script's own Notes section confirms this is unresolved."
    - "No scripts/uat-fixtures/BP-UAT-020.json manifest exists; only BP-UAT-001.json and BP-UAT-013.json are present in scripts/uat-fixtures/."
    - "Running Step 001 as written against the shared local dev environment would require either infrastructure that doesn't exist (isolated Authentik realm) or a destructive action against existing seeded state (removing aiqadam-super-admin members shared with other UAT fixtures) — not safe to improvise in a UATRunner session without a designed, restorable fixture mechanism."
    - "Secondary gap: AC-5 (seeded credentials documented identically in .env.example and auth-architecture.md) has no step or negative-scenario reference anywhere in the script."
