import type { Client } from 'openid-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service';
import type { JwtService } from '../src/modules/auth/jwt.service';
import type { RefreshTokenService } from '../src/modules/auth/refresh-token.service';

// FR-AUTH-003 AC-1/AC-2 — tests for AuthService.startAuthorization() with
// an optional `provider` arg.
//
// The production path:
//   startAuthorization({ next, provider: 'google' })
//     → this.oidc.authorizationUrl({ ..., source: 'google' })
//
// Authentik reads `source=<slug>` and routes the OIDC authorization
// through the matching OAuth Source (Google/GitHub application). When
// `provider` is absent the param must NOT appear — a missing source
// falls through to the default Authentik login form (password or
// magic-link), which is the existing pre-FR-AUTH-003 behavior.
//
// These tests assert only the OIDC client call arguments — they do not
// test the SignJWT flow-cookie construction (that is covered by the
// existing OIDC flow tests).

let authorizationUrlMock: ReturnType<typeof vi.fn>;

function buildAuthService(): AuthService {
  authorizationUrlMock = vi.fn().mockReturnValue(
    'https://auth.example.com/application/o/test/authorize?state=x&code_challenge=y',
  );
  const oidc = { authorizationUrl: authorizationUrlMock } as unknown as Client;
  return new AuthService(oidc, {} as JwtService, {} as RefreshTokenService);
}

describe('AuthService.startAuthorization — provider routing (FR-AUTH-003)', () => {
  let auth: AuthService;

  beforeEach(() => {
    auth = buildAuthService();
  });

  it('appends source=google to the authorize URL when provider is google', async () => {
    await auth.startAuthorization({ next: '/me', provider: 'google' });

    expect(authorizationUrlMock).toHaveBeenCalledTimes(1);
    const callArgs = authorizationUrlMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs).toMatchObject({ source: 'google' });
  });

  it('appends source=github to the authorize URL when provider is github', async () => {
    await auth.startAuthorization({ next: '/me', provider: 'github' });

    expect(authorizationUrlMock).toHaveBeenCalledTimes(1);
    const callArgs = authorizationUrlMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs).toMatchObject({ source: 'github' });
  });

  it('does NOT include source param when provider is absent (default password/magic-link flow)', async () => {
    await auth.startAuthorization({ next: '/me' });

    expect(authorizationUrlMock).toHaveBeenCalledTimes(1);
    const callArgs = authorizationUrlMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('source');
  });

  it('always includes the PKCE code_challenge and code_challenge_method', async () => {
    await auth.startAuthorization({ next: '/me', provider: 'google' });

    const callArgs = authorizationUrlMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs).toHaveProperty('code_challenge');
    expect(callArgs).toMatchObject({ code_challenge_method: 'S256' });
  });

  it('always includes the openid email profile groups scope', async () => {
    await auth.startAuthorization({ next: '/me' });

    const callArgs = authorizationUrlMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs).toMatchObject({ scope: 'openid email profile groups' });
  });

  it('returns the authorizeUrl from the OIDC client unchanged', async () => {
    const FAKE_URL =
      'https://auth.example.com/application/o/test/authorize?state=x&code_challenge=y';
    authorizationUrlMock.mockReturnValue(FAKE_URL);

    const result = await auth.startAuthorization({ next: '/me', provider: 'github' });

    expect(result.authorizeUrl).toBe(FAKE_URL);
  });

  it('returns a flowToken (non-empty string) and flowExpiresIn > 0', async () => {
    const result = await auth.startAuthorization({ next: '/dashboard' });

    expect(typeof result.flowToken).toBe('string');
    expect(result.flowToken.length).toBeGreaterThan(0);
    expect(result.flowExpiresIn).toBeGreaterThan(0);
  });
});
