---
code: FR-MIG-007
name: Tooltip kit atom
status: Not Started
module: Migration (MIG)
phase: Rebuild M1
---

## Description
A lightweight hover/focus tooltip for UI hints. Non-blocking — no other M1 block depends on it, but several cabinets use it for field hints and action explanations.

## Users
Engineers adding contextual hints to forms and action buttons.

## Functional scope
1. `<Tooltip content={string | ReactNode} side? align?>` wrapping any child element.
2. Appears on hover (pointer devices) and on focus (keyboard navigation).
3. Accessible: `role="tooltip"` + `aria-describedby` wired automatically.
4. Respects viewport boundaries (flips side if near edge).

## Acceptance criteria
- [ ] `<Tooltip>` exists at `src/kit/Tooltip.tsx` and exported from `src/kit/index.ts`.
- [ ] Tooltip appears on hover and keyboard focus.
- [ ] Does not obscure the element it describes.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- Use Radix `@radix-ui/react-tooltip` (add to package.json).
- `blocks.md` L2 kit table entry added.
