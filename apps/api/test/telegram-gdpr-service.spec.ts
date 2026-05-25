import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { TickLockService } from '../src/modules/internal-cron/tick-lock.service';
import { TelegramGdprService, displayName } from '../src/modules/telegram/telegram-gdpr.service';

// #362 — GDPR self-service: data export + soft-delete + hard-delete cron.

function fakeDirectus(opts: {
  get?: ReturnType<typeof vi.fn>;
  post?: ReturnType<typeof vi.fn>;
  patch?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
}): DirectusClient {
  return {
    get: opts.get ?? vi.fn(),
    post: opts.post ?? vi.fn(),
    patch: opts.patch ?? vi.fn(),
    delete: opts.delete ?? vi.fn(),
  } as unknown as DirectusClient;
}

function fakeLocks(): TickLockService {
  return { withLock: vi.fn() } as unknown as TickLockService;
}

const MEMBER_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'viktor@example.com',
  first_name: 'Viktor',
  last_name: 'Drukker',
  date_created: '2026-01-15T10:00:00.000Z',
  language: 'en',
  timezone: 'Asia/Tashkent',
  notification_opt_ins: { event_reminders: true, newsletter: false },
  profile_defaults: { name: 'Viktor', email: 'viktor@example.com' },
};

const REG_ROW = {
  id: 'reg-1',
  event: 'evt-1',
  status: 'registered',
  date_created: '2026-04-01T10:00:00.000Z',
  checked_in_at: null,
};

const REG_ROW_CHECKED_IN = {
  id: 'reg-2',
  event: 'evt-2',
  status: 'attended',
  date_created: '2026-03-01T10:00:00.000Z',
  checked_in_at: '2026-03-05T18:00:00.000Z',
};

const FEEDBACK_ROW = {
  id: 'fb-1',
  category: 'other',
  message: 'smoke test',
  date_created: '2026-05-01T10:00:00.000Z',
};

// ─── Pure helpers ───────────────────────────────────────────────────────

describe('displayName', () => {
  it('combines first + last when both present', () => {
    expect(displayName({ ...MEMBER_ROW } as never)).toBe('Viktor Drukker');
  });
  it('returns first alone when last is null', () => {
    expect(displayName({ ...MEMBER_ROW, last_name: null } as never)).toBe('Viktor');
  });
  it('falls back to email local part when name fields are null', () => {
    expect(displayName({ ...MEMBER_ROW, first_name: null, last_name: null } as never)).toBe(
      'viktor',
    );
  });
  it('returns "(no name)" when no name AND no email', () => {
    expect(
      displayName({
        ...MEMBER_ROW,
        first_name: null,
        last_name: null,
        email: null,
      } as never),
    ).toBe('(no name)');
  });
});

// ─── exportData ─────────────────────────────────────────────────────────

describe('TelegramGdprService.exportData', () => {
  it('throws NotFoundException with member_not_found when tg_user_id is unknown', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] }); // findMember → none
    const svc = new TelegramGdprService(fakeDirectus({ get }), fakeLocks());
    await expect(svc.exportData(BigInt(99887766))).rejects.toThrow(NotFoundException);
  });

  it('returns full export shape with member + registrations + check-ins + feedback', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [MEMBER_ROW] }) // findMember
      .mockResolvedValueOnce({ data: [REG_ROW, REG_ROW_CHECKED_IN] }) // registrations
      .mockResolvedValueOnce({ data: [FEEDBACK_ROW] }); // feedback
    const svc = new TelegramGdprService(fakeDirectus({ get }), fakeLocks());
    const out = await svc.exportData(BigInt(52128246));

    expect(out.member.member_id).toBe(MEMBER_ROW.id);
    expect(out.member.email).toBe('viktor@example.com');
    expect(out.profile_defaults).toEqual(MEMBER_ROW.profile_defaults);
    expect(out.preferences.notification_opt_ins).toEqual(MEMBER_ROW.notification_opt_ins);
    expect(out.registrations).toHaveLength(2);
    expect(out.check_ins).toHaveLength(1); // only REG_ROW_CHECKED_IN has checked_in_at
    expect(out.check_ins[0]?.event).toBe('evt-2');
    expect(out.feedback_submissions[0]?.message).toBe('smoke test');
    expect(out.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('queries /users with telegram_user_id filter (string-coerced for bigint)', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [] }) // findMember → none (we just want to check the query shape)
      .mockResolvedValue({ data: [] });
    const svc = new TelegramGdprService(fakeDirectus({ get }), fakeLocks());
    await expect(svc.exportData(BigInt(123456789))).rejects.toThrow();
    const call = decodeURIComponent(get.mock.calls[0]?.[0] as string);
    expect(call).toContain('"telegram_user_id":{"_eq":"123456789"}');
  });
});

