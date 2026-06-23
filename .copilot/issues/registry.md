# Issue Registry

| ID | Severity | Module | Summary | Status | Workflow | Date |
|---|---|---|---|---|---|---|
| [ISS-PREEX-001](ISS-PREEX-001.md) | minor | web-next/lint | 17 pre-existing biome lint errors in apps/web-next | resolved | wf-20260623-fix-3 | 2026-06-23 |
| [ISS-WF-13-1](ISS-WF-13-1.md) | minor | workflow | Pre-existing workflow state drift blocks Step 0.5 of every future workflow | resolved | wf-20260623-fix-13-1 | 2026-06-23 |
| [FEAT-WORKFLOW-002](FEAT-WORKFLOW-002.md) | enhancement | workflow/test | Add bats-core test suite for FEAT-WORKFLOW-001 (drift script + F.5 amendment) + shellcheck CI gate + QualityGate end-to-end test harness | open | _(next workflow after FEAT-WORKFLOW-001 ships)_ | 2026-06-23 |

---

## Severity levels

- **blocker** — prevents a workflow from completing; spawns an autonomous subworkflow
- **bug** — incorrect behavior; must be fixed before merge
- **enhancement** — non-blocking improvement; deferred to a later feature
- **minor** — cosmetic or low-impact; can be batched
