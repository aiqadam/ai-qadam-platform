# Step 1 — UAT Script Validation

`docs/02-business-processes/uat/BP-UAT-009.md` already exists, complete:
7 numbered steps, 3 negative scenarios, documented seed fixture
(`uat-member`), and AC-1 through AC-7 all cross-referenced against real
`apps/web-next` surfaces and the live Playwright spec
(`apps/e2e/tests/uat/BP-UAT-009.spec.ts`). No gaps requiring correction
for this run's scope.

This run is **Step 13 of `wf-20260801-feat-179`** (post-merge
re-verification for FR-AUTH-004, "Magic-link authentication"), triggered
because `FR-AUTH-004.md`'s `business_process` frontmatter names
`BP-UAT-009`. This is a **targeted, fix/feature-scoped re-verification**,
not a full 7-AC pass — mirroring the established precedent
(`wf-20260731-uat-163`, `wf-20260731-uat-166`): scope to the ACs the
shipped surface actually touches, not the whole script.

**Scope rationale:** FR-AUTH-004 adds a *second sign-in entry point*
(magic-link) alongside the existing password flow BP-UAT-009 documents
(AC-1/AC-2/AC-3 — "Sign in" → Authentik login UI → session + `/me`
landing). It does not touch sign-out (AC-4/AC-7), the `next`-param
redirect logic (AC-2/AC-6), or the negative scenarios (AC-5/AC-6) — the
code summary (`wf-20260801-feat-179/03-code-summary.md`) confirms
`sign-in.astro`'s existing password link preserves its exact prior
target/sanitize logic unchanged, only gaining new sibling markup.

This run therefore re-verifies:
1. **BP-UAT-009 Steps 001–003** (AC-1, AC-2, AC-3) — the existing
   password sign-in path, as a **regression check**: does adding the
   magic-link option on the same `/auth/sign-in` page break the
   pre-existing password flow?
2. **FR-AUTH-004's own AC-1** (not a BP-UAT-009 numbered step, but the
   feature's entry-point claim): does "Sign in with email link" actually
   render as a discoverable option on `/auth/sign-in`, matching what
   `03-code-summary.md` describes (`sign-in.astro` gained real markup
   with two options)?

Out of scope for this run (unaffected by FR-AUTH-004, already covered by
`wf-20260801-feat-179` Step 8's own extensive live click-through
verification of the magic-link mechanism itself — email delivery, single
-use, flow topology, session issuance — documented in that workflow's
`03-code-summary.md` Step 8 retry sections): the magic-link email
send/click/session-issuance mechanics themselves. Re-driving that exact
mechanism a third time in this session would be duplicate live
verification of already-proven-live behavior, not new evidence — the gap
this Step 13 run closes is specifically "does the *existing* BP-UAT-009
business process still work with the new option present," which Step 8
could not have checked (it only ever drove the new path in isolation).

**Gate:** `passed` → Step 2.
