import { Injectable } from '@nestjs/common';
import { type JWTPayload, SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env';

// 10 min — matches ADR-0016 §"Access token TTL".
const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
const ISSUER = 'aiqadam-api';
const AUDIENCE = 'aiqadam-web';

interface AccessTokenClaims {
  sub: string; // our local users.id (uuid)
  authentikSubject: string;
  email: string;
}

export type VerifiedClaims = JWTPayload & AccessTokenClaims;

export class AccessTokenInvalidError extends Error {
  constructor(reason: string) {
    super(`access token invalid: ${reason}`);
    this.name = 'AccessTokenInvalidError';
  }
}

@Injectable()
export class JwtService {
  private readonly secret: Uint8Array;

  constructor() {
    if (env.JWT_SIGNING_SECRET.length < 32) {
      throw new Error('JWT_SIGNING_SECRET must be >=32 chars');
    }
    this.secret = new TextEncoder().encode(env.JWT_SIGNING_SECRET);
  }

  async sign(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(this.secret);
  }

  async verify(token: string): Promise<VerifiedClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      return payload as VerifiedClaims;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      throw new AccessTokenInvalidError(reason);
    }
  }
}
