# Runbook: Break-glass admin path

**Audience:** engineer who needs admin-level access to a production system AND the normal SSO chain is broken (Authentik down, RBAC sync wedged, super-admin OIDC mapping mis-applied). Also: post-break-glass cleanup.

**Pre-reading:** [`docs/04-development/architecture/auth-architecture.md`](../../architecture/auth-architecture.md), [`security.md`](security.md) (every break-glass event is a security event by definition), [`audit.md`](audit.md) (the post-cleanup audit pass).

**Total time:** invoke break-glass ~2 min; remediate the underlying outage 15 min – several hours; cleanup + audit + postmortem same-day.

> **Status (2026-05-21):** F-S0.2 shipped — break-glass cached credentials are provisioned + documented below. A short-TTL API endpoint (`POST /v1/internal/break-glass/auth`) was considered for v1 and deferred: it depends on F-S2.2 RBAC sync (which defines the impersonated roles + the audit row shape), and the simpler "cached credentials per [community-platform-roadmap.md §7 row 0.2](../../../01-business/community-platform-roadmap.md)" path is the right v1. Until F-S2.2 lands, the cached-credentials approach below IS the supported break-glass path.

## Pre-conditions

- The normal SSO chain is **verifiably** broken. Not "I can't log in" — "Authentik returns 500" or "RBAC sync hasn't applied changes in N hours". If the only symptom is "I can't log in", the right runbook is [`auth.md`](../../infrastructure/runbooks/auth.md), not this one. Break-glass is a one-way door for an actual outage.
- The break-glass credential is available:
  - `/tmp/aiqadam-secrets-BREAKGLASS_DIRECTUS_TOKEN` (mode 0600) on the engineer's WSL session, OR the same value pulled fresh from the team password manager under "Break-Glass / Directus".
  - SSH access to `aiqadam-prod` for the DB-superuser half (the manual `psql` step under "Database admin" below).
- Incident channel (Telegram / Slack equivalent) is open; another engineer is witness (avoid solo break-glass).
- Reason for invocation has been written down BEFORE the call (e.g., "Authentik authorize endpoint returning 500 since 14:32, blocking all logins, cannot use normal admin path").

If any pre-condition fails, do NOT proceed. The cost of a wrongful break-glass is high (audit, trust, future-outage cost when the credential is rotated); the cost of a delayed legitimate response is lower than that.

## What's cached

