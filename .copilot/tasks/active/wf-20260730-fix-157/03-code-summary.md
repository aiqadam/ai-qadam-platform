# Step 4 — Code Summary

**Workflow:** wf-20260730-fix-157
**Issue:** ISS-UAT-SEED-003

## Files changed

1. **`scripts/uat-fixtures/BP-UAT-010.json`** (new) — manifest declaring 8
   fixtures: 3 identity (`uat-member` — already unconditionally seeded,
   restored here; 2 new filler accounts for the at-capacity event), 5
   domain (`uat-event-open-uz`, `uat-event-full-uz`, 2 `registrations`
   rows filling the full event to capacity, 1 `point_awards` baseline row
   for `uat-member`). Uses the REAL Directus field values throughout
   (`status: published` for events, `status: registered` for
   registrations) — deliberately not the wrong `confirmed`/`waitlist`
   wording BP-UAT-010.md's own AC-1/AC-6 currently use (see
   ISS-UAT-010-1).

2. **`scripts/uat-seed.sh`** — extended `reset_domain_fixture()` and
   `resolve_payload_offsets()`:
   - New `event_ref` / `event_ref_field` manifest hint: resolves another
     domain fixture in the same manifest (by re-reading its own
     `lookup_field`/`lookup_value`) into a target column (default
     `"event"`, overridable — `point_awards` needs `"source_ref"` instead).
     Mirrors the existing `member_email` → `.member` pattern, generalized
     because `registrations`/`point_awards` FK to `events` via different
     column names.
   - New `user_email` manifest hint: resolves to a Directus user id onto
     `.user` — same mechanism as `member_email`, different target field
     name since `registrations`/`point_awards` aren't `member_consents`.
   - New `"__resolved__"` `lookup_value` sentinel: `registrations` and
     `point_awards` have no natural pre-known-string unique column (unlike
     `events.title` or `operator_invites.token_hash`), so the delete-lookup
     step reads the value back out of the resolved payload instead of the
     literal manifest string.
   - **Bug fix, found live in Step 8** (pre-existing, not introduced by
     this PR): `resolve_payload_offsets()`'s `keys=$(jq -r ... <<<...)`
     line now pipes through `tr -d '\r'` — the native Windows `jq.exe`
     build on this machine emits CRLF line endings for multi-line `-r`
     output, and `for k in $keys` word-splitting on the embedded `\r`
     silently corrupted every `*_offset` key except the last one in any
     fixture with 2+ such keys (e.g. `starts_at_offset` +
     `ends_at_offset`), resolving to `date_offset: unknown unit 'null'`.
     Same fix idiom `env_get()` already uses for the identical class of
     problem.

3. **`docs/02-business-processes/uat/BP-UAT-010.md`** — AC-3 (email
   reconciliation) only: `uat-member@aiqadam.test` → `uat-member@example.com`
   in the Seed Fixtures table and Step 002. No other prose changed (the
   wrong status/points wording is explicitly out of scope — see
   ISS-UAT-010-1).

4. **`apps/e2e/tests/uat/BP-UAT-010.spec.ts`** — same one-line email-domain
   default fix, for consistency. No other change (the spec's deeper
   V1/wrong-endpoint issues are also out of scope — ISS-UAT-010-1).

5. **`.copilot/issues/ISS-UAT-010-1.md`, `.copilot/issues/ISS-EVT-004-1.md`**
   (new) — the two follow-up issues for out-of-scope findings, registered
   in `registry.md`.

## No DB migration, no apps/api code touched

Confirmed in Step 2's impact analysis — this is purely Directus-REST-layer
fixture data plus a bash script extension.

## Gate Result

gate_result:
  status: passed
  summary: "5 files changed for the in-scope fix (well under the 400-line/5-file PR guideline), plus 2 new follow-up issue files. Extends an existing generic manifest-interpreter pattern rather than introducing a new one."
  findings:
    - "The __resolved__ sentinel and event_ref_field override are the only genuinely new mechanisms added to reset_domain_fixture() — both are minimal, targeted generalizations of patterns (member_email, per-collection column naming) that already existed."
