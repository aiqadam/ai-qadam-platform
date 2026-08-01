import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// AuthentikClient.sendMagicLinkEmail uses node:http/node:https directly
// (see that method's doc comment in authentik.client.ts for why) rather
// than the fetch-based request() helper — which module it picks depends
// on AUTHENTIK_ADMIN_URL's protocol (http: locally via a dev .env,
// https: by env.ts's own default and in CI), so both must be mocked for
// this test to be deterministic across environments. vitest cannot
// vi.spyOn() a Node builtin's named export directly in ESM ("Module
// namespace is not configurable") — vi.mock with a hoisted factory is
// the supported way to replace it.
const httpsRequestMock = vi.hoisted(() => vi.fn());
const httpRequestMock = vi.hoisted(() => vi.fn());
vi.mock('node:https', () => ({
  request: httpsRequestMock,
}));
vi.mock('node:http', () => ({
  request: httpRequestMock,
}));

import { AuthentikClient, AuthentikError } from '../src/modules/admin-invites/authentik.client';

// Unit tests for the AuthentikClient — F-S2.7 PR-2. Mocks global
// fetch; verifies request shaping (headers, body, path) and error
// surface.

let client: AuthentikClient;
let fetchSpy: ReturnType<typeof vi.spyOn>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function groupResp(pk: string, name: string): Response {
  return jsonResponse(200, {
    results: [{ pk, name, is_superuser: name.includes('admin'), users: [] }],
  });
}

beforeEach(() => {
  client = new AuthentikClient();
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('AuthentikClient.createUser', () => {
  it('POSTs the create-user shape and parses the response', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(201, {
        pk: 42,
        username: 'aigerim',
        email: 'aigerim.k@aiqadam.org',
        name: 'Aigerim K.',
        is_active: true,
        uid: 'abc-123-uid',
        groups: [],
        attributes: { recovery_email: 'aigerim@gmail.com' },
      }),
    );
    const user = await client.createUser({
      email: 'aigerim.k@aiqadam.org',
      username: 'aigerim',
      name: 'Aigerim K.',
      attributes: { recovery_email: 'aigerim@gmail.com' },
    });
    expect(user.pk).toBe(42);
    expect(user.email).toBe('aigerim.k@aiqadam.org');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(url).toMatch(/\/api\/v3\/core\/users\/$/);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer /);
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      username: 'aigerim',
      email: 'aigerim.k@aiqadam.org',
      name: 'Aigerim K.',
      is_active: true,
      attributes: { recovery_email: 'aigerim@gmail.com' },
    });
  });

  it('throws AuthentikError on 4xx', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(400, { email: ['already taken'] }));
    await expect(
      client.createUser({
        email: 'taken@aiqadam.org',
        username: 'taken',
        name: 'T.',
      }),
    ).rejects.toBeInstanceOf(AuthentikError);
  });
});

describe('AuthentikClient.setPassword', () => {
  it('POSTs the password to the set_password endpoint and tolerates 204', async () => {
    fetchSpy.mockResolvedValueOnce(emptyResponse(204));
    await client.setPassword(42, 'a-strong-temp-passw0rd!');
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(url).toMatch(/\/api\/v3\/core\/users\/42\/set_password\/$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ password: 'a-strong-temp-passw0rd!' });
  });
});

describe('AuthentikClient.getUserByEmail', () => {
  it('returns null when no user matches', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { results: [] }));
    const user = await client.getUserByEmail('nobody@aiqadam.org');
    expect(user).toBeNull();
  });

  it('returns the first result with groups_obj resolved', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        results: [
          {
            pk: 5,
            username: 'viktor',
            email: 'viktor.drukker@aiqadam.org',
            name: 'Viktor',
            is_active: true,
            uid: 'viktor-uid',
            groups: ['a1078a27-cc56-49eb-b11e-fa669ca7824b'],
            groups_obj: [
              { pk: 'a1078a27-cc56-49eb-b11e-fa669ca7824b', name: 'aiqadam-super-admin' },
            ],
            attributes: {},
          },
        ],
      }),
    );
    const user = await client.getUserByEmail('viktor.drukker@aiqadam.org');
    expect(user?.username).toBe('viktor');
    expect(user?.groups_obj[0]?.name).toBe('aiqadam-super-admin');
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain('email=viktor.drukker%40aiqadam.org');
  });
});

