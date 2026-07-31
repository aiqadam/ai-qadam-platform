# Step 2: Pre-Flight — BP-UAT-010 (target: local)

1. **Docker stack:** all services healthy (`docker compose ps` — no
   unhealthy/down services found).
2. **Process identity:** `apps/api` confirmed at `:3000`
   (`apps/api/dist/main`, PID 42220 — a pre-existing, correctly-identified
   long-running instance of this repo's own api, not a foreign squatter);
   `apps/web` confirmed at `:4321` (`astro dev`, PID 27564, same repo
   path). (Attempted to start fresh `pnpm dev` instances for both — both
   correctly refused to double-bind against the already-running services;
   no action needed, the existing processes are exactly what's expected.)
3. **Seed reset:** `pnpm uat:seed --reset BP-UAT-010` — succeeded, 8
   fixtures reset.

## Direct, live confirmation the fix works (AC-5 of ISS-BRIDGE-STALE-001)

The seed script's own `ensure_linked` call during reset is a live exercise
of the exact code path this fix changed:

```
✓ ensure_linked uat-member@example.com (directus_user_id=bb110099-c215-433b-8930-81e7f4dab21a)
```

Cross-checked directly against `platform.users` (not just the script's
own success message):

```
docker exec aiqadam-postgres psql -U postgres -d platform -t -c \
  "SELECT email, directus_user_id FROM users WHERE email = 'uat-member@example.com';"
→ uat-member@example.com | bb110099-c215-433b-8930-81e7f4dab21a
```

This is the CORRECT id (matches the currently-mirrored Directus row for
this email), not the stale `a1524645-424a-4ad3-8974-faa94eecbb24` id that
was there before `wf-20260731-fix-162`'s fix landed. `ISS-BRIDGE-STALE-001`
AC-5's live re-verification requirement is satisfied by this alone — the
cached value repointed automatically via the AC-1 mechanism, no manual
row surgery needed.

## Gate Result

**Status:** `passed` → Step 3 (Drive UAT Session).
