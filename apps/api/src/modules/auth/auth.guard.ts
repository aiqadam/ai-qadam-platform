import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtService, type VerifiedClaims } from './jwt.service';

// Attaches verified access-token claims to `req.user`. Use on every route
// that requires authentication: @UseGuards(AuthGuard).
//
// Module-augment Express's Request once so consumers can read `req.user`
// without casts.
declare global {
  namespace Express {
    interface Request {
      user?: VerifiedClaims;
    }
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header('authorization');
    if (!header) {
      throw new UnauthorizedException('missing authorization header');
    }
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      throw new UnauthorizedException('authorization header must be Bearer');
    }
    const token = match[1];
    if (!token) {
      throw new UnauthorizedException('missing bearer token');
    }
    try {
      req.user = await this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('access token invalid');
    }
    return true;
  }
}
