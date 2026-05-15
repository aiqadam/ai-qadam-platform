import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type JWTPayload, SignJWT, jwtVerify } from 'jose';
import { type Client, generators } from 'openid-client';
import { env } from '../../config/env';
import { JwtService } from './jwt.service';
import { OIDC_CLIENT } from './oidc-client.provider';
import { RefreshTokenService } from './refresh-token.service';

// State + PKCE verifier are signed into a short-lived cookie (60s TTL) so the
// callback can verify the redirect actually originated from a flow we started.
// Same secret as the access-token JWT — separate keying isn't worth the env
// surface in Phase 1.
const FLOW_COOKIE_TTL_SECONDS = 60;
const FLOW_ISSUER = 'aiqadam-api-oauth-flow';
const FLOW_AUDIENCE = 'aiqadam-api-callback';
const FLOW_SCOPES = 'openid email profile';

interface FlowClaims extends JWTPayload {
  state: string;
  codeVerifier: string;
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

  // Step 1 of login: build the Authentik authorize URL and a signed cookie
  // value that carries state + PKCE verifier across the redirect.
  async startAuthorization(): Promise<AuthorizationStart> {
    const state = generators.state();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    const authorizeUrl = this.oidc.authorizationUrl({
      scope: FLOW_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const flowToken = await new SignJWT({ state, codeVerifier } satisfies FlowClaims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${FLOW_COOKIE_TTL_SECONDS}s`)
      .setIssuer(FLOW_ISSUER)
      .setAudience(FLOW_AUDIENCE)
      .sign(this.flowSecret);

    return { authorizeUrl, flowToken, flowExpiresIn: FLOW_COOKIE_TTL_SECONDS };
  }

  // Step 2 of login: read the flow cookie, validate state, exchange code.
  // Returns the OIDC claims so the controller can upsert the user + mint
  // its own session tokens.
  async completeAuthorization(input: {
    flowToken: string | undefined;
    callbackParams: Record<string, string | undefined>;
  }): Promise<{ sub: string; email: string; displayName: string | undefined }> {
    if (!input.flowToken) {
      throw new UnauthorizedException('missing oauth flow cookie');
    }
    const flowClaims = await this.verifyFlowToken(input.flowToken);
    const tokenSet = await this.exchangeCode(input.callbackParams, flowClaims);
    return extractIdentityClaims(tokenSet.claims());
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

  // The web base + landing path the API redirects the browser to after a
  // successful callback. The web reads its refresh cookie on first render
  // and calls /v1/auth/refresh to mint the access token (per ADR-0016).
  postCallbackRedirectUrl(): string {
    return env.WEB_BASE_URL;
  }

  // Mint the user-facing token pair: short-lived access JWT + opaque refresh
  // token. Called from /callback (new family) and /refresh (existing family).
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
    if (typeof v === 'string') {
      clean[k] = v;
    }
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
