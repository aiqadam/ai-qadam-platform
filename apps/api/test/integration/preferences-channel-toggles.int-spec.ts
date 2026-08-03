import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { JwtService } from '../../src/modules/auth/jwt.service';

// FR-NTF-005 — Full preferences API round-trip with real Directus.
// Uses Testcontainers to spin up Postgres + Directus.
// Tests GET/PATCH /v1/me/preferences/consents with channel toggles.

let app: INestApplication;
let jwtService: JwtService;
let authToken: string;

const TEST_USER_ID = '11111111-1111-4000-8000-000000000001';

beforeAll(async () => {
  // TODO: Start Testcontainers — Postgres + Directus
  // For now, assumes local Directus is running on port 8055
  // Full Testcontainers setup follows existing pattern in other integration tests

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();

  jwtService = moduleRef.get(JwtService);
  const claims = {
    sub: TEST_USER_ID,
    authentikSubject: 'test-sub',
    email: 'test@example.com',
  };
  authToken = await jwtService.sign(claims);
});

afterAll(async () => {
  await app?.close();
  // TODO: Stop Testcontainers
});

describe('GET /v1/me/preferences/consents — includes channel toggles', () => {
  it('returns channels field with both toggles', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/me/preferences/consents')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('consents');
    expect(res.body).toHaveProperty('channels');
    expect(res.body.channels).toHaveProperty('notification_email_enabled');
    expect(res.body.channels).toHaveProperty('notification_telegram_enabled');
    expect(typeof res.body.channels.notification_email_enabled).toBe('boolean');
    expect(typeof res.body.channels.notification_telegram_enabled).toBe('boolean');
  });
});

describe('PATCH /v1/me/preferences/consents — update channel toggles', () => {
  it('updates notification_email_enabled and returns updated state', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/me/preferences/consents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ notification_email_enabled: false })
      .expect(200);

    expect(res.body).toHaveProperty('channels');
    expect(res.body.channels.notification_email_enabled).toBe(false);

    // Verify persistence: GET again
    const getRes = await request(app.getHttpServer())
      .get('/v1/me/preferences/consents')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(getRes.body.channels.notification_email_enabled).toBe(false);
  });

  it('rejects when both topic and channel toggle are provided (XOR violation)', async () => {
    await request(app.getHttpServer())
      .patch('/v1/me/preferences/consents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        topic: 'newsletter',
        granted: true,
        notification_email_enabled: false,
      })
      .expect(400);
  });

  it('updates notification_telegram_enabled independently', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/me/preferences/consents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ notification_telegram_enabled: false })
      .expect(200);

    expect(res.body).toHaveProperty('channels');
    expect(res.body.channels.notification_telegram_enabled).toBe(false);
  });
});
