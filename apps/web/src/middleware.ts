import { defineMiddleware } from 'astro:middleware';

// Astro middleware. Runs for every SSR request.
//
// Sprint 4 C4.1 of the Directus-centric migration: every operator path
// (admin.aiqadam.org/* OR <country>.aiqadam.org/admin/*) is redirected
// to the Directus admin at cms.aiqadam.org/admin. Authentik OIDC there
// gates access; per-collection permissions enforce country scoping.
//
// The custom /admin/* Astro pages + apps/api/src/modules/admin/* are
// scheduled for full removal in C4.2 (this PR keeps them on disk so a
// rollback is one middleware-line revert).

const ADMIN_HOST = 'admin.aiqadam.org';
const CMS_ADMIN_URL = 'https://cms.aiqadam.org/admin';

export const onRequest = defineMiddleware(({ url, request }, next) => {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? '';
  const isAdminHost = host === ADMIN_HOST;
  const isAdminPath = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
  if (!isAdminHost && !isAdminPath) return next();

  return new Response(null, { status: 302, headers: { location: CMS_ADMIN_URL } });
});
