# Issue Registry

| ID | Severity | Module | Summary | Status | Workflow | Date |
|---|---|---|---|---|---|---|
| [ISS-PREEX-001](ISS-PREEX-001.md) | minor | web-next/lint | 17 pre-existing biome lint errors in apps/web-next | resolved | wf-20260623-fix-3 | 2026-06-23 |
| [ISS-WF-13-1](ISS-WF-13-1.md) | minor | workflow | Pre-existing workflow state drift blocks Step 0.5 of every future workflow | resolved | wf-20260623-fix-13-1 | 2026-06-23 |
| [FEAT-WORKFLOW-002](FEAT-WORKFLOW-002.md) | enhancement | workflow/test | Add bats-core test suite for FEAT-WORKFLOW-001 (drift script + F.5 amendment) + shellcheck CI gate + QualityGate end-to-end test harness | open | _(next workflow after FEAT-WORKFLOW-001 ships)_ | 2026-06-23 |
| [ISS-CI-001](ISS-CI-001.md) | blocker | ci/infrastructure | Pre-existing CI failures (arch-check 25 violations, biome 20,432 errors, pnpm audit 2 high CVEs) block all future PRs to main | resolved | PRs #37–#41 (2026-06-24) | 2026-06-24 |
| [ISS-UAT-013-1](ISS-UAT-013-1.md) | blocker | uat/environment | Port 3000 occupied by foreign ai-dala-next Next.js (PID 5008); AI Qadam NestJS api not running — blocks BP-UAT-013 | resolved | wf-20260629-fix-033 | 2026-06-29 |
| [ISS-UAT-013-2](ISS-UAT-013-2.md) | bug | workflow/orchestrator | Pre-flight verified api by port ownership, not by process CommandLine — wrong service identified as AI Qadam api | resolved | wf-20260628-fix-031 | 2026-06-28 |
| [ISS-UAT-013-3](ISS-UAT-013-3.md) | bug | web-next/customer | apps/web-next/src/pages/index.astro renders only `<Hero>`; no lead capture form — blocks web-next cutover | open | wf-20260628-uat-030 | 2026-06-28 |
| [ISS-UAT-013-4](ISS-UAT-013-4.md) | bug | uat/seed | `scripts/uat-seed.sh` does not provision `operator_invites` rows (mitigated inline by Orchestrator) | open | wf-20260628-uat-030 | 2026-06-28 |
| [ISS-UAT-013-5](ISS-UAT-013-5.md) | minor | uat/seed | Directus returns 503 "Under pressure" during seed bootstrap; 3 retries with back-off required | open | wf-20260628-uat-030 | 2026-06-28 |
| [ISS-UAT-013-6](ISS-UAT-013-6.md) | enhancement | uat/test-design | Neg 004 assertion is vacuous + Neg 002/003 rely on coincidental UI match (`<OnboardingForm>` `GonePanel` renders on any non-OK response) — **spec edits empirically validated in attempt 2** | open | wf-20260628-uat-030 | 2026-06-28 |
| [ISS-UAT-013-7](ISS-UAT-013-7.md) | bug | uat/environment | `RESEND_API_KEY` unset in `apps/api/.env`; api returns 202 for `POST /v1/leads` but skips email dispatch; Mailpit receives nothing → Steps 002 & 003 fail | resolved | wf-20260629-fix-034 | 2026-06-29 |
| [ISS-UAT-013-8](ISS-UAT-013-8.md) | bug | uat/seed | `operator_invites.email = uat-operator+valid@aiqadam.test` does not match seeded Authentik user `uat-operator@aiqadam.test`; api rejects with `invite_missing_authentik_user` → Step 006 fails | open | wf-20260628-uat-030 | 2026-06-28 |

---

## Severity levels

- **blocker** — prevents a workflow from completing; spawns an autonomous subworkflow
- **bug** — incorrect behavior; must be fixed before merge
- **enhancement** — non-blocking improvement; deferred to a later feature
- **minor** — cosmetic or low-impact; can be batched
