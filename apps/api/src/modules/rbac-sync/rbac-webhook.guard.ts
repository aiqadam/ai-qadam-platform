import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../../config/env';

// F-S2.2 (ADR-0021 §5) — HMAC-SHA256 verification for the Authentik
// webhook. Signature must arrive as `X-Aiqadam-Signature: sha256=<hex>`
// computed over the raw request body using AUTHENTIK_WEBHOOK_SECRET.
//
// When the secret is unset, the endpoint returns 503 — this lets the
// API boot cleanly in CI / during the Authentik-side configuration
// window without making the webhook a hard prerequisite.

const SIG_HEADER = 'x-aiqadam-signature';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Injectable()
export class RbacWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!env.AUTHENTIK_WEBHOOK_SECRET) {
      throw new ServiceUnavailableException('rbac_webhook_not_configured');
    }
    const req = context.switchToHttp().getRequest<RawBodyRequest>();
    const raw = req.rawBody;
    if (!raw || raw.length === 0) {
      throw new UnauthorizedException('missing_body');
    }
    const provided = req.header(SIG_HEADER);
    if (!provided) {
      throw new UnauthorizedException('missing_signature');
    }
    const match = /^sha256=([0-9a-f]{64})$/i.exec(provided);
    if (!match) {
      throw new UnauthorizedException('signature_format_invalid');
    }
    const expected = createHmac('sha256', env.AUTHENTIK_WEBHOOK_SECRET).update(raw).digest('hex');
    const providedBuf = Buffer.from(match[1] ?? '', 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (providedBuf.length !== expectedBuf.length) {
      throw new UnauthorizedException('signature_mismatch');
    }
    if (!timingSafeEqual(providedBuf, expectedBuf)) {
      throw new UnauthorizedException('signature_mismatch');
    }
    return true;
  }
}
