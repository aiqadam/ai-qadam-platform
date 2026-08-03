import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { DirectusClient } from '../../src/modules/directus/directus.client';
import { InteractionsService } from '../../src/modules/interactions/interactions.service';

// FR-NTF-005 — Dispatcher enforcement end-to-end with real DB.
// Verifies that master channel toggles actually prevent delivery
// in a real Directus environment.

let app: INestApplication;
let dx: DirectusClient;
let interactions: InteractionsService;

const TEST_USER_ID = '11111111-1111-4000-8000-000000000001';

beforeAll(async () => {
  // TODO: Start Testcontainers — Postgres + Directus
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();

  dx = moduleRef.get(DirectusClient);
  interactions = moduleRef.get(InteractionsService);

  // Create test user with notification_email_enabled=false
  await dx.post('/users', {
    id: TEST_USER_ID,
    email: 'test-disabled@example.com',
    password: 'test123',
    status: 'active',
    notification_email_enabled: false,
    notification_telegram_enabled: true,
  });
});

afterAll(async () => {
  // Clean up test user
  try {
    await dx.delete(`/users/${TEST_USER_ID}`);
  } catch {
    // Ignore cleanup errors
  }
  await app?.close();
  // TODO: Stop Testcontainers
});

describe('InteractionsService.dispatch — master toggle enforcement', () => {
  it('skips email delivery when notification_email_enabled=false', async () => {
    const result = await interactions.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [TEST_USER_ID] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test', text: 'Body', html: '<p>Body</p>' },
    });

    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]?.state).toBe('skipped_channel_disabled');
    expect(result.deliveries[0]?.failureReason).toBe('notification_email_enabled=false');
  });

  it('sends email delivery when notification_email_enabled=true', async () => {
    // Update user to enable email
    await dx.patch(`/users/${TEST_USER_ID}`, {
      notification_email_enabled: true,
    });

    const result = await interactions.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [TEST_USER_ID] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test', text: 'Body', html: '<p>Body</p>' },
    });

    expect(result.deliveries).toHaveLength(1);
    // State could be 'sent' or 'failed' depending on email adapter setup
    // but should NOT be 'skipped_channel_disabled'
    expect(result.deliveries[0]?.state).not.toBe('skipped_channel_disabled');
  });

  it('persists toggle state across multiple dispatches', async () => {
    // Disable email
    await dx.patch(`/users/${TEST_USER_ID}`, {
      notification_email_enabled: false,
    });

    // Dispatch twice
    const result1 = await interactions.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [TEST_USER_ID] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test 1', text: 'Body 1', html: '<p>Body 1</p>' },
    });

    const result2 = await interactions.dispatch({
      initiatorActor: 'operator:announcer',
      intent: 'newsletter',
      audience: { userIds: [TEST_USER_ID] },
      consentBasis: 'explicit_opt_in',
      consentScope: null,
      allowedChannels: ['email'],
      payload: { subject: 'Test 2', text: 'Body 2', html: '<p>Body 2</p>' },
    });

    // Both should be skipped
    expect(result1.deliveries[0]?.state).toBe('skipped_channel_disabled');
    expect(result2.deliveries[0]?.state).toBe('skipped_channel_disabled');
  });
});
