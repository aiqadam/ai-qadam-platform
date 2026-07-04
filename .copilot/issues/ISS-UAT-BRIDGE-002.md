# ISS-UAT-BRIDGE-002 — Directus `directus_users.email` `is-email` validator rejects the `*.aiqadam.test` TLD — `ensureLinkedByEmail` fallback completes with a Directus 400, not a successful Directus mirror

| Field | Value |
|---|---|
| ID | ISS-UAT-BRIDGE-002 |
| Severity | blocker |
| Module | infra/directus-config |
| Status | **resolved (Option B; AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-8, AC-9 verified end-to-end; AC-10 deferred to wf-20260704-fix-087-fix-fr-workflow-003-row-6)** |
| Reported | 2026-07-04 |
| Reporter | UATRunner (wf-20260704-fix-085, Step 9 — Live UAT verification) |
| Related | [ISS-UAT-BRIDGE-001](ISS-UAT-BRIDGE-001.md) — completes the UAT scenario the BRIDGE-001 contract fix unblocks. [ISS-UAT-001-1](ISS-UAT-001-1.md) — same root-cause family (seed flow cannot reach Directus). [ISS-UAT-013-13](../tasks/completed/wf-20260703-fix-065-onboarding-copy/07-test-results.md) – documented Directus `is-email` validator rejection of `.test` TLD. |
| Blocks | BP-UAT-001 Step 006 (uat-member-no-consent excluded from recipient count), BP-UAT-001 member_consents domain fixtures |

## Symptom

`POST http://localhost:8200/users` with body
`{"email": "uat-member-c@aiqadam.test", ...}` returns:

```json
HTTP/1.1 400 Bad Request
{"errors":[{"message":"Validation failed for field \"email\". Value has to be a valid email address.","extensions":{"field":"email","type":"email","path":[],"code":"FAILED_VALIDATION"}}]}
```

Directus's built-in `is-email` validator on the `directus_users.email`
field rejects the `.test` TLD. As a result, the rewritten
`ensureLinkedByEmail` fallback path (added by the
[ISS-UAT-BRIDGE-001 contract fix](ISS-UAT-BRIDGE-001.md)) executes
correctly but its `findOrCreate → Directus POST /users` is blocked at
the platform layer, so the method returns `null` (with the documented
warn log) instead of a real Directus user id.

This blocks the seed UAT scenario:

```
$ bash scripts/uat-seed.sh --reset BP-UAT-001
…
  ✓ ensure_linked uat-member-c@aiqadam.test (directus_user_id=null)
…
  ✗ FATAL: fixture uat-member-consented-consent: member_email 'uat-member-c@aiqadam.test'
    did not resolve to any Directus user — fixture-authoring bug (create the identity
    fixture first), refusing to POST a broken member_consents row.
```

The contract fix is verified correct end-to-end (see [Live UAT
verification report](../tasks/active/wf-20260704-fix-085/uat-live-verify.md):
the bonus probe `POST /v1/internal/users/ensure-linked` with
`uat-operator-real@example.com` returned
`{"directusUserId":"9d990e8f-2f6c-4817-abfe-9d782cc3a8cd"}`). Only
the platform validator is blocking the seed UAT scenario for
`*.aiqadam.test`.

## Root cause

Directus's built-in `is-email` validator (provided by
`@directus/validate-packages`) uses Node-validator's `isEmail` with
default options. Default options reject **single-label TLDs** like
`.test`, `.example`, `.invalid`, `.localhost` per RFC 6761 and IANA
Special-Use Domain Names registry. The seeded UAT emails use
`@aiqadam.test` which fails this validation.

This is **NOT introduced by the BRIDGE-001 fix**. It is a pre-existing
Directus platform config gap. The same root cause forced
[wf-20260701-fix-044/07-test-results-RETRY.md](../tasks/completed/wf-20260701-fix-044/07-test-results-RETRY.md)
to switch the then-affected test fixtures from `@aiqadam.test` to
`@example.com`. That fix was scoped to that single test file; the
BP-UAT-001 fixtures were not adjusted because they were not the
target of that fix.

## Evidence (reproducible)

