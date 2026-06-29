# Step 1 — Issue Lookup (wf-20260629-fix-039)

**Date:** 2026-06-29
**Issue:** ISS-UAT-013-8

---

## Issue Summary

`scripts/uat-seed.sh` (lines 410, 413, 416) inserts three `operator_invites`
rows with plus-addressed emails (`uat-operator+valid@aiqadam.test`,
`uat-operator+used@aiqadam.test`, `uat-operator+expired@aiqadam.test`).
However the Authentik user is created with the bare email
`uat-operator@aiqadam.test` (line 396, via `OPERATOR_EMAIL` default at
line 342). The api's `/v1/onboard/accept` handler
(`apps/api/src/modules/admin-invites/admin-invites.service.ts:358`)
requires the Authentik user's email to match `operator_invites.email`
exactly. The `+valid` suffix means no match → `invite_missing_authentik_user`
(409 Conflict) → BP-UAT-013 Step 006 fails.

---

## Duplicate / Sibling Check

Searched `.copilot/issues/registry.md` for related issues (case-insensitive
on `uat-operator`, `OPERATOR_EMAIL`, `operator_invites`):

| Issue | Status | Relationship |
|---|---|---|
| [ISS-UAT-013-4](../ISS-UAT-013-4.md) | resolved (PR #68) | Sibling — about `operator_invites` rows not being seeded at all. This issue is different: rows ARE seeded, but their `email` does not match the seeded Authentik user. |
| [ISS-UAT-013-5](../ISS-UAT-013-5.md) | resolved (PR #69) | Sibling — Directus 503 retry. Unrelated. |
| [ISS-UAT-013-7](../ISS-UAT-013-7.md) | resolved (PR #66) | Sibling — RESEND_API_KEY unset. Unrelated. |
| [ISS-UAT-013-1](../ISS-UAT-013-1.md) | resolved (PR #65) | Sibling — port 3000 occupied. Unrelated. |
| [ISS-UAT-013-2](../ISS-UAT-013-2.md) | resolved (PR #60) | Sibling — preflight identity. Unrelated. |
| [ISS-UAT-013-3](../ISS-UAT-013-3.md) | resolved (PR #67) | Sibling — web-next lead form. Unrelated. |
| [ISS-UAT-013-6](../ISS-UAT-013-6.md) | resolved (PR #70) | Sibling — UAT test-design defects. Unrelated. |

No duplicate. No prior issue covers the email-mismatch path. **ISS-UAT-013-8
is the canonical issue** for this defect.

---

## Acceptance Criteria Mapping (from the issue)

| AC | Source | Plan |
|---|---|---|
| 1 | `pnpm uat:seed` produces exactly 3 rows with `email = uat-operator@aiqadam.test` | Step 4 changes `ensure_operator_invite` calls at uat-seed.sh:410-416 to use `uat-operator@aiqadam.test` for all three. |
| 2 | Step 006 of BP-UAT-013 succeeds | Step 4 change unblocks the api path. Verification will require a re-run of the UAT (deferred to follow-up workflow — see Risks below). |
| 3 | `+valid`/`+used`/`+expired` suffix convention removed from `BP-UAT-013.md` Step 005 | Step 4 doc edit. |
| 4 | New negative scenario in BP-UAT-013 exercising `invite_missing_authentik_user` with email `uat-operator+no-user@aiqadam.test` | Step 4 spec edit + Step 7 bats test. |

---

## Code References Confirmed

| File | Line(s) | Content |
|---|---|---|
| `scripts/uat-seed.sh` | 410 | `ensure_operator_invite "uat-operator+valid@aiqadam.test" "pending" …` |
| `scripts/uat-seed.sh` | 413 | `ensure_operator_invite "uat-operator+used@aiqadam.test" "consumed" …` |
| `scripts/uat-seed.sh` | 416 | `ensure_operator_invite "uat-operator+expired@aiqadam.test" "pending" …` |
| `scripts/uat-seed.sh` | 342 | `OPERATOR_EMAIL="${UAT_OPERATOR_EMAIL:-uat-operator@aiqadam.test}"` |
| `scripts/uat-seed.sh` | 396 | `"uat-operator" "$OPERATOR_EMAIL" "UAT Operator"` (Authentik user create) |
| `scripts/uat-env-setup.sh` | 468 | `UAT_OPERATOR_EMAIL=uat-operator@aiqadam.test` |
| `apps/api/.env.example` | 82 | `UAT_OPERATOR_EMAIL=uat-operator@aiqadam.test` |
| `apps/api/src/modules/admin-invites/admin-invites.service.ts` | ~358 | `invite_missing_authentik_user` throw |
| `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` | 57, 312, 325 | Spec references `uat-operator+valid@aiqadam.test` and the error code |
| `docs/02-business-processes/uat/BP-UAT-013.md` | Step 005 | Spec text mentions the suffix convention |

---

## Risks / Notes Captured

- **Re-run of BP-UAT-013 (live, against Directus + Authentik + Mailpit)** is
  out of scope for this workflow because it requires running the full
  Docker stack and a re-seed cycle. The DocWriter / UATRunner can do this
  in a follow-up workflow. AC-2 will be verified by code reading + bats
  regression tests, not by a live UAT run.
- **Authentik SCIM provisioning** is explicitly out of scope per the issue.
- **Backward compatibility:** existing seeded Directus data may have rows
  with `+valid` etc. The seed script is idempotent (it checks for
  `token_hash` before insert), so re-running won't double-insert. Manual
  cleanup of stale rows is a UAT environment concern, not a code change.

---

## Gate Result

```
status: passed
attempt: 1
timestamp: 2026-06-29T21:10:00Z
summary: ISS-UAT-013-8 confirmed as canonical (no duplicates). 4 acceptance
  criteria mapped to concrete file/line targets. Step 2 Impact analysis
  dispatched.
next_action: invoke ImpactAnalyzer (Step 2)
```

## Links

- [ISS-UAT-013-8.md](../../issues/ISS-UAT-013-8.md) (issue)
- [registry.md](../../issues/registry.md)
- [handoff.yaml](handoff.yaml)