| Secret path | What it gates | Who uses it |
|---|---|---|
| `/tmp/aiqadam-secrets-BREAKGLASS_DIRECTUS_TOKEN` | Directus admin API (full schema + items + users access; bypasses Authentik SSO) | Engineer with WSL access OR pulled from the password manager and pasted ad-hoc |
| `aiqadam_breakglass` Postgres role on the **shared-infra pgvector container** (password stored in the team password manager under "Break-Glass / Postgres") | Postgres superuser-ish access to the cluster where Directus + API + Authentik app data lives; lets you query / repair tables when Directus itself is misbehaving | Engineer via `ssh aiqadam-prod` + `sudo docker exec -it <pgvector-container> psql -U aiqadam_breakglass`. Resolve the container name at run time: `sudo docker ps --format '{{.Names}} {{.Image}}' \| grep pgvector` (Coolify-managed name; as of 2026-05-21 it's `rmh626agrz1uiv8cyny47rbb`). |

Both rotate quarterly. The Directus side rotates via [`scripts/provision-break-glass.sh`](../../../../scripts/provision-break-glass.sh); the Postgres side rotates manually per the "Rotations" section below.

## Steps

1. **Announce.** In the incident channel: "Invoking break-glass at <UTC time> because <reason>. Witness: <name>." This timestamp anchors the post-incident audit.

2. **Pull the credential you need.** Either:
   - Directus admin API: `export BG=$(cat /tmp/aiqadam-secrets-BREAKGLASS_DIRECTUS_TOKEN)` (or paste from the password manager). Then `curl -H "Authorization: Bearer $BG" https://cms.aiqadam.org/users/me` should return the break-glass user.
   - Postgres: `ssh aiqadam-prod` → resolve the pgvector container at `PG=$(sudo docker ps --format '{{.Names}} {{.Image}}' \| awk '/pgvector/{print $1; exit}')` then `sudo docker exec -it "$PG" psql -U aiqadam_breakglass -d postgres` (password prompts; paste from the password manager).

3. **Log the invocation manually.** Append a line to `/var/log/aiqadam/break-glass.log` on the host (one engineer's responsibility; do this BEFORE the action, not after):
   ```bash
   ssh aiqadam-prod 'sudo tee -a /var/log/aiqadam/break-glass.log <<<"$(date -u --iso-8601=seconds) reason=\"<one-liner>\" engineer=<your-handle> witness=<witness-handle>"'
   ```
   When F-S2.5 audit-log ships, this manual append becomes an audit_events row written by the API; today the host-side log file is the durable record.

4. **Perform the minimum-necessary action.** Do not "look around while you're there" — every byte you touch is an auditable event. Stick to the documented action that the outage requires.

5. **Verify.** The minimum-necessary action succeeded; the system is recovering through normal channels.

6. **Cleanup.**
   - Revoke / rotate the break-glass credential if the credential itself was exposed (e.g., shared screen, typed into a chat). **Default: rotate after every invocation**, even if not exposed. See "Rotations" below.
   - Reset any temporary state the action created (e.g., a temporarily-granted role on a non-engineer account; a debug flag you flipped).
   - Close out / clear the `export BG=...` from your shell history.

7. **Audit + postmortem.** Within the same business day:
   - Run the audit pass from [`audit.md`](audit.md) §B (Operator-conduct) against the `aiqadam-break-glass` Directus user, scoped to the invocation window — verify the actions match the announced reason.
   - Write a postmortem: what broke, why break-glass was needed (not just "I couldn't log in"), what we did, what we'll change so this break-glass isn't needed next time.
   - Update the "Invocation history" table below with date + engineer + outcome.

## Rotations

### Directus break-glass token (quarterly + after every invocation)

```bash
DIRECTUS_URL=https://cms.aiqadam.org \
DIRECTUS_TOKEN=$(cat /tmp/aiqadam-secrets-DIRECTUS_TOKEN) \
bash scripts/provision-break-glass.sh
```

The script is idempotent: re-running rotates the token on the existing `aiqadam-break-glass@aiqadam.org` user (it doesn't create a new user every time). Output is written to `/tmp/aiqadam-secrets-BREAKGLASS_DIRECTUS_TOKEN` and printed to stdout. Copy the new value into the team password manager immediately; the prior token is invalidated by Directus the moment the new one is PATCHed in.

### Postgres `aiqadam_breakglass` role (quarterly + after every invocation)

Manual, on the prod host. The container is Coolify-managed so its name (a UUID) can change — resolve at runtime:

```bash
ssh aiqadam-prod
# Resolve the pgvector container (where Directus + API + Authentik tables live).
PG=$(sudo docker ps --format '{{.Names}} {{.Image}}' | awk '/pgvector/{print $1; exit}')
echo "Targeting container: $PG"
# New random password — copy to team password manager FIRST.
NEW_PW=$(openssl rand -base64 24)
echo "$NEW_PW"
# Apply.
sudo docker exec -i "$PG" psql -U postgres -d postgres <<EOF
DO \$do\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aiqadam_breakglass') THEN
    CREATE ROLE aiqadam_breakglass LOGIN SUPERUSER PASSWORD '$NEW_PW';
  ELSE
    ALTER ROLE aiqadam_breakglass WITH PASSWORD '$NEW_PW';
  END IF;
END
\$do\$;
EOF
```

After rotation: test login with the new password (`sudo docker exec -it "$PG" psql -U aiqadam_breakglass -d postgres`).

## Verification

- The break-glass action achieved its purpose (the outage is resolved or the recovery path is unblocked).
- The break-glass credential has been rotated (or scheduled for next-day rotation if rotation requires a separate change — never longer).
- An entry in `/var/log/aiqadam/break-glass.log` exists for the invocation (today's audit-of-record; superseded by audit_events when F-S2.5 ships).
- The postmortem is opened (even if not yet complete).
- The invocation appears in the "Invocation history" table below.

## Rollback

Break-glass actions themselves are not "rollback-able" — the action was taken because the normal path couldn't. But the consequences are: if break-glass created a temporary role grant, revoke it; if it bypassed a check, re-apply the check; if it surfaced a data-corruption fix, the corresponding backup-restore in [`restic-backups.md`](../../infrastructure/runbooks/restic-backups.md) is the next door if the fix went wrong.

## Common failure modes

*(Grows from real invocations. Empty is correct on day one.)*

| Date | Reason | Cleanup gap | Mitigation |
|---|---|---|---|

## Invocation history

| Date | Engineer | Witness | Reason (1-line) | Outcome | Postmortem |
|---|---|---|---|---|---|

## References

- [`docs/01-business/community-platform-roadmap.md` §7 Sprint 0.2](../../../01-business/community-platform-roadmap.md) — F-S0.2 spec (this runbook + provision script)
- [`scripts/provision-break-glass.sh`](../../../../scripts/provision-break-glass.sh) — the rotation tooling
- [`docs/04-development/architecture/auth-architecture.md`](../../architecture/auth-architecture.md) — the auth chain this bypasses
- [`security.md`](security.md) — every break-glass is a security event
- [`audit.md`](audit.md) — the post-cleanup audit pass
- [ADR-0021 — RBAC manifest](../../../adr/0021-rbac-manifest.md) (Proposed) — when accepted + F-S2.2 RBAC sync ships, the short-TTL API-endpoint version of break-glass (`POST /v1/internal/break-glass/auth`) becomes feasible; until then, the cached-credentials path above IS the v1
- [`reference-secrets-cache`](../../.claude/projects/-home-drukker-aiqadam/memory/reference_secrets_cache.md) — inventory of cached secrets including BREAKGLASS_DIRECTUS_TOKEN
