// Drizzle schema barrel.
//
// Per ARCHITECTURE.md §"Module boundaries" rule 4: each module exports its
// own schema under apps/api/src/modules/<name>/schema.ts; this barrel
// re-exports them so drizzle-kit can pick them up via a single entry point
// (configured in drizzle.config.ts).
//
// Empty for now — schemas land as feature modules come online.
export {};
