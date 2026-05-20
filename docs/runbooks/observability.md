# Runbook: Observability v0 — Loki + Promtail + Gatus

**Audience:** anyone deploying, querying, or triaging alerts from the AI Qadam observability stack.
**Pre-reading:** [`infrastructure/observability/docker-compose.yml`](../../infrastructure/observability/docker-compose.yml) (logs), [`infrastructure/gatus/docker-compose.yml`](../../infrastructure/gatus/docker-compose.yml) (uptime), [ADR-0007](../adr/0007-coolify-orchestration.md), [ADR-0032](../adr/0032-operator-tools-must-sso-or-embed.md).
**Ships:** Sprint 0.4 from [`docs/community-platform-roadmap.md`](../community-platform-roadmap.md) §7.

## What this stack gives us

| Service | Job | Reach |
|---|---|---|
| **Loki** (`grafana/loki:3.3.0`) | Stores logs from every container in `/loki` (filesystem, 30-day retention). | Internal only — exposes `:3100` to other containers in the Coolify network. |
| **Promtail** (`grafana/promtail:3.3.0`) | Tails `/var/lib/docker/containers/*/*-json.log`, labels by container/stack/service, ships to Loki. | Daemon — no exposed port. |
| **Gatus** (`twinproduction/gatus:v5.13.1`) | Synthetic HTTP/TCP/DNS probes every N seconds. Notifications on state change via Telegram (others available). | UI at `https://status.aiqadam.org`, **Authentik OIDC-gated** per [ADR-0032](../adr/0032-operator-tools-must-sso-or-embed.md). |

What this stack does **not** include yet:
- Grafana for log visualization — defer to Sprint 2.4 (Metabase deploy) or later if needed; for now use `logcli` or curl against the Loki HTTP API.
- Tracing (OTel collector + Tempo / Jaeger) — out of scope for v0.

## Why Gatus instead of Uptime Kuma

Uptime Kuma shipped briefly via PR #112 + the 2026-05-20 deploy session, but Uptime Kuma has no OIDC support and the upstream has declined to add it ([louislam/uptime-kuma#2434](https://github.com/louislam/uptime-kuma/issues/2434)). That made it an auth island the moment it went live. [ADR-0032](../adr/0032-operator-tools-must-sso-or-embed.md) sets the rule that operator-facing tools must SSO via Authentik or embed in `workspace.aiqadam.org`. Gatus satisfies (a): native OIDC, configured via `security.oidc` in `config.yaml`, redirects to Authentik for sign-in.

Same probe surface (HTTP/TCP/DNS), ~3× smaller footprint (~50 MB vs ~180 MB), config-as-code (the YAML in `infrastructure/gatus/docker-compose.yml` IS the probe roster — no UI-only state to back up).

## Ops events (Plausible)

The API emits server-side ops events to Plausible via `apps/api/src/lib/ops-events.ts`. These complement the user-facing pageviews collected by the browser tracker and surface in the same `analytics.aiqadam.org` dashboard.

| Event | Where emitted | Props |
|---|---|---|
| `auth.failed` | `auth.controller.ts` OIDC callback `catch` block | `reason` (Error class name), `path` (`callback`) |
| `dispatch.failed` | `interactions.service.ts` adapter-failure + no-adapter paths | `channel`, `intent`, `reason` |
| `rbac.denied` | **Not wired yet** — RBAC system itself ships in Sprint 2.2 (ADR-0021). When that lands, hook into the AuthGuard role-check path with props `route`, `required_role`, `actual_role`. |

**Config:** set `PLAUSIBLE_HOST=https://analytics.aiqadam.org` in the API container's Coolify env. Empty (the default) disables emission — useful in dev/test.

**Filtering test traffic:** every event also receives `is_test=true` once the email-adapter `is_test_user` routing ships (S0.1 schema landed; routing is a follow-up). Until then, every event is emitted; Plausible's dashboard filters can exclude by props.

**Synthetic URLs:** ops events use `https://aiqadam.org/__ops__/<event-name>` as their URL so they group cleanly. Add a Plausible filter to exclude `/__ops__/*` from the default page-views dashboard if it bothers the eye.

**Safety:** the helper is fire-and-forget — it `void`s the Promise, swallows all errors, and aborts after 1 s. Observability MUST NOT break the request path.

