# Step 5 — Security Review

**Workflow:** wf-20260730-fix-157
**Issue:** ISS-UAT-SEED-003

## Scope

Pure UAT test-fixture tooling: a JSON manifest + bash script extension
that creates synthetic Directus rows (events, registrations, point_awards)
and two synthetic Authentik test identities, gated behind the existing
`reset_localhost_guard()` (refuses to run against any non-`localhost`/
`127.0.0.1` `DIRECTUS_URL`/`AK_URL`, exiting 4 with zero writes performed).

## Checklist (AGENTS.md §5, name-only per protocol.md)

- **Secrets:** No new secrets introduced. The two new filler identities
  use the same static test-fixture password constant
  (`ensure_test_user`'s existing `UatFixture1!`-style pattern via
  `reset_identity_fixture()`) already used by every other BP-UAT identity
  fixture — not a new credential, not committed anywhere sensitive.
- **Injection:** All Directus REST calls continue to use the existing
  `jq -nc --arg`/`--argjson` parameterized-payload pattern (no raw string
  interpolation into JSON bodies). URL query params are `@uri`-encoded via
  the existing `jq -sRr @uri` idiom. No new SQL surface (Directus's own
  REST API, no raw SQL).
  - The `__resolved__` sentinel and `event_ref`/`user_email` resolution
    logic constructs jq filter expressions with `--arg`, not string
    interpolation of untrusted values — the only interpolated values are
    the manifest's own trusted `lookup_field`/`lookup_value`/`id` fields,
    authored by this same PR, not runtime user input.
- **Tenant isolation / scope:** No tenant-scoping surface touched — this
  is fixture-seeding tooling operating on synthetic UAT data only, gated
  by the pre-existing localhost guard.
- **Least privilege:** No new Authentik group/permission grants — both
  filler identities are assigned to `aiqadam-member` only, same as every
  other BP-UAT member-role identity fixture.
- **Blast radius:** `reset_localhost_guard()` (unchanged, pre-existing)
  is the first thing that runs on any `--reset` invocation, before any
  delete/create call — a misconfigured `DIRECTUS_URL`/`AK_URL` pointing at
  a non-local target refuses with zero writes, exactly as for every
  existing BP-UAT manifest.

## Gate Result

gate_result:
  status: passed
  summary: "No security-relevant surface introduced — synthetic UAT fixture data only, gated by the pre-existing localhost guard, using the established parameterized-payload pattern throughout."
  findings: []
