---
id: ISS-SUPPLY-CHAIN-JSYAML-NANOID-219
status: fixed
created: 2026-08-21
workflow: wf-20260821-fix-219
---

# supply-chain: pnpm audit (high+critical block) failing — js-yaml + nanoid transitive advisories

## Summary

The `supply-chain` GitHub Actions workflow's `pnpm audit (high+critical
block)` job has been red on every `main` commit today (confirmed via
`gh run list` history back to at least commit `05529a28`, well before
this session's own work began) — 2 unrelated high-severity advisories
in transitive dependencies of `apps/storybook`.

## Root cause

Both vulnerable packages are pulled in transitively through
`@aiqadam/web-next` (linked into `apps/storybook`), via `astro`/`vite`:

1. **`js-yaml@4.3.0`** — GHSA-5p4m-2wfm-xmqj (quadratic CPU
   consumption in `!!omap` resolution), fixed in `>=4.3.1`. Path:
   `astro > @astrojs/internal-helpers > js-yaml` (24 occurrences).
2. **`nanoid@3.3.16`** — GHSA-2v37-7h3g-55p8 (custom generators can
   loop indefinitely when size is zero), fixed in `>=3.3.18`. Path:
   `astro > vite > postcss > nanoid` (25 occurrences).

Neither package is a direct dependency; both are pulled in as
sub-dependencies of pinned tooling versions this repo doesn't control
directly.

## Fix

Added two `pnpm.overrides` entries to the root `package.json`, same
pattern as the existing `fast-uri`/`postcss`/`sharp` overrides already
in this file:

```json
"js-yaml": ">=4.3.1 <5.0.0",
"nanoid": ">=3.3.18 <4.0.0"
```

**Bounded ranges, not open-ended `>=`:** an initial attempt with plain
`>=4.3.1`/`>=3.3.18` resolved to `js-yaml@5.3.0`/`nanoid@6.0.1` —
crossing major version boundaries pnpm was happy to select since
nothing else in the tree pins a tighter range. Corrected to bounded
ranges so the override applies only the minimum patch fix the
advisory actually requires, not an arbitrary newer major that neither
`js-yaml` nor `nanoid`'s own maintainers guarantee is a drop-in
replacement for this transitive-only usage.

## Verification
- `pnpm why js-yaml` / `pnpm why nanoid` confirm exactly `4.3.1` /
  `3.3.18` resolved everywhere (not a later major).
- `pnpm audit --prod --audit-level=high` (same command CI runs): 0
  high/critical, down from 2 high (5 vulnerabilities remain, all
  low/moderate, none blocking).
- `apps/web-next` unit suite: 1115/1115 pass, unchanged.
- `apps/web-next` build (`astro build`): succeeds.
- `apps/storybook` build (`storybook build`): succeeds.