describe('AuthentikClient.resolveGroupNames', () => {
  it('returns [] for empty input and never calls fetch', async () => {
    const res = await client.resolveGroupNames([]);
    expect(res).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves each name to a group pk', async () => {
    fetchSpy.mockResolvedValueOnce(groupResp('group-pk-admin', 'aiqadam-super-admin'));
    fetchSpy.mockResolvedValueOnce(groupResp('group-pk-staff', 'aiqadam-staff'));
    const groups = await client.resolveGroupNames(['aiqadam-super-admin', 'aiqadam-staff']);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.pk).toBe('group-pk-admin');
    expect(groups[1]?.pk).toBe('group-pk-staff');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('skips names with no match (silent partial result)', async () => {
    fetchSpy.mockResolvedValueOnce(groupResp('group-pk-staff', 'aiqadam-staff'));
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { results: [] }));
    const groups = await client.resolveGroupNames(['aiqadam-staff', 'nonexistent-group']);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe('aiqadam-staff');
  });
});

// FR-ADM-011 / FR-ADM-010 shared primitive — see MAX_SUPER_ADMINS and
// getSuperAdminCount() in authentik.client.ts. Both FRs' cap comparisons
// (>=1 for bootstrap, >3/<=1 for ongoing grant/revoke) read through this
// one method.
describe('AuthentikClient.getSuperAdminCount', () => {
  it('returns the live member count of aiqadam-super-admin', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        results: [{ pk: 'grp-1', name: 'aiqadam-super-admin', is_superuser: true, users: [1, 2] }],
      }),
    );
    const count = await client.getSuperAdminCount();
    expect(count).toBe(2);
  });

  it('returns 0 when the group resolves to no result', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { results: [] }));
    const count = await client.getSuperAdminCount();
    expect(count).toBe(0);
  });
});

describe('AuthentikClient.setUserGroups + disableUser', () => {
  it('PATCHes groups onto the user', async () => {
    fetchSpy.mockResolvedValueOnce(emptyResponse(204));
    await client.setUserGroups(42, ['group-pk-staff', 'group-pk-kz']);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ groups: ['group-pk-staff', 'group-pk-kz'] });
  });

  it('PATCHes is_active=false on disable', async () => {
    fetchSpy.mockResolvedValueOnce(emptyResponse(204));
    await client.disableUser(42);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ is_active: false });
  });
});

describe('AuthentikClient — auth + error shape', () => {
  it('uses Bearer token from env on every request', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { results: [] }));
    await client.getUserByEmail('anything@example.org');
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer .+/);
  });

  it('wraps non-2xx as AuthentikError carrying status + path + body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(500, { detail: 'Internal Server Error' }));
    await expect(client.disableUser(1)).rejects.toMatchObject({
      name: 'AuthentikError',
      status: 500,
    });
  });
});

// FR-AUTH-002 — new methods added for Telegram authentication.

describe('AuthentikClient.getUserByTelegramId', () => {
  it('GETs with attributes JSON filter and returns the first matching user', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        results: [
          {
            pk: 101,
            username: 'tg123456789',
            email: 'tg123456789@telegram.local',
            name: 'Aigerim',
            is_active: true,
            uid: 'uid-tg101',
            groups: [],
            groups_obj: [],
            attributes: { telegram_id: '123456789' },
          },
        ],
      }),
    );

    const user = await client.getUserByTelegramId('123456789');

    expect(user?.pk).toBe(101);
    expect(user?.attributes).toMatchObject({ telegram_id: '123456789' });
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/v3/core/users/');
    expect(url).toContain('attributes=');
    expect(decodeURIComponent(url)).toContain('"telegram_id":"123456789"');
  });

  it('returns null when no user has the given telegram_id', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { results: [] }));

    const user = await client.getUserByTelegramId('999999999');

    expect(user).toBeNull();
  });

  it('throws AuthentikError on a non-2xx response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(500, { detail: 'db error' }));

    await expect(client.getUserByTelegramId('123456789')).rejects.toMatchObject({
      name: 'AuthentikError',
      status: 500,
    });
  });
});

describe('AuthentikClient.createRecoveryLink', () => {
  // ISS-USR-REDIRECT-002: this mock previously used `recovery_link` as
  // the response key, mirroring the code's own bug — Authentik's real
  // API returns `{ link: string }` (confirmed live), so the mock and
  // the bug agreed with each other and both disagreed with reality.
  // This test would NOT have caught the always-undefined-in-production
  // bug. Fixed to match the real response shape.
  it('POSTs to the recovery endpoint and returns the link string', async () => {
    const RECOVERY_URL = 'https://auth.aiqadam.org/recover/abcdef123456/';
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { link: RECOVERY_URL }));

    const result = await client.createRecoveryLink(42);

    expect(result).toBe(RECOVERY_URL);
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(url).toMatch(/\/api\/v3\/core\/users\/42\/recovery\/$/);
    expect(init.method).toBe('POST');
  });

  it('throws AuthentikError on a non-2xx response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(404, { detail: 'Not Found' }));

    await expect(client.createRecoveryLink(99)).rejects.toMatchObject({
      name: 'AuthentikError',
      status: 404,
    });
  });
});

