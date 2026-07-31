import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthentikClient } from '../src/modules/admin-invites/authentik.client';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  RegistrationConsentRequiredError,
  RegistrationIneligibleError,
  RegistrationNotFoundError,
  type RegistrationsDirectusService,
} from '../src/modules/registrations/registrations-directus.service';
import { TelegramAuthService } from '../src/modules/auth/telegram-auth.service';

// FEAT-BOT-2 (FR-BOT-002 PR 2/6) — TelegramAuthService.registerViaTelegram /
// cancelViaTelegram. Follows telegram-auth-service.spec.ts's own
// direct-instantiation-with-mocks pattern (no NestJS DI overhead).

function makeDirectusBridge(
  overrides: Partial<DirectusUsersBridgeService> = {},
): DirectusUsersBridgeService {
  return {
    resolveUserIdFromDirectusId: vi.fn(),
    resolveDirectusId: vi.fn(),
    ensureLinked: vi.fn(),
    ensureLinkedByEmail: vi.fn(),
    ...overrides,
  } as unknown as DirectusUsersBridgeService;
}

function makeRegistrationsService(
  overrides: Partial<RegistrationsDirectusService> = {},
): RegistrationsDirectusService {
  return {
    register: vi.fn(),
    cancel: vi.fn(),
    listMine: vi.fn(),
    checkin: vi.fn(),
    checkinWithEvent: vi.fn(),
    ...overrides,
  } as unknown as RegistrationsDirectusService;
}

function makeDirectusClient(overrides: Partial<DirectusClient> = {}): DirectusClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as DirectusClient;
}

function makeService(input: {
  bridge?: DirectusUsersBridgeService;
  registrations?: RegistrationsDirectusService;
  directus?: DirectusClient;
}): TelegramAuthService {
  return new TelegramAuthService(
    {} as AuthentikClient,
    input.directus ?? makeDirectusClient(),
    input.bridge ?? makeDirectusBridge(),
    input.registrations ?? makeRegistrationsService(),
  );
}

const DIRECTUS_USER_ID = 'dir-user-1';
const PLATFORM_USER_ID = 'platform-user-1';
const EVENT_ID = 'evt-1';
const COUNTRY = 'uz';

// ─────────────────────────────────────────────────────────────────────────────

describe('TelegramAuthService.registerViaTelegram', () => {
  it('resolves directusUserId -> platform userId via the bridge, then calls register()', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      register: vi.fn().mockResolvedValueOnce({
        id: 'reg-1',
        eventId: EVENT_ID,
        status: 'registered',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        cancelledAt: null,
      }),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce({ data: { title: 'Meetup #1' } }),
    });
    const service = makeService({ bridge, registrations, directus });

    const result = await service.registerViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY);

    expect(bridge.resolveUserIdFromDirectusId).toHaveBeenCalledWith(DIRECTUS_USER_ID);
    expect(registrations.register).toHaveBeenCalledWith({
      userId: PLATFORM_USER_ID,
      eventId: EVENT_ID,
      countryCode: COUNTRY,
    });
    expect(result).toEqual({ status: 'registered', eventTitle: 'Meetup #1' });
  });

  it('passes through status: waitlisted faithfully, no separate waitlist-detection logic', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      register: vi.fn().mockResolvedValueOnce({
        id: 'reg-2',
        eventId: EVENT_ID,
        status: 'waitlisted',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        cancelledAt: null,
      }),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce({ data: { title: 'Full Meetup' } }),
    });
    const service = makeService({ bridge, registrations, directus });

    const result = await service.registerViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY);

    expect(result).toEqual({ status: 'waitlisted', eventTitle: 'Full Meetup' });
  });

  it('fetches the event title AFTER register() succeeds, not before (ISS-BOT-REG-001 regression guard)', async () => {
    const callOrder: string[] = [];
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      register: vi.fn().mockImplementationOnce(async () => {
        callOrder.push('register');
        return {
          id: 'reg-1',
          eventId: EVENT_ID,
          status: 'registered' as const,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          cancelledAt: null,
        };
      }),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockImplementationOnce(async () => {
        callOrder.push('title-fetch');
        return { data: { title: 'Meetup #1' } };
      }),
    });
    const service = makeService({ bridge, registrations, directus });

    await service.registerViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY);

    expect(callOrder).toEqual(['register', 'title-fetch']);
  });

  it('throws NotFoundException {telegram_user_not_found} when the bridge cannot resolve a platform user', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const registrations = makeRegistrationsService();
    const service = makeService({ bridge, registrations });

    await expect(
      service.registerViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(registrations.register).not.toHaveBeenCalled();
  });

  it('maps RegistrationNotFoundError to NotFoundException {event_not_found}', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      register: vi.fn().mockRejectedValueOnce(new RegistrationNotFoundError('not found')),
    });
    const service = makeService({ bridge, registrations });

    try {
      await service.registerViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect((e as NotFoundException).getResponse()).toEqual({ error: 'event_not_found' });
    }
  });

  it('maps RegistrationConsentRequiredError to ConflictException {consent_required}', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      register: vi.fn().mockRejectedValueOnce(new RegistrationConsentRequiredError('consent')),
    });
    const service = makeService({ bridge, registrations });

    try {
      await service.registerViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).getResponse()).toEqual({ error: 'consent_required' });
    }
  });

  it('maps RegistrationIneligibleError to ConflictException {registration_ineligible}', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      register: vi.fn().mockRejectedValueOnce(new RegistrationIneligibleError('ineligible')),
    });
    const service = makeService({ bridge, registrations });

    try {
      await service.registerViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).getResponse()).toEqual({ error: 'registration_ineligible' });
    }
  });

  it('propagates unrecognized errors unchanged', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const boom = new Error('boom');
    const registrations = makeRegistrationsService({
      register: vi.fn().mockRejectedValueOnce(boom),
    });
    const service = makeService({ bridge, registrations });

    await expect(
      service.registerViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY),
    ).rejects.toBe(boom);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('TelegramAuthService.cancelViaTelegram', () => {
  it('resolves directusUserId -> platform userId, calls cancel(), returns status: cancelled on a row', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      cancel: vi.fn().mockResolvedValueOnce({
        id: 'reg-1',
        eventId: EVENT_ID,
        status: 'cancelled',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        cancelledAt: '2026-08-01T00:00:00.000Z',
      }),
    });
    const service = makeService({ bridge, registrations });

    const result = await service.cancelViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY);

    expect(registrations.cancel).toHaveBeenCalledWith({
      userId: PLATFORM_USER_ID,
      eventId: EVENT_ID,
      countryCode: COUNTRY,
    });
    expect(result).toEqual({ status: 'cancelled' });
  });

  it('returns status: not_registered (not a throw) when cancel() resolves null', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      cancel: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ bridge, registrations });

    const result = await service.cancelViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY);

    expect(result).toEqual({ status: 'not_registered' });
  });

  it('throws NotFoundException {telegram_user_not_found} when the bridge cannot resolve a platform user', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const registrations = makeRegistrationsService();
    const service = makeService({ bridge, registrations });

    await expect(
      service.cancelViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(registrations.cancel).not.toHaveBeenCalled();
  });

  it('maps RegistrationNotFoundError to NotFoundException {event_not_found}', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      cancel: vi.fn().mockRejectedValueOnce(new RegistrationNotFoundError('not found')),
    });
    const service = makeService({ bridge, registrations });

    try {
      await service.cancelViaTelegram(DIRECTUS_USER_ID, EVENT_ID, COUNTRY);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect((e as NotFoundException).getResponse()).toEqual({ error: 'event_not_found' });
    }
  });
});
