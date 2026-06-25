#!/usr/bin/env tsx
/**
 * UAT seed script — creates known test fixtures for the uat-verification workflow.
 *
 * Idempotent: checks whether each fixture already exists before creating it.
 * Run with: pnpm uat:seed
 *
 * Required environment variables (in apps/api/.env or .env.test):
 *   AUTHENTIK_ADMIN_URL   — e.g. http://localhost:9000
 *   AUTHENTIK_ADMIN_TOKEN — Authentik admin API token
 *   DIRECTUS_URL          — e.g. http://localhost:8055
 *   DIRECTUS_TOKEN        — Directus static admin token
 *   INTERNAL_API_TOKEN    — 32+ char token for x-internal-auth header
 *   UAT_OPERATOR_EMAIL    — test operator email (default: uat-operator@aiqadam.test)
 *   UAT_OPERATOR_PASSWORD — test operator password (min 12 chars)
 *   UAT_MEMBER_EMAIL      — test member email (default: uat-member@aiqadam.test)
 *   UAT_MEMBER_PASSWORD   — test member password (min 12 chars)
 */

// ── Constants ────────────────────────────────────────────────────────────────

const UAT_OPERATOR_EMAIL = process.env.UAT_OPERATOR_EMAIL ?? 'uat-operator@aiqadam.test';
const UAT_OPERATOR_PASSWORD = process.env.UAT_OPERATOR_PASSWORD ?? '';
const UAT_MEMBER_EMAIL = process.env.UAT_MEMBER_EMAIL ?? 'uat-member@aiqadam.test';
const UAT_MEMBER_PASSWORD = process.env.UAT_MEMBER_PASSWORD ?? '';
const AUTHENTIK_ADMIN_URL = (process.env.AUTHENTIK_ADMIN_URL ?? '').replace(/\/$/, '');
const AUTHENTIK_ADMIN_TOKEN = process.env.AUTHENTIK_ADMIN_TOKEN ?? '';
const DIRECTUS_URL = (process.env.DIRECTUS_URL ?? '').replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? '';

const UAT_EVENT_TITLE = 'UAT Test Event — AI Qadam';
const UAT_EVENT_COUNTRY = 'uz';
const UAT_EVENT_CAPACITY = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    console.error(`[uat-seed] FATAL: ${message}`);
    process.exit(1);
  }
}

async function authentikRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${AUTHENTIK_ADMIN_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${AUTHENTIK_ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Authentik ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

async function directusRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${DIRECTUS_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Directus ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Authentik user operations ─────────────────────────────────────────────────

interface AuthentikUser {
  pk: number;
  username: string;
  email: string;
  is_active: boolean;
}

async function findAuthentikUserByEmail(email: string): Promise<AuthentikUser | null> {
  const qs = new URLSearchParams({ email });
  const res = await authentikRequest<{ results: AuthentikUser[] }>(
    'GET',
    `/api/v3/core/users/?${qs}`,
  );
  return res.results[0] ?? null;
}

async function createAuthentikUser(
  email: string,
  username: string,
  displayName: string,
  attributes: Record<string, unknown> = {},
): Promise<AuthentikUser> {
  return authentikRequest<AuthentikUser>('POST', '/api/v3/core/users/', {
    username,
    email,
    name: displayName,
    is_active: true,
    attributes,
  });
}

async function setAuthentikPassword(userPk: number, password: string): Promise<void> {
  await authentikRequest<void>('POST', `/api/v3/core/users/${userPk}/set_password/`, { password });
}

async function ensureAuthentikUser(
  email: string,
  username: string,
  displayName: string,
  password: string,
  attributes: Record<string, unknown> = {},
): Promise<AuthentikUser> {
  const existing = await findAuthentikUserByEmail(email);
  if (existing) {
    return existing;
  }
  const user = await createAuthentikUser(email, username, displayName, attributes);
  await setAuthentikPassword(user.pk, password);
  return user;
}

// ── Directus event operations ─────────────────────────────────────────────────

interface DirectusEventRow {
  id: string;
  title: string;
  status: string;
  country: string;
}

async function findDirectusEvent(title: string, country: string): Promise<DirectusEventRow | null> {
  const filter = JSON.stringify({ _and: [{ title: { _eq: title } }, { country: { _eq: country } }] });
  const qs = new URLSearchParams({ 'filter': filter, 'fields': 'id,title,status,country' });
  const res = await directusRequest<{ data: DirectusEventRow[] }>(
    'GET',
    `/items/events?${qs}`,
  );
  return res.data[0] ?? null;
}

async function createDirectusEvent(
  title: string,
  country: string,
  capacity: number,
): Promise<DirectusEventRow> {
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // T+7 days
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString();
  const res = await directusRequest<{ data: DirectusEventRow }>('POST', '/items/events', {
    title,
    status: 'published',
    country,
    capacity,
    format: 'online',
    starts_at: startsAt,
    ends_at: endsAt,
    description: 'Auto-created by uat-seed for UAT testing. Safe to delete.',
  });
  return res.data;
}

async function ensureDirectusEvent(
  title: string,
  country: string,
  capacity: number,
): Promise<DirectusEventRow> {
  const existing = await findDirectusEvent(title, country);
  if (existing) {
    return existing;
  }
  const event = await createDirectusEvent(title, country, capacity);
  return event;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateEnv(): void {
  assert(AUTHENTIK_ADMIN_URL.startsWith('http'), 'AUTHENTIK_ADMIN_URL must be set (e.g. http://localhost:9000)');
  assert(AUTHENTIK_ADMIN_TOKEN.length >= 20, 'AUTHENTIK_ADMIN_TOKEN must be at least 20 chars');
  assert(DIRECTUS_URL.startsWith('http'), 'DIRECTUS_URL must be set (e.g. http://localhost:8055)');
  assert(DIRECTUS_TOKEN.length >= 10, 'DIRECTUS_TOKEN must be set');
  assert(UAT_OPERATOR_PASSWORD.length >= 12, 'UAT_OPERATOR_PASSWORD must be at least 12 chars');
  assert(UAT_MEMBER_PASSWORD.length >= 12, 'UAT_MEMBER_PASSWORD must be at least 12 chars');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {

  validateEnv();
  await ensureAuthentikUser(
    UAT_OPERATOR_EMAIL,
    'uat-operator',
    'UAT Operator',
    UAT_OPERATOR_PASSWORD,
    { is_uat_fixture: true },
  );
  await ensureAuthentikUser(
    UAT_MEMBER_EMAIL,
    'uat-member',
    'UAT Member',
    UAT_MEMBER_PASSWORD,
    { is_uat_fixture: true },
  );
  const _event = await ensureDirectusEvent(UAT_EVENT_TITLE, UAT_EVENT_COUNTRY, UAT_EVENT_CAPACITY);
}

main().catch((err: unknown) => {
  console.error('[uat-seed] FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
