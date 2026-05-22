import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../../config/env';

// Bearer-token guard for the AI Qadam Telegram bot + notifier service.
//
// ADR-0034 specifies `Authorization: Bearer <service-token>` for the
// sync surface (bot → API) — this is the m2m convention and matches the
// httpx client in the Python repo. The token is a long random string
// (≥32 chars) issued out-of-band and configured in both this API's env
// (`TELEGRAM_BOT_SERVICE_TOKEN`) and the bot repo's env
// (`AIQADAM_SERVICE_TOKEN`).
//
// Degraded mode
//   `TELEGRAM_BOT_SERVICE_TOKEN` is optional per env.ts. When unset, the
//   platform isn't broken — we return 503 `telegram_not_configured` so
//   the bot can detect the state and stop polling, and operators see a
//   meaningful status in the future /workspace/integrations/telegram
//   cabinet. This avoids the boot-crash trap and lets the platform run
//   without telegram fully wired.
//
// timingSafeEqual prevents the comparison from leaking the token length
// via per-byte short-circuit timing.
@Injectable()
export class TelegramAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = env.TELEGRAM_BOT_SERVICE_TOKEN;
    if (!expected) {
      // Degraded mode — telegram surface dormant until configured.
      throw new HttpException({ error: 'telegram_not_configured' }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    const req = ctx.switchToHttp().getRequest<Request>();
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
}
