// Drizzle schema barrel.
//
// Per ARCHITECTURE.md §"Module boundaries" rule 4: each module owns its
// schema file under src/modules/<name>/schema.ts (or, for cross-cutting
// concerns like tenants, here under src/db/schema/). All schemas re-export
// here so drizzle-kit picks them up via a single entry point (configured
// in drizzle.config.ts).

export * from './tenants';
export * from '../../modules/users/schema';
export * from '../../modules/auth/refresh-token.schema';
export * from '../../modules/events/schema';
export * from '../../modules/registrations/schema';
