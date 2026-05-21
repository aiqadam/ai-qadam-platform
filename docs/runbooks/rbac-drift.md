# Runbook: RBAC drift investigation + remediation

**Audience:** engineer responding to a nightly RBAC-drift alert, or to a manual drift report ("operator X has permission Y they shouldn't"). Drift = the actual permission state in Directus / Plausible / etc. disagrees with what the RBAC manifest (ADR-0021) says it should be.

**Pre-reading:** [ADR-0021](../adr/0021-rbac-manifest.md) (the canonical manifest), [`docs/community-platform-roadmap.md` §7 Sprint 2.2](../community-platform-roadmap.md) (the sync service that's supposed to prevent drift), [`auth.md`](./auth.md) §C (RBAC sync failure case).

**Total time:** 10–30 min per drift instance.

> **Scaffold** — full procedure lands with F-S2.2 RBAC sync + the nightly drift poll the ADR-0021 §5 calls for. Track Sprint 0.13 + Sprint 2.2 in `docs/community-platform-roadmap.md` §7. **Gated on ADR-0021 Acceptance** (currently Proposed).

## Pre-conditions

- F-S2.2 RBAC sync has shipped (otherwise this runbook is moot — without a sync service, "drift" is the default state and the right tool is manual reconciliation per [`country-lead-activation.md`](./country-lead-activation.md) §A)
- Engineer has Authentik admin + Directus admin + Plausible admin (per [`reference-secrets-cache`](../../.claude/projects/-home-drukker-aiqadam/memory/reference_secrets_cache.md))
- The drift alert / report names: the affected user, the affected engine (Directus / Plausible / Authentik), the expected state per the manifest, the observed state

## Steps

### A. Confirm the drift is real

1. Re-run the nightly drift poll on demand (`/v1/internal/rbac/drift?dry-run=true` per F-S2.2 design; replace with the actual endpoint once shipped). Confirm the alert reproduces.
2. Read the user's Authentik group membership directly (`auth.aiqadam.org/api/v3/core/users/<id>` → groups field) — this is the source of truth.
3. Read the engine-side state (Directus policy attachment / Plausible site access). Compare.

### B. Classify the drift

- **Manual override** — someone edited Directus / Plausible directly. The sync service should re-apply on its next tick; if it doesn't, the override is set as "do not sync" — investigate why.
- **Sync-service stall** — RBAC sync is running but missed events. Check the sync-service event log; look for the missing event-id range.
- **Sync-service crash** — RBAC sync was down during the window. Loki has the gap; replay the missed events from Authentik's audit log.
- **Manifest mismatch** — the manifest itself was updated and the running sync service hasn't picked up the new version. Restart the sync service.
- **Adversarial** — a user / operator deliberately granted themselves a permission. Escalate to [`security.md`](./security.md).

### C. Remediate

Based on classification:

| Class | Remediation |
|---|---|
| Manual override | Re-run sync; if it still drifts, find the override marker + remove it. |
| Sync-service stall | Replay missed events via `/v1/internal/rbac/replay?from=<event-id>&to=<event-id>`. |
| Sync-service crash | Restart `aiqadam-api` (Coolify), then replay events from the last successful tick. |
| Manifest mismatch | Restart the sync service after redeploying the API with the new manifest. |
| Adversarial | → [`security.md`](./security.md). Do NOT remediate before the security runbook runs. |

### D. Document + close

1. Update the drift-alert ticket with the classification + the remediation taken.
2. If the classification revealed a sync-service bug: open an issue against the sync service.
3. If the classification was adversarial: handoff to security runbook is your close-out.

## Verification

- The nightly drift poll on demand returns zero diffs for the previously-flagged user
- The user can perform actions consistent with the manifest (run the F-S2.2 RBAC verification suite if it exists)
- No new drift alert in the following 24 hours

## Rollback

Per-engine: if the remediation accidentally granted MORE permission than intended, revoke via the engine admin UI + re-run sync. If it revoked needed permission, the engineer's normal change is to re-add to the Authentik group + let sync re-apply.

## Common failure modes

*(Grows from real drift cases. Empty is correct on day one.)*

## References

- [ADR-0021](../adr/0021-rbac-manifest.md) — the canonical manifest this runbook protects
- [`docs/community-platform-roadmap.md` §7 Sprint 2.2](../community-platform-roadmap.md) — F-S2.2 RBAC sync feature
- [`auth.md`](./auth.md) — for the related case where the sync service itself is the failure
- [`security.md`](./security.md) — escalation path when drift looks adversarial
- [`audit.md`](./audit.md) — for the post-drift forensic pass
