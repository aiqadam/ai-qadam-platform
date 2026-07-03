## UAT Script Validation — BP-UAT-001

**Script file:** docs/02-business-processes/uat/BP-UAT-001.md
**Process ref:** docs/02-business-processes/operations/event-publication-broadcast.md
**Manifest:** scripts/uat-fixtures/BP-UAT-001.json
**Validated at:** 2026-07-03

### Validation Checklist

| Check | Result | Notes |
|---|---|---|
| process_ref file exists | PASS | `event-publication-broadcast.md` present in `docs/02-business-processes/operations/`; content matches BP-UAT-001's purpose (operator publish → best-effort `event_announce` broadcast, idempotency, per-recipient consent). |
| environment URL present | PASS | `http://localhost:4321` — concrete, http-prefixed. Aligns with the Astro web stack (`apps/web`). |
| seed_required declared | PASS | Frontmatter key `seed_required: true` present. |
| seed_fixture non-empty (if required) | PASS | Declarative table covers 4 fixtures; manifest covers 4 identity / domain rows. See manifest diff row below for the paired domain entry. |
| all steps have action + expected + label | PASS | Steps 001–006 each carry `Action`, `Expected UI state`, and `Screenshot label`. No gaps. |
| negative scenarios present | PASS | Negative 001 (unauthenticated access, AC-5) and Negative 002 (re-publish idempotency, AC-3) both present with action / expected rejection / screenshot label. |
| ACs mapped to steps | PASS | All 5 ACs mapped — AC-1 → S002/S003/S006; AC-2 → S003/S004; AC-3 → S005/N002; AC-4 → S006; AC-5 → S001/N001. |
| manifest matches doc fixture table | PASS | Doc lists 4 fixtures; manifest contains the same 4 identity/domain rows. Manifest adds one paired domain row (`uat-member-consented-consent` in `member_consents`) to faithfully represent the doc's "consent active" requirement — this is intentional decomposition, not a mismatch. No contradictory payload values: doc says `capacity=20`, manifest says `capacity: 20`; doc says `status='draft'`, manifest says `status: "draft"`; doc says `country='uz'`, manifest says `country: "uz"`; identity emails match exactly (`uat-operator@aiqadam.test`, `uat-member-c@aiqadam.test`, `uat-member-nc@aiqadam.test`). |

### Manifest diff detail (PASS — intentional decomposition)

| Doc fixture row | Manifest row(s) | Note |
|---|---|---|
| `uat-operator` | `uat-operator` (identity) | 1:1 |
| `uat-member-consented` (identity + active consent) | `uat-member-consented` (identity) + `uat-member-consented-consent` (domain, `member_consents` row keyed by `member_email`) | Manifest splits the doc's "identity with active consent" into an identity row + a paired domain row. This is the correct shape for the existing reset machinery (identity reset never touches domain rows, similar pattern to `ensure_operator_invite`). The doc's `country='uz'` / `events` consent claim is preserved. |
| `uat-member-no-consent` | `uat-member-no-consent` (identity only, no consent row) | 1:1. Manifest note explicitly states "Reset must NOT create a consent row for this member" — absence IS the fixture. Matches doc. |
| `uat-event-draft-uz` | `uat-event-draft-uz` (domain, `events` collection) | 1:1. Title, status, format, capacity, country all match doc. `starts_at_offset` / `ends_at_offset` are expressed as relative-to-seed offsets (`+7 days`), consistent with BP-UAT-007/011/017/018's pattern in the registry's "Scripts with time-sensitive seeds" note. |

### AC-to-step coverage matrix

| AC | Steps covering it | Coverage notes |
|---|---|---|
| AC-1 | S002 (open draft), S003 (publish), S006 (post-publish re-verify) | Triple-covered. |
| AC-2 | S003 (publish fires dispatch), S004 (verify ledger via API response) | Covered. Note: S004 inspects the PATCH response body rather than a separate `/announce-ledger` endpoint — consistent with runbook's "best-effort, 200 even on dispatch failure" contract. |
| AC-3 | S005 (re-save → no second dispatch), N002 (Directus ledger row count = 1) | Doubly covered (UI + Directus admin). |
| AC-4 | S006 (recipient count inferred; no-consent member excluded) | Covered. Script flags that exclusion is not directly visible in the operator UI in v1 — appropriately honest. |
| AC-5 | S001 (operator sign-in), N001 (unauthenticated redirect) | Covered. |

### Notes for downstream agents

1. **Visual review is mandatory.** Per Step 3 protocol, a missing `02b-visual-review.md` triggers `failed-escalate`.
2. **Seed fixture row count.** `uat-seed.sh --reset BP-UAT-001` must produce 5 manifest entries (4 identity + 1 domain plus the paired consent domain). The manifest's `description` field documents which fixtures `uat-seed.sh` currently creates vs. which must be newly added. Orchestrator should ensure the reset path handles the paired `member_consents` lookup-by-email pattern.
3. **Time-sensitive.** `uat-event-draft-uz` uses relative offsets. Re-seed if > 2 h elapse between seed and run (registry note).
4. **Capacity copy** (runbook §failure modes): runbook lists a "capacity copy" unit test — Step 003 does not assert capacity copy specifically. Not an AC, not required, just an observation.

### Summary

BP-UAT-001 is structurally complete: every contract field is present, every step has action / expected / label, both negative scenarios are written, all 5 acceptance criteria are mapped, and the manifest faithfully represents the script's seed-fixture table (with a clean identity-vs-domain decomposition rather than a contradiction). No gaps require correction. Script approved to advance to UATRunner.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "BP-UAT-001 is structurally and semantically complete — process_ref exists, environment is concrete, seed_manifest matches the doc's fixture table with an intentional identity/domain split, all 6 steps carry action+expected+label, 2 negative scenarios cover AC-3 and AC-5, and all 5 ACs are mapped. Approved to hand off to UATRunner."
  findings: []
```