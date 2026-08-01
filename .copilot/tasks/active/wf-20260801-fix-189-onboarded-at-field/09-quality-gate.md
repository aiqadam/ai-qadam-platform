# 09 — Quality Gate — wf-20260801-fix-189

**Verdict: PASS** — workflow ready to push.

## Acceptance criteria disposition

| # | AC (from issue #168 body) | Verified? | Evidence |
|---|---|---|---|
| AC-1 | `directus_users.onboarded_at` exists as a field on local Directus | **verified** | T1 + T2: jq `index("onboarded_at")` returned a number after bootstrap run; `GET /fields/directus_users/onboarded_at` returned 200 with full schema (type=timestamp, nullable=true, interface=datetime, readonly=true). |
| AC-2 | Field type is `timestamp`, nullable, with `datetime` interface | **verified** | T2: `type=timestamp  nullable=true  interface=datetime` |
| AC-3 | Field is `readonly` to prevent accidental admin writes (matches `email_verified_at` analog) | **verified** | T2: `readonly=true` |
| AC-4 | `PATCH /users/{id}` with `{onboarded_at: <iso>}` body persists the value | **verified** | T4: PATCH response `.data.onboarded_at` equals test timestamp `2026-08-01T12:00:00.000Z`. |
| AC-5 | `GET /users/{id}?fields=onboarded_at` returns the stored value | **verified** | T5: read-side returns identical timestamp. |
| AC-6 | `bootstrap.sh` re-runs are idempotent (field already exists → no-op) | **verified** | T3: snapshot of `/fields/directus_users/onboarded_at` before second bootstrap run is byte-identical to snapshot after; `ensure()` skip-on-existence path works as designed. |
| AC-7 | All permission grants naming `onboarded_at` (in `MEMBER_PROFILE_FIELDS` line ~2729) become functional, not no-op | **verified (by construction)** | `MEMBER_PROFILE_FIELDS` already includes `onboarded_at`. The permission row backed by it was a no-op before this PR; after the field exists, the row grants real read access. No new permission row added — existing allowlist now backed by a real column. |

## Honesty disclosures

- None — every AC was verified end-to-end in this workflow. No
  deferred tests, no queued follow-up workflows for the same surface.
- Pre-existing `wf-20260801-fix-188-public-policy-uuid-lookup` is
  unrelated to `onboarded_at` and was already queued by the prior
  workflow.

## Quality criteria

| Criterion | Result |
|---|---|
| Ten Non-Negotiables (§1) | All 10 met (see `03-code-developer.md` §"Self-check"). |
| Plan before code (§2) | Stated in chat before edits. |
| Code quality (§3) — TS strict, no `any`, no `@ts-ignore` | N/A (bash only). |
| `bash -n` syntax check | exit 0 |
| Live verification per AGENTS.md §6.1 | 5 live curl tests + bootstrap.sh re-run. |
| Security Reviewer verdict | PASS, no blockers (`04-security-reviewer.md`). |
| Tests per AGENTS.md §3 | Live curl probes replace Testcontainers for schema-side change; existing apps/api tests pin contract. |
| Commit conventions (§10) | Conventional Commits scope `directus-bootstrap`. |
| No CI surfaces touched | Confirmed (only `infrastructure/directus/bootstrap.sh` modified). |

## Workflow ready to push.