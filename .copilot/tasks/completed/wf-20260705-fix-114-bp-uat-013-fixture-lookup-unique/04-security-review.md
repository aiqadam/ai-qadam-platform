# 04 — Security Review (wf-20260705-fix-114-bp-uat-013-fixture-lookup-unique)

## Agent

SecurityReviewer

## Verdict per invariant

| Invariant | Verdict | Notes |
|---|---|---|
| Tenant isolation | N/A | No tenant boundary touched. `operator_invites` is a global seed table (BP-UAT-013 doesn't cross tenants). |
| Auth at controller level | N/A | No controller / no route touched. The api's auth envelope is unchanged. |
| Zod validation at boundaries | N/A | No new input surface; the manifest is build-time data, not request-time data. |
| No secrets in code | PASS | The sha256 hex values are NOT secrets — they're public hashes of public fixture tokens that are themselves declared in the manifest. SHA-256 is one-way; knowing the hash doesn't reveal the plaintext token. (The api uses sha256 exactly to AVOID storing plaintext in the operator_invites table.) |
| No cross-schema queries | N/A | The reset code path's existing Directus query shape is unchanged: `filter[${lookup_field}][_eq]=${encoded_value}`. We only changed the value of `lookup_field` from `token_prefix` to `token_hash` — both are columns on the same `operator_invites` table. |
| Rate limiting | N/A | No api surface touched. |
| CSRF | N/A | No browser-side change. |
| N+1 queries | PASS | The reset loop already does one DELETE + one CREATE per fixture (4 round-trips total). This change doesn't affect query count. |
| `is-email` validator compatibility | PASS (improvement) | The pre-fix manifest's `payload.email: uat-operator@aiqadam.test` would have triggered Directus's `is-email` validator on the POST (the @aiqadam.test TLD is not a real TLD per RFC 6761 and Directus's email validator rejects it). This PR aligns the manifest to `@example.com`, removing a latent seed-time rejection that would have surfaced as the next bug the moment anyone tried AC-2 verification. |
| Pre-existing auth gap (ISS-UAT-013-1 through -15) | PASS | Unchanged. ISS-UAT-013-16 is the next gap in the same `--reset BP-UAT-013` code path that ISS-UAT-013-14 (PR #119) and ISS-UAT-013-15 (PR #120) addressed; this PR closes it. |
| Secrets in git diff (gitleaks) | PASS | Diff is JSON fixture values (sha256 hex strings) + bats regression rows. No tokens, passwords, API keys, or PII. The plaintext fixture tokens (`uat-onboard-token` etc.) were already in the manifest on main HEAD — they're test-only stubs, not real secrets. |
| Dependency changes | PASS | None. No new dependencies, no removed dependencies. |

## Notes

- **SHA-256 in a public manifest is not a secret.** SHA-256 is a one-way function; storing `sha256(uat-onboard-token)` in the manifest gives an attacker no path to the plaintext. The api uses sha256 exactly to AVOID storing plaintext tokens in the database. The manifest mirrors the api's lookup semantics by design.
- **The payload.email @aiqadam.test → @example.com change is a security-relevant bug fix**, not just cosmetic. Directus's `is-email` validator would reject the manifest's POST on `@aiqadam.test`, surfacing as a misleading "BP-UAT-013 reset failed" error that operators wouldn't immediately recognize as a manifest bug.
- **No new attack surface.** The reset code path already accepted arbitrary `lookup_field` / `lookup_value` from the manifest. We're constraining its use to a per-row unique column (token_hash) — strictly an improvement over the shared `token_prefix` lookup that caused the data-correctness bug.

## Gate result

Step 04-security-review: **PASS — no security findings, no blocking issues.**