import { defineMiddleware } from 'astro:middleware';

// Astro middleware. Runs for every SSR request.
//
// Two responsibilities:
//
// 1) (Existing — C4.1) operator-admin paths redirect to Directus admin.
//
// 2) Auth bootstrap (Topic 1 fix, 2026-05-25). Server-side `/auth/refresh`
//    once per SSR page load, store result in `Astro.locals.auth`, ship the
//    new refresh cookie + access token forward to the client via a
//    one-shot `<script>` injected by Layout.astro.
//
//    Why: every React island used to call `POST /auth/refresh` on mount.
//    Refresh tokens are single-use; N parallel islands raced on the same
//    cookie, the loser tripped `RefreshTokenReplayError`, the server
//    revoked the entire family and cleared the cookie. Result: a logged-in
//    page would lose its session on the FIRST load — observed as
//    "top nav says Sign in while body shows my email" (Workspace.tsx +
//    NavAccountMenu racing on /workspace).
//
//    Security angle: until islands agree on identity, an in-memory access
//    token from a prior user could outlive the cookie that minted it.
//    Cross-user RBAC leak. The SSR refresh collapses N round-trips to 1
//    and gives every island a single source of truth keyed by the cookie
//    the server just verified.
//
//    Cost: one internal API call per SSR request when a refresh cookie is
//    present. Internal hop (http://localhost:3000 or INTERNAL_API_URL) +
//    cookies forwarded via Cookie header. Short-circuits to anon when no
//    cookie present (the common case for prerendered pages + crawlers).

const ADMIN_HOST = 'admin.aiqadam.org';
const CMS_ADMIN_URL = 'https://cms.aiqadam.org/admin';
const REFRESH_COOKIE = 'aiqadam-refresh';
const LEGACY_REFRESH_COOKIE = '__Host-aiqadam-refresh';
const { INTERNAL_API_URL = 'http://localhost:3000' } = process.env;

interface AuthMe {
  id: string;
  email: string;
  authentikSubject: string;
  groups: string[];
}

export interface SsrAuth {
  accessToken: string;
  me: AuthMe;
}

// Best-effort SSR refresh. Returns null on any failure — the page renders
// as anon and client islands can retry. Never throws; auth must not block
// the page.
async function ssrAuthBootstrap(request: Request): Promise<{
  auth: SsrAuth | null;
  setCookie: string | null;
}> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const hasRefresh =
    cookieHeader.includes(`${REFRESH_COOKIE}=`) ||
    cookieHeader.includes(`${LEGACY_REFRESH_COOKIE}=`);
  if (!hasRefresh) return { auth: null, setCookie: null };

  try {
    const refreshRes = await fetch(`${INTERNAL_API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        host: request.headers.get('host') ?? '',
      },
    });
    if (!refreshRes.ok) return { auth: null, setCookie: null };
    const { accessToken } = (await refreshRes.json()) as { accessToken: string };
    const setCookie = refreshRes.headers.get('set-cookie');

    const meRes = await fetch(`${INTERNAL_API_URL}/v1/auth/me`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        host: request.headers.get('host') ?? '',
      },
    });
    if (!meRes.ok) return { auth: null, setCookie: null };
    const me = (await meRes.json()) as AuthMe;
    return { auth: { accessToken, me }, setCookie };
  } catch {
    return { auth: null, setCookie: null };
  }
}

export const onRequest = defineMiddleware(async ({ url, request, locals }, next) => {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? '';
  const isAdminHost = host === ADMIN_HOST;
  const isAdminPath = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
  if (isAdminHost || isAdminPath) {
    return new Response(null, { status: 302, headers: { location: CMS_ADMIN_URL } });
  }

  // Auth bootstrap. Skipped for /api/* (proxied through to API; cookie
  // handling happens there) and for static assets.
  const skipAuth =
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.ico';
  if (skipAuth) return next();

  const { auth, setCookie } = await ssrAuthBootstrap(request);
  locals.auth = auth;

  const response = await next();
  // Propagate the rotated refresh cookie issued by /auth/refresh so the
  // browser stores the fresh value. Without this, the cookie sent on the
  // NEXT page load is the (now-consumed) old one and the client islands'
  // first /auth/refresh call would trip replay detection — recreating the
  // exact race we're trying to eliminate.
  if (setCookie) response.headers.append('set-cookie', setCookie);
  return response;
});
