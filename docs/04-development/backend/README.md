# Layer 4 - Development - Backend

NestJS 11 API (`apps/api/`) and integrations. Cross-cutting architecture lives
in [../architecture/architecture.md](../architecture/architecture.md).

## Standards that apply to all backend code

- **Code quality:** [`../standards.md`](../standards.md) — esp. Part II (TypeScript), Part III (Zod at boundaries), Part VI (database), Part VII (API shapes).
- **Module boundaries (the most important section):** [`../architecture/architecture.md`](../architecture/architecture.md) §"Module boundaries". Rules in brief:
  - Modules expose a **service interface**, not entities.
  - Cross-module calls go through service interfaces — never query another module's tables directly.
  - Shared DTOs/types live in `packages/shared-types`.
  - Drizzle schemas are co-located per module (`apps/api/src/modules/<name>/schema.ts`) and re-exported from a central index for `drizzle-kit`.
  - Circular module dependencies are forbidden; extract shared concerns to `core/` or a third module.
- **Multi-tenancy:** [`../architecture/architecture.md`](../architecture/architecture.md) §"Multi-tenancy implementation" — `country_code` on tenant-scoped tables, tenant-aware repository layer, `bypassTenant()` for super-admin only.
- **Data ownership:** [`../architecture/architecture.md`](../architecture/architecture.md) §"Data ownership" — cross-schema queries are forbidden (no SQL joins across `platform`/`directus`/`authentik`/`twenty`/`listmonk`).
- **Auth:** [`../architecture/auth-architecture.md`](../architecture/auth-architecture.md) — Authentik OIDC, JWT verification per request, RBAC via JWT claims.
- **Security baseline:** [`../security/security.md`](../security/security.md) — input validation at every boundary, parameterized queries only, rate limits on all public endpoints.

## Integrations

- [Telegram bot + outbound sender](integrations/telegram-bot.md)

