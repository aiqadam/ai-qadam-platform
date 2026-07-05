## UAT Script Validation — BP-UAT-009

**Script file:** docs/02-business-processes/uat/BP-UAT-009.md
**Process ref:** docs/03-requirements/FR-AUTH-001.md

### Validation Checklist

| Check | Result | Notes |
|---|---|---|
| process_ref file exists | PASS | `docs/03-requirements/FR-AUTH-001.md` exists |
| environment URL present | PASS | `http://localhost:4321` |
| seed_required declared | PASS | `seed_required: true` |
| seed_fixture non-empty (if required) | PASS | `uat-member` fixture listed; confirmed present in `scripts/uat-seed.sh` (creates `uat-member@aiqadam.test`, seeds Authentik user) |
| all steps have action + expected + label | PASS | All 6 steps (001–006) have `Action`, `Expected UI state`, and `Screenshot label`; all 3 negative scenarios have `Action`, `Expected rejection`, and `Screenshot label` |
| negative scenarios present | PASS | 3 present: Negative 001 (protected page redirect), Negative 002 (open-redirect blocked), Negative 003 (wrong password) |
| ACs mapped to steps | PASS | All 7 ACs mapped — AC-1: Step 001, Neg 003; AC-2: Step 002, Step 006; AC-3: Step 002, Step 003; AC-4: Step 004, Step 005; AC-5: Neg 001; AC-6: Neg 002; AC-7: Step 004 |

### Summary

BP-UAT-009 passes all template contract checks: `process_ref` resolves to FR-AUTH-001, the environment URL is a concrete `http` base, `seed_required: true` is backed by a non-empty `seed_fixture` table whose `uat-member` fixture is independently confirmed to exist in `scripts/uat-seed.sh`, all six steps and three negative scenarios carry action/expected/screenshot-label triples, and all seven acceptance criteria are mapped to at least one step or negative scenario. The script's Notes section flags two operational caveats for UATRunner and BusinessAnalyst triage (Authentik UI styling out of scope; `HttpOnly` cookie verification requires a devtools screenshot rather than a Playwright cookie read; legacy cookie name `__Host-aiqadam-refresh` should also be accepted) — these are informational, not gaps against the template contract. The script is ready for UATRunner.

## Gate Result

gate_result:
  status: passed
  summary: "BP-UAT-009 satisfies all template contract checks; ready for UATRunner."
  findings: []
