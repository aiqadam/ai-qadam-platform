import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env';

// F-S1.6 — lead-verification HMAC token.
//
// One-shot link sent in the T+0 email. Lead clicks, we verify the HMAC
// matches the stored user_id + email pair + hasn't expired, then flip
// email_verified=true on the directus_users row. After that the T+3 /
// T+7 cron flows can dispatch.
//
// TTL is 30 days — long enough that a user who misses the email this
// week can still verify next week without having to refresh the lead
// signup. Shorter TTL would force more friction without much security
// gain (token leak risk is the same regardless of TTL).

const ISSUER = 'aiqadam-api-lead-verify';
const AUDIENCE = 'aiqadam-leads';
const TTL_SECONDS = 30 * 24 * 3600;

interface VerifyClaims {
  sub: string; // directus_users.id (uuid)
  email: string;
}

@Injectable()
export class LeadVerifyTokenService {
  private readonly secret: Uint8Array;

  constructor() {
    this.secret = new TextEncoder().encode(env.JWT_SIGNING_SECRET);
  }

  async mint(userId: string, email: string): Promise<string> {
    return new SignJWT({ sub: userId, email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${TTL_SECONDS}s`)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(this.secret);
  }

  async verify(token: string): Promise<VerifyClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      const sub = payload.sub;
      const email = (payload as { email?: unknown }).email;
      if (typeof sub !== 'string' || typeof email !== 'string') return null;
      return { sub, email };
    } catch {
      return null;
    }
  }
}
