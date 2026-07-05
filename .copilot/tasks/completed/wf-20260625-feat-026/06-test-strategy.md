---
agent: TestStrategist
workflow_instance_id: wf-20260625-feat-026
produced_at: "2026-06-25"
---

# Test Strategy — FR-CRM-001 (Twenty CRM Production Compose)

## Requirement

**FEAT-INFRA-3** — The repository SHALL contain a production-grade Coolify Docker
Compose file at `infrastructure/twenty/docker-compose.yml` that exactly describes the
Twenty CRM service currently running in production at `crm.aiqadam.org`, plus local-dev
compose additions, env example updates, and postgres init script updates. No NestJS,
Astro, or shared-types code is changed — this is a pure infrastructure deliverable.

---

## Rubric Score

| Criterion | Points | Assessment |
|---|---|---|
| Touches tenant-scoped data | +2 | No — no NestJS queries or row-level tenant scoping changes |
| New API endpoint | +2 | No — zero new NestJS controllers or routes |
| Business rule with edge cases (capacity, waitlist, dates) | +2 | No — no application logic |
| Cross-module service call | +1 | No — no inter-module calls |
| New database query | +1 | No — `CREATE DATABASE twenty;` is a static DDL in postgres-init.sql, not a NestJS query |
| Pure function / utility | 0 | N/A |
| UI-only change (no logic) | 0 | N/A |

**Total score: 0**

**Justification:** Every changed file is infrastructure configuration: a Docker Compose
YAML, a shell-level SQL init script, an env example file, a gitignore entry. There is
no TypeScript, no NestJS module, no Drizzle schema, no React component, and no
application-layer logic in this PR. The rubric's point criteria all target application
code changes — none apply here.

---

## Required Test Levels

- [ ] Unit tests — **Not applicable.** No public functions, classes, or TypeScript
  modules were introduced or modified. There is nothing to unit-test with Vitest.
- [ ] Integration tests (Testcontainers) — **Not applicable.** No NestJS service,
  repository, or database query was added. Testcontainers exercises application-layer
  DB interactions; none exist in this PR.
- [ ] E2E tests (Playwright) — **Not applicable.** No new pages, routes, or user flows
  were introduced in the platform frontend (`apps/web`, `apps/web-next`). Twenty CRM
  is an external service deployed behind Coolify — Playwright cannot reach it in CI.
- [x] YAML lint (automated, CI-viable) — **Required.** Both compose files must parse
  as valid Docker Compose v2 YAML before the PR merges. `docker compose config` is the
  authoritative validator.
- [x] Manual smoke tests (post-deploy, operational) — **Required.** The acceptance
  criteria include runtime behavior (SSO sign-in, worker health, Coolify restart,
  RAM usage) that can only be verified against a live stack. These are documented
  as manual steps and cannot be automated in CI.

---

## Unit Test Plan

Not applicable — score 0, no TypeScript/JavaScript source changes.

| Target | Happy Path | Failure Paths |
|---|---|---|
| — | — | — |

---

## Integration Test Plan

Not applicable — score 0, no NestJS service or DB schema changes.

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| — | — | — |

---

## E2E Test Plan

Not applicable — score 0, no platform frontend or user-flow changes. Post-deploy
operational smoke tests are documented separately in the Manual Smoke Test section
below and in the test design artifact.

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| — | — | — |

---

## Automated Gate: YAML Lint

The only automated test gate viable for this PR is Docker Compose YAML validation.

### Rationale

`docker compose -f <file> config` parses the compose file, resolves anchors and
extends, validates the schema, and exits 0 on success. This is the canonical way to
confirm a compose file is well-formed before it is deployed to Coolify. It catches:

- Malformed YAML syntax
- Unknown or misspelled compose keys
- Structural errors (e.g., a service missing its `image` key)
- Invalid volume mount syntax

It does **not** require a running Docker daemon that pulls images — it only validates
structure. It is therefore runnable in any CI environment that has Docker installed.

### Files to Validate

| File | Validator | Required Env Vars |
|---|---|---|
| `infrastructure/twenty/docker-compose.yml` | `docker compose config` | None (all vars use `${VAR:-default}` or are optional) |
| `infrastructure/docker-compose.yml` | `docker compose config` | Several (see test design for minimal stub set) |

### Limitations

`docker compose config` validates syntax and schema but does not:
- Pull images and verify they exist
- Start containers and confirm runtime health
- Test network routing or Traefik label generation
- Verify that env var values are semantically correct (e.g., that `SERVER_URL` is a
  valid URL)

