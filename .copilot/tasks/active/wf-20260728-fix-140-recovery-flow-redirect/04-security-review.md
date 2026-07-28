# Step 5: Security Review

**Workflow:** wf-20260728-fix-140-recovery-flow-redirect · **Issue:** [ISS-USR-REDIRECT-002](../../../issues/ISS-USR-REDIRECT-002.md)

## Code Changes Reviewed

- `apps/api/src/modules/admin-invites/authentik.client.ts`
- `apps/api/test/authentik-client.spec.ts`

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | No tenant-scoped tables touched. |
| INV-2 Secrets by reference | Yes | Pass | No secret literals introduced. The fix only changes which JSON key is read from an existing response — `AUTHENTIK_ADMIN_TOKEN` usage is unchanged. |
| INV-3 Auth at controller level | No | N/A | No new controller methods; `createRecoveryLink` is an internal client method, already gated by existing callers' own auth checks. |
| INV-4 Validation at boundaries | No | N/A | Internal admin-API client, not a public boundary. |
| INV-5 No cross-schema queries | No | N/A | — |
| INV-6 Rate limiting | No | N/A | No new endpoints. Existing callers (`register`, `telegramExchange`) already have their own rate limits, unchanged. |
| INV-7 CSRF protection | No | N/A | No new state-changing browser-initiated endpoint. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | Pass | Zero occurrences. |
| INV-9 No N+1 queries | No | N/A | — |
| INV-10 Drizzle parameterization | No | N/A | — |
| INV-11 HttpOnly tokens | No | N/A | The recovery link itself is Authentik-hosted and emailed, unrelated to this app's cookie handling. |

## Additional analysis

**Does fixing this bug change the security posture?** Before this fix,
`createRecoveryLink()` silently returned `undefined`; after, it returns
the real Authentik-hosted recovery URL. This restores intended behavior
(email dispatch, Telegram redirect) rather than introducing new
behavior. The recovery link itself is minted by Authentik's own admin
API using a token scoped to `AUTHENTIK_ADMIN_TOKEN` (unchanged,
pre-existing dependency) — no new trust boundary crossed.

**Does the now-working link leak anything?** No — it's dispatched only
via `InteractionsService` email to the registrant's own submitted
address (`registration.service.ts`, unchanged) or returned directly to
the Telegram-widget caller who already proved control of that Telegram
account via HMAC verification (`telegram-auth.service.ts`, unchanged).

**Scope note:** This fix does NOT address whether the recovery link
itself is a secure one-time-login mechanism (see
[ISS-USR-REDIRECT-003](../../../issues/ISS-USR-REDIRECT-003.md) —
filed separately, explicitly deferred as a design question, not
security-reviewed as part of this narrow fix since no new mechanism
ships here).

### BLOCKER Findings

None.

### MAJOR Findings

None.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "One-line field-name fix restoring intended (pre-existing) behavior. No new trust boundary, no new endpoint, no new secret handling. No BLOCKER/MAJOR findings."
```
