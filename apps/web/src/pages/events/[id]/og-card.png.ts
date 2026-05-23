// F-S5.4 — Per-event social card (Satori + resvg).
//
// 1200×630 PNG served on-demand. OG/Twitter scrapers (Telegram, X,
// LinkedIn, Discord, Slack) fetch this when previewing a shared
// /events/<id> link. The cabinet share buttons (F-S5.2 #232) URL-encode
// a link to the event page; this endpoint backs the og:image meta on
// that page.
//
// Cache: 5-minute public cache. The `[id].astro` page injects a
// `?v=<event.updatedAt epoch>` cache-buster so a speaker_added event
// (which bumps updatedAt) busts every scraper's cache. The endpoint
// itself ignores the query string — it just refetches event + speakers
// fresh from CMS every time.
//
// Visibility gate: members_only / invite_only events return 404 so a
// private title never leaks via OG preview.

import { Resvg } from '@resvg/resvg-js';
import type { APIRoute } from 'astro';
import satori from 'satori';
import { fetchEvent, fetchEventSpeakers } from '../../../lib/cms';
import { loadOgFonts } from '../../../lib/og-fonts';
import { renderOgCard } from '../../../lib/og-template';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const { id } = params as { id?: string };
  if (!id) return new Response('not_found', { status: 404 });

  const event = await fetchEvent(request, id);
  if (!event) return new Response('not_found', { status: 404 });
  if (event.visibilityScope && event.visibilityScope !== 'public') {
    return new Response('not_found', { status: 404 });
  }

  const speakers = await fetchEventSpeakers(event.id);

  try {
    const fonts = await loadOgFonts();
    const svg = await satori(renderOgCard(event, speakers), {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Geist', data: fonts.regular, weight: 400, style: 'normal' },
        { name: 'Geist', data: fonts.semiBold, weight: 600, style: 'normal' },
      ],
    });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        // 5-min CDN cache. Scrapers respect this; cabinet edits bust via ?v=.
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (err) {
    console.error(
      '[og-card] render failed:',
      err instanceof Error ? `${err.message}\n${err.stack}` : err,
    );
    return new Response('render_failed', { status: 500 });
  }
};
