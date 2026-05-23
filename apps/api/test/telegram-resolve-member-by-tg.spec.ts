import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DB } from '../src/db';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { EmailService } from '../src/modules/email/email.service';
import { TelegramService, formatDisplayName } from '../src/modules/telegram/telegram.service';

// Phase Bot-B PR-2 — bot's /stop opt-out + /start welcome-back path.
// Contract pinned by sibling repo aiqadam-telegram-bot's
// MemberByTgResponse pydantic model. Field renames here require a
// coordinated cross-repo PR.

describe('formatDisplayName', () => {
  it('joins first + last when both present', () => {
    expect(
      formatDisplayName({
        first_name: 'Viktor',
        last_name: 'Drukker',
        telegram_username: 'vd',
        email: 'v@example.com',
      }),
    ).toBe('Viktor Drukker');
  });

  it('uses first_name alone when last_name is null', () => {
    expect(
      formatDisplayName({
        first_name: 'Binali',
        last_name: null,
        telegram_username: null,
        email: 'b@example.com',
      }),
    ).toBe('Binali');
  });

  it('falls back to @telegram_username when no first/last', () => {
    expect(
      formatDisplayName({
        first_name: null,
        last_name: null,
        telegram_username: 'aiqadam_user',
        email: 'a@example.com',
      }),
    ).toBe('@aiqadam_user');
  });

  it('falls back to email when no first/last and no handle', () => {
    expect(
      formatDisplayName({
        first_name: null,
        last_name: null,
        telegram_username: null,
        email: 'lastresort@example.com',
      }),
    ).toBe('lastresort@example.com');
  });

  it('trims trailing whitespace when only first_name is non-empty', () => {
    expect(
      formatDisplayName({
        first_name: 'Solo',
        last_name: '',
        telegram_username: null,
        email: 's@example.com',
      }),
    ).toBe('Solo');
  });
});

describe('TelegramService.resolveMemberByTgUserId', () => {
  function makeService(getMock: ReturnType<typeof vi.fn>): TelegramService {
    return new TelegramService(
      {} as unknown as DB,
      { get: getMock } as unknown as DirectusClient,
      {} as unknown as EmailService,
    );
  }

  it('returns the wire shape when a member is found', async () => {
    const getMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'mem-1',
          first_name: 'Viktor',
          last_name: 'Drukker',
          email: 'v@example.com',
          country: 'uz',
          telegram_user_id: '8888777766',
          telegram_username: 'vd',
          telegram_opted_out_at: null,
        },
      ],
    });
    const svc = makeService(getMock);

    const out = await svc.resolveMemberByTgUserId(BigInt('8888777766'));

    expect(out).toEqual({
      member_id: 'mem-1',
      tenant: 'uz',
      display_name: 'Viktor Drukker',
      telegram_user_id: 8888777766,
      telegram_opted_out_at: null,
    });
  });

  it('throws NotFoundException when no member matches', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await expect(svc.resolveMemberByTgUserId(BigInt('12345'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('preserves opted_out_at timestamp when member has opted out', async () => {
    const getMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'mem-2',
          first_name: 'Past',
          last_name: 'User',
          email: 'p@example.com',
          country: 'kz',
          telegram_user_id: 999,
          telegram_username: null,
          telegram_opted_out_at: '2026-05-22T12:00:00.000Z',
        },
      ],
    });
    const svc = makeService(getMock);

    const out = await svc.resolveMemberByTgUserId(BigInt('999'));

    expect(out.telegram_opted_out_at).toBe('2026-05-22T12:00:00.000Z');
  });

  it('encodes tg_user_id in the Directus filter (no path injection)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.resolveMemberByTgUserId(BigInt('12345')).catch(() => {});

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[telegram_user_id][_eq]=12345');
  });

  it('defaults tenant to empty string when country is null (degraded path; bot can re-ask)', async () => {
    const getMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'mem-3',
          first_name: 'No',
          last_name: 'Country',
          email: 'n@example.com',
          country: null,
          telegram_user_id: 7,
          telegram_username: null,
          telegram_opted_out_at: null,
        },
      ],
    });
    const svc = makeService(getMock);

    const out = await svc.resolveMemberByTgUserId(BigInt('7'));

    expect(out.tenant).toBe('');
  });
});
