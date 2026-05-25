# ADR-0038: Web architecture — 4-layer block composition (LOCKED)

## Status
Proposed, 2026-05-25.
Target: Accepted in the next decision batch (2026-06-01 weekly review).

> Drafted with Viktor 2026-05-25 after the Topic 1 race-condition fix
> (PR #389) surfaced a deeper architectural rot: 33 React islands had
> independently re-implemented the same `/auth/refresh + /auth/me`
> bootstrap, 22 workspace cabinets had each rolled their own
> `Shell`/`Loading`/`Anon`/`Error` components, and the existing
> `/design-system/` CSS layer was used in 104 places vs 1,642 inline
> `style=` props (~6% adoption). The cause wasn't lack of a design
> system — it was lack of enforcement. This ADR is the lock.

## Context

The web frontend (apps/web) has accumulated three classes of debt:

1. **Component-level duplication.** Every cabinet defines its own page
   shell, its own loading/error states, its own form scaffolding. The
   median cabinet is 800–1,300 LOC; perhaps 250 LOC is feature-specific,
   the rest is boilerplate that already exists better elsewhere.
2. **Data-access duplication.** 33 copies of the auth bootstrap pattern
   (`POST /auth/refresh` + `GET /auth/me`), 32 islands calling raw
   `fetch()` against `/api/v1/*` without a shared client. No retry on
   401, no shared cache, no deduplication of in-flight requests.
3. **Composition is hand-written.** Customer pages and operator
   cabinets hand-render every block (hero, event card, sponsor wall,
   data table, KPI tile, form, drawer). The 49 Directus collections
   feeding content have no canonical block representation.

The design system at [/design-system/](../../design-system/) provides
tokens, atoms, and some portal compositions, but consumers ignored it
in favor of inline styles. There is no compiler-enforced reason to use
it.

Without enforcement, every new feature widened the gap. PR #389 fixed
one race symptom in one island; 24 others still race.

## Decision

The web frontend is exactly **4 layers**, top → bottom:

```
┌────────────────────────────────────────────────────────────────┐
│  L4 PAGES                                                      │
│    Pure composition of L3 blocks. No business logic.           │
│    Hard cap: 100 LOC per page. No `fetch(`. No `style=`.       │
│    Customer pages AND operator cabinets both live here.        │
├────────────────────────────────────────────────────────────────┤
│  L3 BLOCKS  (the "Tilda blocks")                               │
│    Typed data-in/element-out components.                       │
│    Composes L2. Receives props from L4 (which got them from    │
│    L1 query hooks or SSR).                                     │
│    NEVER imports lib/api-* or calls fetch() directly.          │
├────────────────────────────────────────────────────────────────┤
│  L2 KIT  (atoms + molecules)                                   │
│    React components wrapping shadcn/ui + Radix primitives.     │
│    The ONLY layer that hardcodes colors/sizes/radii — and      │
│    only as token-binding (e.g. `var(--primary)`).              │
├────────────────────────────────────────────────────────────────┤
│  L1 RUNTIME  (tokens + identity + data)                        │
│    design-system/tokens.css                                    │
│  + useAuth() hook (wraps the SSR blob from middleware)         │
│  + apiClient (typed, auth-aware, retry-on-401)                 │
│  + TanStack Query provider + query hooks                       │
│    The ONLY layer touching network, identity, theme.           │
└────────────────────────────────────────────────────────────────┘
```

**Composition rules** (enforced mechanically — see §Locks below):

- A page is a composition of blocks. Nothing else.
- A block is data-in / element-out. It NEVER fetches.
- L2 atoms wrap design tokens. No raw colors/sizes/radii.
- L1 is the only network surface. `useAuth()`, `useQuery()`, `apiClient`.
- A cabinet (operator page) is a Page that lives under `/workspace/*`.
  Same composition rules. Same block catalogue. A cabinet table is
  the same `<DataTable>` block the customer leaderboard uses.

## Build strategy

This is a **greenfield build aside**, not an in-place migration.

```
apps/
├── web/           ← v1 (current) — stays on uz/kz/tj/apex.aiqadam.org
└── web-next/      ← v2 — built greenfield from this ADR's locks
```

Both apps:
- Talk to the same `apps/api`. No API rewrite.
- Read from the same Directus. No data migration.
- Use the same Authentik. No IdP changes.

`apps/web-next/` deploys continuously to **`next.aiqadam.org`**
(engineer-only behind Authentik forward-auth). Users see nothing until
cutover.

Cutover happens when v2 hits parity (see
[parity-matrix.md](../architecture/parity-matrix.md)). Coolify FQDN
flip; ~30 minute window; instant rollback by re-flipping. v1 stays
deployed for 2 weeks as fallback, then deleted.

## Locks (the "deeper" enforcement)

Anti-drift mechanisms that an agent cannot bypass without explicitly
modifying the lock config (which is itself a visible PR diff). Listed
in order of detection latency.

### 1. Path-based import rules (compile-time)

Biome config (`packages/biome-config/biome.json`):

```jsonc
{
  "noRestrictedImports": {
    "paths": [
      { "name": "../lib/api-*", "importNames": ["*"],
        "message": "Blocks and pages must not import api-*. Use L1 hooks." }
    ],
    "patterns": [
      { "group": ["**/lib/api-*"], "ignore": ["**/lib/**", "**/pages/**"],
        "message": "Only pages may import L1 hooks." }
    ]
  }
}
```

Effect: Blocks (`apps/web-next/src/blocks/**`) cannot import from
`lib/api-*`. The build fails — agents can't even compile the violation.

### 2. Architecture check (commit + CI time)

`tools/architecture-check.ts` (200 LOC, no runtime deps). Runs in
~2 seconds. Hard-fails on:

- Raw `fetch('/api/...')` outside `apps/web-next/src/lib/api-*.ts`.
- Inline `style={` or `style="` in any file under
  `apps/web-next/src/pages/` or `apps/web-next/src/blocks/`.
- `<Layout>` without `<PageHead>` slot.
- New files under `apps/web-next/src/components/` (deprecated path —
  blocks live under `src/blocks/`).
- Edits to `apps/web-next/src/blocks/*` without a corresponding edit
  to `docs/architecture/blocks.md`.

Wired into:
- `.husky/pre-commit`
- `.github/workflows/ci.yml`

### 3. Generator-only file creation

New pages and cabinets created via scaffolding scripts:

```bash
pnpm gen:page <slug>      # → src/pages/<slug>.astro
pnpm gen:cabinet <slug>   # → src/pages/workspace/<slug>/index.astro
```

Generator output carries a `// @generated-from gen:page` header. Any
new file under `src/pages/` without that header (or without a
documented exemption) fails arch-check.

### 4. PR template checkboxes

`.github/pull_request_template.md` requires explicit confirmation:
- [ ] I composed L3 blocks; did not write inline styles
- [ ] I added no raw `fetch()` calls outside `lib/api-*.ts`
- [ ] If I added a block, I updated `docs/architecture/blocks.md`
- [ ] If I changed data wiring, I updated `docs/architecture/wiring-map.md`

### 5. Agent-prompts Pre-Flight Gate 0

`docs/agent-prompts.md` is amended to require, as the FIRST step of
any agent assignment that touches `apps/web-next/`:

1. Read this ADR.
2. Read `docs/architecture/blocks.md` and find an existing block.
3. If no block matches, draft a block proposal in the PR description
   before writing code.
4. Run `pnpm gen:page` or `pnpm gen:cabinet` to scaffold any new page.

### 6. Storybook as discovery surface

`apps/storybook/` hosts every L2 atom and L3 block as a Story.
Deployed to `design.aiqadam.org` (engineer-only via Authentik
forward-auth, same pattern as `ops.aiqadam.org`). Agents look here
for the right block BEFORE writing new code.

### 7. ADR-0038 amendment process

This ADR is marked **Lockability: HIGH**. Amendments require a new ADR
(0039+) with Viktor sign-off in a decision batch. No `--no-verify`
workaround for any agent or human.

## Migration period grandfathering

`apps/web/` (v1) is **not** subject to these locks. Existing files
under `apps/web/src/components/` and pages keep working as-is until
v2 reaches parity and cutover happens. After cutover, `apps/web/` is
deleted and the locks apply everywhere `apps/web-next/` did.

This avoids the trap of trying to migrate 33 islands in place while
also building the new architecture.

## Decision authority

**Locked.** Amendable only via a successor ADR with Viktor's explicit
sign-off in a decision batch.

## Consequences

**Positive:**
- Every new page is composition. No bespoke shells.
- Every new cabinet is composition. No new auth/loading/error code.
- Adding a feature = adding a block (once) + composing it (per surface).
- An agent who tries to inline-style or raw-fetch is BLOCKED at commit.
- Customer + operator surfaces share the block catalogue → consistency
  by construction.
- The cabinet ↔ aggregate wiring is explicit
  ([wiring-map.md](../architecture/wiring-map.md)) — no surprise
  data-source drift.

**Negative:**
- Build-aside requires running two web apps in parallel for ~4 weeks.
  Coolify resource cost: one extra container. Negligible.
- Cutover day is one ~30-minute risk window. Mitigated by Backrest
  snapshot + per-route rollback path.
- Existing `apps/web/` debt lives on until v2 ships. Acceptable —
  the alternative is shipping a half-migrated state for 5 weeks.
- Adding a block "costs more" up-front than inlining (must write
  Story, must document in catalogue). This is the point: the
  marginal cost stops being paid by every consumer.

## Migration plan reference

The phased execution plan lives at
[`docs/architecture/web-migration-plan.md`](../architecture/web-migration-plan.md).
The block catalogue is at
[`docs/architecture/blocks.md`](../architecture/blocks.md). The
cabinet ↔ customer aggregate wiring registry is at
[`docs/architecture/wiring-map.md`](../architecture/wiring-map.md).

## Related

- ADR-0032 — operator-facing tools must SSO via Authentik or embed
  in workspace. This ADR continues that direction.
- ADR-0037 — three-tier architecture (engineering / operational /
  customer-facing). This ADR defines the *web* shape for the
  operational + customer-facing layers.
- PR #389 — SSR auth bootstrap. The first piece of L1 (apiClient +
  useAuth) is now live in `apps/web/`; will be reused/extended in
  `apps/web-next/`.
