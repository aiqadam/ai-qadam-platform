import {
  BadRequestException,
  Body,
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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { emailField } from '../../lib/email-schema';
import { track } from '../../lib/ops-events';
import { passwordField } from '../../lib/password-schema';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { LeadsService } from '../leads/leads.service';
import { UsersService } from '../users/users.service';
import { AuthGuard } from './auth.guard';
import { AuthService, extractGroupsFromIdToken } from './auth.service';
import { JtiRevocationService } from './jti-revocation.service';
import { JwtService } from './jwt.service';
import {
  RefreshTokenInvalidError,
  RefreshTokenReplayError,
  RefreshTokenService,
} from './refresh-token.service';
import { RegistrationService } from './registration.service';
import {
  TelegramAuthService,
  telegramWidgetPayloadSchema,
  upsertTempUserBodySchema,
} from './telegram-auth.service';
import type { UpsertTempUserResult } from './telegram-auth.service';

// POST /v1/auth/register body — inline schema, matching this codebase's
// established convention (packages/shared-types is an empty, unused
// placeholder; every sibling endpoint defines its Zod schema inline —
// see leads.controller.ts's createSchema).
const registerSchema = z.object({
  email: emailField(200),
  // Length floor (12) matches the existing precedent at
  // admin-invites.service.ts's consumeInvite (password.length < 12), PLUS
  // a small weak/common-password rejection (retry pass — SecurityReviewer
  // MAJOR-3: length-only is a real weakening on a genuinely PUBLIC
  // endpoint, unlike admin-invites' operator-invited flow). See
  // lib/password-schema.ts for the full reasoning and the blocklist.
  password: passwordField(12),
  // Matches the VALID_COUNTRIES set duplicated in dashboard.controller.ts
  // and audit-events.controller.ts — "chapter" = country tenant, no new
  // entity (ISS-USR-REG-001 scope decision #1).
  country: z.enum(['uz', 'kz', 'tj', 'xx']),
  displayName: z.string().trim().min(1).max(100),
  // Anti-spam honeypot. Named `company` on the wire (NOT `honeypot`) —
  // retry pass, SecurityReviewer MAJOR-2: a literal `honeypot` field name
  // is trivially recognizable by bots that inspect field names before
  // filling. Matches LeadCaptureForm.tsx's exact convention (same
  // innocuous name, same hidden-field treatment). Zod key name and HTML
  // `name=` attribute must agree on the wire — see SignUpForm.tsx.
  company: z.string().optional(), // must be empty — anti-spam, mirrors leads.controller.ts
});

// COOKIES — see docs/04-development/architecture/auth-architecture.md §"Cookies"
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

interface SignOutResponse {
  // OIDC RP-Initiated Logout URL the client must navigate the BROWSER
  // to. Authentik kills the IdP session and 302s back to
  // /auth/signed-out. null when no id_token_hint is available — caller
  // navigates to /auth/signed-out directly and accepts that the
  // Authentik session lingers (degraded mode; only happens for refresh
  // rows that predate the id_token column or when the issuer doesn't
  // advertise end_session_endpoint).
  logoutUrl: string | null;
}

interface MeResponse {
  id: string;
  email: string;
  authentikSubject: string;
  // Authentik group names — used by the web nav to render Workspace +
  // Engineering Deck links per role (ADR-0037). Source-of-truth lives in
  // Authentik; we cache via the access JWT and re-source on each refresh
  // by decoding the stored id_token.
  groups: string[];
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
    private readonly leads: LeadsService,
    private readonly telegramAuth: TelegramAuthService,
    private readonly registration: RegistrationService,
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
    let sub: string;
    let email: string;
    let displayName: string | undefined;
    let idToken: string | undefined;
    let groups: string[];
    let next: string;
    try {
      ({ sub, email, displayName, idToken, groups, next } = await this.auth.completeAuthorization({
        flowToken,
        callbackParams: req.query as Record<string, string | undefined>,
      }));
    } catch (err) {
      // Emit ops event for observability dashboards (Plausible). Reason is
      // the error class — e.g. "BadFlowCookie", "InvalidStateError" — so
      // operator can spot a CSRF probe vs an Authentik outage. Fire-and-
      // forget; never blocks the (re-)thrown error.
      void track('auth.failed', {
        reason: err instanceof Error ? err.constructor.name : 'unknown',
        path: 'callback',
      });
      throw err;
    }

    const user = await this.users.upsertByAuthentikSubject({
      authentikSubject: sub,
      email,
      ...(displayName !== undefined ? { displayName } : {}),
    });

    // Sprint 4.5: mirror into directus_users so member-side proxy
    // endpoints (regs, leaderboard) can reference this user. Bridge
    // internally catches its own errors — never blocks sign-in.
    const directusUserId = await this.directusBridge.ensureLinked({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    // F-S1.6 — if this email belongs to an existing lead, upgrade
    // their state to 'member' + dispatch the conversion email.
    // Best-effort: failures don't block sign-in (logged + swallowed
    // inside the service).
    if (directusUserId) {
      this.leads.convertLeadToMember(directusUserId, user.email).catch((err) => {
        // Already-logged inside the service; this catch just keeps
        // the promise rejection from bubbling to the OIDC flow.
        void err;
      });
    }

    const session = await this.auth.mintSession({
      userId: user.id,
      authentikSubject: user.authentikSubject,
      email: user.email,
      idToken: idToken ?? null,
      groups,
    });

    res.clearCookie(FLOW_COOKIE, COOKIE_BASE);
    res.clearCookie(LEGACY_FLOW_COOKIE, { path: '/' });
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...COOKIE_BASE,
      expires: session.refreshExpiresAt,
    });
    res.redirect(this.auth.postLoginRedirectUrl(next));
  }

  // POST /v1/auth/sign-out — XHR from the app. Three responsibilities,
  // in order:
  //   1. Look up the id_token from the current refresh row (read-only)
  //      so we can build an OIDC RP-Initiated Logout URL with hint.
  //   2. Tear down our local session: revoke the refresh family
  //      (replay-protected — entire chain killed), deny-list the
  //      access JWT's jti in Redis for its remaining lifetime, clear
  //      both new + legacy cookies on .aiqadam.org.
  //   3. Return the Authentik end_session URL so the client can drive
  //      the browser through it. THIS is what makes sign-out a real
  //      logout instead of a local-only clear — SSO ⇒ SLO. Without it
  //      the IdP session lingers and the next /login silently SSO's
  //      the user back in (security regression — confirmed in prod
  //      2026-05-23).
  //
  // Degraded fallback: when the refresh cookie is absent but the bearer
  // is a valid (i.e. not denylisted, not malformed) access token, we
  // STILL build a no-hint end_session URL. This covers the orphaned-
  // session case where a prior refresh-token race revoked the family +
  // cleared the cookie while the React island that lost the race kept
  // a valid access token in JS memory. Without this fallback that user
  // gets stuck in the silent-resign-in loop (logoutUrl=null → local
  // clear → next /login silent-SSO's them back in). Cost: the no-hint
  // URL triggers Authentik's "confirm logout?" page per OIDC RP-Initiated
  // Logout 1.0 §2 — degraded UX, but strictly better than the loop.
  //
  // Only returns `logoutUrl: null` when there's no auth signal at all
  // (no cookie + no valid bearer) — i.e. the request is anonymous and
  // there's nothing to log out from.
  @Post('sign-out')
  @HttpCode(HttpStatus.OK)
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignOutResponse> {
    const refreshToken =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ??
      (req.cookies?.[LEGACY_REFRESH_COOKIE] as string | undefined);
    let logoutUrl: string | null = null;
    let sawSession = false;
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      sawSession = true;
      // Peek BEFORE consume: consume() marks usedAt — the row still
      // carries the id_token afterwards, but reading first keeps the
      // logout-URL construction independent of the revoke result. If
      // consume throws (replay, expired, already revoked) we still
      // want to surface a logout URL when we have a hint.
      const idToken = await this.refreshTokens.peekIdToken(refreshToken).catch(() => null);
      logoutUrl = this.auth.buildLogoutUrl(idToken);
      try {
        const { familyId } = await this.refreshTokens.consume(refreshToken);
        await this.refreshTokens.revokeFamily(familyId);
      } catch {
        // already invalid — local clear + IdP logout still need to run
      }
    }
    if (await this.revokeBearerJti(req)) {
      sawSession = true;
    }
    // Degraded fallback: bearer-proven session but no usable id_token.
    // buildLogoutUrl(null) returns a no-hint URL (with confirmation page).
    if (logoutUrl === null && sawSession) {
      logoutUrl = this.auth.buildLogoutUrl(null);
    }
    clearRefreshCookies(res);
    return { logoutUrl };
  }

  // Helper for /sign-out: if the request carries a Bearer access token,
  // verify it and deny-list its jti for the remaining lifetime. Returns
  // true iff verification succeeded (= proof of a session for the caller's
  // identity) so the caller can decide whether to fall back to the no-hint
  // logout URL. Extracted from signOut to keep the controller method
  // under the cognitive-complexity ceiling.
  private async revokeBearerJti(req: Request): Promise<boolean> {
    const bearer = extractBearer(req);
    if (!bearer) return false;
    try {
      const claims = await this.jwt.verify(bearer);
      const exp = typeof claims.exp === 'number' ? claims.exp : 0;
      const ttl = Math.max(1, exp - Math.floor(Date.now() / 1000));
      await this.revocations.revoke(claims.jti, ttl);
      return true;
    } catch {
      // token invalid or already revoked — no proof of session
      return false;
    }
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
    let consumed: Awaited<ReturnType<RefreshTokenService['consume']>>;
    try {
      consumed = await this.refreshTokens.consume(token);
    } catch (err) {
      // Domain errors from the refresh service (revoked / expired / not
      // recognized / replay) must become 401 — the user's cookie is bad,
      // not the server. Without this catch, Nest's default filter maps
      // these to 500 and the form shows "Backend error checking admin
      // permission" instead of redirecting to sign-in.
      if (err instanceof RefreshTokenInvalidError || err instanceof RefreshTokenReplayError) {
        clearRefreshCookies(res);
        throw new UnauthorizedException(`refresh_invalid:${err.message}`);
      }
      throw err;
    }
    const user = await this.users.findById(consumed.userId);
    if (!user) {
      throw new UnauthorizedException('user no longer exists');
    }
    const session = await this.auth.mintSession({
      userId: user.id,
      authentikSubject: user.authentikSubject,
      email: user.email,
      familyId: consumed.familyId,
      // Carry the id_token forward unchanged so the next /sign-out can
      // still build an RP-Initiated Logout URL after N rotations.
      idToken: consumed.idToken,
      // Re-source groups from the stored id_token on every refresh so
      // role changes in Authentik propagate within one refresh cycle
      // (max ~15 min). No DB schema change required — the id_token
      // already carries the claim.
      groups: extractGroupsFromIdToken(consumed.idToken),
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
      groups: req.user.groups ?? [],
    };
  }

  // POST /v1/auth/telegram/exchange — public endpoint (no AuthGuard).
  // Accepts Telegram Login Widget fields, verifies HMAC-SHA256, looks up
  // or creates an Authentik user, mints a recovery link, and 302-redirects
  // the browser through the Authentik one-time login URL.
  //
  // Rate-limited: 5 requests per 15 minutes per IP (security.md §Rate limiting
  // requires 5/15 min for auth endpoints — not the looser global 60/60 s ceiling).
  @Post('telegram/exchange')
  @HttpCode(HttpStatus.FOUND)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async telegramExchange(
    @Body() body: unknown,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const parsed = telegramWidgetPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const recoveryUrl = await this.telegramAuth.exchangeWidgetPayload(parsed.data);
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(HttpStatus.FOUND, recoveryUrl);
  }

  // POST /v1/auth/register — public endpoint (no AuthGuard; there is no
  // user yet). ISS-USR-REG-001 self-registration: email/password/country
  // → full member account (Authentik user + password + aiqadam-member
  // group + Directus country write).
  //
  // Retry-pass fix (SecurityReviewer MAJOR-1 — see registration.service.ts's
  // "Location-header enumeration fix" module doc for full reasoning): the
  // response is now the SAME literal redirect — `Location: /v1/auth/login`
  // — for genuine success, duplicate-email, AND honeypot alike.
  // RegistrationService.register() always resolves to that same
  // RegisterResult; on genuine success it separately EMAILS the real
  // Authentik one-time login URL to the registrant rather than ever
  // putting it in this response's Location header. This closes a
  // scripted-client email-enumeration oracle: previously a real
  // registration redirected to a distinguishable, unique Authentik URL
  // while duplicate/honeypot redirected to the literal '/v1/auth/login'
  // string, which a `fetch(..., { redirect: 'manual' })` client could
  // read in one request per candidate email.
  //
  // Rate-limited: 5 requests per 15 minutes per IP (security.md
  // §Rate limiting — same policy as telegram/exchange above).
  @Post('register')
  @HttpCode(HttpStatus.FOUND)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async register(
    @Body() body: unknown,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    // Honeypot: bot-trap short-circuit. Return the exact same
    // redirect-response shape as a real registration — never distinguish
    // bot-trapped from accepted (mirrors leads.controller.ts:53-55). The
    // field is named `company` on the wire (see registerSchema below) to
    // match LeadCaptureForm.tsx's established, bot-inconspicuous naming.
    if (parsed.data.company && parsed.data.company.length > 0) {
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(HttpStatus.FOUND, '/v1/auth/login');
      return;
    }
    const { recoveryUrl } = await this.registration.register({
      email: parsed.data.email,
      password: parsed.data.password,
      country: parsed.data.country,
      displayName: parsed.data.displayName,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(HttpStatus.FOUND, recoveryUrl);
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

// ── Internal Telegram controller ─────────────────────────────────────────────
//
// Separate controller class so it can declare @Controller('v1/internal/telegram')
// while living in the same file as AuthController. The AuthModule registers
// both controllers.

@Controller('v1/internal/telegram')
@UseGuards(InternalAuthGuard)
export class TelegramInternalController {
  constructor(private readonly telegramAuth: TelegramAuthService) {}

  // POST /v1/internal/telegram/upsert-temp-user — InternalAuthGuard protected.
  // Called by the Telegram bot to provision a temporary Authentik user on
  // /start before full registration. Idempotent by telegram_id.
  @Post('upsert-temp-user')
  @HttpCode(HttpStatus.OK)
  async upsertTempUser(@Body() body: unknown): Promise<UpsertTempUserResult> {
    const parsed = upsertTempUserBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.telegramAuth.upsertTempUser(
      parsed.data.telegramId,
      parsed.data.firstName,
      parsed.data.username,
    );
  }
}
