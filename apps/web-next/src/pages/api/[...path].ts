// L4 endpoint — same-origin /api → backend proxy (SSR).
//
// apiClient + the AppNav sign-in CTA call same-origin `/api/v1/...`
// (see lib/api-client.ts resolveBase default). In LOCAL DEV the Vite
// dev-server proxy (astro.config.mjs) rewrites /api → the API. In
// PRODUCTION on aiqadam.org, Traefik PathPrefix(`/api`) routes to the
// API container. But the build-aside host next.aiqadam.org has NEITHER
// (its docker-compose only routes Host→Astro), so every /api/* request
// hit Astro and 404'd — breaking sign-in (/api/v1/auth/login) AND every
// data call. This endpoint is the missing same-origin hop for the
// build-aside host: it forwards /api/<path> → INTERNAL_API_URL/<path>
// over the docker network, preserving method, headers, cookies, body,
// redirects, and Set-Cookie — so the platform auth-cookie model stays
// same-origin. (On aiqadam.org post-cutover, Traefik intercepts /api
// before Astro, so this endpoint is dormant there.)

import type { APIRoute } from 'astro';

export const prerender = false;

const DEFAULT_INTERNAL_API_URL = 'http://localhost:3000';

function apiBase(): string {
  const { INTERNAL_API_URL = DEFAULT_INTERNAL_API_URL } = process.env;
  return INTERNAL_API_URL;
}

// Hop-by-hop + length/host headers must not be forwarded verbatim.
const STRIP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const proxy: APIRoute = async ({ request, params }) => {
  const { path = '' } = params;
  const search = new URL(request.url).search;
  const target = `${apiBase()}/${path}${search}`;

  const fwdHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIP_HEADERS.has(key.toLowerCase())) fwdHeaders.set(key, value);
  });

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const init: RequestInit = {
    method: request.method,
    headers: fwdHeaders,
    // Pass 3xx (e.g. /v1/auth/login → 302 to Authentik) straight back
    // to the browser instead of following them server-side.
    redirect: 'manual',
    // Conditional spread (not body: undefined) for exactOptionalPropertyTypes.
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
  };
  const upstream = await fetch(target, init);

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') {
      respHeaders.set(key, value);
    }
  });
  // Set-Cookie must be re-emitted per-cookie (the Headers API collapses
  // multiples into one comma-joined value, which corrupts cookies).
  for (const cookie of upstream.headers.getSetCookie()) {
    respHeaders.append('set-cookie', cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
};

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
