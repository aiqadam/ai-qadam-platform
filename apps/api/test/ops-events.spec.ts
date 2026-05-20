// S0.4 / issue #113 — Plausible ops-events helper.
//
// Behavior under test:
//   - POSTs to <PLAUSIBLE_HOST>/api/event with the right body shape
//   - No-ops when PLAUSIBLE_HOST is empty (dev / test default)
//   - Never throws — observability MUST NOT break the request path
//   - Aborts after timeout
//
// We mutate env at runtime (vi.stubEnv) so the env Zod schema sees a
// PLAUSIBLE_HOST in some tests, and we import the module fresh per test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = global.fetch;

async function loadHelper() {
  // Force a fresh module so env.PLAUSIBLE_HOST is re-read with the
  // current stubbed value.
  vi.resetModules();
  const mod = await import('../src/lib/ops-events');
  return mod;
}

describe('ops-events helper', () => {
  beforeEach(() => {
    // Restore real fetch each test — we replace it inside specific tests.
    global.fetch = originalFetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('no-ops when PLAUSIBLE_HOST is empty', async () => {
    vi.stubEnv('PLAUSIBLE_HOST', '');
    const calls: unknown[] = [];
    global.fetch = vi.fn(async (...args: unknown[]) => {
      calls.push(args);
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const { track } = await loadHelper();
    await track('auth.failed', { reason: 'test' });

    expect(calls).toHaveLength(0);
  });

  it('POSTs the expected body to /api/event when PLAUSIBLE_HOST is set', async () => {
    vi.stubEnv('PLAUSIBLE_HOST', 'https://analytics.aiqadam.org');
    let capturedUrl: string | URL | Request | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const { track } = await loadHelper();
    await track('dispatch.failed', { channel: 'email', intent: 'event_announce' });

    expect(capturedUrl).toBe('https://analytics.aiqadam.org/api/event');
    expect(capturedInit?.method).toBe('POST');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['user-agent']).toContain('AIQadamOpsEvents');

    const body = JSON.parse(capturedInit?.body as string);
    expect(body.name).toBe('dispatch.failed');
    expect(body.url).toBe('https://aiqadam.org/__ops__/dispatch.failed');
    expect(body.domain).toBe('aiqadam.org');
    expect(body.props).toEqual({ channel: 'email', intent: 'event_announce' });
  });

  it('stringifies numeric props (Plausible expects string values)', async () => {
    vi.stubEnv('PLAUSIBLE_HOST', 'https://analytics.aiqadam.org');
    let body: { props?: Record<string, unknown> } = {};
    global.fetch = vi.fn(async (_url, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const { track } = await loadHelper();
    await track('rbac.denied', { route: '/admin/users', http_status: 403 });

    expect(body.props).toEqual({ route: '/admin/users', http_status: '403' });
  });

  it('omits the props field entirely when no props are passed', async () => {
    vi.stubEnv('PLAUSIBLE_HOST', 'https://analytics.aiqadam.org');
    let body: { props?: unknown } = {};
    global.fetch = vi.fn(async (_url, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const { track } = await loadHelper();
    await track('auth.failed');

    expect(body.props).toBeUndefined();
  });

  it('swallows network errors — never throws', async () => {
    vi.stubEnv('PLAUSIBLE_HOST', 'https://analytics.aiqadam.org');
    global.fetch = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;

    const { track } = await loadHelper();
    // Must not throw.
    await expect(track('dispatch.failed', { channel: 'email' })).resolves.toBeUndefined();
  });

  it('swallows non-2xx responses', async () => {
    vi.stubEnv('PLAUSIBLE_HOST', 'https://analytics.aiqadam.org');
    global.fetch = vi.fn(
      async () => new Response('boom', { status: 503 }),
    ) as unknown as typeof fetch;

    const { track } = await loadHelper();
    await expect(track('auth.failed')).resolves.toBeUndefined();
  });

  it('drops undefined props rather than serialising them', async () => {
    vi.stubEnv('PLAUSIBLE_HOST', 'https://analytics.aiqadam.org');
    let body: { props?: Record<string, unknown> } = {};
    global.fetch = vi.fn(async (_url, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const { track } = await loadHelper();
    await track('auth.failed', { reason: 'bad_state', country: undefined });

    expect(body.props).toEqual({ reason: 'bad_state' });
  });
});
