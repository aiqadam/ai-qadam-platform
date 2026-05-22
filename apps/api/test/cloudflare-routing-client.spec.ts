import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// F-S2.8 unit tests for CloudflareRoutingClient. Stubs global.fetch +
// env vars; verifies request URL/method/body, idempotency lookup,
// envelope error handling.

const originalFetch = global.fetch;

const VALID_TOKEN = 'cf-token-1234567890abcdef';
const VALID_ZONE = 'a'.repeat(32);

interface CFClientCtor {
  createRoutingRule: (input: { alias: string; destination: string }) => Promise<{
    rule_id: string;
    already_existed: boolean;
  }>;
  isConfigured: () => boolean;
}

async function freshClient(): Promise<CFClientCtor> {
  vi.resetModules();
  const mod = await import('../src/modules/admin-invites/cloudflare-routing.client');
  return new mod.CloudflareRoutingClient() as unknown as CFClientCtor;
}

function cfOk<T>(result: T): Response {
  return new Response(JSON.stringify({ success: true, result, errors: [], messages: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function cfErr(status: number, errors: Array<{ code: number; message: string }>): Response {
  return new Response(JSON.stringify({ success: false, result: null, errors, messages: [] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CloudflareRoutingClient', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', VALID_TOKEN);
    vi.stubEnv('CLOUDFLARE_ZONE_ID', VALID_ZONE);
    global.fetch = originalFetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('isConfigured returns false when token or zone is missing', async () => {
    vi.unstubAllEnvs();
    const client = await freshClient();
    expect(client.isConfigured()).toBe(false);
  });

  it('createRoutingRule: lists then POSTs when no existing rule', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    global.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      const u = String(url);
      calls.push({ url: u, init: (init ?? {}) as RequestInit });
      if (u.includes('per_page=200')) {
        return cfOk([]);
      }
      return cfOk({
        id: 'cf-rule-new',
        name: 'aiqadam-operator-x@aiqadam.org',
        enabled: true,
        priority: 50,
        matchers: [{ field: 'to', type: 'literal', value: 'x@aiqadam.org' }],
        actions: [{ type: 'forward', value: ['x@gmail.com'] }],
      });
    }) as unknown as typeof fetch;

    const client = await freshClient();
    const res = await client.createRoutingRule({
      alias: 'x@aiqadam.org',
      destination: 'x@gmail.com',
    });
    expect(res).toEqual({ rule_id: 'cf-rule-new', already_existed: false });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain(`/zones/${VALID_ZONE}/email/routing/rules?per_page=200`);
    expect(calls[1]?.init.method).toBe('POST');
    const body = JSON.parse(String(calls[1]?.init.body)) as Record<string, unknown>;
    expect(body.matchers).toEqual([{ field: 'to', type: 'literal', value: 'x@aiqadam.org' }]);
    expect(body.actions).toEqual([{ type: 'forward', value: ['x@gmail.com'] }]);
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${VALID_TOKEN}`,
    );
  });

  it('createRoutingRule: returns existing rule without POSTing when alias matches', async () => {
    let postCalls = 0;
    global.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      const u = String(url);
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'POST') postCalls++;
      if (u.includes('per_page=200')) {
        return cfOk([
          {
            id: 'cf-rule-existing',
            name: 'old',
            enabled: true,
            priority: 50,
            matchers: [{ field: 'to', type: 'literal', value: 'x@aiqadam.org' }],
            actions: [{ type: 'forward', value: ['x@gmail.com'] }],
          },
        ]);
      }
      return cfOk(null as unknown as Record<string, unknown>);
    }) as unknown as typeof fetch;

    const client = await freshClient();
    const res = await client.createRoutingRule({
      alias: 'x@aiqadam.org',
      destination: 'x@gmail.com',
    });
    expect(res).toEqual({ rule_id: 'cf-rule-existing', already_existed: true });
    expect(postCalls).toBe(0);
  });

  it('createRoutingRule: throws on CF success=false envelope', async () => {
    global.fetch = vi.fn(async (url: unknown) => {
      if (String(url).includes('per_page=200')) return cfOk([]);
      return cfErr(200, [{ code: 10000, message: 'token_invalid' }]);
    }) as unknown as typeof fetch;
    const client = await freshClient();
    await expect(
      client.createRoutingRule({ alias: 'x@aiqadam.org', destination: 'x@gmail.com' }),
    ).rejects.toThrow(/token_invalid/);
  });

  it('createRoutingRule: throws on HTTP non-2xx', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response('Forbidden', {
          status: 403,
          headers: { 'content-type': 'text/plain' },
        }),
    ) as unknown as typeof fetch;
    const client = await freshClient();
    await expect(
      client.createRoutingRule({ alias: 'x@aiqadam.org', destination: 'x@gmail.com' }),
    ).rejects.toThrow(/Cloudflare 403/);
  });

  it('createRoutingRule: throws when not configured', async () => {
    vi.unstubAllEnvs();
    const client = await freshClient();
    await expect(
      client.createRoutingRule({ alias: 'x@aiqadam.org', destination: 'x@gmail.com' }),
    ).rejects.toThrow(/cloudflare_not_configured/);
  });
});
