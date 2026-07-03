# Doc update — wf-20260703-fix-064 (ISS-UAT-001-1)

Agent: DocWriter
Workflow: wf-20260703-fix-064
Branch: fix/ISS-UAT-001-1-uat-seed-directus-mirror
Commit head at time of doc work: 774489f

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/04-development/infrastructure/runbooks/internal-cron.md` | new `## Provisioning endpoints (non-tick)` section (after `## Escape hatches`, before `## Multi-replica safety`) | Documents `/v1/internal/users/ensure-linked` as a sibling to the tick escape hatches — same `InternalAuthGuard` + `x-internal-auth` header, but explicitly an **action** endpoint (idempotent provisioning), not a tick. Cross-references the OIDC-callback path (`docs/02-business-processes/operations/lead-nurture.md`) as the *other* provisioning path. Includes a "When to prefer an action endpoint over the OIDC callback" subsection and a "Conventions" subsection (Zod input, idempotency requirement, no browser exposure, no public OpenAPI). |
| `docs/03-requirements/FR-WORKFLOW-003.md` | item `7. **Tests:**` — appended one new paragraph | Adds the live-mode pre-condition introduced by the fix: `POST /v1/internal/users/ensure-linked` + bridge method `DirectusUsersBridgeService.ensureLinkedByEmail`. Documents mock-mode (`UAT_SEED_DIRECTUS_MOCK=1`) bats short-circuit so the suite can verify the seed code path without infra. Names the OIDC-callback path as a parallel contrast (without rewriting `lead-nurture.md`). Points to the new internal-cron runbook section for the provisioning-endpoint contract. |

## Documents Not Updated (and why)

| Document | Reason |
|---|---|
| `docs/04-development/architecture/architecture.md` | Checked: there is **no section on Directus↔Authentik identity sync** in the file (grep for `ensureLinked` / `Directus.*Authentik` returned only the unrelated `content/ — Bridge to Directus for content reads` line, which is about content reads, not identity bridge). Task spec says: "If no, do not add a section." — followed. |
| `docs/04-development/security/security.md` | Checked: the file does **not mention `InternalAuthGuard` or internal endpoints as a documented pattern** (grep returned no matches). Task spec says: "If no, do not add a section." — followed. The auth pattern is documented in `docs/04-development/infrastructure/runbooks/internal-cron.md` (the canonical runbook for internal endpoints) instead. |
| `docs/02-business-processes/operations/lead-nurture.md` | Forbidden by spec — task explicitly says "do NOT update BP-UAT-001 doc" and to "reference the OIDC-path contrast without rewriting the existing lead-nurture doc". |
| `docs/02-business-processes/uat/BP-UAT-001.md` | Forbidden by spec — "the fix is a precondition, not a change to the BP itself. The seed reset will be verified by wf-20260703-uat-064, which may update BP-UAT-001's seed-fixtures table if needed." |
| `docs/02-business-processes/uat/registry.md` | Forbidden by spec — same reason. |
| `docs/03-requirements/registry.md` | Forbidden by spec — "this fix is an issue resolution, not a new FR." |
| New `FR-AUTH-*.md` | Forbidden by spec — "this fix is part of FR-WORKFLOW-003's scope" (and was extended in item 7 instead of getting a new FR). |
| `infrastructure/docker-compose.yml`, `apps/api/...`, `scripts/uat-seed.sh` | Forbidden by spec — "Do NOT modify any non-doc files (code, scripts, tests)." |

## Cross-references added

- `internal-cron.md` → `docs/02-business-processes/operations/lead-nurture.md`
  (the OIDC-callback provisioning path, for contrast).
- `FR-WORKFLOW-003.md` item 7 → `DirectusUsersBridgeService.ensureLinkedByEmail`
  (bridge method — code symbol, not a doc link).
- `FR-WORKFLOW-003.md` item 7 → `docs/02-business-processes/operations/lead-nurture.md`
  (OIDC-path contrast, the parallel provisioning path).
- `FR-WORKFLOW-003.md` item 7 → `docs/04-development/infrastructure/runbooks/internal-cron.md`
  §"Provisioning endpoints (non-tick)" (runbook entry for the endpoint contract).
- `internal-cron.md` → mentions Zod input validation by reference to
  `docs/04-development/security/security.md` §Input validation (the security rule
  is already documented there at the policy level; no new section was needed in
  security.md because the security pattern itself is unchanged).

## Honest assessment of gaps NOT closed by this doc update

1. **Bridge gap (orthogonal, remains open):** The static-admin token's
   `POST /v1/users` flow still does not propagate `displayName` /
   `email_verified` / consent-state for some users — this is a separate
   RBAC-related issue and is explicitly **out of scope** for
   ISS-UAT-001-1. The new `/v1/internal/users/ensure-linked` endpoint
   does NOT close that gap; it closes the seed-mirroring gap only.
   Mentioning this in the doc would have been misleading.
2. **No `architecture.md` Directus↔Authentik sync section exists** —
   this doc update does not create one. If the team wants the
   OIDC-callback path and the new `/v1/internal/users/ensure-linked`
   path diagrammed together as the "two provisioning paths into
   Directus," that belongs in a separate architectural-doc PR (it
   would also touch `docs/04-development/architecture/migration-to-directus-centric.md`
   step S4.5/1 #66, which mentions `DirectusUsersBridgeService` once).
   Flagging for a possible follow-up workflow if the team wants it.
3. **No `security.md` `InternalAuthGuard` section exists** — the
   security review (per `security-review.md`) flagged a MINOR
   defense-in-depth follow-up (`@Throttle` on the new action endpoint).
   That follow-up, if implemented, would also warrant a security.md
   cross-reference. Left to the security review flow.

## Total lines added per file

| File | Lines added |
|---|---|
| `docs/04-development/infrastructure/runbooks/internal-cron.md` | +46 |
| `docs/03-requirements/FR-WORKFLOW-003.md` | +22 |
| **Total** | **+68** across **2 files** |

## Small-PR rule confirmation (AGENTS.md §4)

- **Files changed:** 2 (≤ 5 limit). ✅
- **Lines changed:** 68 (≤ 400 limit, excluding no generated files / lockfiles). ✅
- **Logical scope:** One coherent doc update for one fix (a single new
  internal endpoint, documented where it lives in the runbook + where
  it is invoked from in the FR). ✅
- **No non-doc files touched.** ✅
- **No FR registry / BP-UAT registry / architecture diagram / DDL touched.** ✅

## Gate Result

```
gate: passed
agent: doc-writer
workflow: wf-20260703-fix-064
files_changed: 2
lines_added: 68
followups_flagged: 3 (see "Honest assessment" above)
notes:
  - architecture.md intentionally NOT modified (no existing Directus↔Authentik
    sync section to attach to; verified by grep).
  - security.md intentionally NOT modified (no existing InternalAuthGuard
    pattern documentation to attach to; verified by grep).
  - lead-nurture.md intentionally NOT rewritten; cross-referenced from
    both updated files instead (per task spec).
```
