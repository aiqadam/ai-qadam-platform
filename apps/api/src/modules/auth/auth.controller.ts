import {
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
import type { Request, Response } from 'express';
import { UsersService } from '../users/users.service';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';

// Per ADR-0016: __Host- prefix enforces Secure + no Domain attribute + path=/.
const REFRESH_COOKIE = '__Host-aiqadam-refresh';
const REFRESH_COOKIE_PATH = '/v1/auth';
const FLOW_COOKIE = '__Host-aiqadam-oauth-flow';
const FLOW_COOKIE_PATH = '/v1/auth';

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
  ) {}

  // Step 1 — browser hits this, gets redirected to Authentik. We set a short
  // signed cookie carrying state + PKCE verifier; callback validates it.
  @Get('login')
  async login(@Res({ passthrough: false }) res: Response): Promise<void> {
    const { authorizeUrl, flowToken, flowExpiresIn } = await this.auth.startAuthorization();
    res.cookie(FLOW_COOKIE, flowToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: FLOW_COOKIE_PATH,
      maxAge: flowExpiresIn * 1000,
    });
    res.redirect(authorizeUrl);
  }

  // Step 2 — Authentik redirects the browser back here with ?code=&state=.
  // We exchange the code, mint our own session, set the refresh cookie, and
  // redirect the browser to the web app. The access token is NOT in the URL —
  // the web's first render calls /refresh to mint it from the cookie.
  @Get('callback')
  async callback(@Req() req: Request, @Res({ passthrough: false }) res: Response): Promise<void> {
    const flowToken = req.cookies?.[FLOW_COOKIE];
    const claims = await this.auth.completeAuthorization({
      flowToken,
      callbackParams: req.query as Record<string, string | undefined>,
    });

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

    res.clearCookie(FLOW_COOKIE, { path: FLOW_COOKIE_PATH });
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    res.redirect(this.auth.postCallbackRedirectUrl());
  }

  // Web app calls this on 401-then-retry and on first-render (via Astro
  // middleware). Reads the cookie, rotates it, returns a new access token.
  // TODO(viktor, 2026-05-15): rate-limit per ADR-0016 (5 / 15 min / IP).
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const token = req.cookies?.[REFRESH_COOKIE];
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

    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, expiresIn: 600 };
  }

  // Single-device logout: revoke this token's family + clear cookie.
  // RP-initiated logout (ending Authentik's own session) is a follow-up.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (typeof token === 'string' && token.length > 0) {
      try {
        const { familyId } = await this.refreshTokens.consume(token);
        await this.refreshTokens.revokeFamily(familyId);
      } catch {
        // Token already invalid — clearing the cookie is still the right move.
      }
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
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