Runtime correctness is covered by the manual smoke tests below.

---

## Manual Smoke Tests (Post-Deploy Verification)

These steps map directly to the acceptance criteria and to the operational smoke tests
defined in the impact analysis. They MUST be executed manually by the operator after
deploying the stack to Coolify. They cannot be automated in CI.

| Step | What to Check | Pass Condition |
|---|---|---|
| S1 | `https://crm.aiqadam.org` is reachable | HTTP 200, Twenty workspace UI loads |
| S2 | "Sign in with SSO" button navigates to Authentik | Redirect to `https://auth.aiqadam.org/...` |
| S3 | SSO sign-in completes and returns to Twenty | Valid session established; user lands in workspace |
| S4 | `admin@aiqadam.org` maps to existing account on first SSO sign-in | No duplicate user created |
| S5 | Twenty background worker is healthy | `/healthz` returns healthy or worker logs show no errors |
| S6 | Stack survives Coolify restart | Both `twenty-server` and `twenty-worker` come back up without crashloop |
| S7 | RAM usage under 400 MB total for the Twenty stack | `docker stats` confirms combined RSS under threshold |

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (production compose present: four services, image pin, tmpfs) | YAML lint | `docker compose -f infrastructure/twenty/docker-compose.yml config` exits 0; confirms file is parseable and schema-valid |
| AC-1 (content: `twenty-server`, `twenty-worker` services with `v0.50.0` and `mode: 0o1777`) | Manual file inspection | Reviewer confirms service names, image tag reference, and tmpfs mode in the diff |
| AC-2 (SSO env vars present) | Manual file inspection | Reviewer confirms `IS_MULTIWORKSPACE_ENABLED`, `FRONTEND_URL`, `DEFAULT_SUBDOMAIN`, `ENTERPRISE_KEY`, `SERVER_URL` are present as `${VAR}` references |
| AC-3 (expose declaration on server) | Manual file inspection | Reviewer confirms `expose: ["3000"]` on `twenty-server` service |
| AC-4 (local-dev compose: twenty + telegram-bot-api services) | YAML lint | `docker compose -f infrastructure/docker-compose.yml config` exits 0; confirms additive services are syntactically correct |
| AC-4 (port bindings: 127.0.0.1:3010, 127.0.0.1:8082) | Manual file inspection | Reviewer confirms `127.0.0.1:3010:3000` and `127.0.0.1:8082:8081` in local-dev compose |
| AC-5 (postgres-init.sql: `CREATE DATABASE twenty;`) | Manual file inspection | Reviewer confirms the DDL line is present and the file remains valid SQL |
| AC-5 (`.env.example`: `TWENTY_APP_SECRET=`) | Manual file inspection | Reviewer confirms stub entry with generation comment is present |
| AC-6 (FR-CRM-001 status: `Implemented`) | Manual file inspection | Reviewer confirms `status: Implemented` in `docs/03-requirements/FR-CRM-001.md` front-matter |
| AC-7 (no `apps/` or `packages/` changes) | Git diff review | `git diff origin/main --name-only | grep -E '^(apps|packages)/'` returns empty |
| S1–S7 (operational smoke tests) | Manual smoke test (post-deploy) | Operator verifies live stack after Coolify deploy |

---

## Gate Result

gate_result:
  status: passed
  summary: "Infrastructure-only PR (score 0) — no unit, integration, or E2E tests are applicable; automated gate is YAML lint via 'docker compose config' on both compose files; operational smoke tests are documented as mandatory manual steps mapped to all seven ACs."
  findings:
    - "Rubric score 0: no TypeScript/NestJS/Drizzle/frontend code changed — Vitest and Playwright are not applicable"
    - "Automated gate: 'docker compose config' on infrastructure/twenty/docker-compose.yml and infrastructure/docker-compose.yml covers AC-1 and AC-4 structural validity"
    - "AC-1, AC-2, AC-3, AC-5, AC-6 require manual file inspection — all are static-content checks that CI file review (PR diff) can satisfy"
    - "AC-7 (no apps/ or packages/ changes) is verifiable via git diff on the PR"
    - "Operational smoke tests S1–S7 are mandatory post-deploy manual steps — they cannot run in CI because they require a live Coolify + Authentik + Twenty stack"
    - "Known gap from CodeDeveloper: docs/03-requirements/FR-CRM-001.md status still reads Planned — AC-6 is not yet passable until DocWriter resolves this"
