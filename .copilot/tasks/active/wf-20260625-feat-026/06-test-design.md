---
agent: TestDesigner
workflow_instance_id: wf-20260625-feat-026
produced_at: "2026-06-25"
---

# Test Design — FR-CRM-001 (Twenty CRM Production Compose)

## Summary

This PR contains no TypeScript/JavaScript source changes. There are no Vitest unit
tests, no Testcontainers integration tests, and no Playwright E2E tests to write.
The automated test gate is YAML validation via `docker compose config`. Manual smoke
tests are documented as a post-deploy checklist.

---

## Tests Written

### Unit Tests

| File | Count / Focus | Required? |
|---|---|---|
| — | None — no TypeScript/JavaScript source changes in this PR | No |

### Integration Tests

| File | Count / Focus | Required? |
|---|---|---|
| — | None — no NestJS modules, services, or Drizzle schemas changed | No |

### E2E Tests

| File | Count / Focus | Required? |
|---|---|---|
| — | None — no platform frontend routes or user flows introduced; Twenty CRM is an external service unreachable from CI | No |

### Automated YAML Lint Commands

These commands constitute the full automated test suite for this PR. They MUST pass
before the PR is merged.

---

#### Test 1 — Production compose validation

**Purpose:** Confirm `infrastructure/twenty/docker-compose.yml` is valid Docker Compose
v2 YAML with no schema errors.

```bash
docker compose -f infrastructure/twenty/docker-compose.yml config
```

**Expected result:** exits 0 and prints the resolved compose configuration to stdout.

**Environment requirements:** Docker Engine available (no image pull required — `config`
only parses and validates).

**Notes:**
- All env vars in the production compose use `${VAR:-default}` fallback syntax or are
  optional. No additional env var stubs are needed for the validator to succeed.
- If `TAG` is unset, the validator resolves `${TAG:-v0.50.0}` to `v0.50.0` — correct.
- If any secret vars (`APP_SECRET`, `PG_DATABASE_PASSWORD`, `ENTERPRISE_KEY`, etc.)
  are unset, the compose will still validate because they have no `?error` suffix in
  the production compose file (they are referenced as `${VAR}` which resolves to empty
  string on parse — acceptable for a lint gate).

---

#### Test 2 — Local-dev compose validation

**Purpose:** Confirm that the additions to `infrastructure/docker-compose.yml`
(the `twenty` service and `telegram-bot-api` service) do not break the existing
compose file and are themselves schema-valid.

```bash
# Provide a minimal stub .env so required vars resolve.
# These are the vars docker compose config will warn on if entirely absent.
# Use throwaway values — this is a lint gate, not a live stack.
POSTGRES_PASSWORD=stub \
POSTGRES_USER=stub \
MINIO_ROOT_PASSWORD=stub \
MINIO_ROOT_USER=stub \
AUTHENTIK_SECRET_KEY=stub \
AUTHENTIK_BOOTSTRAP_PASSWORD=stub \
TWENTY_APP_SECRET=stub \
TELEGRAM_API_ID=stub \
TELEGRAM_API_HASH=stub \
docker compose -f infrastructure/docker-compose.yml config
```

**Expected result:** exits 0 and prints the resolved compose configuration to stdout.

**Alternative (using an env file):**

```bash
# Create a minimal stub env file for the lint run (do not commit)
cat > /tmp/compose-lint.env <<'EOF'
POSTGRES_PASSWORD=stub
POSTGRES_USER=stub
MINIO_ROOT_PASSWORD=stub
MINIO_ROOT_USER=stub
AUTHENTIK_SECRET_KEY=stub
AUTHENTIK_BOOTSTRAP_PASSWORD=stub
TWENTY_APP_SECRET=stub
TELEGRAM_API_ID=stub
TELEGRAM_API_HASH=stub
EOF

docker compose --env-file /tmp/compose-lint.env \
  -f infrastructure/docker-compose.yml config

rm /tmp/compose-lint.env
```

**Notes:**
- The env file approach is preferred in CI pipelines to avoid leaking variable names
  into shell history or process lists.
- Only stub values are used — no real credentials are required for a lint gate.
- If the local-dev compose inherits from a top-level `.env`, the CI runner should
  ensure no real `.env` is present at the repo root (it is gitignored — this is the
  default state in CI).

---

#### Test 3 — Git diff scope guard

**Purpose:** Confirm AC-7 — that the PR diff contains no changes under `apps/` or
`packages/`. This is a one-liner that passes silently (exit 0) if the invariant holds.

```bash
# Run from the repo root on the feature branch.
# Should produce no output and exit 0 if AC-7 holds.
git diff origin/main --name-only | grep -E '^(apps|packages)/' && \
  echo "FAIL: apps/ or packages/ files changed" && exit 1 || \
  echo "PASS: no apps/ or packages/ changes"
```

