# Step 2 — Impact Analysis (ImpactAnalyzer)

**Workflow:** `wf-20260704-fix-095`
**Issue:** `ISS-TEST-WEB-001`
**Requirement:** Bump `vitest` `^2.1.8` → `^4.1.9` (and `@vitest/coverage-v8`
`^2.1.8` → `^4.1.9`) in `apps/api`, `apps/web`, `apps/web-next`. Regenerate
lockfile. Verify three test commands. Companion edit: remove the obsolete
`transformMode: 'web'` line from `apps/api/vitest.unit.config.ts`.

## Validated requirement summary

Bounded major-version bump of vitest + its v8 coverage plugin across three
apps, plus removal of an obsolete config-key workaround for the very same
`__vite_ssr_exportName__` error this fix obviates. No schema change, no new
dependency, no test authored. Aligns vitest's internal vite with the
workspace's hoisted `vite@8.1.0`, which defines `__vite_ssr_exportName__`
(added in vite v8). vitest 4.1.9 declares peer
`vite: ^6.0.0 || ^7.0.0 || ^8.0.0` — exactly the workspace's vite 8.1.0.

## 1. Files changed

| File | Before (excerpt) | After (excerpt) | Reason |
|---|---|---|---|
| `apps/api/package.json` | `"vitest": "^2.1.8"` | `"vitest": "^4.1.9"` | peer-resolve with vite 8.x |
| `apps/api/package.json` | `"@vitest/coverage-v8": "^2.1.8"` | `"@vitest/coverage-v8": "^4.1.9"` | coverage-v8 4.x pins vitest 4.x exactly |
| `apps/web/package.json` | `"vitest": "^2.1.8"` | `"vitest": "^4.1.9"` | peer-resolve |
| `apps/web-next/package.json` | `"vitest": "^2.1.8"` | `"vitest": "^4.1.9"` | peer-resolve |
| `apps/api/vitest.unit.config.ts` | `transformMode: 'web'` (3 lines incl. comment) | line + comment removed | `transformMode` removed in vitest 3.0; same root-cause workaround this fix obviates |

The fifth edit was discovered during this analysis — it was not named in the
issue file. Without removing that line, `apps/api`'s
`vitest.unit.config.ts` (used by the `ISS-UAT-013-9` regression run) will
fail at config-load time under vitest 4.x.

`vitest.config.ts` files in all three apps use only stable keys (no API
breakage in vitest 4.x). No edits needed there.

## 2. Files regenerated

- `pnpm-lock.yaml` — single regeneration via `pnpm install` (transitive
  dep churn is expected, but mechanical). No edits to package.json fields
  other than the four version pins + one config-line removal.

## 3. Risk analysis

1. **`transformMode: 'web'` removal in `apps/api/vitest.unit.config.ts`.**
   vitest 3.0 removed the option; 4.x will reject it at config-load time,
   breaking `vitest run --config vitest.unit.config.ts` (used by the
   `ISS-UAT-013-9` regression run). The line is also redundant after this
   fix — the bump itself resolves the underlying `__vite_ssr_exportName__`
   issue. **Mitigation:** include the removal in the same PR (one extra
   hunk, same package).
2. **`@vitest/coverage-v8` 4.x pins vitest 4.x exactly (not peer).** A
   version mismatch between the two will fail install. Both must be bumped
   in the same commit in `apps/api/package.json`. Already done in the
   planned edit.
3. **Astro SSR transforms in `apps/web`/`apps/web-next`.** Astro injects
   its own vite plugin order; vitest 4.x may try to SSR-transform `.astro`
   files. The repo's `include` glob covers only `.test.ts` / `.test.tsx`,
   so `.astro` files are not loaded by vitest. **No mitigation needed** —
   verified by reading both configs.

## 4. Blast radius

- **Packages touched:** `apps/api`, `apps/web`, `apps/web-next`.
  Workspace-level deps (`packages/*`) untouched. No code or schema changes
  anywhere else.
- **Commands affected:**
  - `pnpm --filter web exec vitest run` — must pass:
    `OnboardingForm.test.ts` 5/5, `utm.test.ts` 45/45
  - `pnpm --filter web-next exec vitest run` — must not error on config load
  - `pnpm --filter @aiqadam/api exec vitest run` — Testcontainers suite,
    must remain green (pre-existing baseline; only changes if `defineConfig`
    internals moved)
  - `pnpm --filter @aiqadam/api exec vitest run --config vitest.unit.config.ts`
    — depends on the `transformMode` removal
  - `pnpm --filter @aiqadam/api exec vitest run --coverage` — exercises the
    bumped `@vitest/coverage-v8`
  - `pnpm install` — must regenerate lockfile cleanly
  - `pnpm exec biome check` and `pnpm exec tsc --noEmit` — must remain
    clean (no code authored)

## 5. Out of scope

- `@vitest/ui`, `vitest-browser-playwright`, `@vitest/browser`,
  `vitest-mock-extended` — none are direct deps in any of the three apps.
  Their 4.x upgrades, if needed, belong to a follow-up.
- `@vitest/coverage-istanbul` — not used. The repo has
  `coverage.provider: 'v8'`.
- A roll-back to vitest 3.x — the choice locks on 4.1.9.
- New tests beyond the AC-3 regression that this fix unblocks (those
  belong to `ISS-UAT-013-13`'s follow-up after the parent branch rebases).

## 6. Verdict

**`passed`** — the change is bounded, peer-compatible with the workspace's
vite 8.1.0, and requires exactly five hunks across four files plus one
lockfile regeneration. The companion edit to `apps/api/vitest.unit.config.ts`
was discovered during analysis and is small (≤3 lines removed) but mandatory;
it does not change the verdict.

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-04T20:56:00Z"
  summary: "Bounded vitest 4.x bump across 3 apps + 1 coverage plugin + 1 companion config-line removal; no schema/code/test-files authored."
  output_file: ".copilot/tasks/active/wf-20260704-fix-095/02-impact-analysis.md"
```