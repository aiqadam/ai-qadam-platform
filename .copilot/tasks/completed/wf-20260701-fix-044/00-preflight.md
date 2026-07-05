# 00-preflight — Infrastructure & state check

**Recorded:** 2026-07-01T20:14:00Z (UTC)

## Required services

| Service | Host:Port | Status | Source |
|---|---|---|---|
| `apps/web` (legacy Astro) | `127.0.0.1:4321` | ✅ UP (node PID 32536, `astro.mjs dev --port 4321`) | `netstat` + Get-CimInstance |
| `apps/api` (NestJS) | `127.0.0.1:3001` | (assumed up; pre-existing UAT stack) | terminal history |
| aiqadam-postgres | `127.0.0.1:5433` | ✅ UP (37 h, healthy) | `docker ps` |
| aiqadam-directus | `127.0.0.1:8200` | ✅ UP (37 h, healthy) | `docker ps` |
| aiqadam-mailpit | `127.0.0.1:8025` | ✅ UP (37 h, healthy) | `docker ps` |
| aiqadam-authentik | `127.0.0.1:9000` | ✅ UP (37 h, healthy) | `docker ps` |
| aiqadam-redis | `127.0.0.1:6379` | ✅ UP (37 h, healthy) | `docker ps` |

**No infrastructure brought up in this workflow** (AGENTS.md §6.1 pre-flight
required only if infra was missing — it isn't).

## Git state

```text
branch: fix/ISS-LEAD-DISC-001-lead-form-discoverability  (just created off main c136bf8)
status: M .copilot/meta/next-workflow-id
        ?? .copilot/issues/ISS-LEAD-DISC-001.md
```

Clean except for the new workflow artifacts. **Clean-Tree Invariant will be
restored at workflow-finish time.**

## Counter

- `.copilot/meta/next-workflow-id` = **43** at start (assigns wf-20260701-fix-044)
- Will be incremented to **44** at workflow-finish step.
