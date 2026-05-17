import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Client } from 'openid-client';
import { JwtService } from './jwt.service';
import { OIDC_CLIENT } from './oidc-client.provider';
import { RefreshTokenService } from './refresh-token.service';

// Wrapped auth (no visible Authentik UI). Pattern:
//   1. Our web shows the AI Qadam sign-in form.
//   2. Form posts to /v1/auth/sign-in with email + password.
//   3. Controller calls AuthService.signInWithPassword → ROPC grant against
//      Authentik's token endpoint. Authentik validates the password, returns
//      an id_token. We extract the identity, upsert the user, mint our own
//      access + refresh session, and the browser never sees Authentik.
//
// ROPC must be enabled on the Authentik OAuth2 provider (see /v3/providers/
// oauth2 PATCH with client_type: 'public' and grant_types containing
// 'password'). Documented in docs/runbooks/authentik-ropc.md.

interface IdentityClaims {
  sub: string;
  email: string;
  displayName: string | undefined;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(OIDC_CLIENT) private readonly oidc: Client,
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  // ROPC: exchange username+password for an id_token via Authentik's token
  // endpoint. Authentik enforces password policy + MFA + rate-limits on its
  // side. We just translate the result into our own session.
  async signInWithPassword(input: { email: string; password: string }): Promise<IdentityClaims> {
    if (!input.email || !input.password) {
      throw new UnauthorizedException('email and password required');
    }
    try {
      const tokenSet = await this.oidc.grant({
        grant_type: 'password',
        username: input.email,
        password: input.password,
        scope: 'openid email profile',
      });
      return extractIdentityClaims(tokenSet.claims());
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`sign-in failed for ${input.email}: ${reason}`);
      throw new UnauthorizedException('invalid email or password');
    }
  }

  // Mint our session pair. Refresh row goes to Postgres; access JWT carries
  // a unique jti so sign-out can deny-list it immediately even though it
  // hasn't expired.
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

function extractIdentityClaims(claims: {
  sub?: unknown;
  email?: unknown;
  name?: unknown;
}): IdentityClaims {
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new UnauthorizedException('id_token missing sub claim');
  }
  if (typeof claims.email !== 'string' || claims.email.length === 0) {
    throw new UnauthorizedException('id_token missing email claim');
  }
  return {
    sub: claims.sub,
    email: claims.email,
    displayName: typeof claims.name === 'string' ? claims.name : undefined,
  };
}
