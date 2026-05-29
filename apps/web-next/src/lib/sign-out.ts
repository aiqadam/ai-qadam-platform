// L1 runtime — explicit sign-out.
//
// Mirrors v1's apps/web/src/lib/auth-bootstrap.ts signOut(): POST to the
// API sign-out endpoint (revokes the refresh-token family + clears the
// cookie server-side), then hard-redirect to the Authentik RP-logout
// URL it returns (or /auth/signed-out as the degraded fallback).
//
// Lives in lib/ deliberately so blocks can trigger sign-out without a
// raw fetch('/api/...') of their own (ADR-0038 §Locks #1b — raw API
// fetch is forbidden in blocks/pages, allowed in lib/).
//
// NOTE: the /auth/signed-out landing page is an M3.1 deliverable; until
// it ships in web-next the post-logout redirect lands there only once
// the cutover OAuth client registers next.aiqadam.org's post-logout URI.
// Sign-out itself (session revocation) works regardless.

interface SignOutResponse {
  logoutUrl: string | null;
}

export async function signOut(accessToken: string | null): Promise<void> {
  let logoutUrl: string | null = null;
  try {
    const res = await fetch('/api/v1/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (res.ok) {
      logoutUrl = ((await res.json()) as SignOutResponse).logoutUrl;
    }
  } catch {
    // Server-side cookie clear may still have happened on the request;
    // the fallback redirect below fires regardless.
  }
  window.location.href = logoutUrl ?? '/auth/signed-out';
}
