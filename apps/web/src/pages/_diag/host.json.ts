// Temporary diagnostic endpoint (remove once apex redirect is verified
// to work in prod). Returns the Host header + URL hostname the SSR
// runtime sees, so we can confirm what the web container actually
// receives behind Cloudflare + Traefik.
//
// Public: no secrets. Path is `_diag/` to discourage accidental linking.
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  return new Response(
    JSON.stringify(
      {
        host_header: request.headers.get('host'),
        cf_ipcountry: request.headers.get('cf-ipcountry'),
        cf_connecting_ip: request.headers.get('cf-connecting-ip'),
        x_forwarded_host: request.headers.get('x-forwarded-host'),
        url_hostname: new URL(request.url).hostname,
        url_protocol: new URL(request.url).protocol,
      },
      null,
      2,
    ),
    { headers: { 'content-type': 'application/json' } },
  );
};
