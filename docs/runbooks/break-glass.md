# Runbook: Break-glass admin path

**Audience:** engineer who needs admin-level access to a production system AND the normal SSO chain is broken (Authentik down, RBAC sync wedged, super-admin OIDC mapping mis-applied). Also: post-break-glass cleanup.

**Pre-reading:** [`docs/auth-architecture.md`](../auth-architecture.md), [`security.md`](./security.md) (every break-glass event is a security event by definition), [`audit.md`](./audit.md) (the post-cleanup audit pass).

**Total time:** invoke break-glass ~2 min; remediate the underlying outage 15 min – several hours; cleanup + audit + postmortem same-day.

> **Scaffold** — full break-glass endpoint + bootstrap-time provisioning of a break-glass credential lands with F-S0.2 (per `docs/community-platform-roadmap.md` §7 Sprint 0.2). Until F-S0.2 ships, "break-glass" today means SSH to prod (`ssh aiqadam-prod`) + direct DB access + manual Coolify-side fixes. This scaffold codifies the *shape* of the future flow so engineers can write the F-S0.2 PR against a stable target.

## Pre-conditions

- The normal SSO chain is **verifiably** broken. Not "I can't log in" — "Authentik returns 500" or "RBAC sync hasn't applied changes in N hours". If the only symptom is "I can't log in", the right runbook is [`auth.md`](./auth.md), not this one. Break-glass is a one-way door for an actual outage.
- Engineer has the break-glass credential (location TBD per F-S0.2 — current plan: sealed in the team password manager + a separate 2FA-locked entry; both must be present to invoke)
- Incident channel is open; another engineer is witness (avoid solo break-glass)
- Reason for invocation has been written down BEFORE the call (e.g., "Authentik authorize endpoint returning 500 since 14:32, blocking all logins, cannot use normal admin path")

If any pre-condition fails, do NOT proceed. The cost of a wrongful break-glass is high (audit, trust, future-outage cost when the credential is rotated); the cost of a delayed legitimate response is lower than that.

## Steps

1. **Announce.** In the incident channel: "Invoking break-glass at <UTC time> because <reason>. Witness: <name>." This timestamp anchors the post-incident audit.

2. **Authenticate via the break-glass path.** Per F-S0.2 (planned): `POST /v1/internal/break-glass/auth` with the credential + the reason text + the witness name. The endpoint validates, mints a short-TTL (15-minute) admin JWT, and emits an audit event with all three fields. Until F-S0.2 ships, the break-glass path is direct SSH to prod (`ssh aiqadam-prod`) + Coolify admin UI; mint a manual audit entry by appending to `/var/log/aiqadam/break-glass.log` on the host.

3. **Perform the minimum-necessary action.** Do not "look around while you're there" — every byte you touch is an auditable event. Stick to the documented action that the outage requires.

4. **Verify.** The minimum-necessary action succeeded; the system is recovering through normal channels.

5. **Cleanup.**
   - Revoke / rotate the break-glass credential if the credential itself was exposed (e.g., shared screen, typed into a chat). Default: rotate after every invocation, even if not exposed.
   - Reset any temporary state the action created (e.g., a temporarily-granted role on a non-engineer account).
   - Restart whatever short-TTL session was minted (don't let it linger past the 15-minute window).

6. **Audit + postmortem.** Within the same business day:
   - Run the audit pass from [`audit.md`](./audit.md) §B (Operator-conduct) against the break-glass-authenticated user, scoped to the invocation window — verify the actions match the announced reason.
   - Write a postmortem: what broke, why break-glass was needed (not just "I couldn't log in"), what we did, what we'll change so this break-glass isn't needed next time.

## Verification

- The break-glass action achieved its purpose (the outage is resolved or the recovery path is unblocked)
- The break-glass credential has been rotated (or scheduled for next-day rotation if rotation requires a separate change)
- An audit-events row exists for every action taken during the break-glass window
- The postmortem is opened (even if not yet complete)

## Rollback

Break-glass actions themselves are not "rollback-able" — the action was taken because the normal path couldn't. But the consequences are: if break-glass created a temporary role grant, revoke it; if it bypassed a check, re-apply the check; if it surfaced a data-corruption fix, the corresponding backup-restore in [`restic-backups.md`](./restic-backups.md) is the next door if the fix went wrong.

## Common failure modes

*(Grows from real invocations. Empty is correct on day one. Track each invocation here — break-glass is rare enough that the table fits the entire history.)*

| Date | Reason | Cleanup gap | Mitigation |
|---|---|---|---|

## References

- [`docs/community-platform-roadmap.md` §7 Sprint 0.2](../community-platform-roadmap.md) — F-S0.2 feature that ships the endpoint
- [`docs/auth-architecture.md`](../auth-architecture.md) — the auth chain this bypasses
- [`security.md`](./security.md) — every break-glass is a security event
- [`audit.md`](./audit.md) — the post-cleanup audit pass
- [ADR-0021 — RBAC manifest](../adr/0021-rbac-manifest.md) (Proposed) — the roles break-glass briefly impersonates
