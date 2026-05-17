import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { UsersService } from '../users/users.service';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { JtiRevocationService } from './jti-revocation.service';
import { JwtService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';

// COOKIES — see docs/auth-architecture.md §"Cookies"
//
// REFRESH_COOKIE — opaque refresh token. Domain=.aiqadam.org so a sign-in
// on uz.aiqadam.org is also live on kz/tj/admin/global. We dropped the
// Phase 1 __Host- prefix because it's mutually exclusive with the Domain
// attribute. HttpOnly + Secure + SameSite=Lax preserve the rest of the
// guarantees. SameSite=Lax keeps the cookie attached to top-level
// navigations (the OIDC callback) but not to cross-site iframes.
//
// FLOW_COOKIE — short-lived signed JWT holding the OAuth state + PKCE
// verifier + the post-login `next` URL. 60 second TTL — only has to
// survive the round-trip to Authentik. Same Domain so the callback can
// read it even if Authentik redirects to a sibling subdomain (it won't,
// but we don't want to take a dependency on that).

const COOKIE_DOMAIN = env.NODE_ENV === 'production' ? '.aiqadam.org' : undefined;
const COOKIE_BASE: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV !== 'development',
  sameSite: 'lax',
  path: '/',
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
};
const REFRESH_COOKIE = 'aiqadam-refresh';
const FLOW_COOKIE = 'aiqadam-oauth-flow';
const LEGACY_REFRESH_COOKIE = '__Host-aiqadam-refresh';
const LEGACY_FLOW_COOKIE = '__Host-aiqadam-oauth-flow';

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
    private readonly directusBridge: DirectusUsersBridgeService,
  ) {}

  // GET /v1/auth/login?next=/somewhere — top-level browser navigation, NOT
  // an XHR. Sets a 60s flow cookie carrying state + PKCE verifier + the
  // sanitised next path, then 302s to Authentik's authorize endpoint.
  @Get('login')
  async login(
    @Query('next') nextRaw: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const next = sanitiseNext(nextRaw);
    const { authorizeUrl, flowToken, flowExpiresIn } = await this.auth.startAuthorization({ next });
    res.cookie(FLOW_COOKIE, flowToken, {
      ...COOKIE_BASE,
      maxAge: flowExpiresIn * 1000,
    });
    res.redirect(authorizeUrl);
  }

  // GET /v1/auth/callback?code=&state= — Authentik 302s the browser here
  // after the user signs in / signs up. We verify the flow cookie, swap
  // the code for an id_token, upsert the user, mint our session, set the
  // refresh cookie, and 302 the browser to `next`.
  @Get('callback')
  async callback(@Req() req: Request, @Res({ passthrough: false }) res: Response): Promise<void> {
    const flowToken =
      (req.cookies?.[FLOW_COOKIE] as string | undefined) ??
      (req.cookies?.[LEGACY_FLOW_COOKIE] as string | undefined);
    const { sub, email, displayName, next } = await this.auth.completeAuthorization({
      flowToken,
      callbackParams: req.query as Record<string, string | undefined>,
    });

    const user = await this.users.upsertByAuthentikSubject({
      authentikSubject: sub,
      email,
      ...(displayName !== undefined ? { displayName } : {}),
    });

    // Sprint 4.5: mirror into directus_users so member-side proxy
    // endpoints (regs, leaderboard) can reference this user. Bridge
    // internally catches its own errors — never blocks sign-in.
    await this.directusBridge.ensureLinked({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    const session = await this.auth.mintSession({
      userId: user.id,
      authentikSubject: user.authentikSubject,
      email: user.email,
    });

    res.clearCookie(FLOW_COOKIE, COOKIE_BASE);
    res.clearCookie(LEGACY_FLOW_COOKIE, { path: '/' });
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...COOKIE_BASE,
      expires: session.refreshExpiresAt,
    });
    res.redirect(this.auth.postLogoutRedirectUrl(next));
  }

  // POST /v1/auth/sign-out — XHR from the app. Revokes the refresh row
  // (replay-detected => whole family killed), deny-lists the access JWT's
  // jti in Redis for its remaining lifetime, clears both new + legacy
  // cookies on .aiqadam.org and on the current host.
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refreshToken =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ??
      (req.cookies?.[LEGACY_REFRESH_COOKIE] as string | undefined);
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      try {
        const { familyId } = await this.refreshTokens.consume(refreshToken);
        await this.refreshTokens.revokeFamily(familyId);
      } catch {
        // already invalid — clearing the cookie is still the right move
      }
    }
    const bearer = extractBearer(req);
    if (bearer) {
      try {
        const claims = await this.jwt.verify(bearer);
        const exp = typeof claims.exp === 'number' ? claims.exp : 0;
        const ttl = Math.max(1, exp - Math.floor(Date.now() / 1000));
        await this.revocations.revoke(claims.jti, ttl);
      } catch {
        // token invalid or already revoked — no-op
      }
    }
    clearRefreshCookies(res);
  }

  // POST /v1/auth/refresh — XHR. Rotates the refresh cookie + returns a
  // fresh access token. Replay-detection in the refresh service kills the
  // entire family if a previously-consumed token shows up.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const token =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ??
      (req.cookies?.[LEGACY_REFRESH_COOKIE] as string | undefined);
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
      ...COOKIE_BASE,
      expires: session.refreshExpiresAt,
    });
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

// `next` must be a same-origin relative path (begins with / but not //)
// — refuse anything else to prevent open-redirect via /login?next=…
function sanitiseNext(raw: string | undefined): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}

function clearRefreshCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, COOKIE_BASE);
  res.clearCookie(LEGACY_REFRESH_COOKIE, { path: '/' });
  res.clearCookie(LEGACY_FLOW_COOKIE, { path: '/' });
}

function extractBearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}
