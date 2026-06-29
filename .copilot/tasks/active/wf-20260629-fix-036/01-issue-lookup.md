# Step 1: Issue Lookup — wf-20260629-fix-036

**Workflow:** wf-20260629-fix-036
**Date:** 2026-06-29

## Issue Identified

**ID:** ISS-UAT-013-4
**File:** `.copilot/issues/ISS-UAT-013-4.md`
**Status:** open
**Severity:** bug
**Module:** uat/seed

## Summary

`scripts/uat-seed.sh` provisions Authentik users and runs the Directus schema bootstrap but does NOT insert any rows into the `operator_invites` collection. BP-UAT-013 requires three `operator_invites` rows (one valid+unused, one consumed, one expired) for Steps 005/006 and Neg 002/003. Without them, those test steps fail against the real `/v1/onboard/preview` API.

## Search for Similar Issues

No similar open issue found. ISS-UAT-013-5 (Directus 503 on seed) is in the same module but a different symptom. ISS-UAT-013-8 (email mismatch) shares the Authentik/seed domain but is a separate bug.

## Conclusion

Proceeding with ISS-UAT-013-4 as registered. `issue_ref = ISS-UAT-013-4`.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "ISS-UAT-013-4 found and confirmed; no duplicate."
  findings:
    - "ISS-UAT-013-4.md exists with full root-cause and proposed resolution."
```
