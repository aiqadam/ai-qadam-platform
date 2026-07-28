# Step 7: Test Design — wf-20260728-fix-141

Implemented directly in `apps/api/test/me-profile-service.spec.ts` (see
`03-code-summary.md` for the full file list). New describe block:
`MeProfileService — Directus id resolution (ISS-USR-PROFILE-001)`, 4
tests:

1. `getProfile resolves the Directus id via the bridge before querying Directus`
2. `listConsents filters by the Directus id, not the platform id`
3. `listSkills filters by the Directus id, not the platform id`
4. `throws NotFoundException when the bridge cannot resolve a Directus id`

Fixtures: `PLATFORM_USER_ID = 'platform-aaaa'`, `DIRECTUS_USER_ID =
'directus-bbbb'` — non-overlapping strings (an earlier draft using
`'u-1'`/`'du-1'` produced a false pass because `'du-1'` contains `'u-1'`
as a substring; caught by actually running the fail-before check and
fixed before this was reported as done).

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "4 new regression tests added to me-profile-service.spec.ts, non-overlapping id fixtures to avoid substring false-positives."
```
