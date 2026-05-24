import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { type DirectusClient, DirectusError } from '../src/modules/directus/directus.client';
import {
  TelegramProfileDefaultsService,
  mergeDefaults,
} from '../src/modules/telegram/telegram-profile-defaults.service';

// aiqadam#292 — registration auto-fill. Contract pinned by the bot's
// pydantic ProfileDefaults model. Field renames here require a
// coordinated cross-repo PR.

function fakeDirectus(getMock: ReturnType<typeof vi.fn>): DirectusClient {
  return { get: getMock } as unknown as DirectusClient;
}

const MEMBER = {
  id: 'mem-1',
  email: 'viktor@example.com',
  first_name: 'Viktor',
  last_name: 'Drukker',
};

// ─── mergeDefaults ──────────────────────────────────────────────────────────

describe('mergeDefaults', () => {
  it('builds name from first + last + email', () => {
    expect(mergeDefaults(MEMBER, null)).toEqual({
      name: 'Viktor Drukker',
      email: 'viktor@example.com',
    });
  });

  it('uses first_name alone when last_name is null', () => {
    expect(mergeDefaults({ ...MEMBER, last_name: null }, null)).toEqual({
      name: 'Viktor',
      email: 'viktor@example.com',
    });
  });

  it('omits name when both first/last are null (no empty string in response)', () => {
    const out = mergeDefaults({ ...MEMBER, first_name: null, last_name: null }, null);
    expect(out).toEqual({ email: 'viktor@example.com' });
    expect('name' in out).toBe(false);
  });

  it('merges custom fields from last registration profile', () => {
    const out = mergeDefaults(MEMBER, { company: 'AI Qadam', phone: '+998901234567' });
    expect(out).toEqual({
      name: 'Viktor Drukker',
      email: 'viktor@example.com',
      company: 'AI Qadam',
      phone: '+998901234567',
    });
  });

  it('registration profile values WIN over directus_users for matching keys', () => {
    const out = mergeDefaults(MEMBER, { name: 'New Name', email: 'newer@example.com' });
    expect(out).toEqual({
      name: 'New Name',
      email: 'newer@example.com',
    });
  });

  it('skips non-string values in the profile jsonb (number, bool, array)', () => {
    const out = mergeDefaults(MEMBER, {
      company: 'AI Qadam',
      age: 30,
      vegetarian: true,
      tags: ['a', 'b'],
    });
    expect(out).toEqual({
      name: 'Viktor Drukker',
      email: 'viktor@example.com',
      company: 'AI Qadam',
    });
    expect('age' in out).toBe(false);
    expect('vegetarian' in out).toBe(false);
    expect('tags' in out).toBe(false);
  });

  it('skips whitespace-only profile values', () => {
    const out = mergeDefaults(MEMBER, { company: '   ', phone: '+998' });
    expect(out).toEqual({
      name: 'Viktor Drukker',
      email: 'viktor@example.com',
      phone: '+998',
    });
    expect('company' in out).toBe(false);
  });
});

// ─── getDefaults (service) ──────────────────────────────────────────────────

describe('TelegramProfileDefaultsService.getDefaults', () => {
  it('returns wire-shape defaults for a member with no prior registrations', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: MEMBER }) // member
      .mockResolvedValueOnce({ data: [] }); // last registration miss
    const svc = new TelegramProfileDefaultsService(fakeDirectus(getMock));

    const out = await svc.getDefaults('mem-1');

    expect(out).toEqual({
      defaults: { name: 'Viktor Drukker', email: 'viktor@example.com' },
    });
  });

  it('merges last registration profile into defaults', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: MEMBER })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'reg-99',
            date_created: '2026-05-23T17:00:00.000Z',
            profile: { company: 'AI Qadam', phone: '+998901234567' },
          },
        ],
      });
    const svc = new TelegramProfileDefaultsService(fakeDirectus(getMock));

    const out = await svc.getDefaults('mem-1');

    expect(out.defaults).toEqual({
      name: 'Viktor Drukker',
      email: 'viktor@example.com',
      company: 'AI Qadam',
      phone: '+998901234567',
    });
  });

  it('throws NotFoundException with {error:"member_not_found"} when member 404s', async () => {
    const getMock = vi.fn().mockRejectedValueOnce(new DirectusError(404, '/users/x', 'not found'));
    const svc = new TelegramProfileDefaultsService(fakeDirectus(getMock));

    try {
      await svc.getDefaults('nonexistent');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('member_not_found');
    }
  });

  it('queries last registration with sort=-date_created limit=1', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: MEMBER })
      .mockResolvedValueOnce({ data: [] });
    const svc = new TelegramProfileDefaultsService(fakeDirectus(getMock));

    await svc.getDefaults('mem-1');

    const call = getMock.mock.calls[1]?.[0] as string;
    expect(call).toContain('filter[user][_eq]=mem-1');
    expect(call).toContain('sort=-date_created');
    expect(call).toContain('limit=1');
  });

  it('degrades gracefully — base defaults returned when registration lookup fails', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: MEMBER })
      .mockRejectedValueOnce(new DirectusError(500, '/items/registrations', 'boom'));
    const svc = new TelegramProfileDefaultsService(fakeDirectus(getMock));

    const out = await svc.getDefaults('mem-1');

    expect(out).toEqual({
      defaults: { name: 'Viktor Drukker', email: 'viktor@example.com' },
    });
  });

  it('URL-encodes the member_id in the Directus path', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: MEMBER })
      .mockResolvedValueOnce({ data: [] });
    const svc = new TelegramProfileDefaultsService(fakeDirectus(getMock));

    await svc.getDefaults('mem-1');

    const call = getMock.mock.calls[0]?.[0] as string;
    // Plain uuid passes through unchanged (no reserved chars); pin the
    // call shape so a refactor doesn't introduce a path-traversal regression.
    expect(call).toMatch(/^\/users\/mem-1\?/);
  });
});
