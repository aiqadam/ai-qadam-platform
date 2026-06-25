#!/usr/bin/env -S node --experimental-strip-types
// scripts/cutover-authentik-repoint.ts
//
// FR-MIG-031 Step 3 — repoint the Authentik OAuth2 provider's redirect URIs
// from the build-aside domain (next.aiqadam.org) to production domains.
//
// Usage:
//   pnpm cutover:repoint              # live run — writes to Authentik
//   pnpm cutover:repoint --dry-run    # prints the diff, makes no changes
//
// Prerequisites (in apps/api/.env):
//   AUTHENTIK_ADMIN_URL          — e.g. https://auth.aiqadam.org
//   AUTHENTIK_ADMIN_TOKEN        — admin API token from Authentik admin UI
//   AUTHENTIK_OIDC_PROVIDER_NAME — exact Name of the OAuth2 provider to patch
//
// The script is idempotent: running it twice produces the same result because
// it deduplicates URIs rather than blindly appending.

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

loadDotenv({ path: resolve(process.cwd(), 'apps/api/.env') });

// ─── Config ───────────────────────────────────────────────────────────────────

const configSchema = z.object({
  AUTHENTIK_ADMIN_URL: z.string().url().default('https://auth.aiqadam.org'),
  AUTHENTIK_ADMIN_TOKEN: z.string().min(20, 'AUTHENTIK_ADMIN_TOKEN must be ≥20 chars'),
  AUTHENTIK_OIDC_PROVIDER_NAME: z
    .string()
    .min(1, 'AUTHENTIK_OIDC_PROVIDER_NAME must be the exact provider Name in Authentik admin'),
});

const configResult = configSchema.safeParse(process.env);
if (!configResult.success) {
  console.error('Missing or invalid environment variables:');
  for (const [field, errors] of Object.entries(configResult.error.flatten().fieldErrors)) {
    console.error(`  ${field}: ${errors?.join(', ')}`);
  }
  process.exit(1);
}

const config = configResult.data;

// ─── Constants ────────────────────────────────────────────────────────────────

const BUILD_ASIDE_HOST = 'next.aiqadam.org';
const PROD_CALLBACK_PATH = '/api/v1/auth/callback';

// Production redirect URIs that must be present after the repoint.
// Extend when new country subdomains are provisioned.
const PROD_REDIRECT_URIS: readonly string[] = [
  `https://aiqadam.org${PROD_CALLBACK_PATH}`,
  `https://uz.aiqadam.org${PROD_CALLBACK_PATH}`,
  `https://kz.aiqadam.org${PROD_CALLBACK_PATH}`,
  `https://tj.aiqadam.org${PROD_CALLBACK_PATH}`,
  `https://global.aiqadam.org${PROD_CALLBACK_PATH}`,
];

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Types ────────────────────────────────────────────────────────────────────

interface RedirectUri {
  matching_mode: 'strict' | 'regex';
  url: string;
}

interface OauthProvider {
  pk: number;
  name: string;
  redirect_uris: RedirectUri[];
}

interface ListResponse<T> {
  results: T[];
}

// ─── Authentik API helpers ────────────────────────────────────────────────────

const base = config.AUTHENTIK_ADMIN_URL.replace(/\/$/, '');

async function authentikGet<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${config.AUTHENTIK_ADMIN_TOKEN}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Authentik GET ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function authentikPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${config.AUTHENTIK_ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Authentik PATCH ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ─── URI merge logic ──────────────────────────────────────────────────────────

function buildNewUriList(current: RedirectUri[]): {
  next: RedirectUri[];
  removed: string[];
  added: string[];
  kept: string[];
} {
  const removed: string[] = [];
  const kept: RedirectUri[] = [];

  for (const entry of current) {
    if (entry.url.includes(BUILD_ASIDE_HOST)) {
      removed.push(entry.url);
    } else {
      kept.push(entry);
    }
  }

  const existingUrls = new Set(kept.map((e) => e.url));
  const added: string[] = [];
  for (const url of PROD_REDIRECT_URIS) {
    if (!existingUrls.has(url)) {
      kept.push({ matching_mode: 'strict', url });
      added.push(url);
    }
  }

  return {
    next: kept,
    removed,
    added,
    kept: kept.filter((e) => !added.includes(e.url)).map((e) => e.url),
  };
}

// ─── Step helpers ─────────────────────────────────────────────────────────────

async function fetchProvider(): Promise<OauthProvider> {
  const qs = new URLSearchParams({ name: config.AUTHENTIK_OIDC_PROVIDER_NAME });
  const list = await authentikGet<ListResponse<OauthProvider>>(
    `/api/v3/providers/oauth2/?${qs.toString()}`,
  );
  if (list.results.length === 0) {
    throw new Error(
      `Provider "${config.AUTHENTIK_OIDC_PROVIDER_NAME}" not found. Check AUTHENTIK_OIDC_PROVIDER_NAME matches the exact Name field in Authentik admin.`,
    );
  }
  const provider = list.results[0];
  if (provider === undefined) throw new Error('Unexpected empty results array after length check.');
  return provider;
}

function printDiff(kept: string[], removed: string[], added: string[]): void {
  console.info('Changes:');
  for (const url of kept) console.info(`  KEEP   ${url}`);
  for (const url of removed) console.info(`  REMOVE ${url}`);
  for (const url of added) console.info(`  ADD    ${url}`);
  console.info('');
}

async function verifyPatch(pk: number): Promise<void> {
  const updated = await authentikGet<OauthProvider>(`/api/v3/providers/oauth2/${pk}/`);

  const stillBuildAside = updated.redirect_uris.filter((e) => e.url.includes(BUILD_ASIDE_HOST));
  if (stillBuildAside.length > 0) {
    throw new Error(
      `Verification failed — build-aside URIs still present: ${stillBuildAside.map((e) => e.url).join(', ')}`,
    );
  }
  for (const url of PROD_REDIRECT_URIS) {
    if (!updated.redirect_uris.some((e) => e.url === url)) {
      throw new Error(`Verification failed — expected URI missing after PATCH: ${url}`);
    }
  }
  console.info(`Verification passed. New redirect URIs (${updated.redirect_uris.length}):`);
  for (const entry of updated.redirect_uris) {
    console.info(`  [${entry.matching_mode}] ${entry.url}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.info("Authentik repoint — FR-MIG-031 Step 3");
  console.info(`Provider: ${config.AUTHENTIK_OIDC_PROVIDER_NAME}`);
  console.info(`Authentik: ${config.AUTHENTIK_ADMIN_URL}`);
  if (DRY_RUN) console.info("Mode: DRY RUN — no changes will be written\n");
  else console.info("Mode: LIVE\n");

  const provider = await fetchProvider();
  console.info(`Found provider pk=${provider.pk} name="${provider.name}"`);
  console.info(`Current redirect URIs (${provider.redirect_uris.length}):`);
  for (const entry of provider.redirect_uris) {
    console.info(`  [${entry.matching_mode}] ${entry.url}`);
  }
  console.info('');

  const { next, removed, added, kept } = buildNewUriList(provider.redirect_uris);
  if (removed.length === 0 && added.length === 0) {
    console.info('Changes: (none — already up to date)');
    return;
  }
  printDiff(kept, removed, added);

  if (DRY_RUN) {
    console.info('Dry run complete. Re-run without --dry-run to apply.');
    return;
  }

  await authentikPatch(`/api/v3/providers/oauth2/${provider.pk}/`, { redirect_uris: next });
  console.info('Done. Verifying…');
  await verifyPatch(provider.pk);
  console.info('\nAuthentik repoint complete.');
}

main().catch((err: unknown) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