// FR-AUTH-004 — sendMagicLinkEmail. Unlike createRecoveryLink above, this
// hits an ARBITRARY Email stage passed by the caller (not the
// Brand.flow_recovery-bound one) and returns 204 with no body.
//
// CORRECTION (Step 8 retry, see 07-test-results.md's CRITICAL FINDING +
// authentik.client.ts's own doc comment on this method): this method no
// longer routes through the fetch-based request() helper. A live repro
// (a standalone Node script against a local http.Server) proved Node's
// global fetch (undici) silently OVERWRITES any `Host` header passed via
// init.headers with the actual connection target — "Host" is a forbidden
// request header under the WHATWG Fetch spec. Since routing the emailed
// link to the correct Authentik flow REQUIRES a genuine Host-header
// override (Authentik resolves Brand per-request Host header; see
// authentik.client.ts's doc comment for the full mechanism), this method
// now uses node:http/node:https directly via the private
// httpRequestWithHostOverride() helper. These tests mock https.request
// (the test env's AUTHENTIK_ADMIN_URL default is https://auth.aiqadam.org,
// so AuthentikClient's own protocol-selection picks https) rather than
// fetch — fetchSpy from the top-level beforeEach is asserted NOT called
// in each test here, to lock in that this method deliberately bypasses it.

// Mocks BOTH transports identically each time — only one is actually
// invoked per call (selected by AUTHENTIK_ADMIN_URL's protocol), and
// asserting on "whichever one got called" below is what makes this test
// robust to that environment-dependent choice.
function mockNodeRequestOnce(statusCode: number, responseBody: string) {
  const impl = (_options: unknown, callback: (res: unknown) => void) => {
    const req = new EventEmitter();
    (req as unknown as { end: () => void }).end = () => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = statusCode;
      // Simulate the real event ordering: callback receives res
      // synchronously-ish, then data/end fire on nextTick.
      callback(res);
      process.nextTick(() => {
        if (responseBody) res.emit('data', Buffer.from(responseBody));
        res.emit('end');
      });
    };
    return req;
  };
  httpsRequestMock.mockImplementationOnce(impl);
  httpRequestMock.mockImplementationOnce(impl);
}

function calledTransportMock(): ReturnType<typeof vi.fn> {
  return httpsRequestMock.mock.calls.length > 0 ? httpsRequestMock : httpRequestMock;
}

describe('AuthentikClient.sendMagicLinkEmail', () => {
  afterEach(() => {
    httpsRequestMock.mockReset();
    httpRequestMock.mockReset();
  });

  it('POSTs to the recovery_email endpoint with the pk and encoded email_stage query param, sends the brandDomain as the Host header, resolves void on 204, and never uses fetch', async () => {
    mockNodeRequestOnce(204, '');

    // A stage value containing a character encodeURIComponent actually
    // transforms (a space) so the assertion below is not vacuously true
    // for an already-URL-safe UUID.
    const STAGE_WITH_SPACE = 'stage uuid/with-slash';
    const BRAND_DOMAIN = 'magic-link.aiqadam.internal';

    const result = await client.sendMagicLinkEmail(42, STAGE_WITH_SPACE, BRAND_DOMAIN);

    expect(result).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    const transportMock = calledTransportMock();
    expect(transportMock).toHaveBeenCalledTimes(1);
    const options = transportMock.mock.calls[0]?.[0] as {
      path: string;
      method: string;
      headers: Record<string, string>;
    };
    expect(options.path).toBe(
      '/api/v3/core/users/42/recovery_email/?email_stage=stage%20uuid%2Fwith-slash',
    );
    expect(options.method).toBe('POST');
    expect(options.headers.Host).toBe(BRAND_DOMAIN);
    expect(options.headers.Authorization).toMatch(/^Bearer /);
  });

  it('throws AuthentikError on a non-2xx response', async () => {
    mockNodeRequestOnce(404, JSON.stringify({ detail: 'Not Found' }));

    await expect(
      client.sendMagicLinkEmail(42, 'stage-uuid', 'magic-link.aiqadam.internal'),
    ).rejects.toMatchObject({
      name: 'AuthentikError',
      status: 404,
    });
  });

  it('rejects on a network error from the underlying http(s) request', async () => {
    const impl = () => {
      const req = new EventEmitter();
      (req as unknown as { end: () => void }).end = () => {
        process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
      };
      return req;
    };
    httpsRequestMock.mockImplementationOnce(impl);
    httpRequestMock.mockImplementationOnce(impl);

    await expect(
      client.sendMagicLinkEmail(42, 'stage-uuid', 'magic-link.aiqadam.internal'),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
