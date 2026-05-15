import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AccessTokenInvalidError, JwtService } from '../src/modules/auth/jwt.service';

const service = new JwtService();

const sampleClaims = {
  sub: 'b3e88a4c-ff9e-4b9b-9d1c-6c61d49d7e21',
  authentikSubject: 'sub-abcdef',
  email: 'user@example.com',
};

describe('JwtService', () => {
  it('signs and verifies a token round-trip', async () => {
    const token = await service.sign(sampleClaims);
    const verified = await service.verify(token);

    expect(verified.sub).toBe(sampleClaims.sub);
    expect(verified.authentikSubject).toBe(sampleClaims.authentikSubject);
    expect(verified.email).toBe(sampleClaims.email);
    expect(verified.iss).toBe('aiqadam-api');
    expect(verified.aud).toBe('aiqadam-web');
    expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects a tampered signature', async () => {
    const token = await service.sign(sampleClaims);
    const [h, p] = token.split('.');
    const tampered = `${h}.${p}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

    await expect(service.verify(tampered)).rejects.toThrow(AccessTokenInvalidError);
  });

  it('rejects an expired token', async () => {
    // Hand-craft an already-expired token using the same secret.
    const secret = new TextEncoder().encode(process.env.JWT_SIGNING_SECRET ?? '');
    const expired = await new SignJWT(sampleClaims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .setIssuer('aiqadam-api')
      .setAudience('aiqadam-web')
      .sign(secret);

    await expect(service.verify(expired)).rejects.toThrow(AccessTokenInvalidError);
  });

  it('rejects a token with the wrong issuer', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SIGNING_SECRET ?? '');
    const wrongIssuer = await new SignJWT(sampleClaims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .setIssuer('not-aiqadam-api')
      .setAudience('aiqadam-web')
      .sign(secret);

    await expect(service.verify(wrongIssuer)).rejects.toThrow(AccessTokenInvalidError);
  });

  it('rejects a token with the wrong audience', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SIGNING_SECRET ?? '');
    const wrongAud = await new SignJWT(sampleClaims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .setIssuer('aiqadam-api')
      .setAudience('some-other-app')
      .sign(secret);

    await expect(service.verify(wrongAud)).rejects.toThrow(AccessTokenInvalidError);
  });
});
