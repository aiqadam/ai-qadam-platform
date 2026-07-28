# Step 1: Issue Lookup

**Workflow:** wf-20260728-fix-139
**GitHub Issue:** [#89](https://github.com/aiqadam/ai-qadam-platform/issues/89)
**Local issue:** [ISS-USR-REDIRECT-001](../../../issues/ISS-USR-REDIRECT-001.md)

## Registry search

Searched `.copilot/issues/registry.md` for keywords: `redirect`, `signup`,
`first login`, `/me`, `onboard`, `callback`. No existing open or resolved
issue covers a post-signup/first-login redirect failure specifically.
Related-but-distinct precedent:

- `ISS-USR-REG-001/002/003` — registration form + backend registration
  service bugs (different surface: the sign-up submission itself, not the
  post-auth redirect).
- `ISS-AUTH-OIDC-EMAIL-001` (PR #81, resolved 2026-07-27) — OIDC id_token
  was missing the `email` claim, causing `/v1/auth/callback` to 401. Not
  the same symptom (that was a hard failure, this is "signs in fine but
  lands in the wrong place") but same code area (`/v1/auth/callback`) —
  worth checking whether the callback's redirect-target logic regressed
  or was never implemented for the "new user" branch.
- `ISS-UAT-009-2` — `/me` AnonView vs `/workspace` redirect-mechanism
  inconsistency (already resolved, spec-only fix). Different mechanism
  (anon-gating, not post-auth landing).

No similar issue found — proceeding as a new issue, not an occurrence
append.

## Business-Process Linkage

`docs/02-business-processes/uat/registry.md` → **BP-UAT-013** ("Member
signup and operator onboarding") is the matching process. Recorded in
`ISS-USR-REDIRECT-001.md` header and `handoff.yaml.business_process`.

## Requirement cross-reference

`docs/03-requirements/FR-USR-001.md` AC-1: "A new user who completes
sign-up via Authentik and returns to the platform lands at `/me`." This is
the AC the reported symptom violates.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "New issue ISS-USR-REDIRECT-001 created from GitHub issue #89; no duplicate found; BP-UAT-013 linked; back-reference comment posted."
```
