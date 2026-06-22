---
code: FR-MIG-001
name: Sitewide customer nav shell
status: Shipped
module: Migration (MIG)
phase: Rebuild M0
---

## Description
Sitewide top-nav for `apps/web-next` — the primary motivation for the entire rewrite (the auth-UI inconsistency bug). Every customer-facing page in v2 must show an auth-aware header that always agrees with SSR auth state.

## Users
All visitors (anonymous + signed-in members).

## Functional scope
1. `<AppNav>` block wired into `src/layouts/Layout.astro` — renders on every page.
2. `<CountrySwitcher>` — subdomain nav (`uz/kz/tj.aiqadam.org`), reads current country from SSR locale.
3. `<LocaleSwitcher>` — locale cookie toggle (RU/EN), persists via cookie.
4. `<AccountChip>` island — SSR auth blob → shows avatar + name when signed in, "Sign in" link when anon. Role-gated "Workspace" link for operators.
5. Sign-out clears Authentik session (not just local cookie).

## Acceptance criteria
- [ ] `Layout.astro` imports and mounts `<AppNav />` above `<slot />`.
- [ ] Anonymous visit shows "Sign in" in nav; signed-in visit shows account chip — no mismatch with page body.
- [ ] CountrySwitcher changes subdomain and preserves the current path.
- [ ] LocaleSwitcher sets locale cookie; page re-renders in correct locale.
- [ ] Operator visiting `/workspace` sees "Workspace" link; member does not.
- [ ] `pnpm --filter @aiqadam/web-next build` passes.
- [ ] `pnpm arch:check` passes (no raw `fetch()` outside `lib/`).

## Notes
- v1 reference: `apps/web/src/components/Nav.astro` + `NavAccountMenu.tsx`.
- SSR auth blob injected as `window.__AIQADAM_AUTH__` in Layout; `<AccountChip>` reads it via `useAuth()`.
- `blocks.md` must be updated in the same PR.
