# Runbook: Observability v0 — Loki + Promtail + Uptime Kuma

**Audience:** anyone deploying, querying, or triaging alerts from the AI Qadam observability stack.
**Pre-reading:** [`infrastructure/observability/docker-compose.yml`](../../infrastructure/observability/docker-compose.yml), [ADR-0007](../adr/0007-coolify-orchestration.md).
**Ships:** Sprint 0.4 from [`docs/community-platform-roadmap.md`](../community-platform-roadmap.md) §7.

## What this stack gives us

| Service | Job | Reach |
|---|---|---|
| **Loki** (`grafana/loki:3.3.0`) | Stores logs from every container in `/loki` (filesystem, 30-day retention). | Internal only — exposes `:3100` to other containers in the Coolify network. |
| **Promtail** (`grafana/promtail:3.3.0`) | Tails `/var/lib/docker/containers/*/*-json.log`, labels by container/stack/service, ships to Loki. | Daemon — no exposed port. |
| **Uptime Kuma** (`louislam/uptime-kuma:1.23.16`) | Synthetic probes (HTTP/TCP/ping/DNS) every N seconds. Sends notifications on state change via Telegram, Slack, email, generic webhooks. | UI at `https://status.aiqadam.org` (after Coolify FQDN attach). |

What this stack does **not** include yet:
- Grafana for log visualization — defer to Sprint 2.4 (Metabase deploy) or later if needed; for now use `logcli` or curl against the Loki HTTP API.
- Tracing (OTel collector + Tempo / Jaeger) — out of scope for v0.
- Plausible custom events for `auth.failed`, `dispatch.failed`, `rbac.denied` — separate workstream owned by Agent-API (see referenced follow-up issue).

## Coolify deploy steps

> **HUMAN action required after merge.** Coolify deploys are not yet wired to git push. Run these steps in the Coolify UI on the production host.

1. **Create the stack.** Coolify → Project: AI Qadam → New Resource → Docker Compose Empty.
2. **Paste** the contents of `infrastructure/observability/docker-compose.yml` into the compose editor.
3. **No env vars needed.** All configuration is inlined via `configs:`.
4. **Attach FQDN** on the `uptime-kuma` service: `status.aiqadam.org` → port `3001`. Coolify generates the Traefik labels + Let's Encrypt cert automatically.
5. **Do not attach** an FQDN on `loki`. It is internal-only; exposing it publicly without auth would let anyone read or write logs.
6. **Deploy.** Wait for all 3 services to report healthy in the Coolify dashboard.
7. **First-time Uptime Kuma setup** (one-time):
   - Visit `https://status.aiqadam.org`.
   - Create the admin account (use the BREAKGLASS password manager, not personal email).
   - Settings → Notifications → add channel: Telegram (bot token + chat ID), plus email via Resend SMTP (smtp.resend.com:587, user `resend`, password `RESEND_API_KEY`).
   - Settings → General → set "Display timezone" to `Asia/Tashkent`.
   - Save the admin credentials to the team's password manager.

## Probes to configure (Uptime Kuma "Monitors")

Add these on first-time setup; revisit when a new public surface lands.

| Monitor name | Type | Target | Interval | Notification on failure |
|---|---|---|---|---|
| `web — aiqadam.org` | HTTPS | `https://aiqadam.org` (expect 200) | 60 s | Telegram + email |
| `web — uz.aiqadam.org` | HTTPS | `https://uz.aiqadam.org` (expect 200) | 60 s | Telegram + email |
| `api — /v1/health` | HTTPS | `https://api.aiqadam.org/v1/health` (expect 200, body `ok`) | 60 s | Telegram + email |
| `auth — Authentik` | HTTPS | `https://auth.aiqadam.org/-/health/ready/` (expect 204) | 120 s | Telegram + email |
| `cms — Directus` | HTTPS | `https://cms.aiqadam.org/server/health` (expect 200) | 120 s | Telegram + email |
| `crm — Twenty` | HTTPS | `https://crm.aiqadam.org/healthz` (expect 200) | 300 s | Telegram |
| `analytics — Plausible` | HTTPS | `https://analytics.aiqadam.org/api/health` (expect 200) | 300 s | Telegram |
| `coolify — platform host` | HTTPS | `https://coolify.aiqadam.org` (expect 200) | 300 s | Telegram |
| Per-country subdomain (`kz`, `tj`, future) | HTTPS | `https://<cc>.aiqadam.org` | 60 s | Telegram + email |

> **Operator rule:** every new public FQDN ships with a corresponding Uptime Kuma monitor in the same PR (Coolify config step, not git). PR description must list "Uptime Kuma probe added: <FQDN>".

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

## Triaging an Uptime Kuma alert

1. **Read the alert.** Telegram/email shows monitor name, last status, response time / HTTP code, since when.
2. **Reproduce.** `curl -v <url>` from your laptop. If your home network can't reach it, check from a second location (e.g., the platform host itself: `ssh aiqadam-prod 'curl -v <url>'`).
3. **Check related logs.** Query Loki for the failing service in the last 15 minutes (see snippet above). Look for crash loops, OOMs, panic stack traces.
4. **Triage path.**
   - 5xx on the API → check `apps/api` container logs; check Postgres health; check upstream (Directus, Authentik).
   - 404 / connection refused → check Coolify, is the service actually running? `coolify` UI or `ssh aiqadam-prod 'docker ps | grep <service>'`.
   - TLS error → cert renewal — Coolify handles via Traefik, but a misconfigured FQDN can leave a stale cert. Force-redeploy the affected service.
   - Slow response (>2s) → check Plausible event rate, Postgres pg_stat_activity, Redis memory.
5. **If unsure**, escalate via Telegram operators group with the monitor name + last 10 Loki log lines as a quote.

## Adding a new monitor

1. Uptime Kuma UI → Add New Monitor → fill: type, URL/target, interval, notification channels (Telegram + email at minimum for prod surfaces).
2. Update the "Probes to configure" table in this runbook in a doc-only PR (`docs(runbooks): add <name> probe`).
3. If the monitor is for a new public FQDN, the PR shipping that FQDN must reference this runbook in its description.

## Known limitations

- **Loki single-binary, single-replica.** No HA. If the disk fills or the container crashes, in-flight logs are lost. Acceptable for v0 — revisit when log volume justifies a 2-node setup (~50 GB/day or 5+ countries live).
- **Promtail uses the docker socket.** Promtail has read-only docker socket access (`docker.sock:ro`), so it can discover containers but not control them. Still: a Promtail exploit could leak container metadata. Acceptable for a single-tenant platform; reconsider if multi-tenant compute is ever introduced.
- **Uptime Kuma's first-boot signup is open.** Whoever visits `https://status.aiqadam.org` first becomes the admin. The "Coolify deploy steps" above include a "do this in the first 5 minutes after FQDN attach" callout. Audit log surfaces the owner email — verify it's the BREAKGLASS account, not personal.
- **No alert escalation.** If the on-call doesn't ack a Telegram alert, it doesn't escalate. Phase ζ.7 (trust & safety) is the right place to add PagerDuty or Better Stack integration if call density warrants.

## When to revisit this runbook

- Log volume exceeds 50 GB/day → switch to S3 backend.
- A second country goes live → confirm its FQDN has a monitor.
- Grafana joins the stack for log dashboards.
- Plausible ops-events helper from Agent-API lands → cross-link from this runbook to the helper's docstring.
- Coolify gains deploy-on-merge → drop the "HUMAN action required" callout.
