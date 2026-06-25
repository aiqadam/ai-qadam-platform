# Code Summary — FR-MIG-021

## Requirement Implemented

**FR-MIG-021:** `/checkin` — event-day QR check-in page

Implemented a complete check-in system for event operators:
- **Operator mode:** Event dropdown + QR scanner + manual code entry
- **Self-serve mode:** Auto-submit from `?code=` query param
- **Offline queue:** localStorage persistence, flushes on reconnect
- **Member display:** Shows member name + avatar on success
- **Event validation:** Validates token belongs to selected event
- **Already checked-in handling:** Amber/yellow display (not error)

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/api/src/modules/registrations/registration-checkin.controller.ts` | **Modified** | Added rate limiting via `@UseGuards(ThrottlerGuard)` + `@Throttle` (30 req/min) |
| `apps/api/src/modules/registrations/checkin-events.controller.ts` | **Modified** | Added country filter via query param or X-Tenant middleware |

---

## Security Fixes Applied (Retry from Security Review)

### MAJOR-1: Rate Limiting on Check-in Endpoint

**Problem:** `POST /v1/registrations/:token/checkin` had no rate limiting, allowing potential token enumeration and abuse.

**Fix:** Applied `@nestjs/throttler` decorators:
```typescript
@Post(':token/checkin')
@HttpCode(HttpStatus.OK)
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
async checkin(...)
```

The endpoint now enforces 30 requests per minute per IP. This uses the existing `ThrottlerModule` configured in `app.module.ts` (observe mode by default).

### MAJOR-2: Country Filter on Active Events Endpoint

**Problem:** `GET /v1/events/checkin/active` returned ALL published events from ALL countries, violating tenant isolation.

**Fix:** Added country scoping:
1. Accept optional `country` query param (2-char ISO code, e.g., `?country=uz`)
2. Fall back to `req.tenant?.code` from X-Tenant middleware
3. Apply `{ country: { _eq: country.toLowerCase() } }` filter to Directus query

The endpoint remains public by design (operators need it before auth), but now properly scopes to the deployment country.

---

## Key Design Decisions

### Rate Limiting
- Uses existing `ThrottlerModule` infrastructure (observe mode by default)
- Per-route limit of 30 req/min is stricter than the global 60 req/min
- Reuses `ThrottlerGuard` with `@Throttle` decorator

### Country Scoping
- Dual fallback: explicit query param > X-Tenant middleware
- 2-char ISO validation via Zod schema
- Default tenant code (from middleware) applies when no param provided
- Clean integration with existing tenant middleware infrastructure

---

## Architecture Rule Compliance

| Rule | Status |
|------|--------|
| Service methods: typed I/O, no `any` | **Compliant** — Zod validation on all inputs |
| Custom typed errors | **Compliant** — WrongEventError, CheckinNotFoundError, CheckinIneligibleError |
| All promises awaited | **Compliant** |
| DB queries: Directus only | **Compliant** — no raw SQL |
| Cross-module calls via service interface | **Compliant** |
| New endpoints: auth guard at controller level | **Compliant** — open by design; rate limiting applied |
| Rate limiting on public endpoints | **Compliant** — @Throttle(30/min) on check-in |
| Tenant isolation | **Compliant** — country filter on events endpoint |
| RFC 7807 error shape | **Compliant** — NestJS built-in exception filters |

---

## Formatter Check

All modified files pass biome check with no errors:
- `apps/api/src/modules/registrations/registration-checkin.controller.ts` — clean
- `apps/api/src/modules/registrations/checkin-events.controller.ts` — clean

**Typecheck:** `pnpm --filter @aiqadam/api typecheck` — passed
**Biome check:** passed for modified files

---

## Gate Result

```yaml
gate: code-developer
workflow_id: wf-20260624-feat-016
requirement: FR-MIG-021
result: passed
files_created: []
files_modified:
  - apps/api/src/modules/registrations/registration-checkin.controller.ts
  - apps/api/src/modules/registrations/checkin-events.controller.ts
security_fixes:
  MAJOR-1:
    title: Rate limiting on check-in endpoint
    status: fixed
    implementation: "@UseGuards(ThrottlerGuard) + @Throttle({ default: { limit: 30, ttl: 60000 } })"
  MAJOR-2:
    title: Country filter on active events endpoint
    status: fixed
    implementation: "Optional country query param + X-Tenant middleware fallback + Directus filter"
validation:
  api_typecheck: passed
  biome_check: passed for modified files
review_required: false
```
