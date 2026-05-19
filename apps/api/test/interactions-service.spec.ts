import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { InteractionsService } from '../src/modules/interactions/interactions.service';
import type {
  AdapterResult,
  ChannelAdapter,
  DispatchInput,
} from '../src/modules/interactions/interactions.types';

// Pure-mock. No Directus, no Postgres, no Resend. We assert:
//   - the dispatcher creates an interaction row, then N delivery rows
//   - it routes to the adapter for the first allowed channel
//   - it patches delivery state per the adapter's AdapterResult
//   - consent_basis other than operational_contract / b2b_contract is
//     skipped with a recorded reason
//   - missing adapter → state=failed with reason
//   - empty audience → throws (caller bug)
//   - de-dups duplicate user ids before dispatch

const USER_A = '11111111-1111-4000-8000-000000000001';
const USER_B = '22222222-2222-4000-8000-000000000002';
const IX = 'aaaaaaaa-aaaa-4000-8000-00000000aaaa';

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function fakeDirectus(): FakeDirectus {
  return { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
}

function fakeAdapter(
  channel: ChannelAdapter['channel'],
  result: AdapterResult = { state: 'sent' },
): ChannelAdapter & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn().mockResolvedValue(result);
  return { channel, send } as unknown as ChannelAdapter & {
    send: ReturnType<typeof vi.fn>;
  };
}

function baseInput(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    initiatorActor: 'system',
    audience: { userIds: [USER_A] },
    intent: 'smoke',
    payload: { subject: 'hi', text: 'hello' },
    consentBasis: 'operational_contract',
    allowedChannels: ['email'],
    ...overrides,
  };
}

function wireDirectusUserLookup(d: FakeDirectus, users: Array<{ id: string; email: string }>) {
  d.get.mockResolvedValueOnce({ data: users });
}

function wireInteractionRow(d: FakeDirectus, id = IX) {
  d.post.mockResolvedValueOnce({ data: { id } });
}

function wireDeliveryRow(d: FakeDirectus, id: string) {
  d.post.mockResolvedValueOnce({ data: { id } });
}

let dx: FakeDirectus;

beforeEach(() => {
  dx = fakeDirectus();
});

describe('InteractionsService.dispatch — happy path', () => {
  it('creates interaction → delivery → sent, patches delivery + interaction', async () => {
    const email = fakeAdapter('email', { state: 'sent' });
    const svc = new InteractionsService(dx as unknown as DirectusClient, [email]);

    wireDirectusUserLookup(dx, [{ id: USER_A, email: 'a@b.com' }]);
    wireInteractionRow(dx);
    wireDeliveryRow(dx, 'd-1');

    const res = await svc.dispatch(baseInput());

    expect(res.interactionId).toBe(IX);
    expect(res.deliveries).toHaveLength(1);
    const first = res.deliveries[0];
    if (!first) throw new Error('expected delivery');
    expect(first.state).toBe('sent');
    expect(first.recipientUserId).toBe(USER_A);
    expect(first.channel).toBe('email');

    // Directus call sequence: GET users → POST interactions → POST deliveries
    expect(dx.get).toHaveBeenCalledTimes(1);
    expect(dx.post).toHaveBeenCalledTimes(2);
    const interactionBody = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(interactionBody.policy_state).toBe('sending');
    expect(interactionBody.consent_basis).toBe('operational_contract');
    expect(interactionBody.allowed_channels).toEqual(['email']);
    expect(dx.post.mock.calls[0]?.[0]).toBe('/items/interactions');
    expect(dx.post.mock.calls[1]?.[0]).toBe('/items/interaction_deliveries');

    // Adapter called with the email recipient
    expect(email.send).toHaveBeenCalledWith({
      recipient: { userId: USER_A, email: 'a@b.com' },
      intent: 'smoke',
      payload: { subject: 'hi', text: 'hello' },
    });

    // Delivery PATCHed to sent + delivered_at, then interaction to sent
    expect(dx.patch).toHaveBeenCalledTimes(2);
    const deliveryPatch = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(deliveryPatch.state).toBe('sent');
    expect(deliveryPatch.delivered_at).toMatch(/T/);
    expect(dx.patch.mock.calls[1]?.[1]).toEqual({ policy_state: 'sent' });
  });

  it('fans out to multiple recipients, one delivery per user', async () => {
    const email = fakeAdapter('email', { state: 'sent' });
    const svc = new InteractionsService(dx as unknown as DirectusClient, [email]);

    wireDirectusUserLookup(dx, [
      { id: USER_A, email: 'a@b.com' },
      { id: USER_B, email: 'b@c.com' },
    ]);
    wireInteractionRow(dx);
    wireDeliveryRow(dx, 'd-1');
    wireDeliveryRow(dx, 'd-2');

    const res = await svc.dispatch(baseInput({ audience: { userIds: [USER_A, USER_B] } }));

    expect(res.deliveries).toHaveLength(2);
    expect(res.deliveries.every((d) => d.state === 'sent')).toBe(true);
    expect(email.send).toHaveBeenCalledTimes(2);
  });

  it('de-dups duplicate user ids before fan-out', async () => {
    const email = fakeAdapter('email', { state: 'sent' });
    const svc = new InteractionsService(dx as unknown as DirectusClient, [email]);

    wireDirectusUserLookup(dx, [{ id: USER_A, email: 'a@b.com' }]);
    wireInteractionRow(dx);
    wireDeliveryRow(dx, 'd-1');

    await svc.dispatch(baseInput({ audience: { userIds: [USER_A, USER_A, USER_A] } }));

    // One adapter call, not three
    expect(email.send).toHaveBeenCalledTimes(1);
  });
});

