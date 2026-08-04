import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DirectusModule } from '../src/modules/directus/directus.module';
import { DirectusClient } from '../src/modules/directus/directus.client';
import { EventBroadcastService } from '../src/modules/workspace/event-broadcast.service';
import { MembersService } from '../src/modules/workspace/members.service';
import { InteractionsModule } from '../src/modules/interactions/interactions.module';
import { ThrottlerModule } from '@nestjs/throttler';

// FR-NTF-002: Event announcement topic-filtered fan-out integration tests.
//
// These tests verify topic-interest filtering against a live Directus instance
// (Testcontainers-provided Postgres). Tests cover:
//
// - AC-1: Members with matching topic interests receive announcements
// - AC-2: Members with no topic interests are excluded
// - AC-4: Tenant isolation (country filter) is enforced alongside topic filter
// - AC-5: Notification preferences are respected (though InteractionsService handles this)
//
// Prerequisite: Docker running for Testcontainers, PLUS a live Directus +
// Authentik reachable at DIRECTUS_URL / OIDC_ISSUER_URL (this module graph
// pulls in AuthModule via InteractionsModule, which discovers the OIDC
// issuer at bootstrap). Neither is provisioned in CI (only Postgres is,
// via test/setup-pg.ts) — skipped here until ISS-NTF-002-TESTINFRA adds
// that infrastructure. Run locally against the docker-compose stack:
// `pnpm test apps/api/test/event-broadcast-topic-filtering.integration.spec.ts`
describe.skip('EventBroadcastService topic filtering (integration)', () => {
  let module: TestingModule;
  let service: EventBroadcastService;
  let directus: DirectusClient;

  const TEST_COUNTRY = 'uz';
  const TEST_COUNTRY_ALT = 'kz';

  let topicAiMl: string;
  let topicPython: string;
  let topicFrontend: string;
  let memberWithAiMl: string;
  let memberWithPython: string;
  let memberWithBoth: string;
  let memberNoInterests: string;
  let memberKz: string;
  let eventWithTopics: string;
  let eventNoTopics: string;
  let eventKz: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [DirectusModule, InteractionsModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      providers: [EventBroadcastService, MembersService],
    }).compile();

    service = module.get<EventBroadcastService>(EventBroadcastService);
    directus = module.get<DirectusClient>(DirectusClient);

    // Seed test data
    await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    // beforeAll can throw before `module` is assigned (e.g. no live Directus
    // reachable) — guard so the real error surfaces instead of being masked
    // by a TypeError on `undefined.close()`.
    if (module) await module.close();
  });

  beforeEach(async () => {
    // Clear any prior event_announcements to ensure idempotency tests work
    const filter = encodeURIComponent(
      JSON.stringify({
        event: { _in: [eventWithTopics, eventNoTopics, eventKz] },
      }),
    );
    const existing = await directus.get<{ data: Array<{ id: string }> }>(
      `/items/event_announcements?filter=${filter}&fields=id&limit=100`,
    );
    for (const row of existing.data) {
      await directus.delete(`/items/event_announcements/${row.id}`);
    }
  });

  async function seedTestData() {
    // 1. Create topics
    const aiMlRes = await directus.post<{ data: { id: string } }>('/items/topics', {
      country: TEST_COUNTRY,
      slug: 'ai-ml-test',
      name: 'AI/ML',
      name_ru: 'ИИ/МО',
      sort: 1,
    });
    topicAiMl = aiMlRes.data.id;

    const pythonRes = await directus.post<{ data: { id: string } }>('/items/topics', {
      country: TEST_COUNTRY,
      slug: 'python-test',
      name: 'Python',
      name_ru: 'Python',
      sort: 2,
    });
    topicPython = pythonRes.data.id;

    const frontendRes = await directus.post<{ data: { id: string } }>('/items/topics', {
      country: TEST_COUNTRY,
      slug: 'frontend-test',
      name: 'Frontend',
      name_ru: 'Фронтенд',
      sort: 3,
    });
    topicFrontend = frontendRes.data.id;

    // 2. Create users
    const user1 = await directus.post<{ data: { id: string } }>('/users', {
      email: `member-aiml-${Date.now()}@test.local`,
      first_name: 'Member',
      last_name: 'AiMl',
      country: TEST_COUNTRY,
      notification_email_enabled: true,
      state: 'active',
    });
    memberWithAiMl = user1.data.id;

    const user2 = await directus.post<{ data: { id: string } }>('/users', {
      email: `member-python-${Date.now()}@test.local`,
      first_name: 'Member',
      last_name: 'Python',
      country: TEST_COUNTRY,
      notification_email_enabled: true,
      state: 'active',
    });
    memberWithPython = user2.data.id;

    const user3 = await directus.post<{ data: { id: string } }>('/users', {
      email: `member-both-${Date.now()}@test.local`,
      first_name: 'Member',
      last_name: 'Both',
      country: TEST_COUNTRY,
      notification_email_enabled: true,
      state: 'active',
    });
    memberWithBoth = user3.data.id;

    const user4 = await directus.post<{ data: { id: string } }>('/users', {
      email: `member-none-${Date.now()}@test.local`,
      first_name: 'Member',
      last_name: 'None',
      country: TEST_COUNTRY,
      notification_email_enabled: true,
      state: 'active',
    });
    memberNoInterests = user4.data.id;

    const user5 = await directus.post<{ data: { id: string } }>('/users', {
      email: `member-kz-${Date.now()}@test.local`,
      first_name: 'Member',
      last_name: 'Kz',
      country: TEST_COUNTRY_ALT,
      notification_email_enabled: true,
      state: 'active',
    });
    memberKz = user5.data.id;

    // 3. Create member_interests
    await directus.post('/items/member_interests', {
      member: memberWithAiMl,
      topic: topicAiMl,
      intent: 'interested_in',
    });

    await directus.post('/items/member_interests', {
      member: memberWithPython,
      topic: topicPython,
      intent: 'interested_in',
    });

    await directus.post('/items/member_interests', {
      member: memberWithBoth,
      topic: topicAiMl,
      intent: 'interested_in',
    });
    await directus.post('/items/member_interests', {
      member: memberWithBoth,
      topic: topicPython,
      intent: 'interested_in',
    });

    await directus.post('/items/member_interests', {
      member: memberKz,
      topic: topicAiMl,
      intent: 'interested_in',
    });

    // 4. Create events
    const evt1 = await directus.post<{ data: { id: string } }>('/items/events', {
      title: 'AI Qadam Test Event with Topics',
      status: 'draft',
      country: TEST_COUNTRY,
      starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
      location: 'Test Venue',
    });
    eventWithTopics = evt1.data.id;

    const evt2 = await directus.post<{ data: { id: string } }>('/items/events', {
      title: 'AI Qadam Test Event No Topics',
      status: 'draft',
      country: TEST_COUNTRY,
      starts_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
      location: 'Test Venue 2',
    });
    eventNoTopics = evt2.data.id;

    const evt3 = await directus.post<{ data: { id: string } }>('/items/events', {
      title: 'AI Qadam Test Event KZ',
      status: 'draft',
      country: TEST_COUNTRY_ALT,
      starts_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
      location: 'Almaty Test Venue',
    });
    eventKz = evt3.data.id;

    // 5. Create event_topics (only for eventWithTopics and eventKz)
    await directus.post('/items/event_topics', {
      event: eventWithTopics,
      topic: topicAiMl,
    });
    await directus.post('/items/event_topics', {
      event: eventWithTopics,
      topic: topicPython,
    });

    await directus.post('/items/event_topics', {
      event: eventKz,
      topic: topicAiMl,
    });
  }

  async function cleanupTestData() {
    // Order matters due to FK constraints
    if (eventWithTopics) await directus.delete(`/items/events/${eventWithTopics}`);
    if (eventNoTopics) await directus.delete(`/items/events/${eventNoTopics}`);
    if (eventKz) await directus.delete(`/items/events/${eventKz}`);

    if (memberWithAiMl) await directus.delete(`/users/${memberWithAiMl}`);
    if (memberWithPython) await directus.delete(`/users/${memberWithPython}`);
    if (memberWithBoth) await directus.delete(`/users/${memberWithBoth}`);
    if (memberNoInterests) await directus.delete(`/users/${memberNoInterests}`);
    if (memberKz) await directus.delete(`/users/${memberKz}`);

    if (topicAiMl) await directus.delete(`/items/topics/${topicAiMl}`);
    if (topicPython) await directus.delete(`/items/topics/${topicPython}`);
    if (topicFrontend) await directus.delete(`/items/topics/${topicFrontend}`);
  }

  // AC-1: Members with matching topic interests receive announcements
  it('sends announcements only to members with at least one matching topic interest', async () => {
    const result = await service.broadcastPublication(eventWithTopics);

    expect(result.status).toBe('dispatched');
    expect(result.recipientCount).toBe(3); // memberWithAiMl, memberWithPython, memberWithBoth
    expect(result.interactionId).toBeTruthy();

    // Verify that memberNoInterests and memberKz were excluded
    // (This is implicit in the recipientCount assertion, but we could also
    // query the interactions table to verify the exact audience if needed)
  });

  // AC-2: Members with no topic interests are excluded
  it('excludes members with no topic interests from the announcement', async () => {
    // Create a test event with only frontend topic (no members have this interest)
    const evtFrontend = await directus.post<{ data: { id: string } }>('/items/events', {
      title: 'Frontend Only Event',
      status: 'draft',
      country: TEST_COUNTRY,
      starts_at: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
      location: 'Frontend Venue',
    });
    await directus.post('/items/event_topics', {
      event: evtFrontend.data.id,
      topic: topicFrontend,
    });

    const result = await service.broadcastPublication(evtFrontend.data.id);

    expect(result.status).toBe('no_audience');
    expect(result.recipientCount).toBe(0);
    expect(result.interactionId).toBeNull();

    // Cleanup
    await directus.delete(`/items/events/${evtFrontend.data.id}`);
  });

  // AC-4: Tenant isolation — country filter is always enforced
  it('enforces tenant isolation by filtering on country alongside topic filter', async () => {
    // eventKz is a KZ event with AI/ML topic
    // Only memberKz should receive it (not UZ members even if they have AI/ML interest)
    const result = await service.broadcastPublication(eventKz);

    expect(result.status).toBe('dispatched');
    expect(result.recipientCount).toBe(1); // Only memberKz
    expect(result.interactionId).toBeTruthy();

    // Verify that UZ members were excluded despite having matching topic interests
  });

  // AC-3: Idempotency — second publication does not send duplicate
  it('is idempotent — second call returns already_dispatched', async () => {
    const firstResult = await service.broadcastPublication(eventWithTopics);
    expect(firstResult.status).toBe('dispatched');

    const secondResult = await service.broadcastPublication(eventWithTopics);
    expect(secondResult.status).toBe('already_dispatched');
    expect(secondResult.interactionId).toBe(firstResult.interactionId);
    expect(secondResult.recipientCount).toBe(firstResult.recipientCount);
  });

  // Fallback: Event with no topics sends to entire country
  it('broadcasts to entire country when event has no topics', async () => {
    const result = await service.broadcastPublication(eventNoTopics);

    expect(result.status).toBe('dispatched');
    // All UZ members: memberWithAiMl, memberWithPython, memberWithBoth, memberNoInterests
    expect(result.recipientCount).toBe(4);
    expect(result.interactionId).toBeTruthy();
  });
});
