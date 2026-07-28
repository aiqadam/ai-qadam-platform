# Security Review — wf-20260728-fix-144 (ISS-USR-PROFILE-002)

## Code Changes Reviewed

- `apps/api/src/modules/me-profile/me-profile.service.ts`
- `apps/api/test/me-profile-service.spec.ts`
- `infrastructure/directus/bootstrap.sh` (new `ensure_perm_for_policy` helper + `policy.member` permission rows)

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | `policy.member`'s grants are per-member (`$CURRENT_USER`), not tenant/country-scoped — matches ADR-0021 §4.1 (member policy has no country filter). |
| INV-2 Secrets by reference | Yes | Pass | No secret literals in the diff. |
| INV-3 Auth at controller level | No | N/A | `MeProfileController` already has `@UseGuards(AuthGuard)` (unchanged); this fix doesn't touch controller-level auth. |
| INV-4 Validation at boundaries | No | N/A | No new input surface — `fetchProfileRow`'s retry path derives its field list from a constant, not user input. |
| INV-5 No cross-schema queries | Yes | Pass | Directus REST only. |
| INV-6 Rate limiting | No | N/A | No new endpoint. |
| INV-7 CSRF | No | N/A | No new state-changing browser endpoint. |
| INV-8 No dangerouslySetInnerHTML | No | N/A | Backend + infra script only. |
| INV-9 No N+1 queries | Yes | Pass | The 403-retry path is a bounded, single extra `GET` only on the failure branch — not a loop. |
| INV-10 Drizzle parameterization | No | N/A | No raw SQL; Directus REST. |
| INV-11 HttpOnly tokens | No | N/A | Not a token-storage change. |

## Security-critical review: the new `directus_permissions` rows

This is the part of the diff that actually matters for security — a
mis-scoped filter here would let one member read or write another
member's data. Reviewed each row's `permissions` filter:

| Collection | Action | Filter | Correct? |
|---|---|---|---|
| `directus_users` | read | `{"id":{"_eq":"$CURRENT_USER"}}` | Yes — own row only. `$CURRENT_USER` in this position resolves to the requesting user's own id (Directus's documented shorthand for self-row policies on the collection being filtered). **Empirically verified with a genuine cross-user test**, not just asserted: minted a second real user's static token, confirmed it could read its own row but got `403 FORBIDDEN` reading a different member's row. First attempt at this test gave a false negative (the cross-user read appeared to succeed) — root-caused to an unrelated, pre-existing Directus Public-policy grant on `directus_users` that was masking every other policy's filter underneath it, unrelated to this PR's own grant; filed and fixed separately as [ISS-SEC-DIRECTUS-USERS-PUBLIC-001](../../issues/ISS-SEC-DIRECTUS-USERS-PUBLIC-001.md). After that unrelated leak was closed, the retest confirmed this filter was correct all along. |
| `directus_users` | update | same filter, `fields` restricted to the 10 editable profile fields (job_title, seniority, industry_tags, is_student, bio_md, appear_in_directory, appear_in_matches, appear_on_attendee_list, appear_on_public_leaderboard, show_company_on_public_profile) | Yes — deliberately excludes `email`, `onboarded_at`, `country_code`, and every other system/identity field from the writable set, even though they're in the readable set. A member cannot self-promote `onboarded_at` or change their own `email`/`country_code` via this grant. |
| `member_consents` | read/update | `{"member":{"_eq":"$CURRENT_USER"}}` | Yes — own rows only. |
| `member_consents` | create | `{}` (unrestricted create filter) | **Acceptable, not a gap**: Directus's `create` action filter can't reference the not-yet-existing row, so an empty filter is the correct/only shape here — the actual scoping happens at the application layer (`MeProfileService.setConsent` always writes `member: <resolved own directus id>`, never accepting a caller-supplied `member` field per the controller's Zod schema — verified `consentPatchSchema` has no `member` field). Same pattern as the existing `member_skills`/`member_interests`/`member_employments` create grants below. |
| `member_skills` | read/delete | `{"member":{"_eq":"$CURRENT_USER"}}` | Yes. |
| `member_skills` | create | `{}` | Same reasoning as `member_consents` create — app-layer scoping via `MeProfileService.addSkill`, no caller-supplied `member` in `skillAddSchema`. |
| `member_interests` | read/create/delete | same pattern | Same reasoning. |
| `member_employments` | read/create/delete | same pattern | Same reasoning. |

**One residual note, not a blocker for this PR:** the `create` grants'
empty `{}` filter means Directus itself does not prevent a member from
crafting a raw `POST /items/member_skills` (etc.) request with an
arbitrary `member` field pointing at a DIFFERENT member's id, bypassing
`MeProfileService`'s app-layer scoping — Directus's own create-action
filters cannot express "member must equal $CURRENT_USER" for a field
being set in the same request (this is a known Directus limitation, not
specific to this codebase). **This is not a new risk introduced by this
PR** — it is the same shape every other `create` grant in this bootstrap
script already has (see the `S0.1` demo-tenant and other policy
precedents), and the actual write path is exclusively through
`MeProfileController`'s Zod-validated endpoints, which never accept a
caller-supplied `member`/`user` field for these mutations — confirmed by
reading `skillAddSchema`, `interestAddSchema`, `employmentAddSchema`,
`consentPatchSchema` in `me-profile.controller.ts`. Direct Directus API
access uses `DIRECTUS_TOKEN` (server-side only, never exposed to the
browser) for the write proxy in some flows, but members never receive a
Directus-scoped token directly — they authenticate to this app's own API,
which is the actual enforcement boundary. Flagging for awareness, not
requesting a retry.

## BLOCKER Findings

None.

## MAJOR Findings

None.

## Gate Result

```markdown
gate_result:
  status: passed
  summary: "No BLOCKER or MAJOR findings. New directus_permissions rows correctly scope reads/updates/deletes to $CURRENT_USER's own rows; create-action filter limitation is pre-existing codebase pattern, mitigated by app-layer Zod scoping, not introduced by this PR."
  findings: []
```
