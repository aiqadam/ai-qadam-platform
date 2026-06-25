---
code: BP-UAT-003
name: "Member self-service profile"
status: Ready
process_ref: "docs/02-business-processes/operations/member-profile.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-003 — Member Self-Service Profile

## Purpose

Verifies that a member can view and edit their profile (core fields, consents,
skills, interests, employments) at `/me/profile`. Also verifies the
sponsor-PII boundary (a member without `share_with_sponsors` toggled ON does
not appear in sponsor cohorts) and that consent toggles take immediate effect.
Source runbook: [member-profile.md](../operations/member-profile.md).

## Acceptance Criteria

- [ ] AC-1: Member can edit core profile fields (job_title, seniority, bio_md, appear_in_directory).
- [ ] AC-2: Member can add and remove skills.
- [ ] AC-3: Member can add and remove interests (same tag with different intent is allowed; same tag+intent deduplicates).
- [ ] AC-4: Member can add an employment; a new employer name creates a `companies` row with `status=pending`.
- [ ] AC-5: Consent toggles are persistent — toggling OFF and reloading the page shows OFF state.
- [ ] AC-6: `share_with_sponsors` defaults OFF on new employments.
- [ ] AC-7: Unauthenticated access to `/me/profile` redirects to sign-in.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-member` | Member account (`uat-member@aiqadam.test`, password from `.env.test`), country=`uz` |
| `uat-member-skills` | Member has no skills pre-seeded (clean state) |
| `uat-member-consents` | Member has `events` consent ON, all other consents OFF |

## Steps

### Step 001 — Member sign-in

**AC ref:** AC-7

**Precondition:** User is not signed in.

**Action:** Navigate to `/auth/sign-in`. Fill `email` with `uat-member@aiqadam.test` and `password`. Click **Sign in**.

**Expected UI state:** Redirected to `/me` or `/me/profile`. Member dashboard navigation visible.

**Screenshot label:** `step-001-member-signed-in`

---

### Step 002 — Navigate to profile page

**AC ref:** AC-1

**Precondition:** Step 001 completed.

**Action:** Navigate to `/me/profile` (or click the Profile link in member nav).

**Expected UI state:** Profile page renders with 5 sections: Profile core, Consents, Skills, Interests, Employments. Fields for job_title, seniority, bio_md, appear_in_directory are visible.

**Screenshot label:** `step-002-profile-page`

---

### Step 003 — Edit core profile fields

**AC ref:** AC-1

**Precondition:** Step 002 completed.

**Action:** Fill **Job title** with `ML Engineer`. Select **Seniority** = `Senior`. Fill **Bio** with `UAT test bio.`. Ensure **Appear in directory** checkbox is checked. Click **Save profile**.

**Expected UI state:** Success confirmation appears. Fields retain new values after save.

**Screenshot label:** `step-003-profile-saved`

---

### Step 004 — Add a skill

**AC ref:** AC-2

**Precondition:** Step 002 completed (on profile page).

**Action:** In the **Skills** section, type `Python` in the skill input and click **Add**.

**Expected UI state:** `Python` appears as a skill tag in the list. No error.

**Screenshot label:** `step-004-skill-added`

---

### Step 005 — Remove the skill

**AC ref:** AC-2

**Precondition:** Step 004 completed. `Python` skill tag is visible.

**Action:** Click the remove (×) button on the `Python` skill tag.

**Expected UI state:** `Python` tag disappears from the list. No error.

**Screenshot label:** `step-005-skill-removed`

---

### Step 006 — Add an interest

**AC ref:** AC-3

**Precondition:** Step 002 completed.

**Action:** In the **Interests** section, add topic `LLMs` with intent `learn`. Click **Add**.

**Expected UI state:** Interest row `LLMs / learn` appears in the list.

**Screenshot label:** `step-006-interest-added`

---

### Step 007 — Add same topic with different intent (allowed)

**AC ref:** AC-3

**Precondition:** Step 006 completed.

**Action:** Add topic `LLMs` with intent `mentor`. Click **Add**.

**Expected UI state:** A second interest row `LLMs / mentor` appears. Both `LLMs / learn` and `LLMs / mentor` are visible — same tag with different intent is allowed by design.

**Screenshot label:** `step-007-same-topic-different-intent`

---

### Step 008 — Add same topic + same intent (deduplication)

**AC ref:** AC-3

**Precondition:** Step 007 completed.

**Action:** Attempt to add topic `LLMs` with intent `learn` again. Click **Add**.

**Expected UI state:** No duplicate appears. Either the UI prevents submission (button disabled or error shown) or the server returns a dedupe error. The list still shows only two entries for `LLMs`.

**Screenshot label:** `step-008-interest-dedupe`

---

### Step 009 — Add an employment

**AC ref:** AC-4, AC-6

**Precondition:** Step 002 completed.

**Action:** In the **Employments** section, fill **Employer** with `UAT Test Corp` (a new company name that does not exist yet). Fill **Role** with `Engineer`. Set **Is current** to checked. Leave **Share with sponsors** unchecked. Click **Add employment**.

**Expected UI state:** Employment row appears: `Engineer @ UAT Test Corp (current)`. Share with sponsors shows OFF. No error.

**Screenshot label:** `step-009-employment-added`

---

### Step 010 — Toggle consent OFF

**AC ref:** AC-5

**Precondition:** Step 002 completed. `events` consent is ON.

**Action:** In the **Consents** section, click the toggle for **Events** to turn it OFF. (No explicit Save button — toggle fires immediately.)

**Expected UI state:** Toggle shows OFF state. No error.

**Screenshot label:** `step-010-consent-toggled-off`

---

### Step 011 — Reload and verify consent persists

**AC ref:** AC-5

**Precondition:** Step 010 completed.

**Action:** Reload the page (`F5` or navigate away and back to `/me/profile`).

**Expected UI state:** **Events** consent toggle still shows OFF after reload. The change persisted.

**Screenshot label:** `step-011-consent-persists-after-reload`

---

## Negative Scenarios

### Negative 001 — Unauthenticated access redirects to sign-in

**AC ref:** AC-7

**Precondition:** User is not signed in.

**Action:** Navigate directly to `/me/profile`.

**Expected rejection:** Redirected to `/auth/sign-in`. The profile form is NOT visible.

**Screenshot label:** `neg-001-unauth-redirect`

---

### Negative 002 — Duplicate interest (same tag + same intent) is rejected

**AC ref:** AC-3

**Precondition:** `LLMs / learn` interest already exists (Step 006 complete).

**Action:** Attempt to add `LLMs` with intent `learn` again.

**Expected rejection:** The second add either shows an inline error ("already added") or the entry does not appear a second time in the list. Exactly one `LLMs / learn` row remains.

**Screenshot label:** `neg-002-interest-dedupe-rejected`

---

### Negative 003 — share_with_sponsors defaults OFF

**AC ref:** AC-6

**Precondition:** Step 009 completed. `UAT Test Corp` employment is visible.

**Action:** Observe the **Share with sponsors** field on the newly added `UAT Test Corp` employment row.

**Expected rejection:** The field shows OFF / unchecked state without the member having to explicitly set it. This is a default — sharing must be opted into, not opted out of.

**Screenshot label:** `neg-003-sponsor-share-off-by-default`

---

## Notes

- AC-4 verification that `companies` row was created with `status=pending` requires Directus admin access (engineer check). UATRunner records the expected behavior; BusinessAnalyst can spot-check the Directus admin after the run.
- Consent toggles are append-only in the database — toggling OFF inserts a new row with `revoked_at`. The UI reflects the most-recent state; the test does not check the audit trail directly.
- The `share_with_sponsors` sponsor-PII boundary (AC-6) is verified at the UI level only. Full boundary verification (cohort query does not include the member) is deferred to an integration test.