// ─── deleteAccount ──────────────────────────────────────────────────────

describe('TelegramGdprService.deleteAccount', () => {
  it('rejects with member_not_found when tg_user_id unknown', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] });
    const svc = new TelegramGdprService(fakeDirectus({ get }), fakeLocks());
    await expect(
      svc.deleteAccount(BigInt(999), '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects with member_id_mismatch when confirm doesn't match", async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [MEMBER_ROW] });
    const svc = new TelegramGdprService(fakeDirectus({ get }), fakeLocks());
    await expect(
      svc.deleteAccount(BigInt(52128246), '99999999-9999-4999-8999-999999999999'),
    ).rejects.toThrow(NotFoundException);
  });

  it('patches gdpr_deleted_at + returns hard_delete_after 30 days out', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T10:00:00.000Z'));
    const get = vi.fn().mockResolvedValueOnce({ data: [MEMBER_ROW] });
    const patch = vi.fn().mockResolvedValue({});
    const svc = new TelegramGdprService(fakeDirectus({ get, patch }), fakeLocks());
    const result = await svc.deleteAccount(BigInt(52128246), MEMBER_ROW.id);

    expect(patch).toHaveBeenCalledWith(
      `/users/${MEMBER_ROW.id}`,
      expect.objectContaining({ gdpr_deleted_at: '2026-05-25T10:00:00.000Z' }),
    );
    expect(result.deleted_at).toBe('2026-05-25T10:00:00.000Z');
    expect(result.hard_delete_after).toBe('2026-06-24T10:00:00.000Z');
    vi.useRealTimers();
  });
});

// ─── hardDeleteDue (cron entrypoint) ───────────────────────────────────

describe('TelegramGdprService.hardDeleteDue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-25T10:00:00.000Z'));
  });

  it('returns purged=0 when no due rows', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] });
    const svc = new TelegramGdprService(fakeDirectus({ get }), fakeLocks());
    const result = await svc.hardDeleteDue();
    expect(result).toEqual({ purged: 0, errors: 0 });
  });

  it('queries with cutoff = now - 30 days', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] });
    const svc = new TelegramGdprService(fakeDirectus({ get }), fakeLocks());
    await svc.hardDeleteDue();
    const call = decodeURIComponent(get.mock.calls[0]?.[0] as string);
    // 2026-06-25 - 30d = 2026-05-26
    expect(call).toContain('"gdpr_deleted_at":{"_lte":"2026-05-26T10:00:00.000Z"}');
  });

  it('anonymizes registrations + feedback + drops user row for each due member', async () => {
    const due = { id: 'u-due' };
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [due] }) // due members
      .mockResolvedValueOnce({ data: [{ id: 'r1' }, { id: 'r2' }] }) // user's regs
      .mockResolvedValueOnce({ data: [{ id: 'f1' }] }); // user's feedback
    const patch = vi.fn().mockResolvedValue({});
    const del = vi.fn().mockResolvedValue({});
    const svc = new TelegramGdprService(fakeDirectus({ get, patch, delete: del }), fakeLocks());
    const result = await svc.hardDeleteDue();

    expect(result).toEqual({ purged: 1, errors: 0 });
    // Two registrations PATCHed to { user: null }
    expect(patch).toHaveBeenCalledWith('/items/registrations/r1', { user: null });
    expect(patch).toHaveBeenCalledWith('/items/registrations/r2', { user: null });
    // One feedback PATCHed (member + tg_user_id + tg_username all nulled)
    expect(patch).toHaveBeenCalledWith(
      '/items/feedback/f1',
      expect.objectContaining({
        member: null,
        telegram_user_id: null,
        telegram_username: null,
      }),
    );
    // User row dropped last
    expect(del).toHaveBeenCalledWith(`/users/${due.id}`);
  });

  it('continues on per-member failure (logs + counts errors)', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 'fails' }, { id: 'works' }] })
      .mockRejectedValueOnce(new Error('directus 500')) // fails on first member's reg fetch
      .mockResolvedValueOnce({ data: [] }) // works member's regs
      .mockResolvedValueOnce({ data: [] }); // works member's feedback
    const del = vi.fn().mockResolvedValue({});
    const svc = new TelegramGdprService(fakeDirectus({ get, delete: del }), fakeLocks());
    const result = await svc.hardDeleteDue();

    expect(result).toEqual({ purged: 1, errors: 1 });
    expect(del).toHaveBeenCalledWith('/users/works');
  });
});
