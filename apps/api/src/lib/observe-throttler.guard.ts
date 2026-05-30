import { type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';
import { env } from '../config/env';

// Observe-before-enforce rate limiter (hardening backlog C1, phase 1).
//
// The platform had NO request rate limiting (OWASP ASVS V11 / SECURITY.md gap):
// auth callback/refresh, registration, and lead capture were open to credential
// stuffing and abuse. This guard puts @nestjs/throttler on the global request
// path WITHOUT enforcing yet — when RATE_LIMIT_ENFORCE is false (the default) a
// request that exceeds the limit is logged and ALLOWED. We use those
// "would-throttle" logs to size real per-route limits against live traffic
// (notably the /v1/auth/refresh storm every web island fires) before flipping
// enforcement on in a later, deliberate change.
//
// Phase 2 (separate PR) will: (a) set Express `trust proxy` so req.ip is the
// real client IP behind Traefik rather than the proxy's — until then the
// observed IP is the proxy's, which is itself a useful finding; (b) swap the
// in-memory store for a Redis-backed one (reuse the ioredis client) so limits
// hold across replicas; (c) add @Throttle / @SkipThrottle per route; (d) flip
// RATE_LIMIT_ENFORCE=true.
@Injectable()
export class ObserveThrottlerGuard extends ThrottlerGuard {
  private readonly observeLogger = new Logger('RateLimit');

  // The liveness probe is hit every ~30s by Gatus/Coolify — never a candidate
  // for throttling, in observe OR enforce mode.
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    return req.path === '/health' || req.path.startsWith('/health/');
  }

  // Invoked when a tracker exceeds its limit. Observe mode logs and returns
  // (request proceeds); enforce mode defers to the parent (HTTP 429 +
  // Retry-After).
  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    if (!env.RATE_LIMIT_ENFORCE) {
      const req = context.switchToHttp().getRequest<Request>();
      this.observeLogger.warn(
        `would-throttle ${req.method} ${req.path} ip=${req.ip ?? 'unknown'} ` +
          `hits=${throttlerLimitDetail.totalHits} limit=${throttlerLimitDetail.limit} ` +
          `ttlMs=${throttlerLimitDetail.ttl}`,
      );
      return;
    }
    await super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
