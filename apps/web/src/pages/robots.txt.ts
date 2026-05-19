import type { APIRoute } from 'astro';

// M5.1 — robots.txt. Per-tenant: served from each subdomain so the
// sitemap URL it points at matches the same host.
//
// /me, /admin/* and /api/* are noindex'd since they're authenticated
// surfaces with no useful crawl content (login redirect or 401).

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  const host = (request.headers.get('host') ?? 'aiqadam.org').split(':')[0];
  const origin = `https://${host}`;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /me',
    'Disallow: /me/',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /auth/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
