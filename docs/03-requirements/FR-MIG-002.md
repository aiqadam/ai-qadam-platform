---
code: FR-MIG-002
name: Operator shell nav
status: Shipped
module: Migration (MIG)
phase: Rebuild M0
---

## Description
Persistent cross-cabinet navigation inside every `/workspace/*` page. Operators must be able to move between cabinets without going back to a root menu.

## Users
Country leads, super-admins, board members.

## Functional scope
1. `<WorkspaceNav>` block — left-rail cabinet menu with links to all workspace sections.
2. Wired into `<PageShell>` so every operator page gets the rail automatically.
3. Collapses to icon-only below `md` breakpoint; mobile nav rides the top `<AppNav>` account menu.
4. Active cabinet link is highlighted.

## Acceptance criteria
- [ ] Every `/workspace/*` page renders the `<WorkspaceNav>` rail without extra imports in the page file.
- [ ] Navigating between cabinets preserves scroll position in the nav rail.
- [ ] Mobile (< 768 px): rail hidden, workspace link accessible via AppNav account menu.
- [ ] `pnpm arch:check` passes.

## Notes
- v1 reference: `apps/web/src/components/Workspace.tsx` sidebar section.
- `<PageShell>` is the injection point — page files must not import `<WorkspaceNav>` directly.
- `blocks.md` must be updated in the same PR.
