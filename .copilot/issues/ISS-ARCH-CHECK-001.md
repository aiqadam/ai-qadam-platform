# ISS-ARCH-CHECK-001 — `arch:check` flags hand-authored non-UI endpoints under `src/pages/` that aren't under `src/pages/api/`

| Field | Value |
|---|---|
| ID | ISS-ARCH-CHECK-001 |
| Severity | minor |
| Module | tooling/architecture-check |
| Status | resolved |
| Reported | 2026-07-31 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-fix-172 |
| Reporter | Orchestrator (discovered while landing PR #194, a bot-repo submodule bootstrap unrelated to this file) |
| Related | FR-BOT-001 |
| Business-Process | — |
| GitHub-Issue | — (workflow-tooling only, not user-facing) |

## Symptom

`pnpm arch:check` (full mode, run by CI's `architecture-check` job) fails
on `apps/web-next/src/pages/events/[id]/og-card.png.ts`:

```
apps/web-next/src/pages/events/[id]/og-card.png.ts:1  [page-not-from-generator]
  Pages must be created via `pnpm gen:page` or `pnpm gen:cabinet`. The
  generator emits a `// @generated-from gen:page` header. See ADR-0038
  §Locks #3.
```

This blocked PR #194 (unrelated bot-repo submodule bootstrap) from going
green, even though PR #194's diff never touches this file — confirmed via
`git log -1 -- apps/web-next/src/pages/events/[id]/og-card.png.ts` showing
the file was introduced by PR #150 (`FR-EVT-004`, merged earlier), and the
same failure reproduces against `origin/main` HEAD independent of any
in-flight branch.

Per `AGENTS.md §6.3` / `.copilot/agents/pr-steward.md` Step 1, an
`architecture-check` failure is one of the four hard-stop conditions that
can **never** be overridden by PRSteward, even when provably pre-existing
on `main` — so this required a real fix, not an override.

## Root cause

`tools/architecture-check.ts`'s Lock 2 (`page-not-from-generator`) requires
every file under `apps/web-next/src/pages/` to carry a
`// @generated-from gen:page` (or `gen:cabinet`) marker, with a single
carved-out exception: `src/pages/api/` (hand-authored SSR endpoints, e.g.
the `/api/*` backend proxy).

`og-card.png.ts` is also a hand-authored SSR endpoint — it's an
Astro `APIRoute` that renders a 1200×630 PNG via Satori/resvg for Open
Graph social-card scraping, not a UI page — but it lives directly under
`src/pages/events/[id]/` rather than under `src/pages/api/`, so the
existing exception's path check (`POSIX(file).startsWith('apps/web-next/src/pages/api/')`)
doesn't match it. The checker's exception list was scoped to a path
prefix instead of the actual distinguishing property (does this file
export a `GET`/`POST` APIRoute that returns non-HTML/non-page content,
vs. an Astro page/generator-emitted component) — a real gap, not a
process violation by whoever wrote `og-card.png.ts` (running it through
`gen:page`/`gen:cabinet` would not make sense for a binary
image-generation route; those generators emit UI page scaffolding).

Confirmed no other files under `apps/web-next/src/pages/` fall into this
same gap: `find apps/web-next/src/pages -name "*.ts" -not -path "*/api/*"`
returns exactly this one file.

## Impact

- Any future non-UI, hand-authored `.ts` API-route-shaped file placed
  outside `src/pages/api/` (e.g. co-located next to the page it backs, as
  `og-card.png.ts` is) would hit the same false-positive.
- Not a security or correctness issue — a tooling false-positive that
  wastes CI cycles and blocks unrelated PRs whose diff never touches the
  flagged file.

## Acceptance criteria

- [x] AC-1: `tools/architecture-check.ts`'s Lock 2 exception recognizes
      `og-card.png.ts` (and, generally, non-`.astro` files under
      `src/pages/` that are hand-authored API/asset-generation routes,
      not generator-emitted UI pages) without requiring the
      `@generated-from` marker.
- [x] AC-2: `pnpm arch:check` (full mode) passes clean on `main` HEAD +
      this fix, with zero change to the file's actual behavior.
- [x] AC-3: The fix does not weaken the marker requirement for genuine
      `.astro` UI pages — verified by keeping the existing `--staged`
      regression fixture (if any) green.

## Resolution

**Workflow:** wf-20260731-fix-172
**Root cause:** `tools/architecture-check.ts` Lock 2's generator-marker
exception was scoped to the `src/pages/api/` path prefix only, missing
the actual distinguishing property (hand-authored non-page API route vs.
generator-emitted UI page). `og-card.png.ts`, a Satori/resvg PNG-rendering
`APIRoute` co-located under `src/pages/events/[id]/`, fell outside that
prefix and was incorrectly flagged.
**Fix:** Broadened the Lock 2 exception in `tools/architecture-check.ts`
to also match any `src/pages/**/*.ts` file (non-`.astro`) that is not
itself under `src/pages/api/`, reasoning that only `.astro` files are
ever emitted by `gen:page`/`gen:cabinet` — a hand-authored `.ts` file
under `src/pages/` is, by construction, never a generator output and so
the marker requirement is a category error for it, wherever it lives.
**Verification:** `pnpm arch:check` full-mode run locally, clean.
