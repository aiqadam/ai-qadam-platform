# Step 6 — Test Strategy

**Workflow:** wf-20260730-fix-157
**Issue:** ISS-UAT-SEED-003

## Regression test requirement (per issue-resolution.md Step 6)

At least one regression test must fail before the fix and pass after. Two
independent regressions apply here:

1. **The primary fix**: before this workflow, `pnpm uat:seed --reset
   BP-UAT-010` failed immediately with `No fixture manifest found for
   'BP-UAT-010'` (the exact symptom quoted in ISS-UAT-SEED-003). After:
   `scripts/uat-fixtures/BP-UAT-010.json` exists and `--reset BP-UAT-010`
   completes cleanly.
2. **A second, independently-discovered regression** (found live during
   Step 8, not anticipated at test-strategy time — see `07-test-results.md`
   for the full account): `resolve_payload_offsets()`'s `for k in $keys`
   word-splitting broke on the native Windows `jq.exe`'s CRLF multi-line
   output, silently corrupting every `*_offset` key except the last one in
   any fixture declaring 2+ of them. This is pre-existing (also latent in
   `BP-UAT-001.json`'s `uat-event-draft-uz`) but was only ever exercised
   live for the first time by this workflow's live AC-4 run, since mock
   mode never calls `resolve_payload_offsets()` at all.

## Test plan

- **Structural/JSON validity**: `BP-UAT-010.json` parses and declares the
  expected 8 fixture ids.
- **Mock-mode behavioral** (fast, no live infra): `--reset BP-UAT-010`
  exits 0, resets all 8 fixtures, correctly resolves `event_ref`/
  `user_email` hints (including the `event_ref_field` override for
  `point_awards.source_ref`), and `--reset all` still resets BP-UAT-001/
  013/020 unchanged (no cross-manifest regression).
- **Fixture-authoring-bug guards**: an unresolvable `event_ref` or
  `user_email` fails loudly (via an isolated tmpdir copy with a
  deliberately corrupted manifest — same technique the existing
  FR-WORKFLOW-003 corruption tests already use), never silently POSTing a
  broken row.
- **Field-value regression guard**: `registrations.status` in the manifest
  is `registered`, never the old-doc `confirmed`/`waitlist` wording (guards
  against reintroducing ISS-UAT-010-1's documented discrepancy).
- **Email-domain regression guard**: no manifest declares an identity/
  payload email at the retired `@aiqadam.test` domain.
- **CRLF regression test** (added after the live discovery in Step 8):
  `resolve_payload_offsets()` sourced in isolation and driven directly
  against a 2-offset-key fixture, asserting both offsets resolve (neither
  stays `null`) — this is the test that would have failed before the `tr
  -d '\r'` fix and passes after.
- **Live verification (AC-4)**: `bash scripts/uat-seed.sh --reset
  BP-UAT-010` against the actual local Docker stack (Directus + Authentik,
  already running/healthy), followed by direct Directus REST queries
  confirming the exact expected rows exist, and a second `--reset` run
  confirming no row accumulation (idempotency).

## Gate Result

gate_result:
  status: passed
  summary: "Test strategy covers structural, mock-behavioral, fixture-authoring-bug, field-value-regression, and live-verification layers; a second real bug (CRLF word-splitting) was found live and is now covered by its own targeted regression test."
  findings:
    - "Live testing (not just mock mode) was necessary to catch the CRLF bug — mock mode structurally cannot exercise resolve_payload_offsets() since it returns before that function is ever called."
