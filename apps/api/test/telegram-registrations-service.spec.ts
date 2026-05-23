import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { DirectusError } from '../src/modules/directus/directus.client';
import type { OutboxPublisher } from '../src/modules/telegram/outbox-publisher.service';
import {
  DEFAULT_REGISTRATION_CONSENTS,
  DEFAULT_REGISTRATION_FIELDS,
} from '../src/modules/telegram/telegram-registration-schema.service';
import {
  TelegramRegistrationsService,
  formatMemberDisplayName,
  renderRegistrationConfirmedTemplate,
  validateConsents,
  validateProfile,
} from '../src/modules/telegram/telegram-registrations.service';

// Phase Bot-B PR-1.3b — Telegram-as-IdP activation endpoint.
// Contract pinned by sibling repo's RegisterForEventInput +
// RegistrationResult + MemberLookupResponse pydantic models.
// Field renames here require a coordinated cross-repo PR.

function fakeDirectus() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

function fakeOutbox() {
  return { publish: vi.fn().mockResolvedValue(true) };
}

function fakeDb() {
  // Minimum mock: transaction(callback) just calls the callback with a fake tx.
  return {
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
  };
}

function makeService(
  fakeDir: ReturnType<typeof fakeDirectus>,
  opts: {
    outbox?: ReturnType<typeof fakeOutbox>;
    db?: ReturnType<typeof fakeDb>;
  } = {},
): TelegramRegistrationsService {
  return new TelegramRegistrationsService(
    fakeDir as unknown as DirectusClient,
    (opts.outbox ?? fakeOutbox()) as unknown as OutboxPublisher,
    (opts.db ?? fakeDb()) as unknown as Db,
  );
}

const EVENT_ROW = {
  id: 'evt-1',
  slug: 'ai-meetup',
  title: 'AI Meetup',
  starts_at: '2026-06-20T03:00:00.000Z',
  country: 'uz',
  location: 'IMPACT.T',
  status: 'published',
  visibility_scope: 'public',
  registration_open: true,
  registration_schema: null,
};

const EXISTING_MEMBER = {
  id: 'mem-1',
  email: 'v@example.com',
  first_name: 'Viktor',
  last_name: 'Drukker',
  telegram_user_id: null,
};

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('formatMemberDisplayName', () => {
  it('joins first + last', () => {
    expect(formatMemberDisplayName({ first_name: 'A', last_name: 'B', email: 'x@y.z' })).toBe(
      'A B',
    );
  });

  it('falls back to email when both names null', () => {
    expect(formatMemberDisplayName({ first_name: null, last_name: null, email: 'x@y.z' })).toBe(
      'x@y.z',
    );
  });
});

describe('validateProfile', () => {
  it('passes on the default schema with valid name + email', () => {
    expect(() =>
      validateProfile({ name: 'Viktor', email: 'v@example.com' }, DEFAULT_REGISTRATION_FIELDS),
    ).not.toThrow();
  });

  it('rejects missing required field', () => {
    expect(() => validateProfile({ email: 'v@example.com' }, DEFAULT_REGISTRATION_FIELDS)).toThrow(
      BadRequestException,
    );
  });

  it('rejects empty-string required field', () => {
    expect(() =>
      validateProfile({ name: '   ', email: 'v@example.com' }, DEFAULT_REGISTRATION_FIELDS),
    ).toThrow(BadRequestException);
  });

  it('rejects malformed email', () => {
    expect(() =>
      validateProfile({ name: 'V', email: 'not-an-email' }, DEFAULT_REGISTRATION_FIELDS),
    ).toThrow(BadRequestException);
  });

  it('enforces min_length / max_length when set', () => {
    const fields = [
      {
        key: 'short',
        type: 'text' as const,
        label: 'Short',
        required: true,
        hint: null,
        validation: { min_length: 5, max_length: 10 },
        options: null,
      },
    ];
    expect(() => validateProfile({ short: 'abc' }, fields)).toThrow(BadRequestException);
    expect(() => validateProfile({ short: 'abcdefghijk' }, fields)).toThrow(BadRequestException);
    expect(() => validateProfile({ short: 'abcdef' }, fields)).not.toThrow();
  });

  it('rejects non-number for number-typed field', () => {
    const fields = [
      {
        key: 'age',
        type: 'number' as const,
        label: 'Age',
        required: true,
        hint: null,
        validation: null,
        options: null,
      },
    ];
    expect(() => validateProfile({ age: 'twenty' }, fields)).toThrow(BadRequestException);
    expect(() => validateProfile({ age: 20 }, fields)).not.toThrow();
  });

  it('skips validation when optional field is missing', () => {
    const fields = [
      {
        key: 'company',
        type: 'text' as const,
        label: 'Company',
        required: false,
        hint: null,
        validation: null,
        options: null,
      },
    ];
    expect(() => validateProfile({}, fields)).not.toThrow();
  });
});

