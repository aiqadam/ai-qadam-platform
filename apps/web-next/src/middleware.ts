import { defineMiddleware } from 'astro:middleware';

// Astro middleware for apps/web-next/. Runs for every SSR request.
//
// Ported from apps/web/src/middleware.ts (PR #389 — Topic 1 fix) with
// ONE difference: the refresh-cookie name is `aiqadam-next-refresh` so
// v1 and v2 can coexist in different tabs during the build window
// without colliding on the same single-use refresh cookie. See
// docs/architecture/web-migration-plan.md §Cookie isolation.
//
// At cutover (T+0), the API will start issuing the canonical
// `aiqadam-refresh` cookie from v2 and accept `aiqadam-next-refresh`
// for a 24h overlap so v2-during-build tabs auto-rotate to the
// canonical cookie on first refresh. Both cookie names are accepted
// here for that overlap window — see hasRefresh below.
//
// Responsibilities:
//
// 1) Auth bootstrap. Server-side `/auth/refresh` once per SSR page
//    load, store the result in Astro.locals.auth, propagate the
//    rotated refresh cookie back to the browser. Eliminates the
//    N-islands-racing-on-one-cookie pattern that killed sessions on
//    first page load in v1.
//
// 2) (Not yet) admin-host redirects. v1's middleware also redirects
//    admin.aiqadam.org → cms.aiqadam.org/admin. v2 doesn't serve
//    admin.aiqadam.org during the build window — that traffic stays
//    on v1 — so no admin-host branch here.

const REFRESH_COOKIE_NEXT = 'aiqadam-next-refresh';
const REFRESH_COOKIE_LEGACY = 'aiqadam-refresh';
const REFRESH_COOKIE_LEGACY_HOST = '__Host-aiqadam-refresh';
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

// Best-effort SSR refresh. Returns null on any failure — the page
// renders as anon and client islands can retry. Never throws; auth
// must not block the page.
async function ssrAuthBootstrap(request: Request): Promise<{
  auth: SsrAuth | null;
  setCookie: string | null;
}> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const hasRefresh =
    cookieHeader.includes(`${REFRESH_COOKIE_NEXT}=`) ||
    cookieHeader.includes(`${REFRESH_COOKIE_LEGACY}=`) ||
    cookieHeader.includes(`${REFRESH_COOKIE_LEGACY_HOST}=`);
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
  // Skip auth bootstrap for /api/* (proxied through to API; cookie
  // handling happens there) and for static assets.
  const skipAuth =
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/robots.txt';
  if (skipAuth) return next();

  const { auth, setCookie } = await ssrAuthBootstrap(request);
  locals.auth = auth;

  const response = await next();
  // Propagate the rotated refresh cookie issued by /auth/refresh so
  // the browser stores the fresh value. See v1 middleware for the
  // race-condition rationale (PR #389).
  if (setCookie) response.headers.append('set-cookie', setCookie);
  return response;
});
