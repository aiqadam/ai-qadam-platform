import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { JwtService } from '../../src/modules/auth/jwt.service';

// FR-NTF-005 — Topic interests CRUD operations with real Directus.
// Tests POST/DELETE /v1/me/profile/interests/:id.

let app: INestApplication;
let jwtService: JwtService;
let authToken: string;

const TEST_USER_ID = '11111111-1111-4000-8000-000000000001';
const TEST_TOPIC_ID = 'topic-001';

beforeAll(async () => {
  // TODO: Start Testcontainers — Postgres + Directus
  // For now, assumes local Directus is running on port 8055

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

describe('POST /v1/me/profile/interests — add topic interest', () => {
  it('creates a new interest record', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/me/profile/interests')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ topic_id: TEST_TOPIC_ID })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('topic_id', TEST_TOPIC_ID);
    expect(res.body).toHaveProperty('created_at');
  });

  it('returns 409 when adding duplicate interest', async () => {
    // Add once
    await request(app.getHttpServer())
      .post('/v1/me/profile/interests')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ topic_id: TEST_TOPIC_ID })
      .expect(201);

    // Try to add again
    await request(app.getHttpServer())
      .post('/v1/me/profile/interests')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ topic_id: TEST_TOPIC_ID })
      .expect(409);
  });
});

describe('DELETE /v1/me/profile/interests/:id — remove topic interest', () => {
  it('removes an existing interest record', async () => {
    // Add first
    const addRes = await request(app.getHttpServer())
      .post('/v1/me/profile/interests')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ topic_id: TEST_TOPIC_ID })
      .expect(201);

    const interestId = addRes.body.id;

    // Remove
    await request(app.getHttpServer())
      .delete(`/v1/me/profile/interests/${interestId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(204);
  });

  it('returns 404 when removing non-existent interest', async () => {
    await request(app.getHttpServer())
      .delete('/v1/me/profile/interests/99999999-9999-4000-8000-999999999999')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });
});

describe('GET /v1/me/profile — includes interests array', () => {
  it('returns user profile with interests array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('interests');
    expect(Array.isArray(res.body.interests)).toBe(true);
  });
});
