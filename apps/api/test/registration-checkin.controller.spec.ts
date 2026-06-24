import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationCheckinController } from '../src/modules/registrations/registration-checkin.controller';
import {
  CheckinIneligibleError,
  CheckinNotFoundError,
  WrongEventError,
} from '../src/modules/registrations/registrations-directus.service';

// Pattern used throughout this codebase: new Controller(new MockedService()).
// This avoids NestJS module compilation overhead while exercising the full
// controller method including Zod validation and NestJS exception mapping.

// ─── mock service ─────────────────────────────────────────────────────────────

const sharedMock = {
  checkinWithEvent: vi.fn<(...args: unknown[]) => unknown>(),
};

const controller = new RegistrationCheckinController(sharedMock as never);

// ─── fixtures ─────────────────────────────────────────────────────────────────

const MEMBER = { name: 'Bobur Rahimov', avatar: 'https://cdn.example.com/avatar/bobur.jpg' };
const EVENT_VIEW = {
  id: 'cccccccc-cccc-4000-8000-000000000003',
  title: 'AI Qadam Meetup UZ',
  startsAt: '2026-06-01T18:00:00Z',
  endsAt: '2026-06-01T21:00:00Z',
  location: 'Tashkent',
};

const TOKEN = 'eeeeeeee-eeee-4000-8000-000000000005';
const EVENT_ID = 'cccccccc-cccc-4000-8000-000000000003';

const regView = (status: 'registered' | 'attended' = 'attended', checkedInAt = '2026-06-01T18:30:00Z') => ({
  id: 'reg-1',
  eventId: EVENT_ID,
  status,
  checkinCode: TOKEN,
  checkedInAt: status === 'attended' ? checkedInAt : null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  cancelledAt: null,
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('RegistrationCheckinController.checkin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-20T12:00:00Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('happy path — first scan', () => {
    it('returns 200 with member + event data when token is valid', async () => {
      sharedMock.checkinWithEvent.mockResolvedValueOnce({
        registration: regView('attended'),
        alreadyCheckedIn: false,
        member: MEMBER,
        event: EVENT_VIEW,
      });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.status).toBe('ok');
      expect(result.alreadyCheckedIn).toBe(false);
      expect(result.member.name).toBe('Bobur Rahimov');
      expect(result.member.avatar).toBe('https://cdn.example.com/avatar/bobur.jpg');
      expect(result.event.title).toBe('AI Qadam Meetup UZ');
      expect(sharedMock.checkinWithEvent).toHaveBeenCalledOnce();
      expect(sharedMock.checkinWithEvent).toHaveBeenCalledWith(TOKEN, EVENT_ID);
    });

    it('uses current timestamp when checkedInAt is null on first scan', async () => {
      const fixedTime = new Date('2026-06-20T12:00:00Z');
      vi.setSystemTime(fixedTime);
      sharedMock.checkinWithEvent.mockResolvedValueOnce({
        registration: { ...regView('attended'), checkedInAt: null },
        alreadyCheckedIn: false,
        member: MEMBER,
        event: EVENT_VIEW,
      });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.checkedInAt).toBe(fixedTime.toISOString());
    });
  });

  describe('AC-5: already checked in — idempotency', () => {
    it('returns alreadyCheckedIn=true and the original checkedInAt timestamp', async () => {
      sharedMock.checkinWithEvent.mockResolvedValueOnce({
        registration: regView('attended', '2026-06-01T18:15:00Z'),
        alreadyCheckedIn: true,
        member: MEMBER,
        event: EVENT_VIEW,
      });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.status).toBe('ok');
      expect(result.alreadyCheckedIn).toBe(true);
      expect(result.checkedInAt).toBe('2026-06-01T18:15:00Z');
      expect(result.member.name).toBe('Bobur Rahimov');
    });
  });

  describe('missing eventId — BadRequest', () => {
    it('throws BadRequestException when eventId is missing', async () => {
      await expect(controller.checkin(TOKEN, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when eventId is not a valid UUID', async () => {
      await expect(controller.checkin(TOKEN, { eventId: 'not-a-uuid' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('AC-6: unknown token — NotFound', () => {
    it('throws NotFoundException when code is not recognized', async () => {
      sharedMock.checkinWithEvent.mockRejectedValueOnce(
        new CheckinNotFoundError('check-in code not recognized'),
      );

      await expect(controller.checkin(TOKEN, { eventId: EVENT_ID })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('AC-7: wrong event — BadRequest', () => {
    it('throws BadRequestException when token belongs to a different event', async () => {
      sharedMock.checkinWithEvent.mockRejectedValueOnce(
        new WrongEventError('AI Qadam Meetup KZ'),
      );

      await expect(controller.checkin(TOKEN, { eventId: EVENT_ID })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('error message includes the correct event title', async () => {
      sharedMock.checkinWithEvent.mockRejectedValueOnce(
        new WrongEventError('AI Qadam Meetup KZ'),
      );

      await expect(controller.checkin(TOKEN, { eventId: EVENT_ID })).rejects.toMatchObject({
        message: 'this ticket is for a different event: AI Qadam Meetup KZ',
      });
    });
  });

  describe('AC-8: ineligible registration — BadRequest', () => {
    it('throws BadRequestException when registration is cancelled', async () => {
      sharedMock.checkinWithEvent.mockRejectedValueOnce(
        new CheckinIneligibleError('this registration was cancelled'),
      );

      await expect(controller.checkin(TOKEN, { eventId: EVENT_ID })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when registration is waitlisted', async () => {
      sharedMock.checkinWithEvent.mockRejectedValueOnce(
        new CheckinIneligibleError('waitlisted — promoted users only get a check-in code'),
      );

      await expect(controller.checkin(TOKEN, { eventId: EVENT_ID })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('Zod error message format', () => {
    it('throws BadRequest with "Invalid request" prefix when required field is missing', async () => {
      try {
        // @ts-expect-error — intentionally missing required field.
        await controller.checkin(TOKEN, { wrongField: 'value' });
        throw new Error('expected to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const resp = (e as BadRequestException).getResponse() as { message: string };
        // Zod produces "Required" for missing required fields.
        expect(resp.message).toContain('Invalid request');
      }
    });
  });

  describe('member enrichment from service response', () => {
    it('returns avatar=null when member has no avatar', async () => {
      sharedMock.checkinWithEvent.mockResolvedValueOnce({
        registration: regView('attended'),
        alreadyCheckedIn: false,
        member: { name: 'Bobur', avatar: null },
        event: EVENT_VIEW,
      });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.member.avatar).toBeNull();
    });

    it('returns full name constructed by the service', async () => {
      sharedMock.checkinWithEvent.mockResolvedValueOnce({
        registration: regView('attended'),
        alreadyCheckedIn: false,
        member: { name: 'Dilshod Aliyev', avatar: null },
        event: EVENT_VIEW,
      });

      const result = await controller.checkin(TOKEN, { eventId: EVENT_ID });

      expect(result.member.name).toBe('Dilshod Aliyev');
    });
  });
});
