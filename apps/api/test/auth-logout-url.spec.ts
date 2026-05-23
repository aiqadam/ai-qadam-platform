import type { Client, Issuer } from 'openid-client';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service';
import type { JwtService } from '../src/modules/auth/jwt.service';
import type { RefreshTokenService } from '../src/modules/auth/refresh-token.service';

// Regression guard for the SLO fix (2026-05-23). /sign-out used to be
// local-only: it cleared our refresh cookie + denylisted the access JWT
// but never told Authentik to terminate the IdP session. The next
// /login then silently SSO'd the user back in — which, for an SSO
// platform, is effectively "sign-out didn't work" across the whole org.
//
// Fix: AuthService.buildLogoutUrl produces an OIDC end_session URL with
// id_token_hint + post_logout_redirect_uri, the controller returns it,
// and the client navigates the browser through it. These tests assert
// the URL is built only when we genuinely have the inputs to make it
// useful (id_token + advertised endpoint) — otherwise the caller falls
// back to the local /auth/signed-out page and accepts the lingering
// IdP session in degraded mode.

function buildAuthService(
  endSessionEndpoint: string | undefined,
  endSessionUrl?: ReturnType<typeof vi.fn>,
): { auth: AuthService; endSessionUrl: ReturnType<typeof vi.fn> } {
  const fn =
    endSessionUrl ??
    vi.fn((params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      return `${endSessionEndpoint}?${qs}`;
    });
  const issuer = { metadata: { end_session_endpoint: endSessionEndpoint } } as unknown as Issuer;
  const oidc = { issuer, endSessionUrl: fn } as unknown as Client;
  const jwtService = {} as JwtService;
  const refreshTokens = {} as RefreshTokenService;
  return { auth: new AuthService(oidc, jwtService, refreshTokens), endSessionUrl: fn };
}

describe('AuthService.buildLogoutUrl — OIDC RP-Initiated Logout', () => {
  it('returns null when no id_token is available (legacy refresh row)', () => {
    const { auth, endSessionUrl } = buildAuthService(
      'https://auth.example.com/application/o/x/end-session/',
    );

    expect(auth.buildLogoutUrl(null)).toBeNull();
    expect(endSessionUrl).not.toHaveBeenCalled();
  });

  it('returns null when issuer does not advertise end_session_endpoint', () => {
    const { auth, endSessionUrl } = buildAuthService(undefined);

    expect(auth.buildLogoutUrl('id-token-value')).toBeNull();
    expect(endSessionUrl).not.toHaveBeenCalled();
  });

  it('builds an end_session URL with id_token_hint + post_logout_redirect_uri', () => {
    const { auth, endSessionUrl } = buildAuthService(
      'https://auth.example.com/application/o/x/end-session/',
    );

    const url = auth.buildLogoutUrl('some.id.token');

    expect(url).not.toBeNull();
    expect(endSessionUrl).toHaveBeenCalledTimes(1);
    const args = endSessionUrl.mock.calls[0]?.[0] as Record<string, string>;
    expect(args.id_token_hint).toBe('some.id.token');
    // WEB_BASE_URL is fixed by vitest.config.ts env.
    expect(args.post_logout_redirect_uri).toBe('http://placeholder.invalid/auth/signed-out');
  });
});
