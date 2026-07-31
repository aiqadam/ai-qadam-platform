# Step 8: Execute Tests

**Workflow:** wf-20260731-fix-167

## Commands run

```bash
cd apps/web-next
pnpm exec vitest run src/lib/cms.test.ts   # targeted
pnpm exec vitest run                       # full app suite (regression check)
pnpm exec biome check src/lib/cms.ts src/lib/cms.test.ts
pnpm run typecheck                         # astro check
```

## Results

- `cms.test.ts`: 36/36 passed (30 pre-existing + 6 updated for the new
  second fetch call + 4 new regression cases... actually 4 new + 32
  updated/pre-existing = 36 total, see file diff).
- Full `apps/web-next` suite: **1008/1008 passed**, 39 test files — no
  regressions introduced elsewhere.
- Biome: clean, no fixes needed.
- `astro check`: 255 files, 0 errors, 0 warnings, 41 pre-existing hints
  (unchanged from baseline — unrelated to this diff, confirmed by content:
  test-file `_pending`/`_url` unused-var hints and one pre-existing
  `onboard.astro` hint).

No live infrastructure required for this step — pure unit-level fetch
mocking, no Docker/Directus/Testcontainers dependency. Live verification
against the real local Directus stack + browser happens in Step 13
(`Business-Process: BP-UAT-010`), post-merge.

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T07:18:00Z"
  summary: "1008/1008 apps/web-next tests pass (36/36 in the touched file), biome clean, astro check 0 errors/0 warnings."
