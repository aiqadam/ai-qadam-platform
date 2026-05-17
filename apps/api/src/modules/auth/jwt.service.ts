import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type JWTPayload, SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env';
import { JtiRevocationService } from './jti-revocation.service';

// 15 min — short-lived access token. Refresh cookie covers long sessions.
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = 'aiqadam-api';
const AUDIENCE = 'aiqadam-web';

interface AccessTokenClaims {
  sub: string; // our local users.id (uuid)
  authentikSubject: string;
  email: string;
}

export type VerifiedClaims = JWTPayload & AccessTokenClaims & { jti: string };

export class AccessTokenInvalidError extends Error {
  constructor(reason: string) {
    super(`access token invalid: ${reason}`);
    this.name = 'AccessTokenInvalidError';
  }
}

@Injectable()
export class JwtService {
  private readonly secret: Uint8Array;
  static readonly ACCESS_TTL_SECONDS = ACCESS_TOKEN_TTL_SECONDS;

  constructor(private readonly revocations: JtiRevocationService) {
    if (env.JWT_SIGNING_SECRET.length < 32) {
      throw new Error('JWT_SIGNING_SECRET must be >=32 chars');
    }
    this.secret = new TextEncoder().encode(env.JWT_SIGNING_SECRET);
  }

  async sign(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setJti(randomUUID())
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(this.secret);
  }

  async verify(token: string): Promise<VerifiedClaims> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      payload = result.payload;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      throw new AccessTokenInvalidError(reason);
    }
    if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
      throw new AccessTokenInvalidError('missing jti');
    }
    if (await this.revocations.isRevoked(payload.jti)) {
      throw new AccessTokenInvalidError('revoked');
    }
    return payload as VerifiedClaims;
  }
}
