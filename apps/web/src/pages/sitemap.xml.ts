import type { APIRoute } from 'astro';
import { countryFromHost, fetchUpcomingEvents } from '../lib/cms';

// M5.1 — sitemap.xml.
//
// Per-tenant: served from each subdomain (uz.aiqadam.org, kz.aiqadam.org,
// tj.aiqadam.org) with only that tenant's events listed. Apex aiqadam.org
// gets the uz default (matches the tenant resolution in lib/cms).
//
// Static pages: /, /events, /leaderboard.
// Dynamic: every currently-published, not-yet-ended event in the tenant.
//
// Loaded server-side per request (no caching here — Directus is fast, and
// search engines fetch sitemap rarely). If the CMS is unreachable we still
// return the static section so robots at least find the public pages.

export const prerender = false;

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderSitemap(urls: UrlEntry[]): string {
  const body = urls
    .map((u) => {
      const parts = [`    <loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (u.priority !== undefined) parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const GET: APIRoute = async ({ request }) => {
  const host = request.headers.get('host') ?? 'aiqadam.org';
  const tenant = countryFromHost(host);
  const origin = `https://${host.split(':')[0]}`;

  const staticPages: UrlEntry[] = [
    { loc: `${origin}/`, changefreq: 'daily', priority: 1.0 },
    { loc: `${origin}/events`, changefreq: 'daily', priority: 0.9 },
    { loc: `${origin}/leaderboard`, changefreq: 'weekly', priority: 0.5 },
  ];

  let eventPages: UrlEntry[] = [];
  try {
    const events = await fetchUpcomingEvents(request);
    eventPages = events
      .filter((e) => e.countryCode === tenant)
      .map((e) => ({
        loc: `${origin}/events/${e.id}`,
        // Use endsAt as a stable lastmod — fine for events whose data is
        // mostly fixed after publication. Directus doesn't currently
        // surface row updated_at; can wire that in M5.1-followup.
        lastmod: e.startsAt.slice(0, 10),
        changefreq: 'weekly',
        priority: 0.7,
      }));
  } catch {
    // Already logged by fetchUpcomingEvents; degrade to static-only.
  }

  return new Response(renderSitemap([...staticPages, ...eventPages]), {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Crawlers fetch this maybe daily — but content changes when new
      // events publish, so keep the cache window short.
      'cache-control': 'public, max-age=600',
    },
  });
};
