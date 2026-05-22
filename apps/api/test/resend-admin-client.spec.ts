import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// F-S2.8 unit tests for ResendAdminClient. Stubs global.fetch +
// env.RESEND_ADMIN_API_KEY; verifies request URL/body, plaintext-token
// extraction, and that plaintext NEVER appears in any console output.

const originalFetch = global.fetch;
const VALID_ADMIN_TOKEN = 're_admin_full_access_abcdefg';

interface ResendClientCtor {
  createPerOperatorKey: (input: { operatorEmail: string }) => Promise<{
    id: string;
    token: string;
  }>;
  isConfigured: () => boolean;
}

async function freshClient(): Promise<ResendClientCtor> {
  vi.resetModules();
  const mod = await import('../src/modules/admin-invites/resend-admin.client');
  return new mod.ResendAdminClient() as unknown as ResendClientCtor;
}

describe('ResendAdminClient', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_ADMIN_API_KEY', VALID_ADMIN_TOKEN);
    global.fetch = originalFetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('isConfigured returns false when admin key missing', async () => {
    vi.unstubAllEnvs();
    const client = await freshClient();
    expect(client.isConfigured()).toBe(false);
  });

  it('createPerOperatorKey: POSTs to /api-keys with sending_access permission', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    global.fetch = vi.fn(async (url: unknown, init?: unknown) => {
      calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
      return new Response(JSON.stringify({ id: 'rsk_42', token: 're_secret_xyz' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const client = await freshClient();
    const res = await client.createPerOperatorKey({ operatorEmail: 'binali.rustamov@aiqadam.org' });
    expect(res).toEqual({ id: 'rsk_42', token: 're_secret_xyz' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.resend.com/api-keys');
    expect(calls[0]?.init.method).toBe('POST');
    const body = JSON.parse(String(calls[0]?.init.body)) as { name: string; permission: string };
    expect(body.permission).toBe('sending_access');
    expect(body.name).toMatch(/^aiqadam-operator-binali\.rustamov@aiqadam\.org-\d+$/);
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${VALID_ADMIN_TOKEN}`,
    );
  });

  it('createPerOperatorKey: throws on HTTP non-2xx', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response('{"name":"unauthorized"}', {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    const client = await freshClient();
    await expect(client.createPerOperatorKey({ operatorEmail: 'x@aiqadam.org' })).rejects.toThrow(
      /ResendAdmin 401/,
    );
  });

  it('createPerOperatorKey: throws when response missing id or token', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response('{"id":"rsk_42"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    const client = await freshClient();
    await expect(client.createPerOperatorKey({ operatorEmail: 'x@aiqadam.org' })).rejects.toThrow(
      /missing_id_or_token/,
    );
  });

  it('createPerOperatorKey: throws when not configured', async () => {
    vi.unstubAllEnvs();
    const client = await freshClient();
    await expect(client.createPerOperatorKey({ operatorEmail: 'x@aiqadam.org' })).rejects.toThrow(
      /resend_admin_not_configured/,
    );
  });

  it('does NOT log the plaintext token after success', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'rsk_42', token: 're_secret_should_not_appear' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const client = await freshClient();
    await client.createPerOperatorKey({ operatorEmail: 'x@aiqadam.org' });

    const joined = [...consoleSpy.mock.calls, ...errSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((a) => String(a))
      .join(' ');
    expect(joined).not.toContain('re_secret_should_not_appear');

    consoleSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
