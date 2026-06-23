# 03-code-summary.md — FR-MIG-007: Tooltip kit atom

## What was implemented

A lightweight, accessible tooltip kit atom (`<Tooltip>`) built on `@radix-ui/react-tooltip`, exported from `@/kit`.

## Files created

### `apps/web-next/src/kit/Tooltip.tsx`
Kit atom implementing the tooltip. Key decisions:
- **`import * as RadixTooltip`** (namespace import) instead of the default export — the package exposes sub-components (`Provider`, `Root`, `Trigger`, `Portal`, `Content`, `Arrow`) only as named exports under the namespace, not as properties of the default export. The default import resolves to the `TooltipProps` interface only. This was confirmed by the first typecheck failure (all `Property 'X' does not exist on type 'FC<TooltipProps>'` errors).
- **`DELAY_DURATION = 300`** — named constant (no magic number) matching Radix's own recommended default.
- **`SIDE_OFFSET = 4`** — named constant for the trigger-to-tooltip gap, matching Radix recommended value.
- **`'use client'`** directive — required because Radix hooks (`useLayoutEffect`) are used internally.
- Accepts `content: string | ReactNode` — rich content support without requiring a separate component.
- `sideOffset={4}` passed to `Content` — prevents the tooltip from visually touching the trigger edge.

### `apps/web-next/stories/L2 Kit/Tooltip.stories.tsx`
Three stories:
- **Default** — single tooltip with `Info` icon trigger, all controls exposed in the args panel.
- **AllSides** — renders all four `side` variants side-by-side for visual QA.
- **RichContent** — demonstrates `ReactNode` content (bold + line break).

> **Note on story types:** `@storybook/react` is not yet installed in `apps/web-next`, so the story file uses locally stubbed `Meta` and `Story` types (`Record<string, any>`) to avoid importing from an absent package. The file follows standard Storybook CSF3 conventions and will become fully type-checked once Storybook is added to the workspace.

The `TooltipWrapper` in the Default story is a no-op — the Tooltip manages its own `RadixTooltip.Provider` internally; `delayDuration` is fixed at 300ms. The wrapper exists only so the Storybook `delayDuration` arg control can be exercised in the Args Table.

## Files modified

### `apps/web-next/src/kit/index.ts`
Added `export * from './Tooltip';` to the barrel.

### `apps/web-next/package.json`
Added `"@radix-ui/react-tooltip": "^1.1.4"` to `dependencies`. Installed via `pnpm install --no-frozen-lockfile` (root `pnpm-lock.yaml` needed updating).

### `docs/04-development/architecture/blocks.md`
Updated the Tooltip row in the L2 kit table:
- Props: `content, children` → `content, children, side?, align?`
- Story link: filled in with the Storybook URL pattern (`L2 Kit / Tooltip`)

## Validation results

| Check | Result |
|---|---|
| `pnpm --filter web-next typecheck` | ✅ 0 errors (pre-existing `FormEvent` deprecation hints in other files — not from this change) |
| `pnpm --filter web-next lint` | ✅ 0 errors (formatter auto-fixed `Tooltip.tsx`; pre-existing `noExcessiveCognitiveComplexity` in `RegistrationCTA.tsx` — unrelated) |
| `pnpm --filter web-next build` | ✅ Build complete |

## Key constraints followed

- No raw hex — tooltip styling is entirely Radix-managed (no CSS overrides needed for M1 scope)
- No magic numbers — `DELAY_DURATION = 300`, `SIDE_OFFSET = 4` named constants
- Strict TypeScript — `noAny`, explicit prop types, `ReactNode` for rich content
- `'use client'` — correct for Radix hooks dependency
- `aria-describedby` / `role="tooltip"` — wired automatically by Radix
- Viewport boundary flipping — Radix default (`avoidCollisions: true`)
