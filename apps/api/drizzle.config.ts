import type { Config } from 'drizzle-kit';

// drizzle-kit reads this for `pnpm drizzle:generate` (creates migrations
// from schema diff) and `pnpm drizzle:migrate` (applies them).
//
// schema points at the central barrel that re-exports per-module schemas.
// out is the migrations directory committed to the repo.
//
// Per ADR-0013 we use the reversible migration style (each generated
// migration ships up + down).

export default {
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
} satisfies Config;
