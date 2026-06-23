# Doc Update — FR-MIG-020

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/03-requirements/FR-MIG-020.md` | Frontmatter `status` | `Not Started` -> `Implemented` |
| `docs/03-requirements/requirements-registry.md` | FR-MIG table, row 20 | Status column: `Not Started` -> `Shipped` |
| `apps/web-next/blocks.md` | Customer blocks table | Added `<OnboardingForm>` row: 3-step new-member onboarding wizard (profile basics, skills+interests, consents) |

## Documents Not Updated

| Document | Reason |
|---|---|
| `docs/04-development/architecture/architecture.md` | No module boundary changes per code summary. New `modules/members/` is internal wiring. |
| `docs/04-development/standards.md` | No new coding conventions introduced. |
| `docs/04-development/security/security.md` | No new security rules. |
| `docs/api/` | OpenAPI is auto-generated; no manual supplement needed per task context. |

## Gate Result

```
gate: doc-update
agent: doc-writer
status: passed
attempt: 1
workflow: wf-20260623-feat-015
requirement: FR-MIG-020

summary: >
  All 3 required documentation updates applied correctly.
  FR-MIG-020 status: Not Started -> Implemented.
  requirements-registry.md FR-MIG table row 20: Not Started -> Shipped.
  blocks.md: <OnboardingForm> block added to customer blocks table.
  No unaffected content altered.

documents_updated:
  - docs/03-requirements/FR-MIG-020.md
  - docs/03-requirements/requirements-registry.md
  - apps/web-next/blocks.md

documents_checked:
  - docs/04-development/architecture/architecture.md (not updated: no module boundary changes)
  - docs/04-development/standards.md (not updated: no new conventions)
  - docs/04-development/security/security.md (not updated: no new security rules)

confidence: high
```
