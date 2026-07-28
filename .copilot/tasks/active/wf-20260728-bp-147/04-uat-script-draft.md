## UAT Script Draft — wf-20260728-bp-147

Two BP-UAT scripts authored, one per FR from Step 3, per the
`business-process-development` workflow's Step 4 (BusinessAnalyst).

## BP-UAT-020 — Platform admin bootstrap (no manual scripts)

- File: [BP-UAT-020.md](../../../../docs/02-business-processes/uat/BP-UAT-020.md)
- `status: Draft`, `process_ref: admin-bootstrap.md`
- Linked to: `FR-ADM-010`
- 3 steps + 1 negative scenario, covering AC-1 through AC-5.
- Open fixture gap flagged (not resolved): needs a "zero super-admin"
  environment state, which the standard `pnpm uat:seed` fixture doesn't
  provide (it always seeds `uat-operator@example.com` as super-admin).

## BP-UAT-021 — Admin user and role management screen

- File: [BP-UAT-021.md](../../../../docs/02-business-processes/uat/BP-UAT-021.md)
- `status: Draft`, `process_ref: admin-user-management.md`
- Linked to: `FR-ADM-011`
- 5 steps + 2 negative scenarios, covering AC-1 through AC-6.
- Open fixture gap flagged (not resolved): AC-3's cap-enforcement negative
  scenario needs a "3 existing super-admins" environment state, not
  provided by the standard seed.

## Template contract validation (self-applied, per own agent definition)

| Check | BP-UAT-020 | BP-UAT-021 |
|---|---|---|
| `process_ref` file exists | PASS | PASS |
| `environment` URL present | PASS | PASS |
| `seed_required` declared | PASS (true) | PASS (true) |
| `seed_fixture` / Seed Fixtures table non-empty | PASS (1 row, with an explicitly flagged gap) | PASS (3 rows, with an explicitly flagged gap) |
| All steps have action + expected + label | PASS | PASS |
| Negative scenarios present | PASS (1) | PASS (2) |
| ACs mapped to steps | PASS — every AC referenced by ≥1 step | PASS — every AC referenced by ≥1 step |
| `external_hops` declared | PASS (BP-UAT-020: 1 declared hop for Authentik sign-in, matches BP-UAT-009 precedent; BP-UAT-021: none needed) | N/A |
| `session_budget` present | PASS | PASS |
| `teardown_policy` present | PASS (clean-up) | PASS (clean-up) |

Both scripts pass the template contract. Both explicitly flag fixture
design gaps (zero-admin state; 3-existing-admins state) rather than
pretending the standard seed already covers them — consistent with
`AGENTS.md §9`'s honesty bar and the style precedent in BP-UAT-019's
"Deferred Steps" section.

## Registry updates made

- `docs/02-business-processes/uat/registry.md` — two rows added
  (BP-UAT-020, BP-UAT-021), `Status: Draft` (rows show `—` pending a real
  run, consistent with existing never-run rows in this table).

## Gate Result

gate_result:
  status: passed
  summary: "Two BP-UAT scripts authored (BP-UAT-020, BP-UAT-021), both pass the template contract, both explicitly flag unresolved fixture-design gaps for TestDesigner rather than silently assuming them solved."
  findings:
    - "BP-UAT-020: zero-super-admin fixture state not covered by standard pnpm uat:seed — flagged for TestDesigner"
    - "BP-UAT-021: three-existing-super-admins fixture state not covered by standard pnpm uat:seed — flagged for TestDesigner"
    - "Neither script is runnable yet — both wait on their linked FR's own requirement-development workflow to ship code"