describe('validateConsents', () => {
  it('passes when all required consents are true', () => {
    expect(() =>
      validateConsents({ events: true, newsletter: false }, DEFAULT_REGISTRATION_CONSENTS),
    ).not.toThrow();
  });

  it('rejects when a required consent is false', () => {
    expect(() => validateConsents({ events: false }, DEFAULT_REGISTRATION_CONSENTS)).toThrow(
      BadRequestException,
    );
  });

  it('rejects when a required consent is missing', () => {
    expect(() => validateConsents({}, DEFAULT_REGISTRATION_CONSENTS)).toThrow(BadRequestException);
  });

  it('ignores optional consents (newsletter)', () => {
    expect(() => validateConsents({ events: true }, DEFAULT_REGISTRATION_CONSENTS)).not.toThrow();
  });
});

// ─── lookupByEmail ───────────────────────────────────────────────────────────

describe('TelegramRegistrationsService.lookupByEmail', () => {
  it('returns {member_id, display_name} on hit', async () => {
    const fake = fakeDirectus();
    fake.get.mockResolvedValueOnce({ data: [EXISTING_MEMBER] });
    const svc = makeService(fake);

    const out = await svc.lookupByEmail('v@example.com');

    expect(out).toEqual({ member_id: 'mem-1', display_name: 'Viktor Drukker' });
  });

  it('throws NotFoundException with {error:"member_not_found"} on miss', async () => {
    const fake = fakeDirectus();
    fake.get.mockResolvedValueOnce({ data: [] });
    const svc = makeService(fake);

    try {
      await svc.lookupByEmail('nobody@example.com');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('member_not_found');
    }
  });

  it('URL-encodes the email in the filter', async () => {
    const fake = fakeDirectus();
    fake.get.mockResolvedValueOnce({ data: [] });
    const svc = makeService(fake);

    await svc.lookupByEmail('user+tag@example.com').catch(() => {});

    const call = fake.get.mock.calls[0]?.[0] as string;
    expect(call).toContain('user%2Btag%40example.com');
  });
});

// ─── register — silent match path ─────────────────────────────────────────────

