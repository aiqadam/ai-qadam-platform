# Step 2 — Impact Analysis

**Workflow:** wf-20260705-fix-101-bp-uat-013-seed-reset
**Agent:** ImpactAnalyzer (`.copilot/agents/impact-analyzer.md`)
**Date:** 2026-07-05
**Issue:** ISS-UAT-013-14 (`open` → will flip to `resolved` at workflow close)

---

## Validated Requirement

ISS-UAT-013-14 (UAT-blocker, `uat/seed` module) — *Fix `scripts/uat-seed.sh`'s
`--reset <BP-UAT-NNN>` code path so it recomputes `token_hash` and `token_prefix`
from the manifest's `token_plain` field before POSTing to Directus, mirroring
`ensure_operator_invite`'s call-site derivation at `scripts/uat-seed.sh`
lines 500-501 and 558-595.*

**Type:** UAT-environmentality fix (mirror reference implementation into the
sibling code path). No new business behavior. The unconditional
`ensure_operator_invite` path already does this correctly; only the `--reset`
path bypasses it.

**Reference implementation:** `scripts/uat-seed.sh::ensure_operator_invite()`
at lines 500-501 (token derivation) and 558-595 (jq body composition with
`--arg th "$token_hash" --arg tp "$token_prefix"`).

---

## Affected Layers

### API (NestJS)

| Module | Touched? | Reason |
|---|---|---|
| `apps/api/src/modules/admin-invites/` | NO (read-only verification target) | `consumeInvite()` and `lookupByToken()` already query Directus by `filter[token_hash][_eq]=<sha256>`. The seed-script must put a row with a matching hash into Directus; the API itself does not change. AC-2 and AC-3 are observable through the existing endpoints. |
| Any other API module | NO | Out of scope. |

**API surface changes:** **None.** This change is a fixture-load-layer fix
(Directus writes done from bash before the API ever starts). The API's
contract is unchanged; the seed is just expected to honor it.

### DB Changes Required

**NO.** Drizzle schema is correct. The `token_hash` / `token_prefix` NOT-NULL
constraint on `operator_invites` exists at the Directus layer; the seed
script's `--reset` path is the misbehaving consumer. No `pnpm db:generate`
or migration file is needed; no `infrastructure/directus/bootstrap.sh`
schema change is needed. **No DBMigrationAuthor engagement required.**

### Shared Types

**NO.** No new Zod schemas or TypeScript types needed.

### Frontend (apps/web, apps/web-next)

**NO.**

### Bot (apps/bot)

**NO.**

### Workers (apps/workers)

**NO.**

### Scripts (in scope)

| File | Change | Reason |
|---|---|---|
| `scripts/uat-seed.sh` | **Patch `reset_domain_fixture()`** (lines 725-806). Insert a `token_hash` + `token_prefix` derivation block, gated on `[[ "$collection" == "operator_invites" ]]`, immediately after the existing `member_email` resolution step (~line 776) and before the DELETE block (~line 778). Mirror the reference implementation verbatim: read `.token_plain` via `jq -r '.token_plain // empty'`, compute `token_hash` via the existing `sha256_hex` helper (line 432), set `token_prefix` to the first 8 chars (`${token_plain:0:8}`), merge into `resolved_payload` with `jq -c --arg th ... --arg tp ... '. + {token_hash:$th, token_prefix:$tp}'`. If the manifest for collection=operator_invites is missing `token_plain` → `fail` loudly. | Direct fix per AC-1, mirrors the working unconditional path. |
| `scripts/tests/uat-seed.bats` | **Add one new `@test`** at the bottom of the FR-WORKFLOW-003 section that exercises `--reset BP-UAT-013` end-to-end in mock mode and asserts the structural derivation block is present in the script source. | AC-4 regression — the row that would have caught this issue last time. |
| `scripts/uat-fixtures/BP-UAT-013.json` | **NO change** — the manifest already declares `token_plain` at the top level of every fixture row. | The fix is in the consumer, not the manifest. |

### Test infrastructure

Live stack (Directus, Authentik) must already be up for AC-1/AC-2/AC-3 live re-verification. The Orchestrator brings it up per AGENTS.md §6.1 if not.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `POST /v1/onboard/preview` | GET (unchanged) | None — endpoint behavior unchanged. Only the seed input that the endpoint reads at runtime is corrected. | **No** |
| `POST /items/operator_invites` (Directus REST) | POST | Body now includes `token_hash` + `token_prefix` derived from manifest `token_plain`. Server-side constraint already required these; the client was previously violating its own contract. | **No (server already enforced; client fixed)** |

