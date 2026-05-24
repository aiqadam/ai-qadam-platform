import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { TelegramCheckinService } from '../src/modules/telegram/telegram-checkin.service';

// aiqadam#280 — bot-facing /checkin/:token. Contract pinned by bot's
// pydantic CheckinResponse. Field renames here require a coordinated
// cross-repo PR.

function fakeDirectus(opts: { get?: ReturnType<typeof vi.fn>; patch?: ReturnType<typeof vi.fn> }) {
  return {
    get: opts.get ?? vi.fn(),
    patch: opts.patch ?? vi.fn(),
  } as unknown as DirectusClient;
}

const NOW = '2026-06-20T03:30:00.000Z'; // inside the event window

const REG_ROW_REGISTERED = {
  id: 'reg-1',
  user: 'mem-1',
  status: 'registered',
  checked_in_at: null,
  event: {
    id: 'evt-1',
    title: 'AI Qadam Meetup',
    starts_at: '2026-06-20T03:00:00.000Z',
    ends_at: '2026-06-20T06:00:00.000Z',
  },
};

const REG_ROW_ATTENDED = {
  ...REG_ROW_REGISTERED,
  status: 'attended',
  checked_in_at: '2026-06-20T03:05:12.000Z',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TelegramCheckinService.checkin', () => {
  it('flips status to attended on first check-in (200, first_checkin=true)', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [REG_ROW_REGISTERED] });
    const patch = vi.fn().mockResolvedValueOnce({ data: REG_ROW_ATTENDED });
    const svc = new TelegramCheckinService(fakeDirectus({ get, patch }));

    const out = await svc.checkin('TOKEN-ABC');

    expect(out).toMatchObject({
      member_id: 'mem-1',
      event_id: 'evt-1',
      event_title: 'AI Qadam Meetup',
      first_checkin: true,
    });
    expect(out.checked_in_at).toBe(NOW);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]?.[0]).toBe('/items/registrations/reg-1');
    expect(patch.mock.calls[0]?.[1]).toEqual({
      status: 'attended',
      checked_in_at: NOW,
    });
  });

  it('returns first_checkin=false on idempotent replay (no PATCH)', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [REG_ROW_ATTENDED] });
    const patch = vi.fn();
    const svc = new TelegramCheckinService(fakeDirectus({ get, patch }));

    const out = await svc.checkin('TOKEN-ABC');

    expect(out.first_checkin).toBe(false);
    expect(out.checked_in_at).toBe('2026-06-20T03:05:12.000Z'); // original
    expect(patch).not.toHaveBeenCalled();
  });

  it('404 with {error:"checkin_token_not_found"} when token unknown', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] });
    const svc = new TelegramCheckinService(fakeDirectus({ get }));

    try {
      await svc.checkin('NOPE');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('checkin_token_not_found');
    }
  });

  it('404 when the registration row has no event (orphan; defensive)', async () => {
    const get = vi.fn().mockResolvedValueOnce({
      data: [{ ...REG_ROW_REGISTERED, event: null }],
    });
    const svc = new TelegramCheckinService(fakeDirectus({ get }));

    await expect(svc.checkin('TOKEN-ABC')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 event_not_started when now < starts_at - 60min', async () => {
    // Move clock to 2h before event
    vi.setSystemTime(new Date('2026-06-20T01:00:00.000Z'));
    const get = vi.fn().mockResolvedValueOnce({ data: [REG_ROW_REGISTERED] });
    const svc = new TelegramCheckinService(fakeDirectus({ get }));

    try {
      await svc.checkin('TOKEN-ABC');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      const resp = (e as ConflictException).getResponse() as { error: string };
      expect(resp.error).toBe('event_not_started');
    }
  });

  it('allows check-in within the 60min pre-event window', async () => {
    // 30min before event — should succeed
    vi.setSystemTime(new Date('2026-06-20T02:30:00.000Z'));
    const get = vi.fn().mockResolvedValueOnce({ data: [REG_ROW_REGISTERED] });
    const patch = vi.fn().mockResolvedValueOnce({ data: {} });
    const svc = new TelegramCheckinService(fakeDirectus({ get, patch }));

    await expect(svc.checkin('TOKEN-ABC')).resolves.toBeTruthy();
  });

  it('410 event_ended when now > ends_at', async () => {
    // Move clock to 1h after event ended
    vi.setSystemTime(new Date('2026-06-20T07:00:00.000Z'));
    const get = vi.fn().mockResolvedValueOnce({ data: [REG_ROW_REGISTERED] });
    const svc = new TelegramCheckinService(fakeDirectus({ get }));

    try {
      await svc.checkin('TOKEN-ABC');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(GoneException);
      const resp = (e as GoneException).getResponse() as { error: string };
      expect(resp.error).toBe('event_ended');
    }
  });

  it('queries Directus with checkin_code filter + nested event fields', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [REG_ROW_REGISTERED] });
    const patch = vi.fn().mockResolvedValueOnce({ data: {} });
    const svc = new TelegramCheckinService(fakeDirectus({ get, patch }));

    await svc.checkin('TOKEN-ABC');

    const call = get.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[checkin_code][_eq]=TOKEN-ABC');
    expect(call).toContain(
      'fields=id,user,status,checked_in_at,event.id,event.title,event.starts_at,event.ends_at',
    );
  });
});