describe('TelegramRegistrationsService.register', () => {
  function happyPath(opts: { existing?: typeof EXISTING_MEMBER | null } = {}) {
    const fake = fakeDirectus();
    fake.get
      .mockResolvedValueOnce({ data: EVENT_ROW }) // findEventOrThrow
      .mockResolvedValueOnce({
        data: opts.existing === null ? [] : [opts.existing ?? EXISTING_MEMBER],
      }) // findMemberByEmail
      .mockResolvedValueOnce({ data: [] }); // findRegistration (no dupe)
    fake.post
      .mockResolvedValueOnce({ data: { id: 'reg-99' } }) // insertRegistration
      .mockResolvedValueOnce({ data: { id: 'consent-1' } }); // recordConsents: events
    return fake;
  }

  it('uses existing member on email match; was_new_member=false', async () => {
    const fake = happyPath();
    const svc = makeService(fake);

    const out = await svc.register({
      event_id: 'evt-1',
      telegram_user_id: BigInt(123),
      telegram_username: 'viktor',
      profile: { name: 'Viktor', email: 'v@example.com' },
      consents: { events: true, newsletter: false },
    });

    expect(out.member_id).toBe('mem-1');
    expect(out.was_new_member).toBe(false);
    expect(out.registration_id).toBe('reg-99');
    expect(out.starts_at).toBe(EVENT_ROW.starts_at);
    expect(out.title).toBe('AI Meetup');
    expect(out.qr_token).toBeNull(); // Bundle 3
  });

  it('CREATES a Directus member when no email match; was_new_member=true', async () => {
    const fake = fakeDirectus();
    fake.get
      .mockResolvedValueOnce({ data: EVENT_ROW }) // event
      .mockResolvedValueOnce({ data: [] }) // member by email — miss
      .mockResolvedValueOnce({ data: [] }); // registration check — no dupe
    fake.post
      .mockResolvedValueOnce({ data: { id: 'mem-new' } }) // POST /users (createMemberFromProfile)
      .mockResolvedValueOnce({ data: { id: 'reg-100' } }) // POST /items/registrations
      .mockResolvedValueOnce({ data: { id: 'consent-1' } }); // member_consents

    const svc = makeService(fake);

    const out = await svc.register({
      event_id: 'evt-1',
      telegram_user_id: BigInt(456),
      telegram_username: null,
      profile: { name: 'Newbie', email: 'new@example.com' },
      consents: { events: true },
    });

    expect(out.member_id).toBe('mem-new');
    expect(out.was_new_member).toBe(true);
    // First POST is to /users — assert payload shape
    const createCall = fake.post.mock.calls[0];
    expect(createCall?.[0]).toBe('/users');
    const createBody = createCall?.[1] as Record<string, unknown>;
    expect(createBody.email).toBe('new@example.com');
    expect(createBody.first_name).toBe('Newbie');
    expect(createBody.country).toBe('uz'); // inherits event country
    expect(createBody.provider).toBe('telegram');
  });

  it('backfills telegram_user_id on existing member when not already set', async () => {
    const fake = happyPath();
    const svc = makeService(fake);

    await svc.register({
      event_id: 'evt-1',
      telegram_user_id: BigInt(789),
      telegram_username: 'viktor',
      profile: { name: 'Viktor', email: 'v@example.com' },
      consents: { events: true },
    });

    // Should have PATCHed /users/mem-1 with the TG link fields
    const patchCalls = fake.patch.mock.calls;
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]?.[0]).toBe('/users/mem-1');
    const patchBody = patchCalls[0]?.[1] as Record<string, unknown>;
    expect(patchBody.telegram_user_id).toBe('789');
    expect(patchBody.telegram_username).toBe('viktor');
    expect(patchBody.telegram_opted_out_at).toBeNull();
  });

  it('does NOT backfill telegram_user_id when member already has one (preserves first-link timestamp)', async () => {
    const fake = happyPath({ existing: { ...EXISTING_MEMBER, telegram_user_id: '111' } });
    const svc = makeService(fake);

    await svc.register({
      event_id: 'evt-1',
      telegram_user_id: BigInt(789),
      telegram_username: 'viktor',
      profile: { name: 'Viktor', email: 'v@example.com' },
      consents: { events: true },
    });

    expect(fake.patch.mock.calls).toHaveLength(0);
  });

  it('409 ConflictException when (event, user) already registered', async () => {
    const fake = fakeDirectus();
    fake.get
      .mockResolvedValueOnce({ data: EVENT_ROW })
      .mockResolvedValueOnce({ data: [EXISTING_MEMBER] })
      .mockResolvedValueOnce({
        data: [{ id: 'reg-existing', event: 'evt-1', user: 'mem-1', checkin_code: null }],
      });
    const svc = makeService(fake);

    try {
      await svc.register({
        event_id: 'evt-1',
        telegram_user_id: BigInt(123),
        telegram_username: null,
        profile: { name: 'Viktor', email: 'v@example.com' },
        consents: { events: true },
      });
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      const resp = (e as ConflictException).getResponse() as Record<string, unknown>;
      expect(resp.error).toBe('already_registered');
      expect(resp.registration_id).toBe('reg-existing');
    }
  });

  it('400 when event not_published', async () => {
    const fake = fakeDirectus();
    fake.get.mockResolvedValueOnce({ data: { ...EVENT_ROW, status: 'draft' } });
    const svc = makeService(fake);

    await expect(
      svc.register({
        event_id: 'evt-1',
        telegram_user_id: BigInt(1),
        telegram_username: null,
        profile: { name: 'Viktor', email: 'v@example.com' },
        consents: { events: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 when registration_open=false', async () => {
    const fake = fakeDirectus();
    fake.get.mockResolvedValueOnce({ data: { ...EVENT_ROW, registration_open: false } });
    const svc = makeService(fake);

    await expect(
      svc.register({
        event_id: 'evt-1',
        telegram_user_id: BigInt(1),
        telegram_username: null,
        profile: { name: 'Viktor', email: 'v@example.com' },
        consents: { events: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404 with {error:event_not_found} when event lookup 404s', async () => {
    const fake = fakeDirectus();
    fake.get.mockRejectedValueOnce(new DirectusError(404, '/items/events/x', 'not found'));
    const svc = makeService(fake);

    try {
      await svc.register({
        event_id: '11111111-1111-1111-1111-111111111111',
        telegram_user_id: BigInt(1),
        telegram_username: null,
        profile: { name: 'Viktor', email: 'v@example.com' },
        consents: { events: true },
      });
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
    }
  });

  it('400 when profile is missing email', async () => {
    const fake = fakeDirectus();
    fake.get.mockResolvedValueOnce({ data: EVENT_ROW });
    const svc = makeService(fake);

    await expect(
      svc.register({
        event_id: 'evt-1',
        telegram_user_id: BigInt(1),
        telegram_username: null,
        profile: { name: 'V' }, // no email
        consents: { events: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes member_consents rows mapping bot consent keys to canonical purposes', async () => {
    const fake = happyPath();
    fake.post.mockResolvedValueOnce({ data: { id: 'consent-2' } }); // 2 consents this time
    const svc = makeService(fake);

    await svc.register({
      event_id: 'evt-1',
      telegram_user_id: BigInt(1),
      telegram_username: null,
      profile: { name: 'Viktor', email: 'v@example.com' },
      consents: { events: true, newsletter: true },
    });

    // 1 POST for /items/registrations + 2 POSTs to /items/member_consents
    const consentPosts = fake.post.mock.calls.filter((c) => c[0] === '/items/member_consents');
    expect(consentPosts).toHaveLength(2);
    const purposes = consentPosts.map((c) => (c[1] as Record<string, unknown>).purpose);
    expect(purposes).toContain('events');
    expect(purposes).toContain('marketing'); // newsletter → marketing mapping
  });

  it('skips unknown consent keys (operator-defined) when writing member_consents', async () => {
    const fake = happyPath();
    const svc = makeService(fake);

    await svc.register({
      event_id: 'evt-1',
      telegram_user_id: BigInt(1),
      telegram_username: null,
      profile: { name: 'Viktor', email: 'v@example.com' },
      consents: { events: true, photo_consent: true }, // photo_consent not in CONSENT_KEY_TO_PURPOSE
    });

    const consentPosts = fake.post.mock.calls.filter((c) => c[0] === '/items/member_consents');
    // Only 'events' wrote; photo_consent skipped
    expect(consentPosts).toHaveLength(1);
    expect((consentPosts[0]?.[1] as Record<string, unknown>).purpose).toBe('events');
  });
});

// ─── PR-2.1-MVP — registration_confirmed push ────────────────────────────────

describe('renderRegistrationConfirmedTemplate', () => {
  it('renders 2 lines when location is null (virtual event)', () => {
    const out = renderRegistrationConfirmedTemplate({
      eventTitle: 'AI Meetup',
      eventStartsAt: '2026-06-20T03:00:00.000Z',
      eventLocation: null,
    });
    expect(out).toContain("You're registered for AI Meetup");
    expect(out).toContain('When: 2026-06-20T03:00:00.000Z');
    expect(out).not.toContain('Where:');
  });

  it('renders 3 lines when location is present', () => {
    const out = renderRegistrationConfirmedTemplate({
      eventTitle: 'AI Meetup',
      eventStartsAt: '2026-06-20T03:00:00.000Z',
      eventLocation: 'IMPACT.T, Tashkent',
    });
    expect(out).toContain('Where: IMPACT.T, Tashkent');
  });

  it('skips Where line when location is empty whitespace', () => {
    const out = renderRegistrationConfirmedTemplate({
      eventTitle: 'A',
      eventStartsAt: '2026-06-20T03:00:00.000Z',
      eventLocation: '   ',
    });
    expect(out).not.toContain('Where:');
  });
});

describe('register — dispatches tg.dispatch.v1 envelope after successful registration', () => {
  function setupHappyPath() {
    const fake = fakeDirectus();
    fake.get
      .mockResolvedValueOnce({ data: EVENT_ROW })
      .mockResolvedValueOnce({ data: [EXISTING_MEMBER] })
      .mockResolvedValueOnce({ data: [] });
    fake.post
      .mockResolvedValueOnce({ data: { id: 'reg-99' } })
      .mockResolvedValueOnce({ data: { id: 'consent-1' } });
    return fake;
  }

  it('publishes a tg.dispatch.v1 envelope through the outbox', async () => {
    const fakeDir = setupHappyPath();
    const outbox = fakeOutbox();
    const db = fakeDb();
    const svc = makeService(fakeDir, { outbox, db });

    await svc.register({
      event_id: 'evt-1',
      telegram_user_id: BigInt(8888),
      telegram_username: 'viktor',
      profile: { name: 'Viktor', email: 'v@example.com' },
      consents: { events: true },
    });

    expect(outbox.publish).toHaveBeenCalledTimes(1);
    const call = outbox.publish.mock.calls[0];
    const publishInput = call?.[1] as Record<string, unknown>;
    expect(publishInput.stream).toBe('tg.dispatch.v1');
    expect(typeof publishInput.envelopeId).toBe('string');

    const envelope = publishInput.payload as Record<string, unknown>;
    expect(envelope.schema).toBe('tg.dispatch.v1');
    expect(envelope.producer).toBe('aiqadam-api');
    expect((envelope.meta as Record<string, string>).intent).toBe('registration_confirmed');
    expect((envelope.meta as Record<string, string>).tenant).toBe('uz');

    const payload = envelope.payload as Record<string, unknown>;
    const target = payload.target as Record<string, unknown>;
    expect(target.chat_id).toBe(8888);
    expect(target.member_id).toBe('mem-1');

    const template = payload.template as Record<string, unknown>;
    expect(template.text).toContain('AI Meetup');
    expect(template.text).toContain('IMPACT.T');
    expect(template.parse_mode).toBe('None');
  });

  it('swallows outbox publish errors (registration still succeeds)', async () => {
    const fakeDir = setupHappyPath();
    const outbox = fakeOutbox();
    outbox.publish.mockRejectedValueOnce(new Error('redis exploded'));
    const db = fakeDb();
    const svc = makeService(fakeDir, { outbox, db });

    // Must NOT throw — registration was already persisted in Directus.
    const out = await svc.register({
      event_id: 'evt-1',
      telegram_user_id: BigInt(1),
      telegram_username: null,
      profile: { name: 'Viktor', email: 'v@example.com' },
      consents: { events: true },
    });

    expect(out.registration_id).toBe('reg-99');
  });

  it('uses event.location from the row, defaults to null when missing', async () => {
    const fake = fakeDirectus();
    fake.get
      .mockResolvedValueOnce({ data: { ...EVENT_ROW, location: null } })
      .mockResolvedValueOnce({ data: [EXISTING_MEMBER] })
      .mockResolvedValueOnce({ data: [] });
    fake.post
      .mockResolvedValueOnce({ data: { id: 'reg-100' } })
      .mockResolvedValueOnce({ data: { id: 'consent-2' } });
    const outbox = fakeOutbox();
    const svc = makeService(fake, { outbox });

    await svc.register({
      event_id: 'evt-1',
      telegram_user_id: BigInt(1),
      telegram_username: null,
      profile: { name: 'Viktor', email: 'v@example.com' },
      consents: { events: true },
    });

    const envelope = (outbox.publish.mock.calls[0]?.[1] as Record<string, unknown>)
      .payload as Record<string, unknown>;
    const template = (envelope.payload as Record<string, unknown>).template as Record<
      string,
      unknown
    >;
    expect(template.text).not.toContain('Where:');
  });
});
