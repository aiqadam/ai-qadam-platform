import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerException,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { ObserveThrottlerGuard } from '../src/lib/observe-throttler.guard';

// The guard reads env.RATE_LIMIT_ENFORCE at call time. env is a plain object
// parsed once from process.env; mutate-and-restore is the simplest way to
// exercise both branches without re-parsing the whole schema.
const ORIGINAL_ENFORCE = env.RATE_LIMIT_ENFORCE;

const options = { throttlers: [{ limit: 60, ttl: 60_000 }] } as ThrottlerModuleOptions;
const storage = { increment: vi.fn() } as unknown as ThrottlerStorage;

const guard = new ObserveThrottlerGuard(options, storage, new Reflector());

const ctxFor = (req: Partial<Request>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: <T>() => req as T,
      getResponse: <T>() => ({}) as T,
      getNext: <T>() => ({}) as T,
    }),
  }) as ExecutionContext;

const limitDetail: ThrottlerLimitDetail = {
  limit: 60,
  ttl: 60_000,
  key: 'test-key',
  tracker: '1.2.3.4',
  totalHits: 61,
  timeToExpire: 30,
  isBlocked: false,
  timeToBlockExpire: 0,
};

// throwThrottlingException / shouldSkip are protected; cast to reach them.
const callThrow = (g: ObserveThrottlerGuard, ctx: ExecutionContext) =>
  (
    g as unknown as {
      throwThrottlingException(c: ExecutionContext, d: ThrottlerLimitDetail): Promise<void>;
    }
  ).throwThrottlingException(ctx, limitDetail);

const callShouldSkip = (g: ObserveThrottlerGuard, ctx: ExecutionContext) =>
  (g as unknown as { shouldSkip(c: ExecutionContext): Promise<boolean> }).shouldSkip(ctx);

describe('ObserveThrottlerGuard', () => {
  afterEach(() => {
    env.RATE_LIMIT_ENFORCE = ORIGINAL_ENFORCE;
    vi.restoreAllMocks();
  });

  it('observe mode (enforce=false): logs and allows the over-limit request', async () => {
    env.RATE_LIMIT_ENFORCE = false;
    const ctx = ctxFor({ method: 'POST', path: '/v1/auth/refresh', ip: '1.2.3.4' });
    await expect(callThrow(guard, ctx)).resolves.toBeUndefined();
  });

  it('enforce mode (enforce=true): throws ThrottlerException (HTTP 429)', async () => {
    env.RATE_LIMIT_ENFORCE = true;
    const ctx = ctxFor({ method: 'POST', path: '/v1/auth/refresh', ip: '1.2.3.4' });
    await expect(callThrow(guard, ctx)).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('always skips the /health liveness probe', async () => {
    await expect(callShouldSkip(guard, ctxFor({ path: '/health' }))).resolves.toBe(true);
    await expect(callShouldSkip(guard, ctxFor({ path: '/health/ready' }))).resolves.toBe(true);
  });

  it('does not skip a normal route', async () => {
    await expect(callShouldSkip(guard, ctxFor({ path: '/v1/leads' }))).resolves.toBe(false);
  });
});
