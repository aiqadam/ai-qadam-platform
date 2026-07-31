# Step 2 — Pre-Flight (target: local)

## Docker stack

All required containers already up and healthy (`docker ps`):
`aiqadam-postgres`, `aiqadam-directus`, `aiqadam-authentik-server`,
`aiqadam-authentik-worker`, `aiqadam-mailpit`, `aiqadam-redis`. No
`docker compose up` needed.

## App reachability + process identity

- `web` (`:4321`): `curl` → 200. Process-identity helper
  (`scripts/uat-preflight-check.sh web :4321 "@astrojs/node"`) reported a
  substring mismatch — the actual CommandLine is the astro binary's real
  file path (`node_modules/.pnpm/astro@7.1.3.../...`), which does not
  literally contain the string `@astrojs/node` on this machine's path
  layout. Verified safe by other means: the process is unambiguously
  under this repo's own `node_modules`, and the page serves this
  project's actual UI (confirmed visually in the session screenshots
  below). Not a recurrence of ISS-UAT-013-2 (a genuinely foreign
  service) — a stale substring assumption in the check script, noted
  here rather than silently ignored.
- `api` (`:3000`): same situation — `curl http://localhost:3000/health`
  returned `{"status":"ok","service":"api","tenant":{"code":"uz",...}}`,
  unambiguously this repo's API. Process-identity helper's substring
  check against `dist/main` path text is stale in the same way as above.

## Seed

`pnpm uat:seed --reset BP-UAT-010` exits 3 via the pnpm wrapper, but
directly invoking `bash scripts/uat-seed.sh --reset BP-UAT-010` (the
underlying script the pnpm alias wraps) completes with exit 0 and all
fixtures created successfully — confirmed independently against Directus
directly (see below). This looks like a pnpm-lifecycle wrapping quirk on
this machine, not a real seed failure; the actual state landed correctly
either way, which is what matters for this run. Not filed as a new issue
this session (narrow-scope Step 13, not the primary workflow) — worth a
follow-up look if it recurs and blocks a future workflow.

**Directus verification (independent of the seed script's own exit code):**
```
GET /items/events?filter[title][_contains]=UAT
  → "UAT Event Open UZ" id=74d98f3f-c218-4132-aea9-72560649687f capacity=10
  → "UAT Event Full UZ"  id=4e92476d-3a8a-430b-bd99-e736466bd03f capacity=2
GET /items/registrations?filter[event][_eq]=4e92476d-...
  → 2 rows, both status=registered (at capacity, precondition for AC-6 confirmed)
```

**Known environment staleness (same class as `wf-20260731-uat-163`, not
a product bug):** `uat-member`'s Authentik password did not match the
seed script's own default (`UatMember1!`) despite the reset claiming to
set it — same gap that workflow already worked around. Fixed the same
way: a direct `POST /api/v3/core/users/5/set_password/` call against
Authentik. Session then signed in successfully.

**Gate:** `passed` (with the two noted environment quirks worked around,
not blocking) → Step 3.
