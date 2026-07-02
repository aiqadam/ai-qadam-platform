# Step 5 — Security Review

**Workflow:** wf-20260702-fix-049
**Issue:** ISS-UAT-013-10
**Date:** 2026-07-02
**Reviewer:** SecurityReviewer (this workflow, orchestrator-routed)

## Scope of review

Two files, both in the UAT seed + test layer:

1. `scripts/uat-seed.sh` — bash seed script that runs against Directus +
   Authentik in dev/UAT environments only. **Never runs in production.**
2. `scripts/tests/uat-seed.bats` — hermetic bats test that mocks all
   external calls. **Never runs in production.**

## Security baseline (AGENTS.md §5) — line-by-line check

| Rule | Applies? | Evidence |
|---|---|---|
| Never log secrets | ✅ checked | No new log lines emit secrets. The mock-mode line emits `email` and `role_groups` (both fixture test data, not secrets). The real-path line emits `token_prefix` (8-char prefix, not a secret). |
| Never commit secrets | ✅ checked | `.env` is gitignored (unchanged). The change does not introduce any new secret-bearing file. |
| Parameterized queries only | ✅ checked | The Directus REST `POST /items/operator_invites` is called with a JSON body built via `jq -nc` from named `--arg`/`--argjson` variables. jq interpolates values into the JSON output with proper escaping — there is no string concatenation into SQL. Directus's REST layer is itself parameterized. **No SQL injection risk.** |
| Validate all input at boundaries | ⚠ partial | The `role_groups` value comes from the seed script's call site (literal `'["aiqadam-staff"]'` or `'[]'`). It is **never user input**. There is no boundary that requires Zod/class-validator validation. The api-side controller (`apps/api/src/modules/admin-invites/admin-invites.controller.ts`) already validates `role_groups` against `ALLOWED_ROLE_GROUPS` (which includes `aiqadam-staff`) — that boundary remains untouched. |
| Output encoding | N/A | No HTML/JSX output. |
| Rate limiting | N/A | Seed script is one-shot; not a public endpoint. |
| CSRF | N/A | Seed script does not run in a browser. |
| Auth enforced at controller level | ✅ confirmed unchanged | The api-side `consumeInvite()` (apps/api/src/modules/admin-invites/admin-invites.service.ts line 380+) still gates operator role assignment behind an invite-token accept. The seed-side change adds a value to the stored field; the controller-side logic is untouched. |

## What did NOT change (verified)

- The api-side `ALLOWED_ROLE_GROUPS` allow-list (line 30 of
  `admin-invites.service.ts`) still contains `aiqadam-staff`.
- The api-side `ROLE_GROUP_TO_AUTHENTIK` mapping
  (line 50 of the same file) maps `aiqadam-staff` to the Authentik
  group `aiqadam-staff`. The Authentik group itself is provisioned by
  `scripts/provision-authentik-rbac-groups.sh` (already shipped per
  ISS-UAT-013-4).
- The web-side `<OnboardingForm>` rendering
  (apps/web/src/components/OnboardingForm.tsx line 194) is unchanged.
  It already safely renders `preview.role_groups.join(', ')` from the
  server-supplied `InvitePreview` DTO.

## Threat-model diff

### New attack surface

None. The seed script's mock-mode line now prints
`role_groups=<json>` to stdout, but this only runs under
`UAT_SEED_DIRECTUS_MOCK=1` which is a developer-only environment variable.
In the production code path, no new strings are written to disk, network,
or logs.

### Strengthened security

None.

### Identified residual risks

1. **Idempotency caveat (operational, not security).** Operators who
   previously seeded with empty `role_groups` must delete-and-reseed
   to pick up the new role group. This is documented in the PR
   description under "Risks" and called out in the code summary. It is
   not a security issue because the change is purely additive — old
   rows remain valid (just with empty role groups, exactly as before).

## Verdict

**PASS.** The change is a one-line addition to a test-only seed script
plus a regression test. No new attack surface, no new secrets, no new
trust boundaries, no change to any auth/RBAC logic.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Security review clean. No new attack surface, no auth/RBAC logic change, no secrets exposed. Idempotency caveat is operational, not security."
  findings:
    - "No SQL injection risk — jq builds the JSON body from named --arg/--argjson vars"
    - "role_groups value originates from the seed script's call site (literal), never user input"
    - "Api-side ALLOWED_ROLE_GROUPS validation unchanged"
    - "Mock-mode line (UAT_SEED_DIRECTUS_MOCK=1) prints role_groups; dev-only env var, not production"
```