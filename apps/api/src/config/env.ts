import { z } from 'zod';

// Boundary validation per CLAUDE.md §6 + STANDARDS.md Part III: every
// input from outside the system gets a Zod schema. Process env counts.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Postgres connection — points at the 'platform' database in
  // infrastructure/docker-compose.yml. See apps/api/.env.example.
  DATABASE_URL: z.string().url(),
  // Redis used by BullMQ workers and (eventually) cache. See same .env.example.
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  // Symmetric key for signing the API's access tokens (ADR-0016). Must be
  // generated locally and never reused across environments. The 32-char
  // minimum keeps brute-force impractical for HS256 over the 10-min TTL.
  JWT_SIGNING_SECRET: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Boot-time fatal — refuse to start with bad env. Log to stderr and exit
  // so the process supervisor / Coolify sees a clean failure. NestJS Logger
  // isn't available yet at this stage, so console.error is correct here.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
