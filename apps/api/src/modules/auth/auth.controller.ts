import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { UsersService } from '../users/users.service';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { JtiRevocationService } from './jti-revocation.service';
import { JwtService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';

// Cross-subdomain cookies: scoped to .aiqadam.org so a session set on
// uz.aiqadam.org is also seen by kz / tj / admin / global. We deliberately
// drop the __Host- prefix from Phase 1 — it's incompatible with the
// Domain attribute, and we need Domain for multi-tenant UX. HttpOnly +
// Secure + SameSite=Lax preserve the rest of the original guarantees.
//
// Legacy __Host-* cookies (Phase 1) are still read on /sign-out so people
// with an old session can cleanly log out; otherwise the old refresh would
// rot in their browser.

const COOKIE_DOMAIN = env.NODE_ENV === 'production' ? '.aiqadam.org' : undefined;
const COOKIE_BASE: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV !== 'development',
  sameSite: 'lax',
  path: '/',
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
};
const REFRESH_COOKIE = 'aiqadam-refresh';
const LEGACY_REFRESH_COOKIE = '__Host-aiqadam-refresh';
const LEGACY_FLOW_COOKIE = '__Host-aiqadam-oauth-flow';

interface SignInBody {
  email?: string;
  password?: string;
}

interface SignInResponse {
  user: { id: string; email: string; displayName: string | null };
  accessToken: string;
  expiresIn: number;
}

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

interface MeResponse {
  id: string;
  email: string;
  authentikSubject: string;
}

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
    private readonly revocations: JtiRevocationService,
  ) {}

  // POST /v1/auth/sign-in — body { email, password }. Wraps Authentik's
  // ROPC grant so the user never sees an Authentik UI. On success: sets
  // the refresh cookie (.aiqadam.org domain), returns the access token
  // + user identity to the form.
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body() body: SignInBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignInResponse> {
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    if (!email || !password) {
      throw new BadRequestException('email and password are required');
    }
    const claims = await this.auth.signInWithPassword({ email, password });

    const user = await this.users.upsertByAuthentikSubject({
      authentikSubject: claims.sub,
      email: claims.email,
      ...(claims.displayName !== undefined ? { displayName: claims.displayName } : {}),
    });

    const session = await this.auth.mintSession({
      userId: user.id,
      authentikSubject: user.authentikSubject,
      email: user.email,
    });

    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      accessToken: session.accessToken,
      expiresIn: JwtService.ACCESS_TTL_SECONDS,
    };
  }

  // POST /v1/auth/sign-out — revokes the refresh row, deny-lists the
  // current access JWT (if Authorization header present) for its remaining
  // lifetime, clears both new + legacy cookies across the apex domain.
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    // Revoke refresh row (best-effort).
    const refreshToken = req.cookies?.[REFRESH_COOKIE] ?? req.cookies?.[LEGACY_REFRESH_COOKIE];
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      try {
        const { familyId } = await this.refreshTokens.consume(refreshToken);
        await this.refreshTokens.revokeFamily(familyId);
      } catch {
        // Already invalid — clearing the cookie is still the right move.
      }
    }

    // Deny-list the access JWT so the rest of its life can't be used.
    const bearer = extractBearer(req);
    if (bearer) {
      try {
        const claims = await this.jwt.verify(bearer);
        const exp = typeof claims.exp === 'number' ? claims.exp : 0;
        const ttl = Math.max(1, exp - Math.floor(Date.now() / 1000));
        await this.revocations.revoke(claims.jti, ttl);
      } catch {
        // Token invalid or already revoked — no-op.
      }
    }

    clearRefreshCookies(res);
  }

  // POST /v1/auth/refresh — rotates the refresh cookie + returns a new
  // access token. Same shape as Phase 1.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const token = req.cookies?.[REFRESH_COOKIE] ?? req.cookies?.[LEGACY_REFRESH_COOKIE];
    if (!token) {
      throw new UnauthorizedException('missing refresh cookie');
    }
    const consumed = await this.refreshTokens.consume(token);
    const user = await this.users.findById(consumed.userId);
    if (!user) {
      throw new UnauthorizedException('user no longer exists');
    }

    const session = await this.auth.mintSession({
      userId: user.id,
      authentikSubject: user.authentikSubject,
      email: user.email,
      familyId: consumed.familyId,
    });

    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    return { accessToken: session.accessToken, expiresIn: JwtService.ACCESS_TTL_SECONDS };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: Request): MeResponse {
    if (!req.user) {
      throw new UnauthorizedException('no claims attached');
    }
    return {
      id: req.user.sub,
      email: req.user.email,
      authentikSubject: req.user.authentikSubject,
    };
  }
}

function setRefreshCookie(res: Response, token: string, expires: Date): void {
  res.cookie(REFRESH_COOKIE, token, { ...COOKIE_BASE, expires });
}

function clearRefreshCookies(res: Response): void {
  // Clear the new domain-scoped cookie.
  res.clearCookie(REFRESH_COOKIE, COOKIE_BASE);
  // Clear legacy Phase 1 host-only cookies on whichever subdomain we're on.
  res.clearCookie(LEGACY_REFRESH_COOKIE, { path: '/' });
  res.clearCookie(LEGACY_FLOW_COOKIE, { path: '/' });
}

function extractBearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}
