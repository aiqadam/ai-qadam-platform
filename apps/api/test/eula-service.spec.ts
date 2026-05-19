import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  EulaAcceptanceMismatchError,
  EulaConsentIncompleteError,
  EulaNotResolvedError,
  EulaService,
} from '../src/modules/eula/eula.service';

// Pure-mock. Directus is the only side effect.

const EVENT = 'cccccccc-cccc-4000-8000-000000000003';
const USER = 'aaaaaaaa-aaaa-4000-8000-000000000001';
const REG = 'dddddddd-dddd-4000-8000-000000000004';
const EULA = 'eeeeeeee-eeee-4000-8000-000000000005';

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let svc: EulaService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  svc = new EulaService(dx as unknown as DirectusClient);
});

function publishedEula(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      id: EULA,
      slug: 'platform-baseline',
      version: '1.0.0',
      locale: 'en',
      status: 'published',
      title: 'Platform Terms',
      body_markdown: 'You agree...',
      required_consents: ['data_processing', 'code_of_conduct'],
      ...overrides,
    },
  };
}

describe('EulaService.resolveForEvent', () => {
  it('returns null when event has no eula_id and event_type has no default', async () => {
    dx.get
      .mockResolvedValueOnce({ data: { id: EVENT, eula_id: null, format: 'meetup' } })
      .mockResolvedValueOnce({ data: { key: 'meetup', default_eula_id: null } });

    const res = await svc.resolveForEvent(EVENT);
    expect(res).toBeNull();
  });

  it('returns null when event row is missing', async () => {
    dx.get.mockResolvedValueOnce({ data: null });
    const res = await svc.resolveForEvent(EVENT);
    expect(res).toBeNull();
    // Should not have looked up event_type
    expect(dx.get).toHaveBeenCalledTimes(1);
  });

  it('returns the EULA when event.eula_id is set directly', async () => {
    dx.get
      .mockResolvedValueOnce({ data: { id: EVENT, eula_id: EULA, format: 'meetup' } })
      .mockResolvedValueOnce(publishedEula());

    const res = await svc.resolveForEvent(EVENT);
    expect(res).toMatchObject({
      eulaId: EULA,
      slug: 'platform-baseline',
      version: '1.0.0',
      requiredConsents: ['data_processing', 'code_of_conduct'],
    });
  });

  it('falls back to event_type.default_eula_id when event.eula_id is null', async () => {
    dx.get
      .mockResolvedValueOnce({ data: { id: EVENT, eula_id: null, format: 'hackathon' } })
      .mockResolvedValueOnce({ data: { key: 'hackathon', default_eula_id: EULA } })
      .mockResolvedValueOnce(publishedEula());

    const res = await svc.resolveForEvent(EVENT);
    expect(res?.eulaId).toBe(EULA);
  });

  it('returns null when the resolved EULA is in status=draft', async () => {
    dx.get
      .mockResolvedValueOnce({ data: { id: EVENT, eula_id: EULA, format: 'meetup' } })
      .mockResolvedValueOnce(publishedEula({ status: 'draft' }));

    const res = await svc.resolveForEvent(EVENT);
    expect(res).toBeNull();
  });

  it('treats null required_consents as empty array', async () => {
    dx.get
      .mockResolvedValueOnce({ data: { id: EVENT, eula_id: EULA, format: 'meetup' } })
      .mockResolvedValueOnce(publishedEula({ required_consents: null }));

    const res = await svc.resolveForEvent(EVENT);
    expect(res?.requiredConsents).toEqual([]);
  });
});

