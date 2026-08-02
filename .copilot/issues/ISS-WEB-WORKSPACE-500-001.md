# ISS-WEB-WORKSPACE-500-001 — `apps/web` (v1, live prod) `/workspace/dashboard` 500s for anonymous requests, breaking the anon→auth redirect chain

| Field | Value |
|---|---|
| ID | ISS-WEB-WORKSPACE-500-001 |
| Severity | blocker |
| Module | web/workspace (apps/web, v1) |
| Status | open |
| Reported | 2026-08-02 |
| Resolved | — |
| Workflow | none assigned yet |
| Reporter | Orchestrator (discovered while triaging unrelated `ci-cd` failures; root-caused via the scheduled `parity-check` workflow's failure history) |
| Related | FR-MIG-030, `docs/03-requirements/parity-matrix.md` (operator surface, `/workspace` dashboard row) |
| Business-Process | — |
| GitHub-Issue | (to be created) |

## Symptom

Anonymous `GET https://aiqadam.org/workspace/dashboard` returns a `500
Internal Server Error` with an empty response body. Confirmed
reproducible 3/3 via direct `curl` (no cookies) on 2026-08-02 ~07:01
UTC:

```
$ curl -sS -D - -o /dev/null https://aiqadam.org/workspace/dashboard
HTTP/1.1 500 Internal Server Error
Server: nginx/1.28.3 (Ubuntu)
```

Full redirect chain from an anonymous visit to `/workspace`:

```
GET /workspace              → 302 Location: /workspace/dashboard
GET /workspace/dashboard    → 500 (empty body)
```

`/auth/sign-in` and `/onboard` returned healthy `302`s at the same
time this was checked — the earlier `ERR_CONNECTION_REFUSED` seen for
those two paths in the 2026-08-02 05:44 UTC `parity-check` run appears
to have been transient (not reproduced on manual re-check) and is not
covered by this issue.

## Impact

- This is the **root cause** of the `parity-operator.spec.ts` "anon
  redirects" test failures seen in every `parity-check` scheduled run
  for at least the last 8 days (2026-07-25 through 2026-08-02, 10/10
  runs checked, 10/10 failed — `gh run list --workflow
  parity-check.yml`). The test expects anon visitors to `/workspace`
  and its sub-paths to be redirected toward Authentik or shown an
  inline auth gate; instead the client-side redirect never fires
  because the destination route (`/workspace/dashboard`) itself
  crashes with a 500 before `Workspace.tsx`'s `bootstrap()` /
  `getAuthState()` logic can run.
- **Not** a security/auth-bypass issue — the 500 happens instead of
  an auth bypass, not instead of a gate. No anon user can currently
  see real workspace content via this path; they get an opaque error
  page.
- Per the user (2026-08-02 session), v1 (`apps/web`, `aiqadam.org`) is
  still actively used by real operators today — the parity-matrix
  (`docs/03-requirements/parity-matrix.md`) confirms v2 has not cut
  over (every row still ❌ as of this writing). Any operator whose
  session cookie has expired, or any freshly-invited operator without
  a session yet, hitting `/workspace` will land on this 500 instead of
  being routed to sign in.

## Root cause (not yet confirmed — needs investigation)

Not diagnosed in this session — this issue was filed from external
(`curl`) black-box evidence only, no server-side logs or code changes
were made. `apps/web/src/pages/workspace/index.astro` renders
`prerender = false` (SSR, so auth middleware runs) and 302s to
`/workspace/dashboard`. `apps/web/src/pages/workspace/dashboard.astro`
(not yet inspected) is presumably also SSR and may be throwing during
its own render for the anonymous (no-session) case — e.g. an
unguarded Directus/Authentik call that assumes a session exists,
rather than deferring the auth check to the client-side
`Workspace.tsx` component the way `/workspace`'s own index page does.

## Acceptance criteria

- [ ] AC-1: Root-cause the 500 — identify why
      `apps/web/src/pages/workspace/dashboard.astro` (or its
      middleware) throws for anonymous requests specifically.
- [ ] AC-2: Anonymous `GET /workspace/dashboard` no longer 500s —
      either redirects to Authentik server-side, or renders
      client-side and lets `Workspace.tsx`'s existing anon-redirect
      logic run (matching `/workspace`'s own current behavior).
- [ ] AC-3: `apps/e2e/tests/parity/parity-operator.spec.ts`'s "anon
      redirects" suite passes against `https://aiqadam.org` for all 6
      `WORKSPACE_PATHS` (`/workspace`, `/workspace/events`,
      `/workspace/members`, `/workspace/announce`,
      `/workspace/approvals`, `/workspace/partners`) — confirm whether
      the same crash pattern affects the other 5 paths too (not
      individually curl-checked yet, only `/workspace/dashboard` was).
- [ ] AC-4: A subsequent scheduled `parity-check` run shows this
      specific failure class gone (other unrelated parity failures —
      accessibility color-contrast, v2 element-not-found — are
      out of scope for this issue, tracked separately if needed).

## Honesty disclosure

This issue was filed from black-box HTTP evidence (`curl` against the
live production site) only. No repository code was read beyond
`apps/web/src/pages/workspace/index.astro` and
`apps/web/src/components/Workspace.tsx` (to rule out a client-side
auth-bypass explanation) and no server-side logs were consulted — the
actual root cause inside `dashboard.astro` is unconfirmed and is
explicitly AC-1 of this issue, not already known. The other 44
`parity-check` failures from the same run (accessibility
color-contrast on v1, `element(s) not found` renders on v1's homepage
and leaderboard, and all v2/`next.aiqadam.org` failures) were **not**
triaged and are out of scope for this issue — this issue covers only
the `/workspace/dashboard` 500 and its downstream anon-redirect test
failures.

## Resolution

(filled at workflow close)
