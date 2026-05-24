import { BadRequestException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { EmailService } from '../src/modules/email/email.service';
import {
  type FeedbackInput,
  MAX_MESSAGE_LENGTH,
  RATE_LIMIT_PER_HOUR,
  TelegramFeedbackService,
  formatContextLines,
  formatSenderLine,
  formatSubject,
} from '../src/modules/telegram/telegram-feedback.service';

// aiqadam#344 — wire shape pinned by sibling repo's pydantic. Any field
// rename here must coordinate a cross-repo PR.

function fakeDirectus(opts: {
  get?: ReturnType<typeof vi.fn>;
  post?: ReturnType<typeof vi.fn>;
}): DirectusClient {
  return {
    get: opts.get ?? vi.fn(),
    post: opts.post ?? vi.fn(),
  } as unknown as DirectusClient;
}
function fakeEmail(send?: ReturnType<typeof vi.fn>): EmailService {
  return { send: send ?? vi.fn().mockResolvedValue(undefined) } as unknown as EmailService;
}

const BASE_INPUT: FeedbackInput = {
  tg_user_id: 52128246n,
  tg_username: 'viktordrukker',
  category: 'question',
  message: 'Where is the Yandex Maps link for IMPACT.T?',
};

const RATE_LIMIT_OK = { data: [{ count: 0 }] };
const MEMBER_HIT = {
  data: [
    {
      id: 'mem-1',
      first_name: 'Viktor',
      last_name: 'Drukker',
      email: 'viktor@example.com',
      country: 'uz',
    },
  ],
};
const MEMBER_MISS = { data: [] };
const INSERT_OK = {
  data: { id: 'fb-1', date_created: '2026-05-24T15:00:00.000Z' },
};

// ─── formatSubject ───────────────────────────────────────────────────────────

describe('formatSubject', () => {
  it('prefixes with category + truncates long messages', () => {
    const long = 'x'.repeat(200);
    expect(formatSubject('question', long)).toMatch(/^\[Bot Feedback \/ question\] x+…$/);
    expect(formatSubject('question', long).length).toBeLessThanOrEqual(120);
  });
  it('collapses whitespace inline', () => {
    expect(formatSubject('bug', 'a\n\nb\tc')).toBe('[Bot Feedback / bug] a b c');
  });
  it('passes through short messages whole', () => {
    expect(formatSubject('other', 'short msg')).toBe('[Bot Feedback / other] short msg');
  });
});

// ─── formatSenderLine ────────────────────────────────────────────────────────

describe('formatSenderLine', () => {
  it('uses @handle + member name when both known', () => {
    expect(formatSenderLine(BASE_INPUT, { first_name: 'Viktor', last_name: 'Drukker' })).toBe(
      'From: @viktordrukker (Viktor Drukker, tg_user_id 52128246)',
    );
  });
  it('falls back to "(no username)" when tg_username missing', () => {
    expect(formatSenderLine({ ...BASE_INPUT, tg_username: null }, { first_name: 'V' })).toBe(
      'From: (no username) (V, tg_user_id 52128246)',
    );
  });
  it('falls back to "unlinked TG user" when no member record', () => {
    expect(formatSenderLine(BASE_INPUT, null)).toContain('unlinked TG user');
  });
});

// ─── formatContextLines ──────────────────────────────────────────────────────

describe('formatContextLines', () => {
  it('always includes feedback_id', () => {
    const lines = formatContextLines(BASE_INPUT, null, 'fb-1');
    expect(lines[0]).toBe('Feedback ID: fb-1');
  });
  it('adds sender email + tenant when member known', () => {
    const lines = formatContextLines(BASE_INPUT, { email: 'v@example.com', country: 'uz' }, 'fb-1');
    expect(lines).toContain('Sender email: v@example.com');
    expect(lines).toContain('Tenant: uz');
  });
  it('adds event_id + registration_id from context', () => {
    const lines = formatContextLines(
      { ...BASE_INPUT, context: { event_id: 'evt-1', registration_id: 'reg-1' } },
      null,
      'fb-1',
    );
    expect(lines).toContain('Event: evt-1');
    expect(lines).toContain('Registration: reg-1');
  });
  it('omits the lines whose data is missing', () => {
    const lines = formatContextLines(BASE_INPUT, null, 'fb-1');
    expect(lines.find((l) => l.startsWith('Event:'))).toBeUndefined();
    expect(lines.find((l) => l.startsWith('Registration:'))).toBeUndefined();
    expect(lines.find((l) => l.startsWith('Correlation:'))).toBeUndefined();
  });
});

// ─── TelegramFeedbackService.submit ──────────────────────────────────────────

describe('TelegramFeedbackService.submit', () => {
  it('rejects empty messages (post-trim) as 400', async () => {
    const svc = new TelegramFeedbackService(fakeDirectus({}), fakeEmail());
    await expect(svc.submit({ ...BASE_INPUT, message: '   \n  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects oversized messages as 400 with {error:"message_too_long"}', async () => {
    const svc = new TelegramFeedbackService(fakeDirectus({}), fakeEmail());
    const big = 'x'.repeat(MAX_MESSAGE_LENGTH + 1);
    try {
      await svc.submit({ ...BASE_INPUT, message: big });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const resp = (e as BadRequestException).getResponse() as { error: string; max: number };
      expect(resp.error).toBe('message_too_long');
      expect(resp.max).toBe(MAX_MESSAGE_LENGTH);
    }
  });

  it('rate-limits at RATE_LIMIT_PER_HOUR (429)', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [{ count: RATE_LIMIT_PER_HOUR }] });
    const svc = new TelegramFeedbackService(fakeDirectus({ get }), fakeEmail());
    try {
      await svc.submit(BASE_INPUT);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
      const resp = (e as HttpException).getResponse() as { error: string; limit: number };
      expect(resp.error).toBe('rate_limited');
      expect(resp.limit).toBe(RATE_LIMIT_PER_HOUR);
    }
  });

  it('persists the feedback row with resolved member + correlation id', async () => {
    const get = vi.fn().mockResolvedValueOnce(RATE_LIMIT_OK).mockResolvedValueOnce(MEMBER_HIT);
    const post = vi.fn().mockResolvedValueOnce(INSERT_OK);
    const svc = new TelegramFeedbackService(fakeDirectus({ get, post }), fakeEmail());

    await svc.submit({
      ...BASE_INPUT,
      correlation_id: '11111111-1111-1111-1111-111111111111',
      context: { event_id: 'evt-1' },
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe('/items/feedback');
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      telegram_user_id: '52128246',
      telegram_username: 'viktordrukker',
      member: 'mem-1',
      category: 'question',
      correlation_id: '11111111-1111-1111-1111-111111111111',
      context: { event_id: 'evt-1' },
    });
  });

  it('returns the persisted feedback_id + submitted_at', async () => {
    const get = vi.fn().mockResolvedValueOnce(RATE_LIMIT_OK).mockResolvedValueOnce(MEMBER_MISS);
    const post = vi.fn().mockResolvedValueOnce(INSERT_OK);
    const svc = new TelegramFeedbackService(fakeDirectus({ get, post }), fakeEmail());

    const out = await svc.submit(BASE_INPUT);

    expect(out).toEqual({
      feedback_id: 'fb-1',
      submitted_at: '2026-05-24T15:00:00.000Z',
    });
  });

  it('persists with member=null for unlinked tg users', async () => {
    const get = vi.fn().mockResolvedValueOnce(RATE_LIMIT_OK).mockResolvedValueOnce(MEMBER_MISS);
    const post = vi.fn().mockResolvedValueOnce(INSERT_OK);
    const svc = new TelegramFeedbackService(fakeDirectus({ get, post }), fakeEmail());

    await svc.submit(BASE_INPUT);
    expect(post.mock.calls[0]?.[1]).toMatchObject({ member: null });
  });

  it('lets the submission through when rate-limit query fails (graceful degrade)', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('directus 500'))
      .mockResolvedValueOnce(MEMBER_MISS);
    const post = vi.fn().mockResolvedValueOnce(INSERT_OK);
    const svc = new TelegramFeedbackService(fakeDirectus({ get, post }), fakeEmail());

    const out = await svc.submit(BASE_INPUT);
    expect(out.feedback_id).toBe('fb-1');
  });

  it('sends an email to the operator after persistence', async () => {
    const get = vi.fn().mockResolvedValueOnce(RATE_LIMIT_OK).mockResolvedValueOnce(MEMBER_HIT);
    const post = vi.fn().mockResolvedValueOnce(INSERT_OK);
    const send = vi.fn().mockResolvedValue(undefined);
    const svc = new TelegramFeedbackService(fakeDirectus({ get, post }), fakeEmail(send));

    await svc.submit(BASE_INPUT);
    // Email is fire-and-forget — wait a tick for the microtask to run.
    await new Promise((r) => setTimeout(r, 0));

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]?.[0];
    expect(message.to).toBe('hello@aiqadam.org'); // default
    expect(message.subject).toMatch(/^\[Bot Feedback \/ question\]/);
    expect(message.text).toContain('viktordrukker');
    expect(message.text).toContain(BASE_INPUT.message);
  });

  it('does NOT roll back the row if email send fails', async () => {
    const get = vi.fn().mockResolvedValueOnce(RATE_LIMIT_OK).mockResolvedValueOnce(MEMBER_MISS);
    const post = vi.fn().mockResolvedValueOnce(INSERT_OK);
    const send = vi.fn().mockRejectedValueOnce(new Error('SMTP down'));
    const svc = new TelegramFeedbackService(fakeDirectus({ get, post }), fakeEmail(send));

    const out = await svc.submit(BASE_INPUT);
    expect(out.feedback_id).toBe('fb-1');
  });
});
