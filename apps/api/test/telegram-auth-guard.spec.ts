import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramAuthGuard } from '../src/modules/telegram/telegram-auth.guard';
import type { TgConfigService } from '../src/modules/telegram/tg-config.service';

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

// TgConfigService stub. Each test wires its own behaviour.
function makeConfigStub(getServiceToken: () => Promise<string | null>): TgConfigService {
  return { getServiceToken } as unknown as TgConfigService;
}

describe('TelegramAuthGuard — env-only path (DB has no service token)', () => {
  const envToken = process.env.TELEGRAM_BOT_SERVICE_TOKEN ?? '';
  const config = makeConfigStub(async () => null);
  const guard = new TelegramAuthGuard(config);

  it('rejects requests with no Authorization header', async () => {
    await expect(guard.canActivate(ctxFor(reqWithAuth(undefined)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests without the Bearer scheme', async () => {
    await expect(guard.canActivate(ctxFor(reqWithAuth(`Token ${envToken}`)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a length-matched-but-wrong Bearer token', async () => {
    const sameLenWrong = 'X'.repeat(envToken.length);
    await expect(guard.canActivate(ctxFor(reqWithAuth(`Bearer ${sameLenWrong}`)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the env token when DB has none', async () => {
    expect(envToken.length).toBeGreaterThanOrEqual(32);
    await expect(guard.canActivate(ctxFor(reqWithAuth(`Bearer ${envToken}`)))).resolves.toBe(true);
  });

  it('is case-insensitive on the Bearer scheme prefix', async () => {
    await expect(guard.canActivate(ctxFor(reqWithAuth(`bearer ${envToken}`)))).resolves.toBe(true);
    await expect(guard.canActivate(ctxFor(reqWithAuth(`BEARER ${envToken}`)))).resolves.toBe(true);
  });
});

describe('TelegramAuthGuard — DB takes precedence over env (R2 PR-3)', () => {
  const envToken = process.env.TELEGRAM_BOT_SERVICE_TOKEN ?? '';
  const dbToken = 'db_token_in_tg_config_encrypted_service_token_column_xxxxxxxx';
  const config = makeConfigStub(async () => dbToken);
  const guard = new TelegramAuthGuard(config);

  it('accepts the DB token', async () => {
    await expect(guard.canActivate(ctxFor(reqWithAuth(`Bearer ${dbToken}`)))).resolves.toBe(true);
  });

  it('rejects the env token when DB is the canonical source', async () => {
    // Env token still in process.env, but DB returns a different value.
    // DB takes precedence — guard should reject the env value.
    expect(envToken).not.toBe(dbToken);
    await expect(guard.canActivate(ctxFor(reqWithAuth(`Bearer ${envToken}`)))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('TelegramAuthGuard — DB read fails (graceful fallback to env)', () => {
  const envToken = process.env.TELEGRAM_BOT_SERVICE_TOKEN ?? '';
  const config = makeConfigStub(async () => {
    throw new Error('encryption key missing');
  });
  const guard = new TelegramAuthGuard(config);

  it('falls back to env token when DB throws', async () => {
    expect(envToken.length).toBeGreaterThanOrEqual(32);
    await expect(guard.canActivate(ctxFor(reqWithAuth(`Bearer ${envToken}`)))).resolves.toBe(true);
  });
});

describe('TelegramAuthGuard — degraded mode (no DB, no env)', () => {
  let stashed: string | undefined;

  beforeEach(() => {
    stashed = process.env.TELEGRAM_BOT_SERVICE_TOKEN;
    // biome-ignore lint/performance/noDelete: needed to truly unset process.env entry
    delete process.env.TELEGRAM_BOT_SERVICE_TOKEN;
    vi.resetModules();
  });

  afterEach(() => {
    if (stashed !== undefined) {
      process.env.TELEGRAM_BOT_SERVICE_TOKEN = stashed;
    }
    vi.resetModules();
  });

  it('throws 503 telegram_not_configured when both DB and env are absent', async () => {
    const guardModule = await import('../src/modules/telegram/telegram-auth.guard');
    const config = makeConfigStub(async () => null);
    const guard = new guardModule.TelegramAuthGuard(config);
    try {
      await guard.canActivate(ctxFor(reqWithAuth('Bearer anything')));
      throw new Error('expected HttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const status = (err as HttpException).getStatus();
      expect(status).toBe(503);
      const body = (err as HttpException).getResponse() as { error: string };
      expect(body.error).toBe('telegram_not_configured');
    }
  });
});

describe('TelegramAuthGuard — 10s in-memory cache', () => {
  const dbToken = 'cached_db_token_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  let dbReads = 0;
  const config = makeConfigStub(async () => {
    dbReads += 1;
    return dbToken;
  });
  const guard = new TelegramAuthGuard(config);

  it('reuses the cached token across rapid requests (one DB read)', async () => {
    dbReads = 0;
    await guard.canActivate(ctxFor(reqWithAuth(`Bearer ${dbToken}`)));
    await guard.canActivate(ctxFor(reqWithAuth(`Bearer ${dbToken}`)));
    await guard.canActivate(ctxFor(reqWithAuth(`Bearer ${dbToken}`)));
    // First call populated cache; remaining two are cache hits.
    expect(dbReads).toBe(1);
  });
});
