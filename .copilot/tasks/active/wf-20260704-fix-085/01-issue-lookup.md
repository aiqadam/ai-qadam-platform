# Step 1 — Issue Lookup

## Workflow

wf-20260704-fix-085 — Resolve ISS-UAT-BRIDGE-001

## Issue Already Registered

ISS-UAT-BRIDGE-001 is already present in `.copilot/issues/registry.md` (line 38) with severity `blocker` and module `api/directus-bridge`. Read the full description at `.copilot/issues/ISS-UAT-BRIDGE-001.md`.

## Similar/Same-Root-Cause Issue Search

Searched registry by keywords: `directus`, `bridge`, `ensureLinked`, `seed`, `mirror`.

- **[ISS-UAT-001-1](ISS-UAT-001-1.md)** — same root-cause family: "Pre-existing seed flows could not mirror newly-added Authentik identity fixtures into Directus". The previous fix (wf-20260703-fix-064, PR #89) added `ensureLinkedByEmail` to fix the symptom ("endpoint doesn't exist"), but did not address the deeper contract gap that the bridge short-circuits when no `platform.users` row exists. ISS-UAT-BRIDGE-001 is the deeper, second-class symptom discovered during AC-2/AC-3 live verification of ISS-UAT-001-1 (wf-20260703-uat-064).
- No other in-registry issue targets the same code path.

## Relationship to In-Flight Workflows

- **wf-20260703-uat-064** (parent UAT verification) closed with AC-2/AC-3 deferred to this fix.
- **wf-20260703-fix-064** (parent code fix, merged 2026-07-03) — this workflow tightens the contract of a method it introduced.

## Issue Reference Confirmation

`handoff.yaml.issue_ref`: `ISS-UAT-BRIDGE-001` ✓

## Gate Result

```yaml
gate_result:
  status: passed
  step: 1
  timestamp: "2026-07-04T12:30:00Z"
  summary: "Issue found in registry; related root-cause family ISS-UAT-001-1 also resolved but contract gap unaddressed; this workflow owns the second-class symptom."
```
