# 06-test-strategy.md — FR-MIG-007: Tooltip kit atom

## Overview

Pure UI kit atom. No server, no database, no API calls. Unit tests sufficient.

## What to test

| Test case | Type | Reason |
|---|---|---|
| Renders without crashing | Unit | Sanity check |
| Renders string content | Unit | Primary content type |
| Renders ReactNode content (rich) | Unit | Required by FR |
| Renders all 4 side variants | Unit | `side` prop support |
| Renders all 3 align variants | Unit | `align` prop support |
| Renders children as trigger | Unit | Trigger relationship |
| Has 'use client' directive | Unit | Required for Radix hooks |

## What NOT to test

- Hover/focus behaviour — requires browser DOM simulation (Vitest+JSDOM can't reliably simulate Radix pointer-event logic)
- `aria-describedby` wiring — Radix internal, covered by Radix's own test suite
- Viewport boundary flipping — Radix internal

## Test location

`apps/web-next/src/kit/Tooltip.test.tsx` (Vitest + React Testing Library)

## Execution

1. `pnpm --filter web-next typecheck`
2. `pnpm --filter web-next lint`
3. `pnpm --filter web-next test`
