import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramAuthGuard } from '../src/modules/telegram/telegram-auth.guard';

const reqWithAuth = (header: string | undefined): Request =>
  ({
    header: (name: string) => (name.toLowerCase() === 'authorization' ? header : undefined),
  }) as unknown as Request;

const ctxFor = (req: Request): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: <T>() => req as T,
      getResponse: <T>() => ({}) as T,
      getNext: <T>() => ({}) as T,
    }),
  }) as ExecutionContext;

describe('TelegramAuthGuard', () => {
  const guard = new TelegramAuthGuard();
  const token = process.env.TELEGRAM_BOT_SERVICE_TOKEN ?? '';

  it('rejects requests with no Authorization header', () => {
    expect(() => guard.canActivate(ctxFor(reqWithAuth(undefined)))).toThrow(UnauthorizedException);
  });

  it('rejects requests without the Bearer scheme', () => {
    expect(() => guard.canActivate(ctxFor(reqWithAuth(`Token ${token}`)))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests with a length-matched-but-wrong Bearer token', () => {
    // Same length as the real token but different bytes — proves we check
    // bytes, not just length. timingSafeEqual would crash on different-length
    // inputs, so the guard short-circuits on length first.
    const sameLenWrong = 'X'.repeat(token.length);
    expect(() => guard.canActivate(ctxFor(reqWithAuth(`Bearer ${sameLenWrong}`)))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests with a wrong-length Bearer token', () => {
    expect(() => guard.canActivate(ctxFor(reqWithAuth('Bearer too-short')))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts requests carrying the matching Bearer token from env', () => {
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(guard.canActivate(ctxFor(reqWithAuth(`Bearer ${token}`)))).toBe(true);
  });

  it('is case-insensitive on the Bearer scheme prefix', () => {
    expect(guard.canActivate(ctxFor(reqWithAuth(`bearer ${token}`)))).toBe(true);
    expect(guard.canActivate(ctxFor(reqWithAuth(`BEARER ${token}`)))).toBe(true);
  });
});

// Degraded-mode behavior: when TELEGRAM_BOT_SERVICE_TOKEN is unset, the
// guard returns 503 telegram_not_configured instead of crashing the
// app at boot. Tested via vi.resetModules + dynamic import after
// scrubbing the env var.
describe('TelegramAuthGuard — degraded mode (not configured)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('throws 503 telegram_not_configured when env var is unset', async () => {
    const stashed = process.env.TELEGRAM_BOT_SERVICE_TOKEN;
    // delete is the right semantic here — process.env assignment coerces
    // values to strings (`= undefined` sets the literal "undefined"). The
    // biome perf rule is a microbenchmark concern that doesn't apply to
    // one-off test setup.
    // biome-ignore lint/performance/noDelete: needed to truly unset process.env entry
    delete process.env.TELEGRAM_BOT_SERVICE_TOKEN;
    try {
      vi.resetModules();
      // Dynamic import so env.ts re-runs against the scrubbed process.env.
      const guardModule = await import('../src/modules/telegram/telegram-auth.guard');
      const guard = new guardModule.TelegramAuthGuard();
      try {
        guard.canActivate(ctxFor(reqWithAuth('Bearer anything')));
        throw new Error('expected HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const status = (err as HttpException).getStatus();
        expect(status).toBe(503);
        const body = (err as HttpException).getResponse() as { error: string };
        expect(body.error).toBe('telegram_not_configured');
      }
    } finally {
      if (stashed !== undefined) {
        process.env.TELEGRAM_BOT_SERVICE_TOKEN = stashed;
      }
    }
  });
});
