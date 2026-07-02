# Step 5 — Security Review (wf-20260702-fix-055, ISS-UAT-SEED-001)

## Scope

- `scripts/uat-seed.sh` (1 function added, 1 function modified, 1 env helper modified)
- `scripts/uat-env-setup.sh` (1 env helper modified)
- `scripts/tests/uat-seed-iss-001.bats` (NEW — test-only)

No production code paths are touched. No API endpoint changes. No
new dependencies. No new outbound calls outside the existing
Directus / Authentik surface (one additional GET per fixture row,
capped at 4 per seed run).

## Invariants

| ID | Invariant | Applicable? | Notes |
|---|---|---|---|
| INV-1 | Tenant isolation at controller level | n/a | No controller changes. |
| INV-2 | Authentication at controller level | n/a | No controller changes. |
| INV-3 | Zod validation at boundaries | n/a | No API boundary changes. |
| INV-4 | No secrets in code | ✅ | No new secrets. The `authentik_user_id` is a numeric pk, not a secret. |
| INV-5 | No cross-schema queries | n/a | No DB queries; only HTTP calls to Directus/Authentik that already exist. |
| INV-6 | Rate limiting | n/a | Local seed script, not a public endpoint. |
| INV-7 | CSRF on state-changing ops | n/a | No browser-facing surface. |
| INV-8 | Parameterised queries | n/a | No SQL. |
| INV-9 | Output encoding | ✅ | Mock line uses printf — no format-string vulns. |
| INV-10 | No raw SQL | n/a | No SQL at all. |
| INV-11 | No `eval` or dynamic imports | ✅ | The new `user_pk_by_email` mirrors `user_pk_by_username` — pure jq, no eval. |

## Findings

0 BLOCKER. 0 MAJOR. 0 MINOR.

## Notes

- The new `user_pk_by_email` helper does an additional HTTP call per
  fixture row (4 calls/seed). The response is read-only (`GET
  /api/v3/core/users/?email=…`). No new attack surface.
- The `tr -d '\r'` change to `env_get` is a defense-in-depth
  improvement: a Windows-edited `.env` previously caused
  `Authorization: Bearer <token>\r` to be sent, which Directus
  rejected with FORBIDDEN. The fix makes the script robust to the
  CRLF line-ending mismatch that the file is currently stored
  with in our Windows dev environment.

## Gate Result

gate_result:
  status: passed
  summary: "All applicable invariants checked. 0 findings. No security-relevant changes."
  findings: []