## Coolify deploy steps

The observability stack and the uptime stack are TWO Coolify services so they have independent lifecycles. Both can be deployed via Coolify API or the UI.

### A. Logs (Loki + Promtail)

Already deployed as Coolify service `aiqadam-observability` (compose at `infrastructure/observability/docker-compose.yml`). If redeploying from scratch:

1. **Create the stack.** Coolify → Project: AI Qadam → New Resource → Docker Compose Empty.
2. **Paste** the contents of `infrastructure/observability/docker-compose.yml` into the compose editor.
3. **No env vars needed.** All configuration is inlined via `configs:`.
4. **Do not attach** an FQDN to `loki`. It is internal-only; exposing it publicly without auth would let anyone read or write logs.
5. **Deploy.** Wait for both services to report healthy.

### B. Uptime (Gatus)

1. **Provision the Authentik OIDC application + provider** first — Gatus refuses to start without `GATUS_OIDC_CLIENT_SECRET`. Run on the platform host (or anywhere with `AK_API_TOKEN`):
   ```bash
   bash scripts/provision-gatus-authentik.sh
   ```
   Idempotent — re-running prints the existing client secret. The secret is also written to `/tmp/aiqadam-secrets-GATUS_OIDC_CLIENT_SECRET`.
2. **Create the Gatus service** in Coolify (UI or API).
   - Project: AI Qadam → New Resource → Docker Compose Empty.
   - Name: `aiqadam-gatus`.
   - Paste `infrastructure/gatus/docker-compose.yml`.
3. **Env vars:**
   - `GATUS_OIDC_CLIENT_SECRET` (required) — value from step 1.
   - `GATUS_TELEGRAM_TOKEN` + `GATUS_TELEGRAM_CHAT_ID` (optional but recommended for alerts).
4. **Attach FQDN:** `status.aiqadam.org` → `gatus` service, port `8080`.
5. **Deploy.** Wait for `gatus` to report healthy (~30 s).
6. **Authentik:** assign users/groups to the `Gatus` application in Authentik admin. Anyone in the assignment is allowed to log in.
7. **First sign-in:** visit `https://status.aiqadam.org`, click sign-in, complete the Authentik flow. No separate Gatus admin to create — the OIDC subject is the identity.

> **Operator rule:** every new public FQDN added to AI Qadam ships with a corresponding Gatus endpoint in the same PR (edit `infrastructure/gatus/docker-compose.yml`). PR description must list "Gatus probe added: `<FQDN>`".

## Probes configured

Defined inline in `infrastructure/gatus/docker-compose.yml` (the `endpoints:` list). Updating that file + redeploying Gatus is the only step needed to add/remove a probe.

| Endpoint | Group | Interval | Failure threshold |
|---|---|---|---|
| `https://aiqadam.org/` | web | 60 s | 3 |
| `https://uz.aiqadam.org/` | web | 60 s | 3 |
| `https://aiqadam.org/api/health` | api | 60 s | 3 |
| `https://auth.aiqadam.org/-/health/ready/` | identity | 120 s | 2 |
| `https://cms.aiqadam.org/server/health` | cms | 120 s | 2 |
| `https://crm.aiqadam.org/healthz` | crm | 300 s | 2 |
| `https://analytics.aiqadam.org/api/health` | analytics | 300 s | 2 |
| `https://coolify.aiqadam.org/` | platform | 300 s | 2 |
| `https://aiqadam.org/workspace` | web | 120 s | 3 |

## Querying Loki from the platform host

Loki has no UI in v0. Use `logcli` (download via Loki releases page) or curl from the platform host where the Coolify network is reachable:

```bash
# All Authentik logs in the last 5 minutes
docker run --rm --network=coolify grafana/logcli:3.3.0 \
  --addr=http://loki:3100 \
  query '{container=~".*authentik.*"}' --since=5m

# Recent ERROR-level lines across the API stack
docker run --rm --network=coolify grafana/logcli:3.3.0 \
  --addr=http://loki:3100 \
  query '{stack="api"} |= "ERROR"' --since=15m --limit=200
```

Loki keeps 30 days of logs. Older logs are deleted by the compactor.

## Triaging a Gatus alert

