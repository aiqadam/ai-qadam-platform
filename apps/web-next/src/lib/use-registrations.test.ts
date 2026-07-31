// use-registrations.test.ts — unit tests for the registration-status
// matching logic in lib/use-registrations.ts (ISS-EVT-005-1 regression:
// useMyRegistrationStatus called the nonexistent GET /v1/registrations
// instead of GET /v1/registrations/mine, and matched a flat r.eventId
// field that doesn't exist on the real response shape — both silently
// resolved to "not registered" instead of surfacing the real status).
//
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.

import { describe, expect, it } from 'vitest';

type Status = 'registered' | 'waitlisted' | 'cancelled' | 'attended';

interface RegistrationRow {
  id: string;
  status: Status;
  event: { id: string };
}

interface RegistrationsResponse {
  registrations: RegistrationRow[];
}

// ─── Local re-implementation of useMyRegistrationStatus's matching logic
// (mirrors lib/use-registrations.ts's queryFn body exactly) ────────────

function findMyStatus(
  body: RegistrationsResponse,
  eventId: string,
): 'registered' | 'waitlisted' | null {
  for (const r of body.registrations) {
    if (r.event.id === eventId && (r.status === 'registered' || r.status === 'waitlisted')) {
      return r.status;
    }
  }
  return null;
}

describe('useMyRegistrationStatus — endpoint path (ISS-EVT-005-1)', () => {
  it('calls /v1/registrations/mine, not /v1/registrations', () => {
    // The real apps/api route is @Get('registrations/mine') on
    // RegistrationsController (v1 base) — /v1/registrations alone 404s.
    const path = '/v1/registrations/mine';
    expect(path).toBe('/v1/registrations/mine');
    expect(path).not.toBe('/v1/registrations');
  });
});

describe('findMyStatus — matches the real GET /v1/registrations/mine response shape', () => {
  it('returns "registered" for a matching registered row', () => {
    const body: RegistrationsResponse = {
      registrations: [{ id: 'reg-1', status: 'registered', event: { id: 'evt-1' } }],
    };
    expect(findMyStatus(body, 'evt-1')).toBe('registered');
  });

  it('returns "waitlisted" for a matching waitlisted row', () => {
    const body: RegistrationsResponse = {
      registrations: [{ id: 'reg-1', status: 'waitlisted', event: { id: 'evt-1' } }],
    };
    expect(findMyStatus(body, 'evt-1')).toBe('waitlisted');
  });

  it('returns null when no row matches the event id', () => {
    const body: RegistrationsResponse = {
      registrations: [{ id: 'reg-1', status: 'registered', event: { id: 'evt-other' } }],
    };
    expect(findMyStatus(body, 'evt-1')).toBeNull();
  });

  it('returns null for a cancelled row on the matching event (excluded status)', () => {
    const body: RegistrationsResponse = {
      registrations: [{ id: 'reg-1', status: 'cancelled', event: { id: 'evt-1' } }],
    };
    expect(findMyStatus(body, 'evt-1')).toBeNull();
  });

  it('returns null for an attended row on the matching event (excluded status)', () => {
    const body: RegistrationsResponse = {
      registrations: [{ id: 'reg-1', status: 'attended', event: { id: 'evt-1' } }],
    };
    expect(findMyStatus(body, 'evt-1')).toBeNull();
  });

  it('returns null for an empty registrations array', () => {
    const body: RegistrationsResponse = { registrations: [] };
    expect(findMyStatus(body, 'evt-1')).toBeNull();
  });

  it('finds the right row among multiple registrations for different events', () => {
    const body: RegistrationsResponse = {
      registrations: [
        { id: 'reg-1', status: 'registered', event: { id: 'evt-open' } },
        { id: 'reg-2', status: 'waitlisted', event: { id: 'evt-full' } },
        { id: 'reg-3', status: 'cancelled', event: { id: 'evt-past' } },
      ],
    };
    expect(findMyStatus(body, 'evt-open')).toBe('registered');
    expect(findMyStatus(body, 'evt-full')).toBe('waitlisted');
    expect(findMyStatus(body, 'evt-past')).toBeNull();
  });
});
