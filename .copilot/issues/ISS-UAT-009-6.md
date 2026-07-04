# ISS-UAT-009-6 — apps/web React island `_jsxDEV is not a function` blocks all BP-UAT-009 tests

| Field | Value |
|---|---|
| **ID** | ISS-UAT-009-6 |
| **Severity** | blocker |
| **Module** | web/astro-react-runtime |
| **Created** | 2026-07-04 |
| **Status** | open |
| **Owner workflow** | queued: wf-20260704-fix-081 |
| **Discovered by** | wf-20260704-fix-080 (TestRunner) |
| **Affects** | All apps/web client-side React islands (Workspace, NavAccountMenu, LeadCaptureForm, etc.) — see `apps/web/.astro/dev.log` |

---

## Symptom

When `apps/web` runs (`pnpm dev`), every page that mounts a React island via `<Component client:load />` fails with:

```
[Unhandled error] TypeError: _jsxDEV is not a function
 > Workspace src/components/Workspace.tsx:74:42
 > NavAccountMenu src/components/NavAccountMenu.tsx:121:6
 > LeadCaptureForm src/components/LeadCaptureForm.tsx:257:8
```

The page renders the SSR shell (Layout chrome + global nav) but the island script throws on first JSX evaluation. The browser console shows `_jsxDEV is not a function`. The React island never hydrates, so no client-side effects (state, event handlers, `useEffect`) run.

`apps/web/.astro/dev.log` contains 100+ occurrences spanning multiple islands and pages, both warm and cold runs.

## Reproduction (deterministic on this machine, 2026-07-04)

1. `pnpm dev` from `apps/web`.
2. Open `http://localhost:4321/workspace` in a fresh browser.
3. Observe browser DevTools console: `_jsxDEV is not a function`.
4. Observe `apps/web/.astro/dev.log`: same error appended on every request.

## Impact

- **BP-UAT-009 (entire suite)**: every step that depends on a client-side React island (Steps 001-006 + Neg 001-003) cannot pass. Confirmed by `pnpm exec playwright test --config=playwright.uat.config.ts --grep "BP-UAT-009"` on 2026-07-04: 9 failed, 0 BP-UAT-009 tests passed.
- **All other BP-UAT scripts that depend on apps/web client islands**: likely also broken. Was previously misclassified as "flaky" (e.g. ISS-UAT-009-5 / Neg 001) — actually deterministic failure on a broken local stack.

## Probable root cause

`_jsxDEV` is the named export of `react/jsx-dev-runtime`. It is imported automatically by the JSX transform for development builds (`jsx: "react-jsx"` / `"react-jsxdev"` in tsconfig).

Failure modes that produce "is not a function":

1. **Wrong React version installed alongside the project's React** — e.g. a transitive dep pulled in React 17's CJS bundle, which exports `_jsxDEV` differently or not at all. `apps/web/package.json` pins `react` + `react-dom`; check `pnpm why react` for duplicates.
2. **Astro bundler picked the wrong entry** — `client:load` may be loading a server-build bundle that doesn't include the dev runtime.
3. **Stale dev cache** — `.astro/` directory holds compiled output; a partial cache invalidation could leave an island pointing at a removed runtime entry.
4. **Vite alias misconfiguration** — `vite.config.ts` (or `astro.config.mjs`) overriding `react/jsx-dev-runtime` resolution.

## Proposed investigation order (lowest blast radius first)

1. `pnpm why react` from `apps/web` — check for duplicate React copies.
2. `cat apps/web/node_modules/react/package.json | grep version` — confirm installed version matches `package.json`.
3. `rm -rf apps/web/.astro apps/web/node_modules/.vite` and `pnpm dev` — clear caches.
4. `grep -r "jsx-dev-runtime\|jsx-runtime" apps/web/astro.config.mjs apps/web/tsconfig.json` — verify JSX transform setting.
5. Check `apps/web/node_modules/react/jsx-dev-runtime.js` exists and exports `_jsxDEV`.

## Proposed fix (after investigation)

Whichever of the above matches:

- **Duplicate React** → run `pnpm dedupe`; if still broken, add a pnpm `overrides` block pinning React.
- **Stale cache** → add `pnpm dev:clean` script that nukes `.astro/` + `.vite/` before starting.
- **Vite alias** → fix the alias; ensure `react/jsx-dev-runtime` resolves to the same copy as `react`.
- **Wrong jsx transform** → set `"jsx": "react-jsx"` in `tsconfig.json` for the web app (not `react-jsxdev`).

## Acceptance criteria for the fix workflow (wf-20260704-fix-081)

- [ ] **AC-1**: `pnpm dev` from `apps/web`; `http://localhost:4321/workspace` shows the Workspace island rendering (not just the SSR shell). Browser console is clean of `_jsxDEV is not a function`.
- [ ] **AC-2**: `apps/web/.astro/dev.log` has zero new `_jsxDEV is not a function` entries after 5 minutes of normal navigation across `/`, `/workspace`, `/events`, `/leaderboard`.
- [ ] **AC-3**: BP-UAT-009 re-run: at least Steps 001-006 + Neg 001 pass (Neg 002, Neg 003 pre-existing infra-dependent, may still need their own follow-ups).
- [ ] **AC-4**: Root cause documented in the wf-20260704-fix-081 quality gate (with file paths, pnpm output, and the fix applied).
- [ ] **AC-5**: A regression test added (or a unit test) verifying React islands mount cleanly under `client:load` — even a smoke test that mounts an island and asserts `window.__AIQADAM_AUTH__` is consumed without throwing.

## Related

- [ISS-UAT-009-5](ISS-UAT-009-5.md) — the original "Neg 001 flaky" ticket. Was a symptom of THIS bug. The wf-20260704-fix-080 test-only fix is still useful (better error messages when this bug is fixed) but cannot be verified until THIS issue is resolved.
- `docs/02-business-processes/uat/BP-UAT-009.md` — test script whose entire suite is blocked by this.

## Resolution

**Status: open (deferred from wf-20260704-fix-080).** Queued as **wf-20260704-fix-081**.

### Honesty disclosures

- **Queued workflow**: `wf-20260704-fix-081-jsx-dev-runtime` at position 1 in `.copilot/tasks/queued/`.
- **Concrete verification the follow-up will perform**: clean-stack run of `apps/web`, browser-console clean of `_jsxDEV is not a function`, full BP-UAT-009 re-run with Steps 001-006 + Neg 001 passing.
- **Current workflow does NOT mark ISS-UAT-009-5 as `resolved`** based on deferred verification alone — only the test-only fix to Neg 001's waitForURL idiom is shipped (PR for wf-20260704-fix-080). The Neg 001 "flaky" status flips to "stable test, broken stack" once this follow-up lands and Neg 001 deterministically passes.