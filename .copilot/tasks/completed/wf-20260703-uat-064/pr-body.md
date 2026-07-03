# wf-20260703-uat-064 — Re-verify ISS-UAT-001-1 deferred ACs against the live stack

## What

This workflow (`wf-20260703-uat-064`) re-runs the 3 verification
probes that were deferred from
[wf-20260703-fix-064](https://github.com/tvolodi/aiqadam/pull/89)
(the ISS-UAT-001-1 fix; squash 2b72f460, merged). It also
registers one missing-spec coverage issue (ISS-UAT-COV-003) and
two newly-discovered gaps (ISS-UAT-BRIDGE-001, ISS-UAT-SEED-002).

The branch (`uat/BP-UAT-001-event-publication-broadcast`) is reused
from PR #88 (uat-063); this PR carries the merge-base from
`origin/main` so the verification can run against the actual
fixed-064 code without duplicating the fix on this branch.

## Why

Per AGENTS.md §6.1, "Production-readiness and infrastructure
obligations": every AC listed in an issue MUST be verified
end-to-end in the same workflow that closes it, OR be re-classified
with a named, queued follow-up workflow ID + concrete verification
commands + queue position.

fix-064's QualityGate deferred AC-1/2/3 to this workflow (which
now exists). This PR is that workflow's closure.

## How

User-chosen Path A — minimal verification (seed + directus probes),
no Playwright run:

1. `pnpm uat:seed --reset BP-UAT-001` against the live local stack
2. `curl -fsS -H "Authorization: Bearer $DIRECTUS_TOKEN" "http://localhost:8200/users?filter[email][_eq]=uat-member-c@aiqadam.test"`
3. `curl -fsS -H "Authorization: Bearer $DIRECTUS_TOKEN" "http://localhost:8200/items/member_consents?filter[purpose][_eq]=events"`

Evidence: `.copilot/tasks/active/wf-20260703-uat-064/03-*.md|.log|.ps1`.

## What was verified

- **AC-1 (partial)** — `ensure_test_user` invokes `ensure_linked`
  endpoint: all 3 identity fixtures got `directus_user_id=null`
  responses from the new endpoint (HTTP 200 OK, valid token).
  Endpoint reachable + accepts valid token + emits `ensure_linked`
  log line as expected. PARTIAL because the domain
  `uat-member-consented-consent` fixture failed (no platform row
  → bridge returned null → FK lookup failed).

- **Issue registration** — 3 new issues added to
  `.copilot/issues/registry.md` and the corresponding
  `.copilot/issues/ISS-UAT-*.md` files.

- **Registry update** —
  `docs/02-business-processes/uat/registry.md` BP-UAT-001 row
  flipped from `Last Run: —, Run Status: —` to
  `Last Run: 2026-07-03, Run Status: partial` with all 4 linked
  issues listed.

## Risks

- **AC-2 and AC-3 are still failing on a fresh stack** — but
  that's because of an entirely new gap (the
  `ensureLinkedByEmail` short-circuit), not a regression from
  fix-064. The gap is registered as a separate issue and will be
  handled in a follow-up workflow.

- **AC-4 (Playwright spec run) is also still outstanding** —
  BP-UAT-001 has no spec; out of scope for Path A.

## Honesty disclosures (per AGENTS.md §6.1)

1. **Failure ACs are honest, not deferred-to-nowhere.** Each
   failure has a tracked issue file with concrete acceptance
   criteria + verification commands (see Honesty §5 below for the
   three follow-up workflow IDs).

2. **AC-5 became "failed" with concrete evidence** during this
   workflow's live verification (the `api_base=http://localhost:3001`
   default refused connection — needs ISS-UAT-SEED-002 fix).

3. **No AC was marked verified when it was actually only partial.**
   The QualityGate's AC table marks AC-1 as `partial`, AC-2/3/5 as
   `failed`, AC-4 as `deferred`, and references the follow-up
   workflow for each.

4. **The new endpoint that fix-064 added (`POST /v1/internal/users/ensure-linked`)
   IS live and IS working.** Verified by curl probe
   `200 OK {"directusUserId":null}` (with valid token), `401`
   (no token), `400` (invalid body). It's the *caller's* contract
   (the bridge service) that has the gap.

5. **Follow-up workflows (all named):**
   - **AC-1/2/3 follow-up**: `wf-20260703-fix-065-bridge` (will be
     the next counter from this PR's merge; placeholder name). Owns
     ISS-UAT-BRIDGE-001 end-to-end (relax `ensureLinkedByEmail` to
     create Directus mirror without a local row).
   - **AC-4 follow-up**: `wf-20260703-feat-065-bp-uat-001-spec`
     (placeholder). Owns ISS-UAT-COV-003 (author
     `apps/e2e/tests/uat/BP-UAT-001.spec.ts`).
   - **AC-5 follow-up**: `wf-20260703-fix-066-seed-port`
     (placeholder). Owns ISS-UAT-SEED-002 (1-line fix in
     `scripts/uat-seed.sh`).

## Testing

- Manual probe via PowerShell `Invoke-WebRequest` against
  `http://localhost:8200/users?filter[email][_eq]=uat-member-c@aiqadam.test`
  returns `{"data":[]}` — but the probe itself works, proving the
  test infrastructure is reachable.
- No automated tests in this workflow (it's a UAT verification, not
  a code change).

## Files added

| File | Purpose |
|---|---|
| `.copilot/issues/ISS-UAT-BRIDGE-001.md` | New issue (blocker) — bridge gap |
| `.copilot/issues/ISS-UAT-COV-003.md` | New issue (enhancement) — missing spec |
| `.copilot/issues/ISS-UAT-SEED-002.md` | New issue (bug) — port default |
| `.copilot/issues/registry.md` | 3 new rows + ISS-UAT-001-1 row updated |
| `docs/02-business-processes/uat/registry.md` | BP-UAT-001 row updated to `partial` |
| `.copilot/tasks/active/wf-20260703-uat-064/03-*.{md,log,ps1}` | Step 3 evidence |
| `.copilot/tasks/active/wf-20260703-uat-064/09-quality-gate.md` | This PR's quality gate |

## Checklist

- [x] Live verification ran against the live local stack (api on
  :3000, web on :4321, Directus on :8200, Authentik on :9000).
- [x] Failures honestly recorded in the QualityGate + 3 new issue
  files (not deferred-to-nowhere).
- [x] Registry updated.
- [x] No new code changes (workflow is verification-only).
- [x] `arch:check` passed (no source files modified).
