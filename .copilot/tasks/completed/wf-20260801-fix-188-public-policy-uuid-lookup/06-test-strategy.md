# Regression Test Strategy — ISS-PUB-POLICY-UUID-PIN-001

## Required regression

Add a static shell regression test that inspects `infrastructure/directus/bootstrap.sh` and proves:

1. `POLICY_PUBLIC_PROD` and its hardcoded UUID assignment are absent.
2. Exactly eight affected lower blocks resolve `$t:public_label` through the encoded `/policies` filter.
3. Each block checks the resolved ID before querying or creating permissions.
4. All expected collections remain represented.

This test must fail against `origin/main` because the UUID pin exists there and seven lower blocks reuse it without name lookup, then pass on the fix branch.

## Additional verification

- `bash -n infrastructure/directus/bootstrap.sh`.
- Run the repository shell test suite containing the regression.
- Pre-flight local Directus and query `$t:public_label` to confirm an instance-specific ID resolves.
- Run bootstrap against local Directus and verify all intended public-read permission rows exist; rerun to prove idempotency.

No Playwright flow is required because this is infrastructure bootstrap behavior with no direct user interaction.

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-08-03T00:00:00Z"
  summary: "Static regression plus live Directus permission and idempotency verification planned."
  output_file: ".copilot/tasks/active/wf-20260801-fix-188-public-policy-uuid-lookup/06-test-strategy.md"
```
