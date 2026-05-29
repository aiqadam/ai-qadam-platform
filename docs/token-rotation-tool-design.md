# Design spec — one-command token-rotation tool

**Status:** DESIGN ONLY — not implemented. Build at the launch rotation pass (the trigger), when the per-secret steps are concrete.
**Why deferred:** the secrets this rotates are intentionally launch-gated (live-but-exposed, rotation deferred to customer-launch). Building the tool now would encode steps that may change before launch. Capture the design; implement when the rotation actually runs.

---

## Goal

One command rotates a class of platform secrets end-to-end: **mint new → write to where it's consumed (Coolify env / infra config) → verify the new one works → revoke the old one → update the local cache + memory record.** Replaces the current manual, error-prone, easy-to-forget-a-step dance.

## Secrets in scope (the launch-deferred set)

| Class | Secrets | Consumed by | Mint via | Revoke via |
|---|---|---|---|---|
| **F-S2.8** | Cloudflare Email-Routing token, Resend admin API key | `aiqadam-api` Coolify env (`CLOUDFLARE_API_TOKEN`, `RESEND_ADMIN_API_KEY`) | CF API tokens endpoint; Resend dashboard/API | CF API; Resend API |
| **F-S4.1-d** | dedicated Coolify API token, Plausible Sites token (`PLAUSIBLE_ADMIN_TOKEN` — now unused, F-S4.1-e) | `aiqadam-api` Coolify env | Coolify Profile→Tokens; Plausible (no Sites API on CE — token unused, just revoke) | Coolify UI; Plausible |
| **F-OPS1** | R2 access key id+secret, restic repo password | Backrest/restic config on prod | Cloudflare R2 API; restic `key add`/`key remove` | R2 API; restic |

> **Note:** some of these may no longer be needed at launch (e.g. `PLAUSIBLE_ADMIN_TOKEN` is already unused; F-S2.8 CF/Resend per-operator flow was dropped in PR #372 — verify what's still live before rotating). The tool should **skip** secrets whose consumer was removed.

## Shape

A small, auditable CLI (bash or a Node script in `infrastructure/scripts/`), one subcommand per secret class so blast radius is bounded:

```
rotate-secrets <class> [--dry-run] [--yes]
   class ∈ { cf-resend | coolify-plausible | r2-restic | all }
```

### Per-class lifecycle (the invariant)

1. **Pre-check** — confirm the consumer still exists (e.g. is `RESEND_ADMIN_API_KEY` still referenced in `aiqadam-api` env? if not, skip + log).
2. **Mint** new secret via the provider API. Capture the new value in memory only (never echo to stdout unredacted).
3. **Stage** — write new value to the consumer (Coolify env PATCH / infra config). Do NOT revoke old yet.
4. **Verify** — exercise the consumer with the new secret (e.g. a CF API ping, a restic `snapshots` list, a Coolify `GET /me`). Abort + roll back to old if verify fails.
5. **Activate** — redeploy/reload the consumer so it picks up the new secret. Re-verify the live path.
6. **Revoke** old secret via provider API (only after activate+verify succeed).
7. **Record** — update `/tmp/aiqadam-secrets-<NAME>`, 1Password, and the secrets-cache memory entry. Stamp rotation date.

### Safety properties (hard requirements)

- **Stage-before-revoke**: never revoke the old secret before the new one is verified live. Every class supports an abort that leaves the old secret valid.
- **`--dry-run`** prints the plan (what it would mint/stage/revoke) without mutating anything. Default to dry-run; require `--yes` to mutate.
- **No plaintext secrets in logs/stdout** (CLAUDE.md §6). Redact to last-4 in any output.
- **Idempotent-ish**: re-running after a partial failure detects already-rotated secrets (e.g. by tag/name) and resumes, rather than minting duplicates.
- **One class at a time** by default; `all` runs them sequentially with a confirm between each.
- **Coolify env writes**: use the API env PATCH (not label/FQDN paths — those are the WEB-UI-only trap). Env-var PATCH is safe via API.

## What it does NOT do
- It does not rotate Authentik admin tokens, JWT secrets, or DB passwords (different lifecycle/criticality — out of scope; rotate those manually per their own runbooks).
- It does not store secrets anywhere new — same cache locations as today.

## Build trigger
When the customer-launch rotation pass is scheduled. Reference the live exposed-secret memory entries (`project_f_s2_8_*`, `project_f_s4_1_d_*`, `project_snapshot_restore_tool`) for the exact current values + consumers at that time. **Re-verify each consumer still exists before coding its rotation** — several may have been removed (PR #372 dropped the F-S2.8 per-operator flow; F-S4.1-e made PLAUSIBLE_ADMIN_TOKEN unused).

## Related
- Memory: the three `…pending_rotation` / exposed-secret entries are the canonical list of what to rotate + where each is consumed.
- `infrastructure/dms/smoke.sh` is a good template for the "verify" step pattern (probe-and-assert).
