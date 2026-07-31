# Step 8: Execute Tests

**Workflow:** wf-20260731-fix-168

## Commands run

```bash
cd apps/web-next && pnpm exec vitest run
cd apps/web-next && pnpm run typecheck
cd apps/web-next && pnpm exec biome check .
cd apps/api && pnpm exec vitest run test/event-registration-count.controller.spec.ts
cd apps/api && pnpm exec tsc --noEmit -p .
cd apps/api && pnpm exec biome check <changed files>
```

## Results

- `apps/web-next` full suite: **1017/1017 passed** (40 test files, up
  from 1008 pre-workflow — +9 net: +5 new `api-ssr.test.ts` cases, +8
  new `use-registrations.test.ts` cases, -4 removed `cms.test.ts` cases
  that tested the now-deleted `registeredCountOf` Directus-direct path).
- `apps/web-next` typecheck (`astro check`): 255 files pre-fix / 256
  post-fix (new test file), 0 errors, 0 warnings, 41 pre-existing hints
  (unchanged).
- `apps/web-next` biome: clean on all changed files.
- `apps/api` new controller test: **5/5 passed**.
- `apps/api` sibling registration tests (`registrations-directus.spec.ts`,
  `checkin-events.controller.spec.ts`): **50/50 passed** (no regressions).
- `apps/api` typecheck (`tsc --noEmit`): 0 errors.
- `apps/api` biome: clean on all changed/new files.

## Live infrastructure verification (mandatory per AGENTS.md §6.1 — this
IS the live-infra step, run inline since these bugs were discovered by it)

Pre-flight: `docker ps` confirmed `aiqadam-postgres`, `aiqadam-directus`,
`aiqadam-authentik-server`, `aiqadam-authentik-worker`, `aiqadam-redis`
all healthy. `apps/api` dev server confirmed live on `:3000`
(`curl /health` → 200). `apps/web-next` dev server restarted with
`INTERNAL_DIRECTUS_URL=http://localhost:8200 INTERNAL_API_URL=http://localhost:3000`
(the running dev instance had neither set, which is itself how the
Directus-direct 403 stayed invisible until this workflow — see
Resolution's honesty disclosure).

1. **`registeredCountOf` fix**: `curl http://localhost:3000/v1/events/<id>/registration-count`
   → `200 {"registeredCount":2}`, cross-checked against a direct
   authenticated Directus query returning the same 2 `registered` rows.
2. **Hydration crash fix**: Playwright `pageerror` listener showed ZERO
   `TypeError` events post-fix (previously: `t.spots is not a function`
   on every signed-in event-detail page load). Screenshot confirms
   "3 / 2 spots" + "Leave waitlist" / "1 / 10 spots" + "Cancel
   registration" rendering correctly — sidebar no longer empty.
3. **`useMyRegistrationStatus` fix**: Playwright `response` listener
   confirmed `GET /api/v1/registrations/mine → 200` post-fix (was
   `GET /api/v1/registrations → 404`). Screenshots confirm "✓ You're
   registered" and "On waitlist — we'll email if a seat opens" correctly
   render within ~1s of the click, cross-referenced against direct
   Directus queries showing `status=registered` and `status=waitlisted`
   respectively for the exact same rows.

Full BP-UAT-010 session spec (`apps/e2e/tests/uat/BP-UAT-010.session.spec.ts`)
re-run against fresh seed data 3 times during this workflow (fixture ids
regenerate on every `--reset`, updated in the spec each time per its own
documented convention) — all 3 runs passed cleanly post-fix.

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T09:28:00Z"
  summary: "1017/1017 apps/web-next + 55/55 apps/api relevant tests pass; live Playwright + direct Directus cross-reference confirms all 3 fixes work end-to-end against the real local stack."
