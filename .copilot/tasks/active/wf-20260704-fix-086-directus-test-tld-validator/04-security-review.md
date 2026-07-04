# 04 — Security Review: ISS-UAT-BRIDGE-002 (Option B)

## Verdict

**PASS** — no new security findings. The change is a TLD-only string
swap (RFC 2606 reserved `.test` → RFC 2606 reserved `.example`) plus a
migration helper and two latent-bug fixes (curl bracket parsing, API
URL hostname). None of these introduce new attack surface, new trust
boundaries, new PII handling, or new credentials.

## Invariants reviewed

### Tenant isolation (Pass)

The change preserves the existing per-tenant boundary:

- `UAT_OPERATOR_EMAIL` and `UAT_MEMBER_EMAIL` remain env-driven
  defaults (overridable per environment).
- The seeded identities are still scoped to the local docker stack
  (`AK_URL=http://localhost:9000`).
- `host.docker.internal` is Docker Desktop magic DNS — it resolves to
  the host machine's loopback, not a public endpoint.

### Auth at controller level (Pass — N/A for this PR)

No new controllers, no new endpoints. The PATCH call to Authentik uses
the existing `INTERNAL_API_TOKEN` header (already in use).

### Zod / input validation at boundaries (Pass — N/A)

No new API surface. The PATCH body is `{email: <string>}` constructed
via `jq -nc --arg e "$email" '{email:$e}'` — no injection vector.

### No secrets in code (Pass)

- The PR does not introduce any new secrets.
- The `host.docker.internal` host is not a secret — it's a Docker
  Desktop magic DNS name documented at
  https://docs.docker.com/desktop/networking/#i-want-to-connect-from-a-container-to-a-service-on-the-host.

### No cross-schema queries (Pass — N/A)

No new queries. The `user_email_by_pk` helper makes one
`GET /api/v3/core/users/{pk}/` call against the same Authentik
instance that's already in use.

### Parameterized queries (Pass)

Drizzle handles parameterization for the API. The seed's Directus and
Authentik calls use HTTP header / JSON body, not string concatenation.

### Rate limiting (Pass — N/A)

The seed runs are bounded by the operator's manual invocation — no
unbounded loops. The `ensure_test_user` PATCH branch fires at most
once per identity per seed run.

### CSRF (Pass — N/A)

No browser-mediated flows. The PATCH is a server-to-server call with
the bearer token in the header.

## What changed in the security posture

| Surface | Before | After | Delta |
|---------|--------|-------|-------|
| Email values in fixtures/seed | `*.aiqadam.test` (RFC 6761 reserved `.test`) | `*.example.com` (RFC 2606 reserved `.example`) | None — both reserved TLDs, neither resolvable to real hosts |
| API base URL | `http://localhost:3001` (PowerShell-friendly, broken on WSL bash) | `http://host.docker.internal:3001` (works on both, defaults to host loopback) | None — `host.docker.internal` is Docker Desktop's published magic DNS |
| curl URL parsing | bash-curl rejected `filter[...]` URLs with `bad range in URL` (silent) | `-g` flag passes brackets through | Fixes a latent bug — bash-curl's bracket handling is a known footgun (documented in curl manpage) |
| Authentik user PATCH | One PATCH per identity only on FORCE_REGEN | One PATCH per identity on any non-FORCE_REGEN run if email differs | New code path; PATCH is idempotent and respects `meta.system` constraints (email is not a system field on Authentik users) |

## Non-findings worth noting

1. **`@example.com` collisions**: RFC 2606 reserves `.example` for
   documentation and testing. IANA's reservation means no real domain
   can register under `.example`. No risk of collision with a real
   tenant's email.

2. **`host.docker.internal` exposure**: The magic DNS resolves only
   inside Docker Desktop's networking namespace. It is not reachable
   from outside the developer's machine. No risk of unintended
   external exposure.

3. **PATCH idempotency**: The Authentik `PATCH /api/v3/core/users/{pk}/`
   endpoint is idempotent — PATCHing the same email twice returns 200
   with no observable change. No risk of "drift" from repeated runs.

4. **Migration safety**: The email-update branch only fires when (a)
   the user exists and (b) FORCE_REGEN=0 and (c) the email differs. In
   the FORCE_REGEN path (full reset), the user is recreated from
   scratch with the new email by the existing user-creation flow. The
   two paths are mutually exclusive — no risk of double-PATCH or
   partial state.

5. **No new auth surface**: The PATCH uses the existing Authentik
   admin API token (`AK_TOKEN`), not a new credential. The admin token
   is already in `apps/api/.env` (written by `uat-env-setup.sh`).

## Pre-existing security posture (not affected by this PR)

- Directus admin token (`uat-directus-static-admin-token-32c`): not
  changed, not exposed, not logged.
- `INTERNAL_API_TOKEN`: not changed, not exposed, not logged.
- Multi-tenant schema isolation: not affected (no schema changes).

## Recommendations

**None.** The PR is ready to merge from a security standpoint.

The migration helper (`user_email_by_pk` + email-update branch) is a
defensive addition — it makes the seed more robust to seeded-data
drift, which is a positive security property (less manual cleanup,
less chance of operators hand-editing Authentik users).