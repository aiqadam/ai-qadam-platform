# Runbook: Member self-service profile (`/me/profile`)

**Audience:** members + operators (operators read aggregates; members own writes).
**Pre-reading:** [ADR-0033](../adr/0033-community-member-graph.md), [marketing playbook §16.3](../marketing-and-pr-playbook.md#163-attribution-model), [interaction-architecture.md](../interaction-architecture.md).
**Ships:** F-S3.6 v1 (#171) + F-S3.6b (interests + employments).

## What lives here

Members manage their own profile, consents, skills, interests, and work history in one place. The page is the canonical UX surface for the rights ADR-0033 grants members (per ADR-0033 §"Member self-service").

| Section | Source | Notes |
|---|---|---|
| Profile core | `directus_users` (job_title, seniority, industry_tags[], is_student, bio_md, appear_in_directory) | Patch-by-key; null clears |
| Consents | `member_consents` (append-only ledger; 7 purposes from ADR-0033 Part 1) | Per-purpose toggle; default OFF; most-recent row wins |
| Skills | `member_skills` (member, skill_tag, endorsement_count) | Add/remove; dedupe on (member, tag) |
| **Interests** | **`member_interests` (member, topic_tag, intent ∈ learn/practice/mentor/discuss)** | **Add/remove; dedupe on (member, tag, intent); same tag with different intent is allowed** |
| **Employments** | **`member_employments` (member, employer FK→companies, role, started/ended/is_current, share_with_sponsors)** | **Add/remove; finds-or-creates the company by slug; new companies are inserted with status=pending so operators can review before they show on aggregations** |

## Key invariants

### Sponsor PII boundary (per ADR-0033)

`member_employments.share_with_sponsors` defaults **OFF**. Sponsors NEVER see an employment row unless the member toggled this flag for that specific employment. The F-S3.5 sponsor cabinet (when shipped) reads cohorts that filter on `share_with_sponsors=true` only.

If a member toggles `share_with_sponsors` from on → off, the row stops appearing in any sponsor cohort immediately (cohort cache invalidates on next refresh; manual refresh from `/workspace/members` reflects within seconds).

### Find-or-create company

When a member adds an employment with a free-text employer name, the service:

1. Slugifies the name (`Acme Robotics` → `acme-robotics`; max 80 chars; non-alphanumerics → hyphens)
2. Looks up `companies WHERE slug=?`
3. If found → reuse; if not → insert with `is_employer=true, status=pending`

`status=pending` is the gate: pending orgs are visible in `/workspace/members` aggregations only after an operator promotes them to `status=active` (operator manual step until F-S3.7 plugs the operator_assisted_interaction source for company-approval).

If two members submit the same employer name with different formatting at the same time, the slug match ensures they converge on the same row. Both create attempts succeed at the controller layer; the second one find()s the first's row.

### Consents are append-only

`member_consents` is an append-only ledger. Toggling a purpose ON → OFF inserts a new row with `revoked_at = now()`. The most-recent row per (member, purpose) is the current state. Audit history is preserved forever.

The dispatcher (Sprint 5.5 / F-S1.x) reads the current-state derived view, NOT raw rows; toggling consent has same-second effect on subsequent dispatches.

## Failure modes + recovery

### "Can't remove an interest / employment"
The owned-check rejects deletes where the row's `member !== current user`. If you get a 404, the row either:
1. Doesn't exist (already deleted; reload page).
2. Belongs to another member (you can't delete other members' rows — by design).

### "Two interests with the same topic showed up"
Dedupe is on `(member, topic_tag, intent)` — same tag with different intent is allowed by design. If you see same-tag-same-intent duplicates, it's a regression in `addInterest`'s dedupe — file an issue.

### "Same employer appears twice with slightly different names"
Possible if a previous version inserted them without going through the find-or-create path (e.g. legacy seed data). Operator can merge in Directus admin: pick the canonical row, repoint `member_employments.employer` FKs to it, delete the dupes.

### "Sponsors are seeing my employer when share_with_sponsors is off"
Should be impossible — the cohort query filters on the flag. If it happens, escalate immediately (sponsor-PII boundary breach is a P0 per ADR-0033).

### "/me/profile redirects me to sign-in repeatedly"
The Anon view renders inline when `/api/v1/auth/refresh` returns non-200. The redirect-to-Authentik flow is in the auth controller, not this page. Check `aiqadam-refresh` cookie presence + auth runbook (`docs/runbooks/auth.md`).

## Related

- `apps/api/src/modules/me-profile/me-profile.service.ts` — service (profile + consents + skills + interests + employments)
- `apps/api/src/modules/me-profile/me-profile.controller.ts` — 9 endpoints (GET / PATCH profile / PATCH consents / POST+DELETE skills/interests/employments)
- `apps/web/src/components/MeProfileForm.tsx` — single island, 5 cards
- `apps/api/test/me-profile-service.spec.ts` — 10 unit tests on F-S3.6b interests + employments paths
- `infrastructure/directus/bootstrap.sh` — `[member_interests]`, `[member_employments]`, `[member_consents]`, `[member_skills]`, `[companies]` collections
- ADR-0033 — member graph foundation + sponsor PII boundary
