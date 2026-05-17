import { defineMiddleware } from 'astro:middleware';

// Astro middleware. Runs for every SSR-rendered request (in `output: 'static'`
// mode, prerendered pages bypass this). Used today only to redirect the
// admin.aiqadam.org subdomain at every path to a country subdomain's /admin
// space — see RBAC roadmap note below.
//
// Future (per user direction): when country_admin RBAC ships, this should
// pick the destination country based on the signed-in user's assigned
// countries (single-country admin → that country; super_admin → cookie
// preference). For launch, everyone routes to uz.aiqadam.org/admin.

const ADMIN_HOST = 'admin.aiqadam.org';
const DEFAULT_ADMIN_TARGET = 'uz.aiqadam.org';

export const onRequest = defineMiddleware(({ url, request }, next) => {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? '';
  if (host !== ADMIN_HOST) return next();

  // Already starts with /admin — preserve verbatim; otherwise prefix.
  const path = url.pathname.startsWith('/admin') ? url.pathname : `/admin${url.pathname}`;
  const normalisedPath = path === '/admin/' ? '/admin' : path;
  const target = `https://${DEFAULT_ADMIN_TARGET}${normalisedPath}${url.search}`;
  return new Response(null, { status: 302, headers: { location: target } });
});
