# Doc Writer — wf-20260801-fix-187 — ISS-SEC-PUBLIC-UNMANAGED-001

## Doc Update Scope

This PR touches infrastructure only — `infrastructure/directus/bootstrap.sh`. No application code, no API, no UI. Doc impact:

### Files to update

| Path | Change | Why |
|---|---|---|
| `infrastructure/directus/bootstrap.sh` (inline) | Already includes a comprehensive block comment explaining the fix (header banner + inline rationale for each filter/allowlist choice + explicit callout of the related bug in the lower public-read blocks). | Code-level documentation. |
| `.copilot/issues/ISS-SEC-PUBLIC-UNMANAGED-001.md` | Resolution section update — see Step 10. | Issue tracking. |
| `.copilot/issues/registry.md` | Add row — see Step 10. | Issue registry. |
| `docs/04-development/security/security.md` | **No update needed.** The fix is a specific Directus permission configuration, not a new policy rule. The existing §3 "Authorization at the controller level" + §4 "Tenant isolation" + §9 "Sensitive data exposure" rules are what this fix enforces; nothing new to add. |

### Files NOT to update (and why)

| Path | Reason |
|---|---|
| `apps/web/...` | No application code changed. apps/web's `cms.ts:852` continues to make the same requests; the resulting response shape was already missing bio_md before this PR (because of the earlier directus_users revoke) and continues to be missing after. Documented in PR Risks, not docs. |
| `docs/02-business-processes/uat/` | No business process changed. The public event-detail surface continues to be a `BP-UAT-NNN` process; this PR doesn't change which process is exercised. |
| `docs/04-development/architecture/architecture.md` | No architectural decision; same Directus permission model. |
| `docs/04-development/standards.md` | No new standard; existing "RBAC scopes via policies" rule is followed. |

### Honesty note

The inline block comments in `bootstrap.sh` are doing more documentation work than usual because the rest of the file doesn't have a header-style comment for each block. This is intentional — the section touches security-sensitive permission rows, and the next contributor who needs to modify it (e.g. to widen an allowlist) should understand the trade-offs without re-deriving them.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Doc impact is contained to inline comments in the file being modified + issue/registry updates. No app code, no architectural decisions, no new standards. No docs/ tree changes needed beyond the issue file + registry row updates handled in Step 10."
```