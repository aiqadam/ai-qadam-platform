# Step 8 — Test Execution Results: ISS-WEB-NEXT-SSR-JSDOM-001

## 1. `pnpm --filter api typecheck`

```
0 errors
```
**Pass.**

## 1b. `pnpm --filter web-next typecheck`

```
Result (243 files):
- 0 errors
- 0 warnings
- 41 hints (pre-existing, unrelated)
```
**Pass.**

## 2. `pnpm biome check package.json`

```
Checked 1 file in 3ms. No fixes applied.
```
**Pass.**

## 3. `pnpm --filter api test` (full suite, post-fix)

```
Test Files  103 passed (103)
     Tests  1350 passed (1350)
```
**Pass. Zero failures** — confirms `testcontainers@12.0.4`'s separate
`undici@8.8.0` resolution (the risk flagged in Step 2) is completely
unaffected by the scoped override.

## 3b. `pnpm --filter web-next test` (full suite, post-fix)

```
Test Files  36 passed (36)
     Tests  947 passed (947)
```
**Pass.** Includes the new regression test
(`isomorphic-dompurify-resolution.test.ts`).

## 4. `pnpm --filter api build` / `pnpm --filter web-next build`

Both complete successfully (`nest build` exit 0; Astro build reports
`Complete!`). No new build errors.

## 5. `pnpm audit --prod --audit-level=high`

```
3 vulnerabilities found
Severity: 2 low | 1 moderate
```
No high/critical findings; none reference `undici` (confirmed via
`pnpm audit --prod | grep -A10 undici` — zero output).

## 6. Live route verification (the actual proof this bug is fixed)

| Route | Before fix | After fix |
|---|---|---|
| `/workspace/admin/users` | 500 | **200** |
| `/workspace/dashboard` | 500 | **200** |
| `/workspace/admin/audit` | 500 | **200** |
| `/workspace/admin/rbac-sync` | 500 | **200** |
| `/workspace/announce` (the actual DOMPurify consumer) | 500 | **200** |
| `/` (homepage, was never broken) | 200 | 200 |

Dev server logs confirmed clean (no jsdom/undici errors) across all
requests.

## 7. Fail-before / pass-after regression-test proof

Executed literally (not just claimed): stashed the fix, reinstalled,
confirmed the new regression test fails with the exact original error;
restored the fix, reinstalled, confirmed the test passes. Full detail
in `06-test-design.md`.

## Infrastructure Pre-Flight

Docker stack already up (confirmed healthy at session start, unrelated
to this fix). No live-infra dependency for this fix beyond the local
`apps/web-next` dev server, which was brought up and torn down
correctly for each verification pass.

## Gate Result

gate_result:
  status: passed
  summary: "All test tiers pass post-fix: typecheck (0 errors both packages), Biome clean, full api suite 1350/1350, full web-next suite 947/947 (incl. new regression test), both builds succeed, pnpm audit shows no new high/critical findings. Live verification confirms all 5 previously-500 routes now return 200, including the actual DOMPurify-consuming route (/workspace/announce) that was the original trigger."
  findings: []
