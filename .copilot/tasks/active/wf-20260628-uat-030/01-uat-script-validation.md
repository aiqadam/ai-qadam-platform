## UAT Script Validation — BP-UAT-013

**Script file:** `docs/02-business-processes/uat/BP-UAT-013.md`
**Process ref:** `docs/03-requirements/FR-USR-001.md`
**Workflow:** wf-20260628-uat-030
**Validated by:** BusinessAnalyst (Step 1)
**Validated at:** 2026-06-28

### Validation Checklist

| Check | Result | Notes |
|---|---|---|
| process_ref file exists | PASS | `docs/03-requirements/FR-USR-001.md` exists, status `Shipped`, lists both flows (lead capture + `/onboard`) the script tests. |
| environment URL present | PASS | `http://localhost:4321` — concrete base URL, matches `apps/web-next` dev server. |
| seed_required declared | PASS | `seed_required: true`. |
| seed_fixture non-empty (if required) | PASS | Four-row table: `uat-onboard-token`, `uat-onboard-used-token`, `uat-onboard-expired-token`, Mail catcher. Each row has a name and description, plus the env-var binding (`UAT_ONBOARD_TOKEN`, etc.). |
| all steps have action + expected + label | PASS | Steps 001–006 each have **Precondition**, **Action**, **Expected UI state**, **Screenshot label**. |
| negative scenarios present | PASS | Four negative scenarios (Neg 001 honeypot, Neg 002 used token, Neg 003 expired token, Neg 004 plus-addressing). Each has **AC ref**, **Precondition**, **Action**, **Expected rejection**, **Screenshot label**. |
| ACs mapped to steps | PASS | 7 ACs (AC-1 … AC-7), all explicitly mapped: AC-1 → Steps 001, 002 + Neg 004; AC-2 → Step 003; AC-3 → Step 004; AC-4 → Neg 001; AC-5 → Steps 005, 006; AC-6 → Neg 002; AC-7 → Neg 003. No unmapped ACs. |
| AC-4, AC-6, AC-7 negatives present with action/expected/screenshot_label | PASS | All three present (Neg 001, Neg 002, Neg 003). |
| Negative 004 (plus-addressing) present with action/expected/screenshot_label | PASS | Neg 004 is present, references `uat-lead+tag@aiqadam.test`, action/expected rejection/label all complete. |
| Frontmatter fields match template contract | PASS | All template keys present: `code`, `name`, `status`, `process_ref`, `environment`, `seed_required`, `last_run`. No stray fields. |
| status field is valid enum | PASS | `status: Ready`. (Note: `Ready` is the post-validation state per the registry legend, which is slightly forward-looking for a script that hasn't been validated yet — but it matches the template enum and all other Ready scripts in the registry, so not a failure.) |

### Seed-script cross-check (informational, not a script gap)

The script lists four seed fixtures. Verifying them against the actual seed mechanism:

| Fixture listed in script | Provisioned by `scripts/uat-seed.sh` (PR #54, `a978fb0`)? |
|---|---|
| `uat-onboard-token` (valid, unused) | **No.** `uat-seed.sh` only creates two Authentik users (`uat-member`, `uat-operator`) and delegates Directus schema to `bootstrap.sh`. No code path in `uat-seed.sh` inserts an `operator_invites` row. |
| `uat-onboard-used-token` | **No.** Same — not provisioned. |
| `uat-onboard-expired-token` | **No.** Same — not provisioned. |
| Mail catcher | External (Mailpit at `:8025`), not part of `uat-seed.sh`. Started by `docker-compose.yml` or manually. |

This is an **environment concern**, not a UAT script validation gap. The script's "Seed Fixtures Required" section is correctly written; the seed script itself has not yet been taught to insert the three invite tokens. Flagged for the UATRunner step (and the BusinessAnalyst-triage step) so Steps 005, 006, Neg 002, Neg 003 are expected to fail at the env layer and be triaged as `Env failure`.

### Downstream concerns (not script validation gaps)

These are real product gaps the UATRunner should expect — **they are not script gaps, do not affect `gate_result` here**:

1. **`apps/web-next/src/pages/index.astro` does not render a lead capture form.** A code search of `apps/web-next/src/` finds no `LeadCapture` block, no `email_input` field, and no honeypot field. The `<Hero>` block on `/` has no embedded form. Steps 001–004 and Neg 001 / Neg 004 will likely fail at the UI layer with "element not found."
2. **`apps/web-next/src/pages/leads/verified.astro` and `apps/web-next/src/pages/leads/verify-failed.astro`** are listed in `context_refs` of the handoff — should be checked for existence before UATRunner runs Step 003 / the verify-failed path.

These should be registered as issues during the UATRunner → BusinessAnalyst-triage step (Step 3), not as script-validation failures now. The script correctly describes the expected behavior; the product does not yet match.

### Summary

`BP-UAT-013.md` is a complete, executable UAT script against the `Ready` standard. Frontmatter matches the template contract; all six steps have precondition/action/expected/screenshot_label; four negative scenarios cover AC-4 (honeypot), AC-6 (used token), AC-7 (expired token), and the plus-addressing rule from `FR-USR-001` Notes; all seven acceptance criteria are mapped. The "Seed Fixtures Required" table is present and correctly enumerates the four fixtures the script needs. The one significant environment finding — `scripts/uat-seed.sh` does not yet provision the three operator invite tokens, only the two Authentik users — is **outside this script's scope** and is flagged as an environment concern for the runner. The product-level gap that the homepage has no lead capture form is also flagged as a downstream concern, not a script-validation failure. The script is valid as written; pass this gate and hand off to UATRunner.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "BP-UAT-013 script is complete against the template contract — all 6 steps, 4 negatives, and 7 ACs are correctly mapped; the seed-fixture table is present and well-formed."
  findings:
    - "ENVIRONMENT (informational, not a script gap): scripts/uat-seed.sh provisions uat-member and uat-operator users but does NOT insert operator_invites rows. The three onboard tokens (valid, used, expired) listed in the script's Seed Fixtures table will not exist after `pnpm uat:seed`. UATRunner must provision them via Directus admin or mark Steps 005/006 and Neg 002/003 as env-deferred."
    - "DOWNSTREAM (informational, not a script gap): apps/web-next/src/pages/index.astro has no lead capture form, no email_input field, no honeypot field. Steps 001–004 and Neg 001/004 are expected to fail at the UI layer; UATRunner-triage should classify as UI bug and register issues."
    - "Frontmatter field `status: Ready` is technically the post-validation state. Not a failure — matches the registry enum and all other Ready scripts — but flagging in case the validator wants scripts to start as `Draft` until this step passes."
    - "All template-contract checks pass; no script corrections required."
```
