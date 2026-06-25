---
code: BP-UAT-004
name: "Operator cohort builder"
status: Ready
process_ref: "docs/02-business-processes/operations/operator-cohort-builder.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-004 — Operator Cohort Builder

## Purpose

Verifies that an operator can filter members using the 7 filter primitives at
`/workspace/members`, save the result as a named cohort, and retrieve it again.
Also verifies that the sponsor PII boundary is respected (sponsors do not reach
the raw member list). Source runbook:
[operator-cohort-builder.md](../operations/operator-cohort-builder.md).

## Acceptance Criteria

- [ ] AC-1: Member list loads and shows all country-scoped members by default.
- [ ] AC-2: Filtering by country narrows the list to that country's members only.
- [ ] AC-3: Combining multiple filter primitives (AND logic) further narrows the list correctly.
- [ ] AC-4: A filtered view can be saved as a named cohort and retrieved from the cohort list.
- [ ] AC-5: Search box filters by name or email.
- [ ] AC-6: Unauthenticated access to `/workspace/members` redirects to sign-in.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-operator` | Operator account (`uat-operator@aiqadam.test`, password from `.env.test`), country=`uz` |
| `uat-member-senior-fintech` | Member in `uz`, `seniority='senior'`, `industry_tags=['fintech']`, `appear_in_directory=true`, `member_consents` has `events` active |
| `uat-member-junior-saas` | Member in `uz`, `seniority='ic'`, `industry_tags=['saas']`, `appear_in_directory=true` |
| `uat-member-kz` | Member in `kz` (different country), `appear_in_directory=true` |

## Steps

### Step 001 — Sign in as operator

**AC ref:** AC-6

**Precondition:** User is not signed in.

**Action:** Navigate to `/auth/sign-in`. Fill `email` with `uat-operator@aiqadam.test` and `password`. Click **Sign in**.

**Expected UI state:** Redirected to `/workspace`. Operator navigation visible.

**Screenshot label:** `step-001-operator-signed-in`

---

### Step 002 — Open members directory (default view)

**AC ref:** AC-1

**Precondition:** Step 001 completed.

**Action:** Navigate to `/workspace/members`.

**Expected UI state:** Member list loads. At least `uat-member-senior-fintech` and `uat-member-junior-saas` are visible in the list. `uat-member-kz` may or may not appear depending on whether country auto-filter is active.

**Screenshot label:** `step-002-member-list-default`

---

### Step 003 — Filter by country `uz`

**AC ref:** AC-2

**Precondition:** Step 002 completed. Member list is visible.

**Action:** Set the **Country** filter to `uz`.

**Expected UI state:** Only `uz` country members remain in the list. `uat-member-kz` is no longer visible.

**Screenshot label:** `step-003-filtered-by-country`

---

### Step 004 — Add seniority filter

**AC ref:** AC-3

**Precondition:** Step 003 completed. Country=`uz` filter is active.

**Action:** Add **Seniority** filter = `Senior` (or `senior`).

**Expected UI state:** List narrows to members where `country=uz AND seniority=senior`. Only `uat-member-senior-fintech` is visible; `uat-member-junior-saas` is not.

**Screenshot label:** `step-004-filtered-by-seniority`

---

### Step 005 — Add industry filter

**AC ref:** AC-3

**Precondition:** Step 004 completed. Country=`uz`, Seniority=`senior` filters active.

**Action:** Add **Industry** filter = `fintech`.

**Expected UI state:** List shows only `uat-member-senior-fintech` — the single member matching all three criteria.

**Screenshot label:** `step-005-filtered-by-industry`

---

### Step 006 — Save as named cohort

**AC ref:** AC-4

**Precondition:** Step 005 completed. Filtered list shows 1 member.

**Action:** Click **Save as cohort**. In the dialog/input, type `UAT Fintech Seniors UZ`. Confirm.

**Expected UI state:** Success message appears. Cohort is saved. The cohort name `UAT Fintech Seniors UZ` is now visible in the cohorts list or dropdown (depending on where the cabinet displays saved cohorts).

**Screenshot label:** `step-006-cohort-saved`

---

### Step 007 — Retrieve saved cohort

**AC ref:** AC-4

**Precondition:** Step 006 completed.

**Action:** Clear all filters. Open the saved cohorts list and select `UAT Fintech Seniors UZ`.

**Expected UI state:** The member list automatically applies the saved filters (country=`uz`, seniority=`senior`, industry=`fintech`) and shows `uat-member-senior-fintech` only.

**Screenshot label:** `step-007-cohort-loaded`

---

### Step 008 — Search box filters by name

**AC ref:** AC-5

**Precondition:** Step 002 completed. All filters cleared, full `uz` member list visible.

**Action:** Type part of `uat-member-senior-fintech`'s display name into the search box.

**Expected UI state:** List filters to show only matching member(s). No other members appear.

**Screenshot label:** `step-008-search-by-name`

---

## Negative Scenarios

### Negative 001 — Unauthenticated access redirects to sign-in

**AC ref:** AC-6

**Precondition:** User is not signed in.

**Action:** Navigate directly to `/workspace/members`.

**Expected rejection:** Redirected to `/auth/sign-in`. Member list is NOT visible.

**Screenshot label:** `neg-001-unauth-redirect`

---

### Negative 002 — Cross-country member excluded by country filter

**AC ref:** AC-2

**Precondition:** Step 003 completed. Country=`uz` filter active.

**Action:** Visually scan the member list for `uat-member-kz`.

**Expected rejection:** `uat-member-kz` (country=`kz`) does NOT appear anywhere in the filtered list.

**Screenshot label:** `neg-002-cross-country-excluded`

---

### Negative 003 — Combined filters produce empty result for no-match criteria

**AC ref:** AC-3

**Precondition:** Step 002 completed (signed in, member list visible).

**Action:** Set **Country**=`uz`, **Seniority**=`c_level`. No c-level members exist in seed.

**Expected rejection:** Member list shows zero results (empty state message). No error, just an empty list — the filters are valid but produce no matches.

**Screenshot label:** `neg-003-no-results-empty-state`

---

## Notes

- The sponsor PII boundary (sponsors never access `/workspace/members`) is enforced at the auth/RBAC layer. This UAT verifies the operator path only; sponsor-side access is not testable without a separate `sponsor` role account.
- Cohort drift (saved cohort returns different members next time the filter is re-evaluated) is not testable in a single UAT run — it is a property of the live system over time.
- If country auto-inject is active (operator's country pre-fills the country filter), Step 002 and Step 003 may show the same result. Record both screenshots — this is expected behavior once RBAC sync ships.