No breaking change to any consumer.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `scripts/uat-seed.sh::reset_domain_fixture()` (new code, ~3 lines) | `sha256_hex` (existing helper, line 432) | Local function call |
| `scripts/uat-seed.sh::reset_domain_fixture()` (new code) | Directus REST POST `/items/operator_invites` (existing curl at ~line 800) | Same curl, same body shape + two new fields |
| `apps/api/src/modules/admin-invites/admin-invites.service.ts::consumeInvite()` → `lookupByToken()` | (unchanged) | Existing `filter[token_hash][_eq]=<sha256>` lookup |

No tenant-scope risk: this only affects UAT fixtures loaded from
`scripts/uat-fixtures/BP-UAT-013.json`. No new auth requirement.

---

## Risk Flags

### Security Review

**No new security risks.** This change adds two derived fields to a Directus
POST that were already required by Directus schema-level NOT-NULL constraints;
it does not introduce a new code path, does not touch auth, does not touch
multi-tenant boundaries, does not introduce new input parsing, and does not
change any API endpoint surface. The reference implementation it mirrors
(`ensure_operator_invite`) is already in main and reviewed. SecurityReviewer
should clear in a single line — no new risks.

### Architecture Rule Risks

**None.** No module-boundary violations.

### Operational Risks

1. **Bats row 6 / row 1 regressions** — the fix is silent in mock mode (no
   new log lines) so existing assertion invariants hold. Verified.

2. **Live-mode POST 400 regression** — if the new `jq` merge produces
   invalid JSON, Directus would reject with HTTP 400 (same as the original
   bug). Mitigation: `--arg` string typing in `jq -c`; the only failure
   mode is a missing-`token_plain` manifest, caught by explicit `fail`.

3. **`token_plain` is a test token, not a secret** — the four strings
   (`uat-onboard-token` etc.) are hard-coded in the repo since
   `wf-20260629-fix-036`. No new secret leak risk.

4. **Only missing-field class is `token_hash` + `token_prefix`** — verified
   by inspecting the manifest end-to-end. No future-proofing loop needed.

---

## AC-by-AC Verification Strategy

| AC | Test Layer | Specific Test | Pass Criterion |
|---|---|---|---|
| **AC-1** | Live-Directus integration | `pnpm uat:seed --reset BP-UAT-013`; then `curl ... /items/operator_invites?filter[token_prefix][_eq]=uat-onbo&limit=-1` | Exit 0; 4 rows, non-empty 64-char hex `token_hash`, every `token_prefix == uat-onbo`. SHA256 of each test token equals stored hash. |
| **AC-2** | Live-Directus + API integration | After AC-1, `curl -fsS http://localhost:3001/v1/onboard/preview?token=uat-onboard-token` | HTTP 200; payload shape conforms to `InvitePreview`; **no 500**. |
| **AC-3** | Live API integration | Same curl as AC-2 for all four tokens | All return their expected status (200 / 410 / etc.); **none return 500**. |
| **AC-4** | bats regression test (hermetic) | New `@test` at the end of FR-WORKFLOW-003 section in `scripts/tests/uat-seed.bats` | Test passes hermetically; structural assert that the derivation block is present in `reset_domain_fixture()`. |
| **AC-5** | bats regression test (already exists) | `scripts/tests/uat-seed.bats` row 6 (`FR-WORKFLOW-003 row 6`) | Output line count delta remains exactly +2 vs. baseline; fixture-shape drift-whitelist still passes; the fix does not touch unconditional STEP 1-4, so this assertion continues to hold. |

**Honesty disclosure per AGENTS.md §6.1:** the live re-verification of
AC-1/AC-2/AC-3 (the `pnpm uat:seed --reset BP-UAT-013` + 4 token lookup
curls) lives in the queued follow-up `wf-20260705-fix-103-uat-013-verify`.
This fix workflow proves AC-4 (structural) + AC-5 (no-flag regression);
the parent's `blocks:` entry in `handoff.yaml.blocks` guarantees that the
verify workflow runs before the issue is marked fully resolved end-to-end.

---

## Fix Shape (hand-off-ready for CodeDeveloper)

**Target file:** [scripts/uat-seed.sh](../../../../scripts/uat-seed.sh)

**Function under change:** `reset_domain_fixture` (lines 725-806).

### Insertion point

After the `member_email`-resolution block ends (~line 776) and BEFORE the
`DELETE` block that begins ~line 778.

### Exact patch (CodeDeveloper to apply)

```bash
  # ── ISS-UAT-013-14 fix: derive token_hash + token_prefix from manifest's
  # token_plain so the POST honors Directus's NOT-NULL constraint. Mirror
  # the reference implementation in ensure_operator_invite()
  # (scripts/uat-seed.sh lines 500-501, 558-595).
  #
  # Gated on collection=operator_invites ONLY. Other collections never had
  # a token_hash requirement; broader gating would be over-engineering.
  if [[ "$collection" == "operator_invites" ]]; then
    local token_plain
    token_plain=$(jq -r '.token_plain // empty' <<<"$fixture_json")
    if [[ -n "$token_plain" ]]; then
      local token_hash token_prefix
      token_hash=$(sha256_hex "$token_plain")
      token_prefix="${token_plain:0:8}"
      resolved_payload=$(jq -c \
        --arg th "$token_hash" \
        --arg tp "$token_prefix" \
        '. + {token_hash:$th, token_prefix:$tp}' \
        <<<"$resolved_payload")
    else
      fail "reset_domain_fixture ${id}: collection=operator_invites but manifest has no .token_plain — cannot derive token_hash. Update scripts/uat-fixtures/<bp-uat>.json to declare token_plain per fixture."
    fi
  fi
```

