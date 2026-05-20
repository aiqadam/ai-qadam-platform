import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type JWTPayload, SignJWT, jwtVerify } from 'jose';
import { type Client, generators } from 'openid-client';
import { env } from '../../config/env';
import { JwtService } from './jwt.service';
import { OIDC_CLIENT } from './oidc-client.provider';
import { RefreshTokenService } from './refresh-token.service';

// OIDC Authorization Code + PKCE through Authentik. The full design is in
// docs/auth-architecture.md — read that first if you're new to this code.
//
// One-line summary: GET /v1/auth/login sets a 60-second flow cookie that
// carries state + PKCE verifier + the post-callback `next` URL, then 302s
// the browser to Authentik. Authentik authenticates the user and 302s back
// to /v1/auth/callback with `?code=&state=`. We verify the flow cookie,
// exchange the code with Authentik's token endpoint (PKCE), upsert the
// user, mint OUR session (access JWT + opaque refresh row), set the
// refresh cookie on .aiqadam.org, redirect to the original `next`.

const FLOW_COOKIE_TTL_SECONDS = 60;
const FLOW_ISSUER = 'aiqadam-api-oauth-flow';
const FLOW_AUDIENCE = 'aiqadam-api-callback';
const FLOW_SCOPES = 'openid email profile';

interface FlowClaims extends JWTPayload {
  state: string;
  codeVerifier: string;
  next: string;
}

interface AuthorizationStart {
  authorizeUrl: string;
  flowToken: string;
  flowExpiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly flowSecret: Uint8Array;

  constructor(
    @Inject(OIDC_CLIENT) private readonly oidc: Client,
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokenService,
  ) {
    this.flowSecret = new TextEncoder().encode(env.JWT_SIGNING_SECRET);
  }

  // Step 1: build the Authentik authorize URL + signed flow cookie. The
  // `next` parameter is carried in the cookie (NOT the OAuth state) so
  // Authentik never sees app-internal paths.
  async startAuthorization(input: { next: string }): Promise<AuthorizationStart> {
    const state = generators.state();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    const authorizeUrl = this.oidc.authorizationUrl({
      scope: FLOW_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      // NO prompt=login + NO max_age=0 — see the long-form rationale
      // below. The short version: those two flags were added in Phase 1
      // when AI Qadam was the only OIDC app, and they're now actively
      // breaking SSO across the workspace tools.
      //
      // The original comment acknowledged the trade-off ("we lose
      // silent SSO across other Authentik-protected apps") and accepted
      // it because AI Qadam was the only such app at the time. That's
      // no longer true — Directus, Twenty, and Gatus are all OIDC-
      // bound to the same Authentik now (ADR-0032 acceleration,
      // 2026-05-20). Forcing re-auth on workspace not only kills
      // silent SSO but — verified against prod 2026-05-20 — leaves
      // the user stuck on the Authentik login page with a
      // "Successfully logged in!" toast and no redirect, because the
      // OAuth2 authorize endpoint refuses to issue a code when it
      // sees max_age=0 even immediately after a fresh login.
      //
      // Silent SSO is now the correct behavior: valid Authentik
      // session → consent (skipped via implicit-consent) → callback →
      // workspace. Sign-out remains explicit via POST /v1/auth/sign-out.
    });

    const flowToken = await new SignJWT({
      state,
      codeVerifier,
      next: input.next,
    } satisfies FlowClaims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${FLOW_COOKIE_TTL_SECONDS}s`)
      .setIssuer(FLOW_ISSUER)
      .setAudience(FLOW_AUDIENCE)
      .sign(this.flowSecret);

    return { authorizeUrl, flowToken, flowExpiresIn: FLOW_COOKIE_TTL_SECONDS };
  }

  // Step 2: read the flow cookie, validate state, exchange the code for
  // an id_token. Returns the identity claims + the `next` URL the caller
  // should redirect to.
  async completeAuthorization(input: {
    flowToken: string | undefined;
    callbackParams: Record<string, string | undefined>;
  }): Promise<{
    sub: string;
    email: string;
    displayName: string | undefined;
    next: string;
  }> {
    if (!input.flowToken) {
      throw new UnauthorizedException('missing oauth flow cookie');
    }
    const flowClaims = await this.verifyFlowToken(input.flowToken);
    const tokenSet = await this.exchangeCode(input.callbackParams, flowClaims);
    const identity = extractIdentityClaims(tokenSet.claims());
    return { ...identity, next: flowClaims.next };
  }

  private async verifyFlowToken(flowToken: string): Promise<FlowClaims> {
    try {
      const { payload } = await jwtVerify(flowToken, this.flowSecret, {
        issuer: FLOW_ISSUER,
        audience: FLOW_AUDIENCE,
      });
      return payload as FlowClaims;
    } catch {
      throw new UnauthorizedException('invalid or expired oauth flow cookie');
    }
  }

  private async exchangeCode(
    callbackParams: Record<string, string | undefined>,
    flowClaims: FlowClaims,
  ): Promise<Awaited<ReturnType<Client['callback']>>> {
    const params = this.oidc.callbackParams(`?${stringifyParams(callbackParams)}`);
    try {
      return await this.oidc.callback(env.OIDC_REDIRECT_URI, params, {
        state: flowClaims.state,
        code_verifier: flowClaims.codeVerifier,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      throw new UnauthorizedException(`oidc callback failed: ${reason}`);
    }
  }

  // Where /sign-out sends the browser. We don't hit Authentik's
  // end_session_endpoint — its built-in invalidation flow shows a consent
  // page (clunky UX). To kill the IdP session, hit
  // OIDC_END_SESSION_URL with the id_token_hint; for our needs the local
  // session kill + JWT deny-list + refresh revoke is enough.
  postLogoutRedirectUrl(next: string | undefined): string {
    return next?.startsWith('/') && !next.startsWith('//')
      ? `${env.WEB_BASE_URL}${next}`
      : env.WEB_BASE_URL;
  }

  // Mint OUR session: short-lived access JWT (with jti for deny-list) +
  // 14-day refresh row. Called from /callback (new family) and /refresh
  // (existing family).
  async mintSession(input: {
    userId: string;
    authentikSubject: string;
    email: string;
    familyId?: string;
  }): Promise<{ accessToken: string; refreshToken: string; refreshExpiresAt: Date }> {
    const accessToken = await this.jwtService.sign({
      sub: input.userId,
      authentikSubject: input.authentikSubject,
      email: input.email,
    });
    const refresh = await this.refreshTokens.issue(
      input.familyId !== undefined
        ? { userId: input.userId, familyId: input.familyId }
        : { userId: input.userId },
    );
    return {
      accessToken,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }
}

function stringifyParams(input: Record<string, string | undefined>): string {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') clean[k] = v;
  }
  return new URLSearchParams(clean).toString();
}

function extractIdentityClaims(claims: {
  sub?: unknown;
  email?: unknown;
  name?: unknown;
}): { sub: string; email: string; displayName: string | undefined } {
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new UnauthorizedException('oidc id_token missing sub claim');
  }
  if (typeof claims.email !== 'string' || claims.email.length === 0) {
    throw new UnauthorizedException('oidc id_token missing email claim');
  }
  return {
    sub: claims.sub,
    email: claims.email,
    displayName: typeof claims.name === 'string' ? claims.name : undefined,
  };
}
