import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../../config/env';
import { TgConfigService } from './tg-config.service';

// Bearer-token guard for the AI Qadam Telegram bot + notifier service.
//
// ADR-0034 specifies `Authorization: Bearer <service-token>` for the
// sync surface (bot → API) — this is the m2m convention and matches the
// httpx client in the Python repo.
//
// ─── Source of truth (R2 PR-3) ──────────────────────────────────────────────
//
// 1. DB first: `tg_config.encrypted_service_token` for the matching
//    tenant. Once an operator rotates via the cabinet, this is the
//    canonical store and the env var becomes deprecated.
// 2. Env fallback: `env.TELEGRAM_BOT_SERVICE_TOKEN`. Preserves the v1
//    boot-from-env behaviour so existing deploys keep working until
//    they're cut over via the cabinet rotation flow.
// 3. Neither set: degraded mode — 503 `telegram_not_configured`.
//
// Per-request DB hit is amortized by a 10s in-memory cache keyed by
// tenant. The bot polls /v1/telegram/inbound at ~1Hz; even with cache
// misses the planner reads a single indexed row.
//
// timingSafeEqual prevents the comparison from leaking the token length
// via per-byte short-circuit timing.

interface CachedToken {
  token: string;
  expiresAt: number;
  source: 'db' | 'env';
}

const CACHE_TTL_MS = 10_000;

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  private readonly logger = new Logger(TelegramAuthGuard.name);
  private readonly cache = new Map<string, CachedToken>();

  constructor(
    @Inject(forwardRef(() => TgConfigService))
    private readonly config: TgConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    // ADR-0034 ships a single global bot (tenant=null). Per-tenant
    // resolution lives here in case a future deploy revisits that.
    const tenant: string | null = null;

    const expected = await this.resolveToken(tenant);
    if (!expected) {
      throw new HttpException({ error: 'telegram_not_configured' }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    const header = req.header('authorization') ?? '';
    if (!header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException();
    }
    const provided = header.slice('bearer '.length).trim();

    if (provided.length !== expected.length) {
      throw new UnauthorizedException();
    }
    const ok = timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) {
      throw new UnauthorizedException();
    }
    return true;
  }

  // DB first, env fallback. Cached for CACHE_TTL_MS keyed by tenant.
  // The cache doesn't invalidate on rotation; the next miss after TTL
  // picks up the new value. The bot restarting after rotation closes
  // the worst-case 10s stale window immediately.
  private async resolveToken(tenant: string | null): Promise<string | null> {
    const cacheKey = tenant ?? '*';
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.token;
    }

    const dbToken = await this.readDbToken(tenant);
    const resolved = dbToken ?? this.readEnvToken();
    if (!resolved) return null;

    this.cache.set(cacheKey, {
      token: resolved.token,
      expiresAt: Date.now() + CACHE_TTL_MS,
      source: resolved.source,
    });
    if (resolved.source === 'env') {
      this.logger.warn(
        `service token resolved from env fallback for tenant=${cacheKey} — rotate via /admin/rotate-service-token to migrate to DB`,
      );
    }
    return resolved.token;
  }

  private async readDbToken(
    tenant: string | null,
  ): Promise<{ token: string; source: 'db' } | null> {
    try {
      const token = await this.config.getServiceToken(tenant);
      return token ? { token, source: 'db' } : null;
    } catch (err) {
      // Decryption / DB error — log + return null so caller can fall
      // through to env. Failing open on auth is worse than degraded
      // operation on telemetry.
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`getServiceToken(${tenant ?? '*'}) failed: ${reason}; falling back to env`);
      return null;
    }
  }

  private readEnvToken(): { token: string; source: 'env' } | null {
    const envToken = env.TELEGRAM_BOT_SERVICE_TOKEN;
    return envToken ? { token: envToken, source: 'env' } : null;
  }
}
