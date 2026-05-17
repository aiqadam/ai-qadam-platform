import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../../config/env';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = req.header('x-internal-auth') ?? '';
    const expected = env.INTERNAL_API_TOKEN;

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
