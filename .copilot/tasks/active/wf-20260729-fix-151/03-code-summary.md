# Step 4 — Code Summary: ISS-WEB-NEXT-SSR-JSDOM-001

## Issue Fixed

Every `/workspace/*` SSR route on `apps/web-next` returned HTTP 500,
both locally and on QA. Root cause: `jsdom@28.1.0` (a transitive
dependency of `isomorphic-dompurify`, used only by
`AnnounceComposer.tsx`) requires `undici@^7.21.0`, but the repo's root
`pnpm.overrides.undici: ">=7.28.0"` (added 2026-06-24 to clear CVEs for
`ISS-CI-001`) is open-ended and resolved to `undici@8.8.0` — a major
version past jsdom's supported range, missing an internal file path
(`lib/handler/wrap-handler.js`) jsdom's code requires directly.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `package.json` | Modified | Added `"jsdom>undici": "7.29.0"` to `pnpm.overrides`, scoped specifically to `jsdom`'s resolution of `undici` — leaves the existing blanket `"undici": ">=7.28.0"` untouched for every other consumer (notably `testcontainers@12.0.4`, which needs `undici@^8.5.0` and would break under a blanket downgrade). |
| `pnpm-lock.yaml` | Regenerated | `jsdom`'s `undici` dependency now resolves to `7.29.0` (latest 7.x, satisfies both jsdom's `^7.21.0` and the original `>=7.28.0` CVE-fix floor). `testcontainers`'s `undici` dependency remains `8.8.0`, unaffected. |

No application source code changed — this is a pure dependency-graph
fix.

## Key Design Decisions

1. **Selector-scoped override, not a blanket version change.** A naive
   fix (narrowing the blanket `undici` override to `<8.0.0`) would have
   satisfied jsdom but broken `testcontainers@12.0.4` (declares
   `undici: ^8.5.0`), regressing `apps/api`'s entire Testcontainers
   integration suite. pnpm's `"<parent>>undici"` selector syntax lets
   `jsdom` and `testcontainers` resolve independently — confirmed via
   `pnpm-lock.yaml` post-install: `jsdom@28.1.0` → `undici: 7.29.0`,
   `testcontainers@12.0.4` → `undici: 8.8.0`.
2. **`7.29.0`, not an arbitrary older 7.x.** Chosen as the latest
   available 7.x release, which is strictly `>=7.28.0` (the original
   CVE-fix floor) — this cannot regress whatever the original override
   was protecting against, since it's a later patch within the same
   major.
3. **No source-code workaround attempted** (e.g. making
   `AnnounceComposer.tsx`'s DOMPurify import `client:only` to keep it
   out of the SSR bundle). The dependency-resolution fix is more direct,
   addresses the actual root cause rather than working around a symptom,
   and doesn't touch application code that has its own established
   behavior/tests.

## Architecture Rule Compliance

- No module boundary changes — dependency-manifest fix only.
- No new dependency added — an existing dependency's *resolution* was
  corrected.
- No tenant scoping / cross-schema / Zod-boundary concerns apply (no
  application code touched).

## Formatter Check

`pnpm biome check package.json` — clean, no fixes applied.

## Known Limitations

None. This is a complete, verified fix — see `07-test-results.md` for
live route verification (all previously-500 routes now return 200) and
full test-suite results.

## Gate Result

gate_result:
  status: passed
  summary: "Root cause fixed via a selector-scoped pnpm override (jsdom>undici: 7.29.0) that resolves jsdom's undici dependency correctly without disturbing testcontainers' separate, higher undici requirement. Verified live: all previously-500 /workspace/* routes now return 200."
  findings:
    - "Considered and rejected a blanket undici version cap during Step 2 impact analysis — would have broken apps/api's Testcontainers integration suite (testcontainers@12.0.4 needs undici ^8.5.0)."
