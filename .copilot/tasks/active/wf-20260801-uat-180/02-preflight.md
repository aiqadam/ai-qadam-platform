# Step 2 — Pre-Flight (target: local)

## Docker stack

All required containers already up and healthy (`docker compose -f
infrastructure/docker-compose.yml ps`): `aiqadam-postgres`,
`aiqadam-directus`, `aiqadam-authentik-server`, `aiqadam-authentik-worker`,
`aiqadam-mailpit`, `aiqadam-redis`, `aiqadam-minio`, `aiqadam-twenty`. No
`docker compose up` needed.

## App reachability + process identity

- `web` (`:4321`): `curl` → 200. Process-identity helper
  (`scripts/uat-preflight-check.sh web :4321 "@astrojs/node"`) reported a
  substring mismatch. Verified via `Get-CimInstance Win32_Process`: PID
  17560, CommandLine is `astro.mjs dev --port 4321` running from this
  repo's own `node_modules\.pnpm\astro@7.1.3...` path — unambiguously
  this repo's own dev server, not a foreign squatter (the ISS-UAT-013-2
  failure mode this script actually guards against). Same stale-substring
  situation independently already documented by `wf-20260731-uat-166`'s
  own pre-flight for this exact port/check.
- `api` (`:3000`): the process originally listening (PID 33972) was a
  **stale built** `node dist/main` process, not a `pnpm --filter api dev`
  process — its build timestamp predated this session and its freshness
  relative to the just-merged `cfe574f` commit could not be trusted by
  inspection alone. Rebuilt fresh from current `main` (`pnpm build` in
  `apps/api`, confirmed against `git log -1` = `cfe574f452e9...`, the
  exact FR-AUTH-004 merge SHA), stopped the stale process, and started a
  fresh `pnpm dev` (`nest start --watch`) instance (PID 47252). Confirmed
  live: `POST /v1/auth/magic-link` returns `{"ok":true}` (this endpoint
  did not exist before FR-AUTH-004, so its presence + correct response
  proves the running process is the current merged code, not a stale
  artifact).

  Process-identity helper still reports a substring mismatch even
  against this freshly-verified dev process — `nest start --watch`
  compiles to and runs `dist/main` the same way a production start does;
  the literal string `@aiqadam/api` (the package name) never appears in
  either invocation's CommandLine on this machine. This is the identical
  stale-assumption gap `wf-20260731-uat-166`'s pre-flight already
  flagged for the same two checks — not a new finding, and not a
  recurrence of ISS-UAT-013-2 (both processes are confirmed under this
  repo's own absolute path, not a sibling project). Worth a follow-up to
  correct the script's expected substrings (e.g. `apps/api/dist/main` /
  the astro adapter's actual bundled path) so it stops false-failing on
  this repo's real invocation patterns — not filed as a new ISS this
  session (narrow-scope Step 13, non-blocking, already twice-observed).

- `authentik` (`:9000`): `curl` → 302 (expected — root redirects to
  login). Healthy per Docker status above.

## Seed

`pnpm uat:seed` (plain form — BP-UAT-009 has no `scripts/uat-fixtures/*.json`
manifest yet, so `--reset` is not applicable per Step 2's documented
branching) completed successfully in the background
(`[0;32m ✓[0m UAT seed complete`). Verified independently against live
Authentik (not just the script's own exit code):

```
GET /api/v3/core/users/?email=uat-member@example.com
  → 1 result: pk=5, username=uat-member, is_active=true,
    groups=[aiqadam-member], directus_user_id=bb110099-c215-433b-8930-81e7f4dab21a
```

**Known documentation/fixture drift (not a product bug, same class as
already noted in `wf-20260731-uat-166`'s pre-flight for a different BP-UAT):**
`BP-UAT-009.md`'s own "Seed Fixtures Required" table and step text say the
member fixture is `uat-member@aiqadam.test`; the actual seeded identity
(per `scripts/uat-seed.sh` / `apps/e2e/.env.uat`) is
`uat-member@example.com` / `UatMember1!`. This run uses the real,
live-confirmed credentials (`@example.com`), not the doc's stale text.
Not filed as a new issue this session (narrow-scope Step 13, cosmetic
doc drift, does not block verification) — flagging for a future doc-sync
pass across BP-UAT-009.md.

**Gate:** `passed` (with the two noted environment quirks — stale
pre-flight substrings, stale doc email — worked around/noted, not
blocking) → Step 3.
