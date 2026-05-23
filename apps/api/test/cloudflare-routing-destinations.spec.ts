import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// F-S2.8.1 — destination-address methods on CloudflareRoutingClient.
// Stubs global.fetch + env (account id + token + zone id); verifies
// add/get behavior + idempotency lookup + 404 mapping.

const originalFetch = global.fetch;
const VALID_TOKEN = 'cfut_test_token_aaaaaaaaaaaaa';
const VALID_ZONE = 'a'.repeat(32);
const VALID_ACCT = 'b'.repeat(32);

interface ClientShape {
  addDestinationAddress: (email: string) => Promise<{
    tag: string;
    already_existed: boolean;
    verified: boolean;
  }>;
  getDestinationByTag: (tag: string) => Promise<{
    tag: string;
    email: string;
    verified: string | null;
  } | null>;
  isDestinationApiConfigured: () => boolean;
}

async function freshClient(): Promise<ClientShape> {
  vi.resetModules();
  const mod = await import('../src/modules/admin-invites/cloudflare-routing.client');
  return new mod.CloudflareRoutingClient() as unknown as ClientShape;
}

function cfOk<T>(result: T): Response {
  return new Response(JSON.stringify({ success: true, result, errors: [], messages: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CloudflareRoutingClient.addDestinationAddress', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', VALID_TOKEN);
    vi.stubEnv('CLOUDFLARE_ZONE_ID', VALID_ZONE);
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', VALID_ACCT);
    global.fetch = originalFetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('isDestinationApiConfigured is false when account id is missing', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('CLOUDFLARE_API_TOKEN', VALID_TOKEN);
    vi.stubEnv('CLOUDFLARE_ZONE_ID', VALID_ZONE);
    const client = await freshClient();
    expect(client.isDestinationApiConfigured()).toBe(false);
  });

  it('lists then POSTs when address does not exist', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    global.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      const u = String(url);
      const i = (init ?? {}) as RequestInit;
      calls.push({ url: u, method: i.method ?? 'GET', body: i.body });
      if (i.method === 'POST') {
        return cfOk({
          tag: 'cf-dest-new',
          email: 'op@gmail.com',
          verified: null,
          created: '2026-05-23T00:00:00Z',
        });
      }
      return cfOk([]);
    }) as unknown as typeof fetch;

    const client = await freshClient();
    const res = await client.addDestinationAddress('op@gmail.com');
    expect(res).toEqual({ tag: 'cf-dest-new', already_existed: false, verified: false });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain(`/accounts/${VALID_ACCT}/email/routing/addresses?per_page=200`);
    expect(calls[1]?.method).toBe('POST');
    expect(JSON.parse(String(calls[1]?.body))).toEqual({ email: 'op@gmail.com' });
  });

  it('returns existing destination without POSTing when email already present (case-insensitive)', async () => {
    let postCalls = 0;
    global.fetch = vi.fn(async (_url: unknown, init?: unknown) => {
      const i = (init ?? {}) as RequestInit;
      if (i.method === 'POST') postCalls++;
      if (i.method === 'POST') return cfOk({ tag: 'should-not-happen' });
      return cfOk([
        {
          tag: 'cf-dest-existing',
          email: 'OP@gmail.com',
          verified: '2026-05-22T20:00:00Z',
          created: '2026-05-22T18:00:00Z',
        },
      ]);
    }) as unknown as typeof fetch;

    const client = await freshClient();
    const res = await client.addDestinationAddress('op@gmail.com');
    expect(res).toEqual({ tag: 'cf-dest-existing', already_existed: true, verified: true });
    expect(postCalls).toBe(0);
  });

  it('throws when destination API not configured', async () => {
    vi.unstubAllEnvs();
    const client = await freshClient();
    await expect(client.addDestinationAddress('op@gmail.com')).rejects.toThrow(
      /cloudflare_destination_api_not_configured/,
    );
  });

  it('rejects invalid email shape', async () => {
    const client = await freshClient();
    await expect(client.addDestinationAddress('not-an-email')).rejects.toThrow(/invalid_email/);
  });
});

describe('CloudflareRoutingClient.getDestinationByTag', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', VALID_TOKEN);
    vi.stubEnv('CLOUDFLARE_ZONE_ID', VALID_ZONE);
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', VALID_ACCT);
    global.fetch = originalFetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('returns the destination with verified timestamp once verified', async () => {
    global.fetch = vi.fn(async () =>
      cfOk({
        tag: 'cf-dest-1',
        email: 'op@gmail.com',
        verified: '2026-05-23T08:30:00Z',
        created: '2026-05-23T08:00:00Z',
      }),
    ) as unknown as typeof fetch;
    const client = await freshClient();
    const res = await client.getDestinationByTag('cf-dest-1');
    expect(res?.verified).toBe('2026-05-23T08:30:00Z');
  });

  it('returns null on 404 (destination has been deleted)', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, result: null, errors: [], messages: [] }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    const client = await freshClient();
    const res = await client.getDestinationByTag('does-not-exist');
    expect(res).toBeNull();
  });
});
