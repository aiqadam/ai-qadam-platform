import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('AuthentikClient.getUserBySubject', () => {
  it('returns null when no user matches', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { results: [] }));
    const user = await client.getUserBySubject('missing-uid');
    expect(user).toBeNull();
  });

  it('returns the first result when present', async () => {
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
            groups: ['aiqadam-super-admin'],
            attributes: {},
          },
        ],
      }),
    );
    const user = await client.getUserBySubject('viktor-uid');
    expect(user?.username).toBe('viktor');
    expect(user?.groups).toEqual(['aiqadam-super-admin']);
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain('uuid=viktor-uid');
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
    await client.getUserBySubject('anything');
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