describe('EulaService.recordAcceptance', () => {
  function wireResolveSuccess(consents = ['data_processing', 'code_of_conduct']) {
    dx.get
      .mockResolvedValueOnce({ data: { id: EVENT, eula_id: EULA, format: 'meetup' } })
      .mockResolvedValueOnce(publishedEula({ required_consents: consents }));
  }

  it('throws EulaNotResolvedError when event has no EULA', async () => {
    dx.get
      .mockResolvedValueOnce({ data: { id: EVENT, eula_id: null, format: 'meetup' } })
      .mockResolvedValueOnce({ data: { key: 'meetup', default_eula_id: null } });

    await expect(
      svc.recordAcceptance({
        userId: USER,
        eventId: EVENT,
        registrationId: REG,
        acceptance: { eulaId: EULA, consentedIntents: ['data_processing'] },
      }),
    ).rejects.toBeInstanceOf(EulaNotResolvedError);
  });

  it('throws EulaAcceptanceMismatchError when eulaId does not match', async () => {
    wireResolveSuccess();
    await expect(
      svc.recordAcceptance({
        userId: USER,
        eventId: EVENT,
        registrationId: REG,
        acceptance: {
          eulaId: '00000000-0000-4000-8000-000000000000',
          consentedIntents: ['data_processing', 'code_of_conduct'],
        },
      }),
    ).rejects.toBeInstanceOf(EulaAcceptanceMismatchError);
  });

  it('throws EulaConsentIncompleteError when a required consent is missing', async () => {
    wireResolveSuccess();
    await expect(
      svc.recordAcceptance({
        userId: USER,
        eventId: EVENT,
        registrationId: REG,
        acceptance: {
          eulaId: EULA,
          consentedIntents: ['data_processing'], // missing code_of_conduct
        },
      }),
    ).rejects.toBeInstanceOf(EulaConsentIncompleteError);
  });

  it('inserts one eula_acceptances row + one consent_records row per intent', async () => {
    wireResolveSuccess(['data_processing', 'code_of_conduct']);
    dx.post.mockResolvedValue({ data: { id: 'x' } });

    await svc.recordAcceptance({
      userId: USER,
      eventId: EVENT,
      registrationId: REG,
      acceptance: {
        eulaId: EULA,
        consentedIntents: ['data_processing', 'code_of_conduct'],
        ipAddress: '203.0.113.7',
        userAgent: 'TestBrowser/1.0',
      },
    });

    expect(dx.post).toHaveBeenCalledTimes(3);
    expect(dx.post.mock.calls[0]?.[0]).toBe('/items/eula_acceptances');
    const acceptanceBody = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(acceptanceBody.user).toBe(USER);
    expect(acceptanceBody.eula).toBe(EULA);
    expect(acceptanceBody.source_event).toBe(EVENT);
    expect(acceptanceBody.ip_address).toBe('203.0.113.7');
    expect(acceptanceBody.user_agent).toBe('TestBrowser/1.0');

    for (let i = 1; i <= 2; i++) {
      expect(dx.post.mock.calls[i]?.[0]).toBe('/items/consent_records');
      const body = dx.post.mock.calls[i]?.[1] as Record<string, unknown>;
      expect(body.user).toBe(USER);
      expect(body.initiator_actor_class).toBe('system');
      expect(body.scope).toEqual({ event_id: EVENT });
      expect(body.source).toBe('registration');
      expect(body.source_ref).toEqual({ registration_id: REG, event_id: EVENT });
      expect(body.revoked_at).toBeNull();
    }
    const intents = (dx.post.mock.calls.slice(1) as Array<[string, Record<string, unknown>]>).map(
      (c) => c[1].intent_class,
    );
    expect(intents.sort()).toEqual(['code_of_conduct', 'data_processing']);
  });

  it('handles null ipAddress + userAgent', async () => {
    wireResolveSuccess(['data_processing']);
    dx.post.mockResolvedValue({ data: { id: 'x' } });

    await svc.recordAcceptance({
      userId: USER,
      eventId: EVENT,
      registrationId: REG,
      acceptance: { eulaId: EULA, consentedIntents: ['data_processing'] },
    });
    const body = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.ip_address).toBeNull();
    expect(body.user_agent).toBeNull();
  });
});