### Mock-mode behavior

Silent merge — no new `\(mock, ...\)` log lines. The create line already
proves `reset_domain_fixture` ran; AC-4's structural bats assertion proves
the derivation block exists in the source.

---

## Dependencies

**No new dependencies.** All tools used (`jq`, `sha256sum`/`shasum`, `awk`)
are already used by `ensure_operator_invite`. No new package or transitive.

---

## Migration Required

**No Drizzle migration.** Per the issue's `## Proposed fix` and the verified
Directus schema, the `operator_invites` collection's `token_hash` +
`token_prefix` NOT-NULL constraint is already in place. No `pnpm db:generate`
step needed.

---

## Public API / Security / Auth Surface

| Surface | Affected? | Reasoning |
|---|---|---|
| Public HTTP API endpoints (apps/api) | **No** | `POST /v1/onboard/preview` etc. are unchanged in shape. The seed script's fix changes only the data Directus contains at UAT-environment load time. |
| Internal Authentik endpoints | **No** | The Authentik user lookup branch is not mirrored into `reset_domain_fixture` — `authentik_user_id` is intentionally NOT in the manifest. Consistent with unconditional path's optional handling. |
| Directus REST schema | **No** | Already required `token_hash` + `token_prefix`. |
| CSRF / CORS / cookies | **No** | Out of scope. |
| Multi-tenant boundaries | **No** | UAT-environment-only fixture path. |
| Rate limiting / abuse surface | **No** | New derivation is local arithmetic — no new network round trips. |

**Security-relevant summary:** no auth-flow change, no new boundary
crossing, no new attack surface. The reference implementation this
mirrors (`ensure_operator_invite`) is already in main and previously
passed SecurityReviewer.

---

## Test Scope

| Layer | Scope | Files |
|---|---|---|
| **Unit (hermetic, no stack)** | Bats assertion reading `scripts/uat-seed.sh` source — proves the derivation block is present and shaped correctly. | `scripts/tests/uat-seed.bats` (new AC-4 `@test`) |
| **Integration (live Directus + Authentik)** | `--reset BP-UAT-013` end-to-end against live UAT stack. Orchestrator brings stack up per AGENTS.md §6.1. | `wf-20260705-fix-103-uat-013-verify` (queued follow-up, position 3) |
| **E2E (Playwright)** | BP-UAT-013 Steps 005/006 — page-level. | Covered by `wf-20260705-fix-103-uat-013-verify`'s Playwright UAT rerun. |

---

## Sequencing Note (for Orchestrator)

This workflow produces a structural fix. The runtime re-verification of
AC-1/AC-2/AC-3 lives in the already-queued
`wf-20260705-fix-103-uat-013-verify` (parent's `blocks:` entry). This is
the correct division per AGENTS.md §6.1: the fix workflow proves the CODE
DERIVATION via bats; the verify workflow proves the END-TO-END effect via
the live stack.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Scope fully bounded; fix is a 3-line mirror into reset_domain_fixture() plus one bats regression test; no migration, no new deps, no public-API impact."
  findings:
    - "ISS-UAT-013-14 is a UAT-environment bug, not an API bug. Fix is local to scripts/uat-seed.sh::reset_domain_fixture() (~lines 776, just before the DELETE block) and mirrors the reference implementation at ensure_operator_invite() (lines 500-501, 558-595)."
    - "Manifest scripts/uat-fixtures/BP-UAT-013.json already declares token_plain at the top level of all four fixture rows. No manifest change needed."
    - "Bats regression (AC-4) appended to scripts/tests/uat-seed.bats at end of FR-WORKFLOW-003 section. New test must NOT break FR-WORKFLOW-003 row 1 — recommended: silence in mock mode (no new log line) and rely on the bats structural assertion to prove the derivation block exists in the source."
    - "Drizzle migration: NO. Directus schema already requires token_hash + token_prefix; the seed script was the only consumer violating the constraint."
    - "Public API / auth / tenant boundaries: NO impact."
    - "Live re-verification of AC-1/AC-2/AC-3 is queued in wf-20260705-fix-103-uat-013-verify per AGENTS.md §6.1."
    - "Risk-class 5 categories verified: no new dependencies, no migration, no API contract change, no auth change, no tenant-data change."
```