describe('InteractionsService.dispatch — consent', () => {
  it('skips delivery when consent_basis=explicit_opt_in (not yet enforced)', async () => {
    const email = fakeAdapter('email');
    const svc = new InteractionsService(dx as unknown as DirectusClient, [email]);

    wireDirectusUserLookup(dx, [{ id: USER_A, email: 'a@b.com' }]);
    wireInteractionRow(dx);
    wireDeliveryRow(dx, 'd-1');

    const res = await svc.dispatch(baseInput({ consentBasis: 'explicit_opt_in' }));

    expect(res.deliveries[0]?.state).toBe('skipped_consent');
    expect(res.deliveries[0]?.failureReason).toContain('5.5/5');
    expect(email.send).not.toHaveBeenCalled();

    // Delivery row was created with state=skipped_consent, no PATCH needed
    const deliveryBody = dx.post.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(deliveryBody.state).toBe('skipped_consent');
    expect(deliveryBody.failure_reason).toContain('5.5/5');
  });

  it('passes b2b_contract through without consent check', async () => {
    const email = fakeAdapter('email', { state: 'sent' });
    const svc = new InteractionsService(dx as unknown as DirectusClient, [email]);

    wireDirectusUserLookup(dx, [{ id: USER_A, email: 'a@b.com' }]);
    wireInteractionRow(dx);
    wireDeliveryRow(dx, 'd-1');

    const res = await svc.dispatch(baseInput({ consentBasis: 'b2b_contract' }));

    expect(res.deliveries[0]?.state).toBe('sent');
    expect(email.send).toHaveBeenCalledTimes(1);
  });
});

describe('InteractionsService.dispatch — adapter outcomes', () => {
  it('records failed when adapter returns failed', async () => {
    const email = fakeAdapter('email', { state: 'failed', failureReason: 'resend 502' });
    const svc = new InteractionsService(dx as unknown as DirectusClient, [email]);

    wireDirectusUserLookup(dx, [{ id: USER_A, email: 'a@b.com' }]);
    wireInteractionRow(dx);
    wireDeliveryRow(dx, 'd-1');

    const res = await svc.dispatch(baseInput());

    expect(res.deliveries[0]?.state).toBe('failed');
    expect(res.deliveries[0]?.failureReason).toBe('resend 502');
    const patch = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.state).toBe('failed');
    expect(patch.failure_reason).toBe('resend 502');
    expect(patch.delivered_at).toBeUndefined();
  });

  it('records skipped_policy when adapter is a stub', async () => {
    const telegram = fakeAdapter('telegram', {
      state: 'skipped_policy',
      failureReason: 'channel telegram not implemented',
    });
    const svc = new InteractionsService(dx as unknown as DirectusClient, [telegram]);

    wireDirectusUserLookup(dx, [{ id: USER_A, email: 'a@b.com' }]);
    wireInteractionRow(dx);
    wireDeliveryRow(dx, 'd-1');

    const res = await svc.dispatch(baseInput({ allowedChannels: ['telegram'] }));

    expect(res.deliveries[0]?.state).toBe('skipped_policy');
    expect(telegram.send).toHaveBeenCalledTimes(1);
  });

  it('records failed when no adapter is registered for the chosen channel', async () => {
    const svc = new InteractionsService(dx as unknown as DirectusClient, []);

    wireDirectusUserLookup(dx, [{ id: USER_A, email: 'a@b.com' }]);
    wireInteractionRow(dx);
    wireDeliveryRow(dx, 'd-1');

    const res = await svc.dispatch(baseInput({ allowedChannels: ['sms'] }));

    expect(res.deliveries[0]?.state).toBe('failed');
    expect(res.deliveries[0]?.failureReason).toContain('no adapter');
  });
});

describe('InteractionsService.dispatch — input errors', () => {
  it('throws when audience resolves to zero recipients', async () => {
    const email = fakeAdapter('email');
    const svc = new InteractionsService(dx as unknown as DirectusClient, [email]);

    // user lookup returns empty (deleted user)
    wireDirectusUserLookup(dx, []);

    await expect(svc.dispatch(baseInput())).rejects.toThrow(/zero recipients/);
    expect(dx.post).not.toHaveBeenCalled();
  });
});
