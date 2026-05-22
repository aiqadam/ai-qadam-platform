import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { DirectusError } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { LeadVerifyTokenService } from '../src/modules/leads/lead-verify-token.service';
import { LeadsService } from '../src/modules/leads/leads.service';

// F-S1.6 — LeadsService unit tests (mocked Directus + dispatcher).
// Covers: new-lead create, repeat-submit re-verify, already-member skip,
// verify token round-trip, lead→member conversion path.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let dispatcher: FakeInteractions;
let tokens: LeadVerifyTokenService;
let svc: LeadsService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  dispatcher = { dispatch: vi.fn().mockResolvedValue({ interactionId: 'i-1', deliveries: [] }) };
  tokens = new LeadVerifyTokenService();
  svc = new LeadsService(
    dx as unknown as DirectusClient,
    dispatcher as unknown as InteractionsService,
    tokens,
  );
});

describe('LeadsService.create — new lead', () => {
  it('creates a new directus_users row with state=lead and dispatches verify email', async () => {
    dx.get.mockResolvedValueOnce({ data: [] }); // no existing user
    dx.post.mockResolvedValueOnce({ data: { id: 'u-new' } });

    const result = await svc.create({
      email: 'Alice@example.com',
      city: 'Tashkent',
      interestTopics: ['AI/ML', 'LLMs'],
      sourceUrl: 'https://aiqadam.org/',
    });

    expect(result.status).toBe('created');
    expect(result.userId).toBe('u-new');

    const postBody = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(postBody.email).toBe('alice@example.com'); // normalized lowercase
    expect(postBody.state).toBe('lead');
    expect(postBody.email_verified).toBe(false);
    expect(postBody.city).toBe('Tashkent');
    expect(postBody.interest_topics).toEqual(['AI/ML', 'LLMs']);
    expect(postBody.source_url).toBe('https://aiqadam.org/');

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    const dispatch = dispatcher.dispatch.mock.calls[0]?.[0] as {
      intent: string;
      audience: { userIds: string[] };
      payload: { subject: string; text: string };
    };
    expect(dispatch.intent).toBe('lead_welcome_verify');
    expect(dispatch.audience.userIds).toEqual(['u-new']);
    expect(dispatch.payload.subject).toContain('Tashkent');
    expect(dispatch.payload.text).toContain('/api/v1/leads/verify?token=');
  });

  it('subject omits city when none given', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    dx.post.mockResolvedValueOnce({ data: { id: 'u-new' } });

    await svc.create({ email: 'bob@example.com' });

    const dispatch = dispatcher.dispatch.mock.calls[0]?.[0] as { payload: { subject: string } };
    expect(dispatch.payload.subject).toBe('Confirm your AI Qadam updates');
  });
});

describe('LeadsService.create — existing email', () => {
  it('re-sends verify when existing row is state=lead and unverified', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'u-exist', email: 'eve@example.com', state: 'lead', email_verified: false }],
    });
    dx.patch.mockResolvedValueOnce({ data: { id: 'u-exist' } });

    const result = await svc.create({ email: 'eve@example.com', city: 'Almaty' });

    expect(result.status).toBe('reverification_sent');
    expect(result.userId).toBe('u-exist');
    const patchCall = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchCall.state).toBe('lead');
    expect(patchCall.email_verified).toBe(false);
    expect(patchCall.city).toBe('Almaty');
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it('skips silently when existing row is already a member', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'u-exist', email: 'admin@example.com', state: 'member', email_verified: true }],
    });

    const result = await svc.create({ email: 'admin@example.com' });

    expect(result.status).toBe('already_member');
    expect(result.userId).toBe('u-exist');
    expect(dx.post).not.toHaveBeenCalled();
    expect(dx.patch).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('rejects empty email', async () => {
    await expect(svc.create({ email: '   ' })).rejects.toThrow();
  });
});

describe('LeadsService.verify', () => {
  it('round-trips token and flips email_verified true', async () => {
    const token = await tokens.mint('u-1', 'alice@example.com');
    dx.patch.mockResolvedValueOnce({ data: { id: 'u-1' } });

    const result = await svc.verify(token);

    expect(result).toEqual({ userId: 'u-1', email: 'alice@example.com' });
    const patchCall = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchCall.email_verified).toBe(true);
    expect(patchCall.email_verified_at).toBeDefined();
  });

  it('returns null for tampered token', async () => {
    const result = await svc.verify('not-a-valid-token');
    expect(result).toBeNull();
    expect(dx.patch).not.toHaveBeenCalled();
  });
});

describe('LeadsService.convertLeadToMember', () => {
  it('upgrades state and dispatches conversion email', async () => {
    dx.get.mockResolvedValueOnce({
      data: { id: 'u-1', email: 'alice@example.com', state: 'lead', email_verified: false },
    });
    dx.patch.mockResolvedValueOnce({ data: { id: 'u-1' } });

    const result = await svc.convertLeadToMember('u-1', 'alice@example.com');

    expect(result.converted).toBe(true);
    const patchCall = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchCall.state).toBe('member');
    expect(patchCall.email_verified).toBe(true);
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    const intent = (dispatcher.dispatch.mock.calls[0]?.[0] as { intent: string }).intent;
    expect(intent).toBe('lead_converted_to_member');
  });

  it('no-ops when user is already a member', async () => {
    dx.get.mockResolvedValueOnce({
      data: { id: 'u-1', email: 'admin@example.com', state: 'member', email_verified: true },
    });
    const result = await svc.convertLeadToMember('u-1', 'admin@example.com');
    expect(result.converted).toBe(false);
    expect(dx.patch).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('no-ops gracefully on 404 lookup', async () => {
    dx.get.mockRejectedValueOnce(new DirectusError(404, '/users/missing', 'not found'));
    const result = await svc.convertLeadToMember('missing', 'x@x');
    expect(result.converted).toBe(false);
    expect(dx.patch).not.toHaveBeenCalled();
  });
});