```bash
# Direct POST to Directus with .test email — confirms validator gate
$ curl -X POST http://localhost:8200/users \
    -H "Authorization: Bearer $DIRECTUS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"email":"uat-operator@aiqadam.test","first_name":"UAT","last_name":"Operator"}'
{"errors":[{"message":"Validation failed for field \"email\". Value has to be a valid email address.","extensions":{"field":"email","type":"email","path":[],"code":"FAILED_VALIDATION"}}]}
http_code=400

# Direct bridge probe with .example.com — confirms bridge code path works
$ curl -X POST http://localhost:3001/v1/internal/users/ensure-linked \
    -H "x-internal-auth: $INTERNAL_API_TOKEN" \
    -d '{"email":"uat-operator-real@example.com","displayName":"UAT Operator"}'
{"directusUserId":"9d990e8f-2f6c-4817-abfe-9d782cc3a8cd"}
http_code=200
```

API-side diagnostic in the bridge service log (PID 32712 at the time
of the verification):

```
[Nest] 32712  WARN [DirectusClient] Directus POST /users → 400: {...FAILED_VALIDATION...}
[Nest] 32712  WARN [DirectusUsersBridgeService] [directus-bridge] ensureLinkedByEmail
    fallback failed for uat-operator@aiqadam.test: Directus 400 /users: {...}
```

The "swallow + warn" behavior is **as designed** by the BRIDGE-001
fix (`apps/api/src/modules/directus/directus-users-bridge.service.ts:138-156`).
The Open Issue is that the warn path is reachable at all in normal UAT
operation.

## Recommended fix (one of two paths — both are small)

### Option A — Relax the Directus validator to accept `.test` in dev/local

In `infrastructure/directus/bootstrap.sh`, after the bootstrap creates
the `directus_users` collection, drop the validator and replace with a
validator that accepts the IANA special-use TLDs (`.test`,
`.example`, `.invalid`, `.localhost`). Concretely: `@directus/validate`
exposes a `regex` validator — replace the field's `is-email` validator
with `regex: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/` which
treats `.test` like any other local part. Other tests in the seed
pipeline use `.local` and `.local` is already accepted by the regex
above.

Approximate scope: 1 file (`infrastructure/directus/bootstrap.sh`), 1
field patch (direct it at the `directus_users.email` field via
`PATCH /fields/directus_users/email` during bootstrap), 1-2 bats cases
covering "create user with `@*.test` email → 201 Created".

### Option B — Switch BP-UAT-001 fixtures to `.example.com`

Lower-blast-radius option. Edit
`scripts/uat-fixtures/BP-UAT-001.json` so the three UAT member emails
become `uat-operator@example.com`, `uat-member-c@example.com`,
`uat-member-nc@example.com` (and the corresponding Authentik user
emails at the top of `uat-seed.sh` `ensure_test_user` calls). Re-run
the seed. The contract fix already works end-to-end for `.example.com`
addresses (proven by the bonus probe).

Approximate scope: 1 file (`scripts/uat-fixtures/BP-UAT-001.json`),
possibly 1 file (`scripts/uat-seed.sh` if Authentik users also need
to be re-emailed). No infrastructure changes. Reuse of existing
precedent (wf-20260701-fix-044).

### Recommendation

**Option A is preferred long-term** because it preserves the seeded
email convention across all UAT artefacts and aligns the local
Directus stack with what RFC 6761 already considers valid. **Option B
is the smaller, safer fix** if the team wants to land a fix in the
smallest PR per AGENTS.md §4. Either closes the issue; choose based
on the user's preferred blast-radius trade-off.

## Acceptance criteria for the future workflow

1. After `pnpm uat:seed --reset BP-UAT-001` (with the BRIDGE-001 contract
   fix already merged into main):
   - `GET http://localhost:8200/users?filter[email][_eq]=uat-member-c@aiqadam.test`
     returns 200 OK with non-empty data (if Option A), **or** with
     `uat-member-c@example.com` (if Option B).
2. After the same seed, `GET http://localhost:8200/items/member_consents?filter[purpose][_eq]=events&fields=id,member.email`
   returns 200 OK with at least one row whose `member.email` matches
   the corresponding seeded email.
3. The repro above (`POST /users` with `@aiqadam.test` email)
   returns either 201 Created (Option A) or is no longer invoked
   (Option B — fixtures no longer use `.test`).

## Notes

- This issue is the **second pre-existing failure** discovered while
  verifying ISS-UAT-BRIDGE-001 (the first was the bridge short-circuit
  itself, which the fix under wf-20260704-fix-085 addresses).
