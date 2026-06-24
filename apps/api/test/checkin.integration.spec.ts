import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import { RegistrationCheckinController } from '../src/modules/registrations/registration-checkin.controller';
import { RegistrationsDirectusService } from '../src/modules/registrations/registrations-directus.service';
import type { EulaService } from '../src/modules/eula/eula.service';
import type { BadgeAwarderService } from '../src/modules/badges/badge-awarder.service';

// Integration-level: exercises controller + service together.
// The service is instantiated with fully-mocked dependencies (Directus,
// bridge, eula, badges). This gives good coverage of:
// - Controller Zod validation
// - Controller NestJS exception mapping
// - Service business logic (checkinWithEvent)
// - Member enrichment
// without requiring NestJS DI or Testcontainers.

// ─── mock service dependencies ─────────────────────────────────────────────────

function makeDirectus() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

function makeBridge() {
  return {
    resolveDirectusId: vi.fn(),
  };
}

function makeEula() {
  return {
    resolveForEvent: vi.fn().mockResolvedValue(null),
    recordAcceptance: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBadges() {
  return {
    onRegistrationCreated: vi.fn(),
    onAttendanceRecorded: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── service factory ──────────────────────────────────────────────────────────

let sharedDirectus: ReturnType<typeof makeDirectus>;
let sharedBridge: ReturnType<typeof makeBridge>;
let sharedEula: ReturnType<typeof makeEula>;
let sharedBadges: ReturnType<typeof makeBadges>;
let service: RegistrationsDirectusService;
let controller: RegistrationCheckinController;

function reset() {
  sharedDirectus = makeDirectus();
  sharedBridge = makeBridge();
  sharedEula = makeEula();
  sharedBadges = makeBadges();
  service = new RegistrationsDirectusService(
    sharedDirectus as unknown as DirectusClient,
    sharedBridge as unknown as DirectusUsersBridgeService,
    sharedEula as unknown as EulaService,
    sharedBadges as unknown as BadgeAwarderService,
  );
  controller = new RegistrationCheckinController(service);
}

// ─── fixtures ─────────────────────────────────────────────────────────────────

const TOKEN = 'eeeeeeee-eeee-4000-8000-000000000005';
const EVENT_ID = 'cccccccc-cccc-4000-8000-000000000003';
const REG_ID = 'dddddddd-dddd-4000-8000-000000000004';
const USER_ID = 'mem-bbb-bbbb-4000-8000-00000000000b';
const NOW = '2026-06-20T12:00:00Z';

function regRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REG_ID,
    event: EVENT_ID,
    user: USER_ID,
    status: 'registered',
    checkin_code: TOKEN,
    checked_in_at: null,
    cancelled_at: null,
    date_created: '2026-05-01T00:00:00Z',
    date_updated: null,
    referred_by: null,
    event: {
      id: EVENT_ID,
      title: 'AI Qadam Meetup UZ',
      starts_at: '2026-06-20T10:00:00Z',
      ends_at: '2026-06-20T14:00:00Z',
      location: 'Tashkent',
      country: 'uz',
    },
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('Check-in integration (controller + service, mocked Directus)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('AC-4: Happy path — first scan', () => {
    it('returns member name + avatar, sets status=attended, checkedInAt is set', async () => {
      sharedDirectus.get
        .mockResolvedValueOnce({ data: [regRow()] })
        .mockResolvedValueOnce({
          data: { first_name: 'Bobur', last_name: 'Rahimov', avatar: 'https://cdn.example.com/bobur.jpg' },
        });
      sharedDirectus.patch.mockResolvedValueOnce({
        data: { ...regRow({ status: 'attended', checked_in_at: NOW }) },
      });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.status).toBe('ok');
      expect(result.alreadyCheckedIn).toBe(false);
      expect(result.member.name).toBe('Bobur Rahimov');
      expect(result.member.avatar).toBe('https://cdn.example.com/bobur.jpg');
      expect(result.event.id).toBe(EVENT_ID);
      expect(sharedDirectus.patch).toHaveBeenCalledOnce();
      const patchBody = sharedDirectus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(patchBody.status).toBe('attended');
    });
  });

  describe('AC-5: Already checked in — idempotency', () => {
    it('returns alreadyCheckedIn=true without PATCH', async () => {
      sharedDirectus.get
        .mockResolvedValueOnce({
          data: [{ ...regRow({ status: 'attended', checked_in_at: '2026-06-20T10:15:00Z' }) }],
        })
        .mockResolvedValueOnce({
          data: { first_name: 'Bobur', last_name: 'Rahimov', avatar: null },
        });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.status).toBe('ok');
      expect(result.alreadyCheckedIn).toBe(true);
      expect(result.member.name).toBe('Bobur Rahimov');
      expect(sharedDirectus.patch).not.toHaveBeenCalled();
    });
  });

  describe('AC-6: Unknown token — NotFound', () => {
    it('throws NotFoundException when token is not found', async () => {
      sharedDirectus.get.mockResolvedValueOnce({ data: [] });

      await expect(controller.checkin(TOKEN, { eventId: EVENT_ID })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('AC-7: Wrong event rejection', () => {
    it('throws BadRequest when token belongs to Event A but request is for Event B', async () => {
      const OTHER_EVENT = '11111111-1111-4000-8000-000000000001';
      sharedDirectus.get
        .mockResolvedValueOnce({
          data: [{ ...regRow({ event: OTHER_EVENT }) }],
        })
        // Service fetches actual event title for error message
        .mockResolvedValueOnce({ data: { id: OTHER_EVENT, title: 'AI Qadam Meetup KZ' } });

      await expect(controller.checkin(TOKEN, { eventId: EVENT_ID })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('AC-8: Cancelled/Waitlisted rejection', () => {
    it('rejects cancelled registration', async () => {
      sharedDirectus.get.mockResolvedValueOnce({
        data: [{ ...regRow({ status: 'cancelled' }) }],
      });

      await expect(controller.checkin(TOKEN, { eventId: EVENT_ID })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects waitlisted registration', async () => {
      sharedDirectus.get.mockResolvedValueOnce({
        data: [{ ...regRow({ status: 'waitlisted' }) }],
      });

      await expect(controller.checkin(TOKEN, { eventId: EVENT_ID })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('member enrichment fallback', () => {
    it('falls back to "Member" when directus_users fetch fails', async () => {
      sharedDirectus.get
        .mockResolvedValueOnce({ data: [regRow()] })
        .mockRejectedValueOnce(new Error('directus 503'));
      sharedDirectus.patch.mockResolvedValueOnce({
        data: { ...regRow({ status: 'attended' }) },
      });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.member.name).toBe('Member');
      expect(result.member.avatar).toBeNull();
    });

    it('falls back to "Member" when user has no name fields', async () => {
      sharedDirectus.get
        .mockResolvedValueOnce({ data: [regRow()] })
        .mockResolvedValueOnce({ data: { first_name: null, last_name: null, avatar: null } });
      sharedDirectus.patch.mockResolvedValueOnce({
        data: { ...regRow({ status: 'attended' }) },
      });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.member.name).toBe('Member');
    });

    it('uses first_name only when last_name is absent', async () => {
      sharedDirectus.get
        .mockResolvedValueOnce({ data: [regRow()] })
        .mockResolvedValueOnce({ data: { first_name: 'Bobur', last_name: null, avatar: null } });
      sharedDirectus.patch.mockResolvedValueOnce({
        data: { ...regRow({ status: 'attended' }) },
      });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.member.name).toBe('Bobur');
    });
  });

  describe('Missing eventId validation', () => {
    it('throws BadRequestException when eventId is missing', async () => {
      await expect(controller.checkin(TOKEN, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when eventId is not a UUID', async () => {
      await expect(controller.checkin(TOKEN, { eventId: 'not-a-uuid' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
