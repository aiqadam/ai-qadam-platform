import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrmController } from '../src/modules/internal/crm.controller';
import type { TwentyClient } from '../src/modules/internal/twenty.client';

// Pure-mock — no Twenty / Postgres / Directus contact. The controller is
// thin REST orchestration; everything testable lives in the mocked client
// interactions + the input validation.

type FakeTwenty = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let fake: FakeTwenty;
let ctrl: CrmController;

const DX_USER = '11111111-1111-4000-8000-000000000001';
const PERSON = 'aaaaaaaa-aaaa-4000-8000-000000000099';

function person(
  overrides: Partial<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    city: string;
  }> = {},
) {
  return {
    id: overrides.id ?? PERSON,
    name: {
      firstName: overrides.firstName ?? '',
      lastName: overrides.lastName ?? '',
    },
    emails: { primaryEmail: overrides.email ?? 'a@b.com' },
    ...(overrides.city ? { city: overrides.city } : {}),
  };
}

beforeEach(() => {
  fake = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  ctrl = new CrmController(fake as unknown as TwentyClient);
});

describe('CrmController.syncContact — input validation', () => {
  it('rejects payload missing directusUserId', async () => {
    await expect(ctrl.syncContact({ email: 'a@b.com' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects payload with malformed email', async () => {
    await expect(
      ctrl.syncContact({ directusUserId: DX_USER, email: 'not-an-email' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payload with non-UUID directusUserId', async () => {
    await expect(
      ctrl.syncContact({ directusUserId: 'not-a-uuid', email: 'a@b.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payload with non-2-char country', async () => {
    await expect(
      ctrl.syncContact({ directusUserId: DX_USER, email: 'a@b.com', country: 'uzbekistan' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CrmController.syncContact — creates new Person', () => {
  it('POSTs /rest/people when no existing person matches email', async () => {
    fake.get.mockResolvedValueOnce({ data: { people: [] } });
    fake.post.mockResolvedValueOnce({
      data: {
        createPerson: person({
          firstName: 'Alice',
          lastName: 'A',
          email: 'alice@example.com',
          city: 'UZ',
        }),
      },
    });

    const res = await ctrl.syncContact({
      directusUserId: DX_USER,
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'A',
      country: 'uz',
    });

    expect(res).toEqual({ personId: PERSON, action: 'created' });
    expect(fake.get).toHaveBeenCalledTimes(1);
    const lookupPath = fake.get.mock.calls[0]?.[0] as string;
    expect(lookupPath).toContain('/rest/people');
    expect(lookupPath).toContain('alice%40example.com');
    expect(fake.post).toHaveBeenCalledWith('/rest/people', {
      emails: { primaryEmail: 'alice@example.com' },
      name: { firstName: 'Alice', lastName: 'A' },
      city: 'UZ',
    });
  });

  it('omits the city field when country is absent', async () => {
    fake.get.mockResolvedValueOnce({ data: { people: [] } });
    fake.post.mockResolvedValueOnce({ data: { createPerson: person({ email: 'b@c.com' }) } });

    await ctrl.syncContact({ directusUserId: DX_USER, email: 'b@c.com' });

    const body = fake.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('city');
  });
});

describe('CrmController.syncContact — updates existing Person', () => {
  it('PATCHes when names differ', async () => {
    fake.get.mockResolvedValueOnce({
      data: { people: [person({ firstName: 'Old', lastName: 'Name', email: 'a@b.com' })] },
    });
    fake.patch.mockResolvedValueOnce({
      data: { updatePerson: person({ firstName: 'New', lastName: 'Name', email: 'a@b.com' }) },
    });

    const res = await ctrl.syncContact({
      directusUserId: DX_USER,
      email: 'a@b.com',
      firstName: 'New',
      lastName: 'Name',
    });

    expect(res).toEqual({ personId: PERSON, action: 'updated' });
    expect(fake.patch).toHaveBeenCalledWith(
      `/rest/people/${PERSON}`,
      expect.objectContaining({
        name: { firstName: 'New', lastName: 'Name' },
      }),
    );
  });

  it('PATCHes when city (country) differs', async () => {
    fake.get.mockResolvedValueOnce({
      data: { people: [person({ firstName: 'X', email: 'a@b.com' })] }, // existing has no city
    });
    fake.patch.mockResolvedValueOnce({
      data: { updatePerson: person({ firstName: 'X', email: 'a@b.com', city: 'KZ' }) },
    });

    const res = await ctrl.syncContact({
      directusUserId: DX_USER,
      email: 'a@b.com',
      firstName: 'X',
      country: 'kz',
    });

    expect(res.action).toBe('updated');
    expect(fake.patch).toHaveBeenCalledTimes(1);
  });

  it('returns unchanged + skips PATCH when fields match', async () => {
    fake.get.mockResolvedValueOnce({
      data: { people: [person({ firstName: 'A', lastName: 'B', email: 'a@b.com', city: 'UZ' })] },
    });

    const res = await ctrl.syncContact({
      directusUserId: DX_USER,
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
      country: 'uz',
    });

    expect(res).toEqual({ personId: PERSON, action: 'unchanged' });
    expect(fake.patch).not.toHaveBeenCalled();
    expect(fake.post).not.toHaveBeenCalled();
  });
});
