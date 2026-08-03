import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../../../src/modules/directus/directus.client';
import type { ConsentService } from '../../../src/modules/interactions/consent.service';
import { InteractionsService } from '../../../src/modules/interactions/interactions.service';
import type { ChannelAdapter } from '../../../src/modules/interactions/channels/adapter.tokens';

// FR-NTF-005 — InteractionsService master channel toggle enforcement.
// Tests the early-gate logic in deliverToRecipient() that checks
// notification_email_enabled and notification_telegram_enabled BEFORE
// consent checks.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};
type FakeConsent = { check: ReturnType<typeof vi.fn> };
type FakeAdapter = { channel: 'email' | 'telegram'; send: ReturnType<typeof vi.fn> };

const USER_ID = '11111111-1111-4000-8000-000000000001';
const INTERACTION_ID = '22222222-2222-4000-8000-000000000002';
const DELIVERY_ID = '33333333-3333-4000-8000-000000000003';

let dx: FakeDirectus;
let consent: FakeConsent;
let emailAdapter: FakeAdapter;
let telegramAdapter: FakeAdapter;
let service: InteractionsService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
  consent = { check: vi.fn() };
  emailAdapter = { channel: 'email', send: vi.fn() };
  telegramAdapter = { channel: 'telegram', send: vi.fn() };
  
  service = new InteractionsService(
    dx as unknown as DirectusClient,
    consent as unknown as ConsentService,
    [emailAdapter, telegramAdapter] as unknown as ChannelAdapter[],
  );
});