- Auto-registered per AGENTS.md §14 ("agents may register a new
  issue file when an unambiguous pre-existing failure is observed —
  specific reproduction steps on disk; severity and module derived
  from existing registry precedent"). The severity ("blocker"),
  module ("infra/directus-config"), and report cadence match the
  existing pattern at [ISS-UAT-BRIDGE-001](ISS-UAT-BRIDGE-001.md)
  and [ISS-UAT-001-1](ISS-UAT-001-1.md).

## Files in this issue

| File | Where | What it contains |
|---|---|---|
| Reproduction evidence | `seed-stdout.log` (in wf-20260704-fix-085 dir) | Full seed log showing `directus_user_id=null` for all 3 UAT users |
| API warn logs | API stdout at 10:33:22-10:39:01 | `[directus-bridge] ensureLinkedByEmail fallback failed for X@aiqadam.test: Directus 400 /users` |
| Direct Directus probe | `probe-directus.json` + curl invocation above | Confirms validator blocks .test TLD |
| Bonus probe | `probe-bonus.json` + curl invocation above | Confirms bridge code path works for .example.com |

## Resolution (2026-07-04, wf-20260704-fix-086)

### Selected path

**Option B** — switch BP-UAT-001 fixtures and seeded identities from
`@aiqadam.test` to `@example.com`. Selected over Option A because:

- Option A is **structurally infeasible** — `directus_users.email` is a
  Directus system field (`meta.system: true`) and PATCH
  `/fields/directus_users/email` returns 400 "Only schema.is_indexed
  may be modified for system fields".
- Option B is the **smaller-blast-radius** fix (4 files vs Option A's
  "would require patching Directus core") and reuses the existing
  precedent from wf-20260701-fix-044.

Pivot recorded per AGENTS.md §13; user override was implicit
(autonomous mode per §6.2, no §6.2 safety gate tripped).

### Acceptance criteria verified

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: Directus accepts `@example.com` for all 3 seeded users | **verified** | `07-test-results.md` Layer 3 — 3 rows present |
| AC-2: `bash scripts/uat-seed.sh --reset BP-UAT-001` exits 0 | **verified** | `07-test-results.md` Layer 2 — full output captured |
| AC-3: `ensure_test_user` migrates stale `@aiqadam.test` emails via PATCH | **verified** | `07-test-results.md` Authentik migration section — all 3 users' emails updated from `@aiqadam.test` to `@example.com` during live seed |
| AC-5: bash syntax check passes | **verified** | `bash -n scripts/uat-seed.sh` exits 0 |
| AC-6: `FR-WORKFLOW-003 row 7` (`member_email` FK resolution) regression-free | **verified** | Updated assertion passes; live seed shows `member_email 'uat-member-c@example.com' resolved to member=8a47d08e-...` |
| AC-7: PR diff ≤ 5 files and ≤ 400 lines | **verified** | 4 files, 98 lines net (well within limits) |
| AC-8: No new secrets, no new PII, no new external services | **verified** | `04-security-review.md` — PASS |
| AC-9: No CI surfaces touched | **verified** | `git diff --stat` — no `.github/workflows/` or `tools/architecture-check.ts` |

### Deferred ACs

| AC | Disposition | Follow-up workflow |
|----|-------------|--------------------|
| AC-4: bats regression 100% pass | **deferred-with-followup-workflow-id** | `wf-20260704-fix-087-fix-fr-workflow-003-row-6` (queued at workflow-finish time) |
| AC-10: Pre-existing `FR-WORKFLOW-003 row 6` failure acknowledged | **deferred-with-followup-workflow-id** | `wf-20260704-fix-087-fix-fr-workflow-003-row-6` (same queue position) |

### Honesty disclosures

1. The `-g` curl flag (3 sites) and `host.docker.internal:3001` default
   are latent-bug fixes required to make Option B verifiable
   end-to-end on the WSL bash + Windows-host API topology. They are
   not Option-B-specific but are included in this PR as the
   minimum-scope fix that lets live verification work.

2. The pre-existing `FR-WORKFLOW-003 row 6` failure is **NOT introduced
   by this PR** — verified by running the test against `origin/main`'s
   `uat-seed.sh` and `uat-seed.bats` (same failure mode).
   PRSteward override policy applies per AGENTS.md §6.3.

3. The current workflow's issue status flips to `resolved` based on
   AC-1/2/3/5/6/7/8/9 which are all verified. AC-4 / AC-10 (row 6
   failure) is orthogonal and does not gate the issue's
   `resolved` status — it is a separate FR-WORKFLOW-003 test bug.

### Related artefacts

- Workflow dir: `.copilot/tasks/active/wf-20260704-fix-086-directus-test-tld-validator/`
- PR: <to-be-opened by `scripts/workflow-finish.sh` Step 11>
- Parent: `wf-20260704-fix-085` (PR #104, squash `9fd57aa`)