**Expected result:** prints `PASS: no apps/ or packages/ changes` and exits 0.

---

## Manual Smoke Test Checklist (Post-Deploy)

These steps MUST be executed manually by the operator after deploying the stack to
Coolify. They cannot be automated in CI because they require a live
Coolify + Authentik + Twenty stack.

Record results in a comment on the PR before merging.

```
[ ] S1 — https://crm.aiqadam.org is reachable. HTTP 200, Twenty workspace UI loads.
[ ] S2 — "Sign in with SSO" button is present and redirects to https://auth.aiqadam.org/...
[ ] S3 — SSO sign-in completes and returns a valid session. User lands in the workspace.
[ ] S4 — admin@aiqadam.org maps to the existing bootstrap account. No duplicate user created.
[ ] S5 — Twenty background worker is healthy. Check /healthz or worker container logs show no errors.
[ ] S6 — Stack survives Coolify restart. Both twenty-server and twenty-worker containers come back up.
[ ] S7 — RAM usage: docker stats shows Twenty stack (server + worker + db + cache) under 400 MB combined RSS.
```

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 (production compose present, four services, image pin, tmpfs) | Test 1 (YAML lint) + PR diff review | Automated (structural) + manual (content) |
| AC-2 (SSO env vars present as `${VAR}` references) | PR diff review | Manual file inspection |
| AC-3 (`expose: ["3000"]` on `twenty-server`) | PR diff review | Manual file inspection |
| AC-4 (local-dev compose: `twenty` + `telegram-bot-api` services with correct port bindings) | Test 2 (YAML lint) + PR diff review | Automated (structural) + manual (content) |
| AC-5 (postgres-init.sql: `CREATE DATABASE twenty;`) | PR diff review | Manual file inspection |
| AC-5 (`.env.example`: `TWENTY_APP_SECRET=` with comment) | PR diff review | Manual file inspection |
| AC-6 (FR-CRM-001 status: `Implemented`) | PR diff review | Manual file inspection — BLOCKED pending DocWriter fix |
| AC-7 (no `apps/` or `packages/` changes) | Test 3 (git diff guard) | Automated |
| S1–S7 (operational smoke tests) | Manual smoke checklist | Manual (post-deploy) |

---

## Known Test Gaps

1. **AC-6 is currently blocked.** `docs/03-requirements/FR-CRM-001.md` still reads
   `status: Planned` and `docs/03-requirements/requirements-registry.md` row 6 still
   reads `Planned`. The DocWriter step must apply these updates before the quality gate
   runs. The test design cannot resolve this gap — it is a documentation deliverable.
   <!-- TODO: DocWriter must update FR-CRM-001.md and requirements-registry.md before merge -->

2. **No runtime image availability check.** `docker compose config` validates YAML
   schema but does not pull or verify that `twentycrm/twenty:v0.50.0`,
   `postgres:16-alpine`, and `redis:7-alpine` are pullable. This is acceptable for a
   lint gate — image availability is implicitly verified when Coolify deploys.

3. **No Traefik routing validation.** The `expose: ["3000"]` declaration drives
   Coolify/Traefik label generation, but label correctness can only be verified after
   Coolify registers the service via `PATCH /api/v1/services/<uuid>`. This is covered
   by smoke test S1.

4. **Worker healthcheck is absent (OBS-3 from SecurityReviewer).** The production
   compose does not define a healthcheck for the `worker` service. Smoke test S5
   covers this manually. An automated healthcheck command can be added in a follow-up
   PR if Twenty's worker exposes a health endpoint.
   <!-- TODO: Add worker healthcheck to infrastructure/twenty/docker-compose.yml in a follow-up PR -->

---

## Gate Result

gate_result:
  status: passed
  summary: "No unit, integration, or E2E tests are applicable for this infrastructure-only PR; three automated commands cover YAML lint (production compose), YAML lint (local-dev compose), and git diff scope guard; manual smoke tests S1–S7 are fully documented for post-deploy verification; all seven ACs are mapped."
  findings:
    - "Test 1: 'docker compose -f infrastructure/twenty/docker-compose.yml config' — production compose YAML lint; no additional env vars needed"
    - "Test 2: 'docker compose -f infrastructure/docker-compose.yml config' with stub env vars — local-dev compose YAML lint; stub values documented"
    - "Test 3: git diff scope guard confirms AC-7 (no apps/ or packages/ changes)"
    - "Manual smoke tests S1–S7 documented as a PR-comment checklist for post-deploy operator verification"
    - "AC-6 coverage is BLOCKED: FR-CRM-001.md and requirements-registry.md still read Planned — DocWriter must resolve before quality gate"
    - "OBS-3 gap noted: worker healthcheck absent in production compose — documented as TODO for follow-up PR"
    - "No it.skip, no any, no skipped test bodies — there are no test files to write; this is intentional and documented"
