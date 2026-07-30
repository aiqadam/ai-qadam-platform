# Step 7 — Test Design

**Workflow:** wf-20260730-fix-157
**Issue:** ISS-UAT-SEED-003

## Tests added

All in `scripts/tests/uat-seed.bats` (append), following the file's
existing structural/mock-mode/isolated-tmpdir-corruption idioms:

1. `ISS-UAT-SEED-003 AC-1: BP-UAT-010.json is valid JSON with the expected fixture ids`
2. `ISS-UAT-SEED-003 AC-2: --reset BP-UAT-010 mock mode exits 0 and resets all 8 fixtures`
3. `ISS-UAT-SEED-003: registrations fixtures resolve event_ref + user_email in mock mode`
4. `ISS-UAT-SEED-003: point_awards fixture resolves event_ref onto the overridden source_ref field, not event`
5. `ISS-UAT-SEED-003: uat-member identity fixture is reset (not recreated) matching the unconditional STEP 3 user`
6. `ISS-UAT-SEED-003: --reset all still resets BP-UAT-001/013/020 unchanged alongside the new BP-UAT-010 (no cross-manifest regression)`
7. `ISS-UAT-SEED-003: unresolvable event_ref fails loudly in mock mode, refusing to POST a broken registrations row`
8. `ISS-UAT-SEED-003: unresolvable user_email fails loudly in mock mode, refusing to POST a broken registrations row`
9. `ISS-UAT-SEED-003: registrations.status uses real values (registered/waitlisted), never BP-UAT-010.md's old confirmed/waitlist wording`
10. `ISS-UAT-SEED-003: resolve_payload_offsets resolves ALL *_offset keys, not just the last, even under jq.exe's CRLF multi-line output` — the regression test for the live-discovered CRLF bug; sources `date_offset()` + `resolve_payload_offsets()` directly (same technique `uat-seed-iss-001.bats` already uses for `env_get()`) and drives them against a 2-offset-key fixture.
11. `ISS-UAT-SEED-003 AC-3: no manifest declares an identity/payload email at the retired @aiqadam.test domain`

Result: 61/61 pass in `scripts/tests/uat-seed.bats` (up from 50); full
`uat-seed*.bats` suite (3 files) 76/76 pass (3 pre-existing, unrelated
`python`-stub skips untouched).

## Regression proof (fail-before / pass-after)

Test #10 above is the literal regression test: before the `tr -d '\r'`
fix in `resolve_payload_offsets()`, this exact test failed (`ends_at` /
`starts_at` resolved to the un-jq-CRLF-stripped key lookup returning
`null`, and `date_offset()` would have exited non-zero inside the real
function — reproduced manually via an isolated repro script during Step
8, documented in `07-test-results.md`). After the fix, both keys resolve
to real ISO timestamps.

## Gate Result

gate_result:
  status: passed
  summary: "11 new bats tests, all passing; one is a genuine fail-before/pass-after regression test for a live-discovered bug."
  findings: []