describe('InteractionsService — FR-NTF-005 master toggle enforcement', () => {
  // ─── 1. Email channel disabled ────────────────────────────────────────

  it('skips email delivery when notification_email_enabled=false', async () => {
    // Arrange: user list query (resolveRecipients)
    dx.get
      .mockResolvedValueOnce({
        data: [
          {
            id: USER_ID,
            email: 'user@example.com',
            country: 'uz',
            telegram_user_id: null,
            telegram_opted_out_at: null,
            notification_email_enabled: false,
            notification_telegram_enabled: true,
          },
        ],
      })
      // Arrange: single-user fetch (resolveUser) — returns same user
      .mockResolvedValueOnce({
        data: {
          id: USER_ID,
          email: 'user@example.com',
          notification_email_enabled: false,
          notification_telegram_enabled: true,
        },
      });

    // Arrange: interaction creation (dx.post), then delivery creation (dx.post)
    dx.post
      .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })
      .mockResolvedValueOnce({ data: { id: DELIVERY_ID } });
    dx.patch.mockResolvedValue({});

    // Act
    const result = await service.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [USER_ID] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test', text: 'Body', html: '<p>Body</p>' },
    });

    // Assert
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]?.state).toBe('skipped_channel_disabled');
    expect(result.deliveries[0]?.failureReason).toBe('notification_email_enabled=false');
    expect(result.deliveries[0]?.channel).toBe('email');
    
    // Consent check should NOT have been called (early gate)
    expect(consent.check).not.toHaveBeenCalled();
    // Adapter should NOT have been called
    expect(emailAdapter.send).not.toHaveBeenCalled();
  });

  // ─── 2. Telegram channel disabled ─────────────────────────────────────

  it('skips telegram delivery when notification_telegram_enabled=false', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [
          {
            id: USER_ID,
            email: 'user@example.com',
            country: 'uz',
            telegram_user_id: '123456',
            telegram_opted_out_at: null,
            notification_email_enabled: true,
            notification_telegram_enabled: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          id: USER_ID,
          telegram_user_id: '123456',
          notification_email_enabled: true,
          notification_telegram_enabled: false,
        },
      });

    dx.post
      .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })
      .mockResolvedValueOnce({ data: { id: DELIVERY_ID } });
    dx.patch.mockResolvedValue({});

    const result = await service.dispatch({
      initiatorActor: 'system:reminder',
      intent: 'event_reminder_24h',
      audience: { userIds: [USER_ID] },
      consentBasis: 'operational_contract',
      consentScope: null,
      allowedChannels: ['telegram'],
      payload: { text: 'Reminder: Event tomorrow' },
    });

    expect(result.deliveries[0]?.state).toBe('skipped_channel_disabled');
    expect(result.deliveries[0]?.failureReason).toBe('notification_telegram_enabled=false');
    expect(consent.check).not.toHaveBeenCalled();
    expect(telegramAdapter.send).not.toHaveBeenCalled();
  });

  // ─── 3. Both channels enabled → passes to consent check ──────────────

  it('proceeds to consent check when notification_email_enabled=true', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [
          {
            id: USER_ID,
            email: 'user@example.com',
            country: 'uz',
            telegram_user_id: null,
            telegram_opted_out_at: null,
            notification_email_enabled: true,
            notification_telegram_enabled: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          id: USER_ID,
          email: 'user@example.com',
          notification_email_enabled: true,
          notification_telegram_enabled: true,
        },
      });

    dx.post
      .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })
      .mockResolvedValueOnce({ data: { id: DELIVERY_ID } });
    dx.patch.mockResolvedValue({});
    
    // Mock consent check to return OK
    consent.check.mockResolvedValueOnce({ ok: true });
    emailAdapter.send.mockResolvedValueOnce({ state: 'sent', failureReason: null });

    const result = await service.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [USER_ID] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test', text: 'Body', html: '<p>Body</p>' },
    });

    expect(result.deliveries[0]?.state).toBe('sent');
    // Consent check SHOULD have been called (master toggle passed)
    expect(consent.check).toHaveBeenCalledTimes(1);
    // Adapter SHOULD have been called
    expect(emailAdapter.send).toHaveBeenCalledTimes(1);
  });

  // ─── 4. Default true when fields are null (backward compat) ──────────

  it('treats null notification_email_enabled as true (backward compat)', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [
          {
            id: USER_ID,
            email: 'user@example.com',
            country: 'uz',
            // Fields not present in response (old rows)
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          id: USER_ID,
          email: 'user@example.com',
          // Fields not present
        },
      });

    dx.post
      .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })
      .mockResolvedValueOnce({ data: { id: DELIVERY_ID } });
    dx.patch.mockResolvedValue({});
    consent.check.mockResolvedValueOnce({ ok: true });
    emailAdapter.send.mockResolvedValueOnce({ state: 'sent', failureReason: null });

    const result = await service.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [USER_ID] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test', text: 'Body', html: '<p>Body</p>' },
    });

    // Should pass through to delivery (null treated as true)
    expect(result.deliveries[0]?.state).toBe('sent');
    expect(consent.check).toHaveBeenCalledTimes(1);
  });

  // ─── 5. Master toggle wins over consent ──────────────────────────────

  it('skips delivery even when consent is granted if master toggle is off', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [
          {
            id: USER_ID,
            email: 'user@example.com',
            country: 'uz',
            notification_email_enabled: false,
            notification_telegram_enabled: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          id: USER_ID,
          email: 'user@example.com',
          notification_email_enabled: false,
          notification_telegram_enabled: true,
        },
      });

    dx.post
      .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })
      .mockResolvedValueOnce({ data: { id: DELIVERY_ID } });
    dx.patch.mockResolvedValue({});
    
    // Even if consent would be OK, it shouldn't be checked
    consent.check.mockResolvedValueOnce({ ok: true });

    const result = await service.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [USER_ID] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test', text: 'Body', html: '<p>Body</p>' },
    });

    expect(result.deliveries[0]?.state).toBe('skipped_channel_disabled');
    // Consent check should NOT have been called (master toggle blocks early)
    expect(consent.check).not.toHaveBeenCalled();
  });

  // ─── 6. resolveUser() is called for toggle check ─────────────────────

  it('calls resolveUser() to fetch channel toggle fields', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [
          {
            id: USER_ID,
            email: 'user@example.com',
            country: 'uz',
            notification_email_enabled: true,
            notification_telegram_enabled: true,
          },
        ],
      })
      // This is the resolveUser() call — verify it includes toggle fields
      .mockResolvedValueOnce({
        data: {
          id: USER_ID,
          email: 'user@example.com',
          notification_email_enabled: true,
          notification_telegram_enabled: true,
        },
      });

    dx.post
      .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })
      .mockResolvedValueOnce({ data: { id: DELIVERY_ID } });
    dx.patch.mockResolvedValue({});
    consent.check.mockResolvedValueOnce({ ok: true });
    emailAdapter.send.mockResolvedValueOnce({ state: 'sent', failureReason: null });

    await service.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [USER_ID] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test', text: 'Body', html: '<p>Body</p>' },
    });

    // Verify resolveUser was called (2nd GET call, after resolveRecipients)
    expect(dx.get).toHaveBeenCalledTimes(2);
    const resolveUserCall = dx.get.mock.calls[1]?.[0] as string;
    expect(resolveUserCall).toContain(`/users/${USER_ID}`);
    expect(resolveUserCall).toContain('notification_email_enabled');
    expect(resolveUserCall).toContain('notification_telegram_enabled');
  });

  // ─── 7. Multiple recipients — each evaluated independently ────────────

  it('evaluates channel toggles per recipient independently', async () => {
    const USER_ID_2 = '44444444-4444-4000-8000-000000000004';
    const DELIVERY_ID_2 = '55555555-5555-4000-8000-000000000005';

    dx.get
      .mockResolvedValueOnce({
        data: [
          {
            id: USER_ID,
            email: 'user1@example.com',
            country: 'uz',
            notification_email_enabled: false,
            notification_telegram_enabled: true,
          },
          {
            id: USER_ID_2,
            email: 'user2@example.com',
            country: 'kz',
            notification_email_enabled: true,
            notification_telegram_enabled: true,
          },
        ],
      })
      // resolveUser for USER_ID (disabled)
      .mockResolvedValueOnce({
        data: {
          id: USER_ID,
          email: 'user1@example.com',
          notification_email_enabled: false,
          notification_telegram_enabled: true,
        },
      })
      // resolveUser for USER_ID_2 (enabled)
      .mockResolvedValueOnce({
        data: {
          id: USER_ID_2,
          email: 'user2@example.com',
          notification_email_enabled: true,
          notification_telegram_enabled: true,
        },
      });

    dx.post
      .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })
      .mockResolvedValueOnce({ data: { id: DELIVERY_ID } })
      .mockResolvedValueOnce({ data: { id: DELIVERY_ID_2 } });
    dx.patch.mockResolvedValue({});
    consent.check.mockResolvedValue({ ok: true });
    emailAdapter.send.mockResolvedValue({ state: 'sent', failureReason: null });

    const result = await service.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [USER_ID, USER_ID_2] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test', text: 'Body', html: '<p>Body</p>' },
    });

    expect(result.deliveries).toHaveLength(2);
    // First user: skipped (master toggle off)
    expect(result.deliveries[0]?.state).toBe('skipped_channel_disabled');
    expect(result.deliveries[0]?.recipientUserId).toBe(USER_ID);
    // Second user: sent (master toggle on)
    expect(result.deliveries[1]?.state).toBe('sent');
    expect(result.deliveries[1]?.recipientUserId).toBe(USER_ID_2);
    
    // Consent check called only once (for USER_ID_2)
    expect(consent.check).toHaveBeenCalledTimes(1);
    // Adapter called only once (for USER_ID_2)
    expect(emailAdapter.send).toHaveBeenCalledTimes(1);
  });

  // ─── 8. Telegram opt-out timestamp is independent of master toggle ────

  it('respects master toggle even when telegram_opted_out_at is null', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [
          {
            id: USER_ID,
            email: 'user@example.com',
            country: 'uz',
            telegram_user_id: '123456',
            telegram_opted_out_at: null, // Not opted out via bot command
            notification_email_enabled: true,
            notification_telegram_enabled: false, // But master toggle is off
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          id: USER_ID,
          telegram_user_id: '123456',
          telegram_opted_out_at: null,
          notification_email_enabled: true,
          notification_telegram_enabled: false,
        },
      });

    dx.post
      .mockResolvedValueOnce({ data: { id: INTERACTION_ID } })
      .mockResolvedValueOnce({ data: { id: DELIVERY_ID } });
    dx.patch.mockResolvedValue({});

    const result = await service.dispatch({
      initiatorActor: 'system:reminder',
      intent: 'event_reminder_24h',
      audience: { userIds: [USER_ID] },
      consentBasis: 'operational_contract',
      consentScope: null,
      allowedChannels: ['telegram'],
      payload: { text: 'Reminder' },
    });

    // Master toggle should block delivery regardless of telegram_opted_out_at
    expect(result.deliveries[0]?.state).toBe('skipped_channel_disabled');
    expect(result.deliveries[0]?.failureReason).toBe('notification_telegram_enabled=false');
  });
});
