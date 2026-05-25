import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { EmailService } from '../src/modules/email/email.service';
import { tgLinkChallenges } from '../src/modules/telegram/schema';
import {
  TelegramService,
  generateSixDigitCode,
  maskEmail,
  sha256Hex,
} from '../src/modules/telegram/telegram.service';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);

afterAll(async () => {
  await client.end();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FakeMember {
  id: string;
  email: string;
  country: string;
}

function makeService(opts: {
  members?: FakeMember[];
  emailSend?: ReturnType<typeof vi.fn>;
  directusPatch?: ReturnType<typeof vi.fn>;
}): {
  service: TelegramService;
  emailSend: ReturnType<typeof vi.fn>;
  directusPatch: ReturnType<typeof vi.fn>;
  directusGet: ReturnType<typeof vi.fn>;
} {
  const emailSend = opts.emailSend ?? vi.fn().mockResolvedValue(undefined);
  const directusPatch = opts.directusPatch ?? vi.fn().mockResolvedValue({ data: { id: 'ok' } });
  const directusGet = vi.fn(async (path: string) => {
    const match = path.match(/email\]\[_eq\]=([^&]+)/);
    if (!match) return { data: [] };
    const email = decodeURIComponent(match[1] ?? '');
    const found = (opts.members ?? []).find((m) => m.email === email);
    return found ? { data: [found] } : { data: [] };
  });
  const fakeDirectus = {
    get: directusGet,
    post: vi.fn(),
    patch: directusPatch,
    delete: vi.fn(),
  } as unknown as DirectusClient;
  const fakeEmails = { send: emailSend } as unknown as EmailService;
  const service = new TelegramService(db, fakeDirectus, fakeEmails);
  return { service, emailSend, directusPatch, directusGet };
}

beforeEach(async () => {
  await db.delete(tgLinkChallenges);
});

// Helper: read the single challenge that startLink just persisted.
// Tests insert exactly one row at a time, so this is unambiguous and
// keeps the assertion-heavy bodies free of non-null assertions.
async function getOnlyChallengeId(): Promise<string> {
  const [row] = await db.select().from(tgLinkChallenges);
  if (!row) throw new Error('precondition: expected one challenge row');
  return row.id;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('generateSixDigitCode', () => {
  it('always returns 6 digits', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateSixDigitCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe('sha256Hex', () => {
  it('is deterministic and 64 hex chars', () => {
    const h = sha256Hex('123456');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('123456')).toBe(h);
  });
});

describe('maskEmail', () => {
  it('keeps the first char + domain', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@example.com');
    expect(maskEmail('b@x.io')).toBe('b@x.io'); // single-char local
    expect(maskEmail('not-an-email')).toBe('***@***');
  });
});

// ─── startLink ────────────────────────────────────────────────────────────────

describe('TelegramService.startLink', () => {
  it('issues a challenge and sends email when member exists', async () => {
    const { service, emailSend } = makeService({
      members: [{ id: 'm-1', email: 'alice@example.com', country: 'uz' }],
    });
    const result = await service.startLink(123456789n, 'alice@example.com');
    expect(result.challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.sentToEmailMasked).toBe('a***@example.com');
    expect(emailSend).toHaveBeenCalledTimes(1);
    const sent = emailSend.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      to: 'alice@example.com',
      subject: expect.stringContaining('Telegram link code'),
    });
    expect(sent.text).toMatch(/\b\d{6}\b/); // 6-digit code appears in body
  });

  it('issues a challenge but does NOT send email when member missing — email-enum safe', async () => {
    const { service, emailSend } = makeService({ members: [] });
    const result = await service.startLink(123456789n, 'ghost@example.com');
    expect(result.challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.sentToEmailMasked).toBe('g***@example.com');
    expect(emailSend).not.toHaveBeenCalled();
    // Challenge row is still persisted (so confirm fails cleanly with
    // not-found, not "invalid_code").
    const rows = await db.select().from(tgLinkChallenges);
    expect(rows).toHaveLength(1);
  });

  it('rate-limits per tg_user_id after 3 active challenges', async () => {
    const { service } = makeService({
      members: [{ id: 'm-1', email: 'alice@example.com', country: 'uz' }],
    });
    await service.startLink(42n, 'alice@example.com');
    await service.startLink(42n, 'alice@example.com');
    await service.startLink(42n, 'alice@example.com');
    await expect(service.startLink(42n, 'alice@example.com')).rejects.toThrow(BadRequestException);
  });

  it('does not rate-limit across different tg_user_ids', async () => {
    const { service } = makeService({
      members: [{ id: 'm-1', email: 'alice@example.com', country: 'uz' }],
    });
    await service.startLink(1n, 'alice@example.com');
    await service.startLink(2n, 'alice@example.com');
    await service.startLink(3n, 'alice@example.com');
    // tg user 4 has 0 active — should succeed.
    await expect(service.startLink(4n, 'alice@example.com')).resolves.toBeTruthy();
  });
});

// ─── confirmLink ──────────────────────────────────────────────────────────────

describe('TelegramService.confirmLink', () => {
  it('completes the link when code + tg_user_id + member all match', async () => {
    const { service, emailSend, directusPatch } = makeService({
      members: [{ id: 'm-1', email: 'alice@example.com', country: 'uz' }],
    });
    await service.startLink(99n, 'alice@example.com');
    const sentMsg = emailSend.mock.calls[0]?.[0] as { text: string };
    const code = (sentMsg.text.match(/\b(\d{6})\b/) ?? [])[1] ?? '';
    expect(code).toMatch(/^\d{6}$/);

    // Retrieve challenge_id from DB (controller would pass it back; here
    // we just read what startLink wrote).

    const result = await service.confirmLink({
      challengeId: await getOnlyChallengeId(),
      code,
      tgUserId: 99n,
      tgUsername: 'alice_tg',
    });
    expect(result).toEqual({ memberId: 'm-1', tenant: 'uz' });
    expect(directusPatch).toHaveBeenCalledWith(
      '/users/m-1',
      expect.objectContaining({
        telegram_user_id: '99',
        telegram_username: 'alice_tg',
        telegram_linked_at: expect.any(String),
        telegram_opted_out_at: null,
        // #362 — re-link recovery clears any prior soft-delete marker.
        gdpr_deleted_at: null,
      }),
    );

    // Challenge marked consumed.
    const [after] = await db.select().from(tgLinkChallenges);
    expect(after?.consumedAt).toBeTruthy();
  });

  it('rejects a wrong code and bumps attempts', async () => {
    const { service } = makeService({
      members: [{ id: 'm-1', email: 'alice@example.com', country: 'uz' }],
    });
    await service.startLink(99n, 'alice@example.com');
    await expect(
      service.confirmLink({
        challengeId: await getOnlyChallengeId(),
        code: '000000',
        tgUserId: 99n,
        tgUsername: null,
      }),
    ).rejects.toThrow(UnauthorizedException);
    const [after] = await db.select().from(tgLinkChallenges);
    expect(after?.attempts).toBe(1);
    expect(after?.consumedAt).toBeNull();
  });

  it('rejects after MAX_CONFIRM_ATTEMPTS even with the correct code', async () => {
    const { service, emailSend } = makeService({
      members: [{ id: 'm-1', email: 'alice@example.com', country: 'uz' }],
    });
    await service.startLink(99n, 'alice@example.com');
    const code = (emailSend.mock.calls[0]?.[0].text.match(/\b(\d{6})\b/) ?? [])[1] ?? '';

    for (let i = 0; i < 5; i++) {
      await expect(
        service.confirmLink({
          challengeId: await getOnlyChallengeId(),
          code: '000000',
          tgUserId: 99n,
          tgUsername: null,
        }),
      ).rejects.toThrow(UnauthorizedException);
    }

    // Even the right code now fails.
    await expect(
      service.confirmLink({
        challengeId: await getOnlyChallengeId(),
        code,
        tgUserId: 99n,
        tgUsername: null,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a mismatched tg_user_id (challenge-hijack defense) and bumps attempts', async () => {
    const { service, emailSend } = makeService({
      members: [{ id: 'm-1', email: 'alice@example.com', country: 'uz' }],
    });
    await service.startLink(99n, 'alice@example.com');
    const code = (emailSend.mock.calls[0]?.[0].text.match(/\b(\d{6})\b/) ?? [])[1] ?? '';

    await expect(
      service.confirmLink({
        challengeId: await getOnlyChallengeId(),
        code,
        tgUserId: 100n, // wrong TG user
        tgUsername: null,
      }),
    ).rejects.toThrow(UnauthorizedException);

    const [after] = await db.select().from(tgLinkChallenges);
    expect(after?.attempts).toBe(1);
    expect(after?.consumedAt).toBeNull();
  });

  it('rejects an expired challenge', async () => {
    const { service } = makeService({
      members: [{ id: 'm-1', email: 'alice@example.com', country: 'uz' }],
    });
    await service.startLink(99n, 'alice@example.com');
    // Force-expire.
    await db
      .update(tgLinkChallenges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(tgLinkChallenges.id, await getOnlyChallengeId()));

    await expect(
      service.confirmLink({
        challengeId: await getOnlyChallengeId(),
        code: '000000',
        tgUserId: 99n,
        tgUsername: null,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns 404-shaped error when code is right but no member for the email', async () => {
    const { service, emailSend } = makeService({ members: [] });
    await service.startLink(99n, 'ghost@example.com');
    // No email was sent (no member) → grab the code from the DB hash by
    // brute-forcing? No — we generated it but didn't expose it. Easier:
    // just patch the row's code_hash to one we know.
    const knownCode = '424242';
    await db.update(tgLinkChallenges).set({ codeHash: sha256Hex(knownCode) });

    await expect(
      service.confirmLink({
        challengeId: await getOnlyChallengeId(),
        code: knownCode,
        tgUserId: 99n,
        tgUsername: null,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('rejects with member_missing_tenant when member.country is null', async () => {
    const { service, emailSend } = makeService({
      // @ts-expect-error -- intentionally testing the bad-data path
      members: [{ id: 'm-1', email: 'alice@example.com', country: null }],
    });
    await service.startLink(99n, 'alice@example.com');
    const code = (emailSend.mock.calls[0]?.[0].text.match(/\b(\d{6})\b/) ?? [])[1] ?? '';

    await expect(
      service.confirmLink({
        challengeId: await getOnlyChallengeId(),
        code,
        tgUserId: 99n,
        tgUsername: null,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

// ─── optOut ───────────────────────────────────────────────────────────────────

describe('TelegramService.optOut', () => {
  it('PATCHes telegram_opted_out_at on the directus_user', async () => {
    const { service, directusPatch } = makeService({});
    await service.optOut('m-1');
    expect(directusPatch).toHaveBeenCalledWith(
      '/users/m-1',
      expect.objectContaining({
        telegram_opted_out_at: expect.any(String),
      }),
    );
  });
});

// ─── purgeOldChallenges ──────────────────────────────────────────────────────

describe('TelegramService.purgeOldChallenges', () => {
  it('deletes expired challenges', async () => {
    const { service } = makeService({
      members: [{ id: 'm-1', email: 'alice@example.com', country: 'uz' }],
    });
    await service.startLink(99n, 'alice@example.com');
    // Force-expire well in the past.
    await db.update(tgLinkChallenges).set({ expiresAt: new Date(Date.now() - 60_000) });

    const n = await service.purgeOldChallenges(new Date());
    expect(n).toBe(1);
    const rows = await db.select().from(tgLinkChallenges);
    expect(rows).toHaveLength(0);
  });
});
