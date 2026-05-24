import type { Client, Issuer } from 'openid-client';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service';
import type { JwtService } from '../src/modules/auth/jwt.service';
import type { RefreshTokenService } from '../src/modules/auth/refresh-token.service';

// Regression guard for the SLO fix (2026-05-23) + the no-hint fallback
// (2026-05-24). /sign-out used to be local-only: it cleared our refresh
// cookie + denylisted the access JWT but never told Authentik to
// terminate the IdP session. The next /login then silently SSO'd the
// user back in — which, for an SSO platform, is effectively "sign-out
// didn't work" across the whole org.
//
// Fix v1 (happy path): buildLogoutUrl produces an OIDC end_session URL
// with id_token_hint + post_logout_redirect_uri, the controller returns
// it, the client navigates the browser through it — Authentik runs the
// invalidation flow silently and lands on /auth/signed-out.
//
// Fix v2 (degraded fallback): when the caller has no id_token (e.g.
// after a refresh-token race revoked the family + cleared the cookie,
// leaving only a bearer in JS memory), buildLogoutUrl(null) now returns
// a NO-HINT end_session URL — per OIDC RP-Initiated Logout 1.0 §2 the
// OP MUST then prompt the user "log out?", but the IdP session still
// gets killed when they click confirm. Without this the user is stuck
// in a silent-resign-in loop. We DROP post_logout_redirect_uri from
// the URL because spec §3 says the OP MUST NOT honour it without a
// hint; the static-redirect stage in the aiqadam-provider-invalidation
// flow handles landing instead.
//
// buildLogoutUrl now returns null only when the issuer doesn't advertise
// end_session_endpoint (truly nothing we can construct).

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
  it('returns null when issuer does not advertise end_session_endpoint', () => {
    const { auth, endSessionUrl } = buildAuthService(undefined);

    expect(auth.buildLogoutUrl('id-token-value')).toBeNull();
    expect(auth.buildLogoutUrl(null)).toBeNull();
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

  it('builds a NO-HINT end_session URL when id_token is null (degraded fallback)', () => {
    // Triggered by the orphaned-session case: refresh family revoked +
    // cookie cleared, but the caller still holds a valid bearer. Per
    // OIDC RP-Initiated Logout 1.0 §3 we MUST NOT pass
    // post_logout_redirect_uri without a hint — Authentik would refuse
    // to honour it.
    const { auth, endSessionUrl } = buildAuthService(
      'https://auth.example.com/application/o/x/end-session/',
    );

    const url = auth.buildLogoutUrl(null);

    expect(url).not.toBeNull();
    expect(endSessionUrl).toHaveBeenCalledTimes(1);
    const args = endSessionUrl.mock.calls[0]?.[0] as Record<string, string>;
    expect(args.id_token_hint).toBeUndefined();
    expect(args.post_logout_redirect_uri).toBeUndefined();
  });
});
