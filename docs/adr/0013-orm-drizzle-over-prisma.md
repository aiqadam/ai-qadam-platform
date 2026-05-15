# ADR-0013: ORM choice — Drizzle over Prisma

## Status
Accepted, 2026-05-15

## Context
`ARCHITECTURE.md` originally specified Prisma 6 as the ORM for the NestJS API. Two issues surfaced during the first session:

1. **Conflict with [STANDARDS.md §VI Migrations](../../.claude/STANDARDS.md).** The standard requires reversible migrations ("every up has a down"). Prisma's migration tool is forward-only by design. The conflict had to be resolved by either softening the rule or switching tooling.
2. **Drizzle ORM has matured** (released 2022, version 0.x stable in 2026) into a defensible alternative for TypeScript projects, with a different set of trade-offs that aligns better with this project's constraints.

Considered alternatives:

- **Prisma 6** — most mature, schema-first, generated client, separate query engine binary
- **Drizzle 0.x** — SQL-first, schema-as-TypeScript, no runtime engine, `drizzle-kit` migration tool
- **Kysely** — typed SQL query builder (not an ORM), no migration tool of its own

## Decision
Use **Drizzle ORM** for the NestJS API and any other TypeScript persistence layer in this project. Migrations via `drizzle-kit`, configured for the reversible style (each migration produces both `up` and `down` files).

Stack line in `ARCHITECTURE.md` updated:
> Backend API: NestJS 11 + Drizzle 0.x + Zod (validation)

## Rationale

- **TypeScript inference quality.** Drizzle's types are inferred directly from the TS-defined schema; Prisma generates a separate client. Drizzle's inference catches more errors at compile time, especially around partial selects and joins.
- **No query engine binary.** Prisma ships a Rust query engine that runs as a child process; Drizzle generates SQL strings at build time. Smaller Docker images, faster cold starts, simpler local dev.
- **`drizzle-kit` supports reversible migrations.** Resolves the conflict with [STANDARDS.md §VI](../../.claude/STANDARDS.md) without requiring a rule change.
- **SQL-first style helps the developer build durable SQL intuition.** Project owner is learning to code; Drizzle's "schema looks like SQL" approach reinforces patterns that transfer to any SQL database, not just Drizzle-specific ones.
- **Smaller dependency footprint.** Drizzle has fewer transitive dependencies than Prisma, aligning with the Power-of-Ten / Karpathy ethos in [CLAUDE.md](../../.claude/CLAUDE.md).
- **Faster runtime.** Marginal at our expected scale, but free wins are free wins.

## Consequences

- ✅ [STANDARDS.md §VI](../../.claude/STANDARDS.md) reversible-migration rule survives unchanged — `drizzle-kit` honors it natively.
- ✅ TS inference is better; fewer runtime bugs slip through the type system.
- ✅ Smaller, faster container images for the API.
- ⚠️ **Less mature than Prisma.** More likely to hit rough edges (worse error messages, occasional weird migration corner cases, fewer Stack Overflow answers).
- ⚠️ **Smaller ecosystem.** NestJS official integration patterns are documented for Prisma; Drizzle integration is community-driven (well-covered, but less prescribed).
- ⚠️ **Less documentation than Prisma.** A solo developer leaning on Claude Code partially compensates, but expect moments of "the docs don't cover this."
- ⚠️ **Switching ORMs later is expensive.** Every query gets rewritten. The decision should be considered semi-permanent. If Drizzle stagnates over the next 12 months, the cost of re-evaluation is real.
- 📝 **Multi-tenant `country_code` filtering** is implemented via a tenant-aware repository layer (Drizzle middleware-style), not via Prisma extensions. Pattern documented in code reviews, not yet in a separate ADR.
- 📝 **Schema files** are split per module under `apps/api/src/modules/<name>/schema.ts`, then re-exported from a central index for `drizzle-kit` to pick up. Deviates slightly from Prisma's "one schema.prisma" convention, but matches the modular monolith structure in `ARCHITECTURE.md`.

## Supersedes
The implicit "Prisma 6" choice baked into `ARCHITECTURE.md` §"Stack — the canonical list" (rewritten in this Round 2A to name Drizzle).

## References
- [STANDARDS.md §VI Migrations](../../.claude/STANDARDS.md) — the rule that drove the resolution.
- [Drizzle docs](https://orm.drizzle.team) — official documentation.
- [drizzle-kit CLI](https://orm.drizzle.team/docs/migrations) — migration tooling.
