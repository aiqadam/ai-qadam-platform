# 02 — Impact Analysis: FR-AUTH-003 (Google + GitHub OAuth)

**Workflow:** wf-20260802-feat-192-auth-003-social-oauth  
**Agent:** ImpactAnalyzer  
**Date:** 2026-08-02

---

## Summary

Four files touched. No DB migration. No shared-types changes.

| File | Action |
|---|---|
| `apps/api/src/modules/auth/auth.controller.ts` | Modify — `?provider=` param + `access_denied` early exit |
| `apps/api/src/modules/auth/auth.service.ts` | Modify — widen `startAuthorization()` input; pass `source=` to `authorizationUrl()` |
| `apps/web-next/src/pages/auth/sign-in.astro` | Modify — Google + GitHub buttons; `oauth_denied` error display |
| `scripts/provision-authentik-oauth-sources.sh` | Create — idempotent Authentik OAuth Source provisioning |

**DBMigrationAuthor step skipped.** Email deduplication is Authentik-side; `upsertByAuthentikSubject()` handles any OIDC identity source.

---

## Implementation Notes

### `auth.service.ts`

Widen input: `{ next: string; provider?: 'google' | 'github' }`.
Append to `authorizationUrl()` options: `...(input.provider !== undefined ? { source: input.provider } : {})`.

### `auth.controller.ts` — `login()`

Add `@Query('provider') providerRaw: string | undefined`. Validate against:
```ts
const VALID_PROVIDERS = ['google', 'github'] as const;
```
Invalid value → `throw new BadRequestException('invalid provider')` BEFORE `startAuthorization()`.

### `auth.controller.ts` — `callback()`

Insert BEFORE the existing `completeAuthorization()` try/catch:
```ts
if (req.query['error'] === 'access_denied') {
  res.redirect(`${env.WEB_BASE_URL}/auth/sign-in?error=oauth_denied`);
  return;
}
```
Ordering is critical — `openid-client` throws `OPError` for `?error=` params.

### `sign-in.astro`

Add provider URLs and error read at the top of the frontmatter, then render:
- Error banner (only when `oauthError === 'oauth_denied'`)
- Two new `btn-secondary` anchors (Google, GitHub)

### `provision-authentik-oauth-sources.sh`

Slugs MUST be `google` and `github`. Credentials via env vars only. Windows curl idiom per AGENTS.md §6.1.

---

## Risk Flags for SecurityReviewer

| # | Risk | Severity |
|---|---|---|
| SR-1 | Provider injection — `source=<provider>` appended to authorize URL | HIGH — `VALID_PROVIDERS` allowlist required |
| SR-2 | `access_denied` redirect destination | MEDIUM — fixed `env.WEB_BASE_URL + /auth/sign-in?error=oauth_denied`, no user input |
| SR-3 | No secrets in tracked files (AC-6) | HIGH — credentials only in Authentik env |

---

## Gate Result

```
gate_result:
  status: passed
  summary: "Full impact identified. No architecture violations. DBMigrationAuthor skipped. SecurityReviewer must verify SR-1 and SR-3."
```
