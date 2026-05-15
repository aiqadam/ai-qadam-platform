// Cloudflare-only geo lookup. Requires the apex DNS A record to be
// proxied (orange cloud) — Cloudflare sets `cf-ipcountry` on every
// upstream request based on the visitor's IP. If the header is missing
// (proxy off, direct origin hit, bot without geo data) we return
// 'global' so the caller redirects to the country picker rather than
// guessing wrong.

const APEX_HOSTS: ReadonlySet<string> = new Set(['aiqadam.org', 'www.aiqadam.org']);

const COUNTRY_BY_CF: ReadonlyMap<string, string> = new Map([
  ['UZ', 'uz'],
  ['KZ', 'kz'],
  ['TJ', 'tj'],
]);

export function isApexHost(hostname: string): boolean {
  return APEX_HOSTS.has(hostname.toLowerCase());
}

export function geoTargetSubdomain(headers: Headers): string {
  const cf = (headers.get('cf-ipcountry') ?? '').toUpperCase();
  return COUNTRY_BY_CF.get(cf) ?? 'global';
}
