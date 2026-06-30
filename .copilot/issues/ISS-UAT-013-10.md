# ISS-UAT-013-10 — Step 005 spec asserts role_groups text but seed has empty role_groups

| Field | Value |
|---|---|
| ID | ISS-UAT-013-10 |
| Severity | minor |
| Module | uat/test-design |
| Status | open |
| Reported | 2026-06-30 |
| Resolved | — |
| Reporter | BusinessAnalyst (wf-20260630-uat-042 / BP-UAT-013-04-triage.md) |
| Workflow | wf-20260630-uat-042 (reported) |
| AC ref | AC-5 (BP-UAT-013) |

## Symptom

Step 005 of BP-UAT-013 failed with:

```
expect(getByText(/aiqadam-staff/i)).toBeVisible() — timed out
```

## Classification

**Spec/seed misalignment — NOT a product bug.** The UI correctly renders what is in
the invite. The seed creates `operator_invites` with `role_groups: []` (empty), but
the spec expects `aiqadam-staff` to appear.

## Two valid fix paths

### Option A — Update seed (preferred)

Add `aiqadam-staff` to `role_groups` for the valid invite row in `uat-seed.sh`.

### Option B — Update spec assertion

Replace the specific role text check with a check matching the empty-groups state,
or remove if displaying role groups is out of scope for Step 005.

## Acceptance criteria

- [ ] Seed updated to include `aiqadam-staff` in valid invite's role_groups OR spec updated to match empty state
- [ ] Step 005 in BP-UAT-013 passes on re-run
- [ ] Step 006 (onboarding accept) remains passing