1. **Read the alert.** Telegram message shows endpoint name, last status, failure count, since when.
2. **Reproduce.** `curl -v <url>` from your laptop. If your home network can't reach it, check from a second location (e.g., the platform host: `ssh aiqadam-prod 'curl -v <url>'`).
3. **Check related logs.** Query Loki for the failing service in the last 15 minutes (see snippet above). Look for crash loops, OOMs, panic stack traces.
4. **Triage path.**
   - 5xx on the API → check `apps/api` container logs; check Postgres health; check upstream (Directus, Authentik).
   - 404 / connection refused → check Coolify, is the service actually running? `coolify` UI or `ssh aiqadam-prod 'docker ps | grep <service>'`.
   - TLS error → cert renewal — Coolify handles via Traefik, but a misconfigured FQDN can leave a stale cert. Force-redeploy the affected service.
   - Slow response (>3 s) → check Plausible event rate, Postgres pg_stat_activity, Redis memory.
5. **If unsure**, escalate via Telegram operators group with the endpoint name + last 10 Loki log lines as a quote.

## Adding a new probe

1. Edit `infrastructure/gatus/docker-compose.yml`, add a new entry to the `endpoints:` list (copy an existing block as template).
2. The PR adding the new public FQDN must include this edit.
3. After merge, re-deploy the `aiqadam-gatus` Coolify service (or run the redeploy via Coolify API): `curl -X GET -H "Authorization: Bearer $COOLIFY_TOKEN" "https://coolify.aiqadam.org/api/v1/services/<uuid>/restart"`.
4. Verify the new probe appears on `https://status.aiqadam.org` within ~30 s.

## Known limitations

- **Loki single-binary, single-replica.** No HA. If the disk fills or the container crashes, in-flight logs are lost. Acceptable for v0 — revisit when log volume justifies a 2-node setup (~50 GB/day or 5+ countries live).
- **Promtail uses the docker socket.** Promtail has read-only docker socket access (`docker.sock:ro`), so it can discover containers but not control them. Still: a Promtail exploit could leak container metadata. Acceptable for a single-tenant platform.
- **Gatus dashboard is read-only-public by default.** Anyone visiting `https://status.aiqadam.org` sees probe results without signing in. Tighten by setting `ui.public: false` in the compose's inlined config if probe data itself is sensitive (today it isn't — every probed URL is a public FQDN).
- **No alert escalation.** If the on-call doesn't ack a Telegram alert, it doesn't escalate. Phase ζ.7 (trust & safety) is the right place to add PagerDuty or Better Stack integration if call density warrants.
- **Gatus SQLite is single-host.** Probe history doesn't replicate. Acceptable for v0; the data is regenerable (probes run continuously) — losing it just means losing the historical chart.

## When to revisit this runbook

- Log volume exceeds 50 GB/day → switch Loki to S3 backend.
- A second country goes live → confirm its FQDN has a Gatus probe entry.
- Grafana joins the stack for log dashboards.
- ~~Plausible ops-events helper from Agent-API lands → cross-link from this runbook to the helper's docstring.~~ Shipped via issue #113 — see "Ops events (Plausible)" section above.
- ~~Uptime Kuma replaced with an OIDC-capable tool.~~ Shipped: Gatus, per ADR-0032 + this PR.
- Coolify gains deploy-on-merge → drop the "HUMAN action required" callouts.

## Decommissioning Uptime Kuma (one-time)

The Uptime Kuma container is part of the Coolify service `aiqadam-observability` (UUID `kmt4q1atfo9hxyyadtc1mwc0`). To remove it cleanly:

1. **Detach the FQDN.** PATCH the service URL list to drop `status.aiqadam.org` from `uptime-kuma`. (Will be reassigned to `aiqadam-gatus` in the Gatus deploy step above.)
2. **Update the service compose.** PATCH `aiqadam-observability` with the new compose at `infrastructure/observability/docker-compose.yml` (Loki + Promtail only — no Uptime Kuma block).
3. **Redeploy.** Coolify re-applies; the `uptime-kuma` container is removed.
4. **Drop the orphaned volume.** `ssh aiqadam-prod docker volume rm <volume-name>` once the container is gone — Coolify won't reuse it.

No member-visible URL changes (Uptime Kuma wasn't bookmarked anywhere). The historical probe data inside Uptime Kuma is lost; Gatus starts fresh.
