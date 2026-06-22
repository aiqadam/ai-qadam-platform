# Layer 4 - Development - Frontend

Two frontends coexist during the rewrite window: **`apps/web/`** (legacy Astro,
grandfathered until cutover) and **`apps/web-next/`** (Astro 5 + React 19 +
Tailwind 4, the target — see [ADR-0038](../../adr/0038-web-4-layer-architecture.md)).
All new feature work lands in `apps/web-next/`.

## Where to look

| Doc | Purpose |
|---|---|
| [web-migration-plan.md](web-migration-plan.md) | The phased PR plan from current state to cutover. North star. |
| [web-next-workplan.md](web-next-workplan.md) | Concrete workplan: tasks, owners, dependencies. |
| [web-next-kickoff.md](web-next-kickoff.md) | Hand-off prompt for a fresh agent starting Phase 0. |
| [migration-status.md](migration-status.md) | Live status of the cutover (which surfaces have shipped). |

## Standards that apply to all frontend code

- **Code quality:** [`../standards.md`](../standards.md) — esp. Part VIII (React rules, state priority, performance budgets).
- **Architecture:** [`../architecture/architecture.md`](../architecture/architecture.md) §"Frontend architecture" (Astro pages → React islands, folder layout, state management).
- **4-layer block composition (web-next only):** [`../architecture/blocks.md`](../architecture/blocks.md) and [`../architecture/wiring-map.md`](../architecture/wiring-map.md). Enforced by `pnpm arch:check` (see [ADR-0038](../../adr/0038-web-4-layer-architecture.md) §Locks).
- **Design system:** [`../design-system/ux-and-content-guidelines.md`](../design-system/ux-and-content-guidelines.md) for UX/content rules; tokens are single-sourced in [`design-system/tokens.css`](../../../design-system/tokens.css) and bridged into Tailwind v4 via `@theme inline` in `apps/web-next/src/styles/globals.css`.
- **Auth flow:** [`../architecture/auth-architecture.md`](../architecture/auth-architecture.md) and [ADR-0016](../../adr/0016-web-auth-flow.md).

## Conventions quick-reference

- **Routing:** file-based under `src/pages/` (Astro) and `src/app/` (Next routes used by web-next islands where applicable).
- **State priority:** URL state → TanStack Query (server) → `useState` (ephemeral) → Context (app-wide). No Redux/Zustand without explicit justification.
- **Imports:** absolute (`@/...`) across modules, relative (`./`, `../`) within a module. No deep imports across module boundaries.
- **i18n:** i18next + react-i18next; translations managed in Tolgee.
- **No inline `style=`**, no raw hex, no gradients, no non-Lucide icons in `web-next` (see [AGENTS.md §11](../../../AGENTS.md)).
