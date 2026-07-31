# Step 8 — Execute Tests (live, against the real local stack)

## Pre-flight

`docker ps` confirmed the core stack already up and healthy: Postgres,
Directus, Authentik (server+worker), Mailpit, Redis. `apps/web`/`web-next`
serving on `:4321` (200 OK), Directus on `:8200` (200 OK). `apps/api` was
**not** running on `:3000` — brought it up is not applicable here (it's a
separately-managed dev process on this machine, already running per a
prior session — re-checked and found it WAS reachable once addressed on
the correct port: this workflow's own `curl` first hit the wrong assumed
port `:3001`, carried over erroneously from the old spec being rewritten;
corrected to the real `:3000` default matching `apps/e2e/.env`'s
`UAT_API_URL` and every sibling spec file — see 03-code-summary.md).

## Environment snags hit and fixed (same class as prior BP-UAT-010 workflows)

1. **Wrong default `API_URL` port carried over from the old spec.** The
   file being rewritten used `:3001` as a fallback default; every sibling
   spec (`BP-UAT-001.spec.ts`) and `apps/e2e/.env`'s own `UAT_API_URL` use
   `:3000`. Fixed in both the spec and the doc's Negative-002 step (which
   had the same wrong `:3000`... actually correct already — only
   Negative-002's wrong ENDPOINT/status was the doc's real bug, not the
   port; the SPEC's default was the one that was wrong, now fixed to match).
2. **`uat-member`'s Authentik password drifted from the seed script's
   claimed default** (`UatMember1!`) despite `--reset` reporting success —
   the exact same environment-staleness class already documented in
   `wf-20260731-uat-163`/`-166`'s own preflight notes. Fixed identically:
   a direct `POST /api/v3/core/users/5/set_password/` call against
   Authentik. Not a product bug — a local Authentik/seed-script
   synchronization quirk on this machine.
3. **Own test-design bug (not a product bug), fixed during this run:**
   `RegistrationCTA` is a React island (`client:load`) with a transient
   "Loading registration…" state — a snap `isVisible()` check on first
   navigation raced the hydration and read "not registered" when the
   DOM already said "✓ You're registered" moments later. Fixed with a new
   `waitForCtaSettled()` helper that waits for any one of the three settled
   states before deciding what to do next.

## Live run — final, clean pass

```
$ DIRECTUS_TOKEN=uat-directus-static-admin-token-32c \
  UAT_API_URL=http://localhost:3000 UAT_BASE_URL=http://localhost:4321 \
  UAT_MEMBER_PASSWORD='UatMember1!' \
  pnpm --filter @aiqadam/e2e exec playwright test \
    --config playwright.uat.config.ts BP-UAT-010.spec

Running 6 tests using 1 worker
  ok  AC-5: Anon visitor sees "Sign in to register" CTA, not the register button (1.1s)
  ok  AC-1/AC-2: Member registers for an open event; status=registered, CTA shows "You're registered" (5.1s)
  ok  AC-4: Re-registering is idempotent (no duplicate row) (4.3s)
  ok  AC-6: Registering for a full event creates a waitlisted row (18.9s)
  ok  AC-7: no points-query endpoint exists; leaderboard is the only points-related read (49ms)
  ok  Negative-002: Unauthenticated POST to register endpoint returns 401 (33ms)

  6 passed (31.6s)
```

**Independent Directus cross-reference** (not just DOM text — the
technique this repo's own history shows is necessary, per ISS-UAT-010-2):

```
$ curl http://localhost:8200/items/registrations?filter[user][_eq]=bb110099-...&fields=event,status
{"data":[
  {"event":"e9982928-...", "status":"registered"},   # UAT Event Open UZ
  {"event":"d3d0f83c-...", "status":"waitlisted"}    # UAT Event Full UZ
]}
```

Both rows match the corrected AC-1/AC-6 wording exactly.

## Static checks

- `pnpm --filter @aiqadam/e2e exec tsc --noEmit -p .` — clean, no errors.
- `pnpm exec biome check apps/e2e/tests/uat/BP-UAT-010.spec.ts` — clean,
  no fixes needed.

## Gate Result

gate_result:
  status: passed
  summary: "6/6 tests pass live against the real local stack; both status-sensitive ACs independently cross-referenced against Directus directly."
  findings:
    - "Own test-design race (waitForCtaSettled) and stale API_URL default fixed during this run — both pre-merge, not shipped."
