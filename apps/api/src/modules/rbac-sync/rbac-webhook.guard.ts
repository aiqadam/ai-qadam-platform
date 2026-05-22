import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../../config/env';

// F-S2.2 (ADR-0021 §5) — webhook auth via URL-path secret.
//
// Original PR #201 used HMAC-SHA256 over the raw body. That approach
// required the upstream to set an Authorization header — but
// Authentik's Generic Webhook transport (the only mode available in
// CE 2026.x) exposes only { url, body template, content-type }. It
// cannot inject custom headers. Switched to URL-path secret (Slack/
// GitHub-style: caller knows the URL, the URL itself is the credential).
// Timing-safe compare on the path segment.
//
// Same env var (AUTHENTIK_WEBHOOK_SECRET) — operators rotate it by
// changing the env + updating Authentik's webhook URL in lockstep.

@Injectable()
export class RbacWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!env.AUTHENTIK_WEBHOOK_SECRET) {
      throw new ServiceUnavailableException('rbac_webhook_not_configured');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.params?.secret;
    if (typeof provided !== 'string' || provided.length === 0) {
      throw new UnauthorizedException('missing_secret');
    }
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(env.AUTHENTIK_WEBHOOK_SECRET);
    if (providedBuf.length !== expectedBuf.length) {
      throw new UnauthorizedException('secret_mismatch');
    }
    if (!timingSafeEqual(providedBuf, expectedBuf)) {
      throw new UnauthorizedException('secret_mismatch');
    }
    return true;
  }
}
