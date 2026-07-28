# Step 5: Security Review

**Workflow:** wf-20260728-fix-139 · **Issue:** [ISS-USR-REDIRECT-001](../../../issues/ISS-USR-REDIRECT-001.md)

## Code Changes Reviewed

- `apps/web-next/src/pages/auth/sign-in.astro`
- `apps/web/src/pages/auth/sign-in.astro`
- `apps/web-next/src/blocks/common/AppNav.astro`
- `apps/web/src/components/Nav.astro`

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | No DB queries, no tenant-scoped tables touched. |
| INV-2 Secrets by reference | No | N/A | No secrets/tokens in the diff. |
| INV-3 Auth at controller level | No | N/A | No new controller methods. |
| INV-4 Validation at boundaries | Yes | Pass | The pre-existing sanitizer (`startsWith('/') && !startsWith('//')`) is unchanged in logic — only the *fallback value* when it rejects or when `?next=` is absent changed, from the literal `/` to the literal `/me`. Both are hardcoded same-origin absolute paths, not user input — no new attack surface. The open-redirect guard itself (reject anything not starting with a single `/`) is untouched. |
| INV-5 No cross-schema queries | No | N/A | — |
| INV-6 Rate limiting | No | N/A | No new endpoints. |
| INV-7 CSRF protection | No | N/A | GET navigations only, no state-changing POST/PUT/PATCH/DELETE introduced. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | Pass | Zero occurrences in diff. |
| INV-9 No N+1 queries | No | N/A | — |
| INV-10 Drizzle parameterization | No | N/A | — |
| INV-11 HttpOnly tokens | No | N/A | No cookie/token handling touched. |

## Additional analysis: open-redirect risk

The changed lines only affect the **fallback constant** used when `next`
is absent or fails the existing same-origin check
(`rawNext.startsWith('/') && !rawNext.startsWith('//')`). That check is
unmodified. `/me` is a hardcoded literal, same trust level as the `/`
literal it replaces — no attacker-controlled input reaches the new
fallback value. `AppNav.astro`/`Nav.astro`'s new `signInNext` branch
(`Astro.url.pathname === '/' ? '/me' : currentPath`) compares against a
hardcoded string and falls through to the pre-existing `currentPath`
(itself server-derived from `Astro.url`, not user-supplied) for every
other case. No new user-controlled value flows into the redirect target
that wasn't already there.

`/me` requires authentication (`AuthGuard` server-side / `AuthGate`
client-side per existing architecture) — redirecting an unauthenticated
browser there after a successful OIDC callback is safe; `/me` itself
handles the "not actually authed" case independently (pre-existing
behavior, unrelated to this change).

### BLOCKER Findings

None.

### MAJOR Findings

None.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "4-file, default-value-only change to next= computation. No new user-controlled input reaches the redirect sanitizer; the sanitizer itself is unmodified. No BLOCKER/MAJOR findings."
```
