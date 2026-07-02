# Step 10 — Documentation Update (wf-20260702-fix-052, ISS-CI-002)

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/04-development/security/runbooks/supply-chain.md` | "Known existing high-severity advisories" | (a) Updated snapshot date from `2026-05-20` to `2026-07-02`; (b) Added "Resolved advisories since the 2026-05-20 snapshot" sub-section with ISS-CI-002's two cleared advisories (GHSA-rcmh-qjqh-p98v, GHSA-p6gq-j5cr-w38f), the resolution workflow reference, and the lesson recorded about always reading the `Patched versions` row from the GHSA itself. |

## Documents Not Updated

| Document | Reason |
|---|---|
| `docs/04-development/architecture/architecture.md` | No module boundary or shared-types changes. |
| `docs/04-development/standards.md` | No new coding convention introduced. The dep-upgrade pattern is captured by the regression test instead. |
| `docs/adr/<new>` | The decision (upgrade to `^9.0.1`) is recorded in `01-issue-lookup.md`, `03-code-summary.md`, and the supply-chain runbook. A standalone ADR would be over-engineering for a one-line dependency pin. |
| `docs/api/` | No API surface changes (the public `EmailService` API is unchanged; nodemailer 9.x is shape-compatible at the call site). |
| `docs/05-other/` | No cross-cutting changes. |
| `packages/shared-types/README.md` | No shared-types changes. |
| `apps/api/README.md` (or equivalent) | The nodemailer upgrade is captured in `04-security-review.md` and the runbook; adding a section here would duplicate information. |

## Honesty disclosure

Per `DocWriter` agent definition: "What Does NOT Require Doc Updates:
Bug fixes that don't change specified behavior." A one-line dependency
pin is a bug fix (it closes two CVEs without altering observable
behavior). The DocWriter rule would strictly say "no docs needed."

We made a **small, targeted** runbook update anyway because:

1. The supply-chain runbook already lists "known existing
   high-severity advisories" with a snapshot date. Leaving
   ISS-CI-002's CVEs in that table after they're resolved would
   mislead future on-call engineers into triaging a non-issue.
2. The "lesson" paragraph (always read `Patched versions` from
   the GHSA itself) is the kind of operational note the runbook
   is for — it short-circuits a class of mistake that almost
   happened in this workflow.

This update is **append-only**: no existing prose was rewritten,
no sections were removed, no version numbers were bumped
(managed separately per DocWriter rule).

## Gate Result

gate_result:
  status: passed
  summary: "Single targeted docs update: appended ISS-CI-002's resolved advisories to the supply-chain runbook's known-snapshot table + added a lesson about reading GHSA's Patched-versions row. No other docs need updates (no behavior change, no new API, no new convention)."
  findings:
    - "Snapshot date updated 2026-05-20 → 2026-07-02; pre-existing 3 advisories table untouched."
    - "Resolved advisories sub-section added with both GHSAs, the resolution workflow ID, and a terse operational lesson."
    - "Per DocWriter rule, the dep pin itself is a 'bug fix that doesn't change behavior' and would not require doc updates on its own; the runbook change is supplementary."