// F-S5.4 — Satori JSX template for /events/[id]/og-card.png.
//
// 1200×630 OG card. Layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │ [FORMAT]                                AI QADAM · uz        │
//   │                                                              │
//   │ <event title — up to 2 lines>                                │
//   │                                                              │
//   │ Sat 14 June · 19:00                                          │
//   │ Tashkent · IT Park                                           │
//   │                                                              │
//   │ Speakers: Name One · Name Two · Name Three                   │
//   └──────────────────────────────────────────────────────────────┘
//
// Up to 4 speaker display names, comma-separated. Truncated if too
// many — "+N more" tail. Country code in the top-right comes from
// the event's country.

import React from 'react';
import type { ApiEvent, EventSpeaker } from './api';

const BG = '#0a0a0a';
const FG = '#fafafa';
const MUTED = '#a1a1aa';
const PRIMARY = '#4ade80'; // brand teal-ish; matches --primary in dark mode

const FORMAT_LABEL: Record<ApiEvent['format'], string> = {
  meetup: 'MEETUP',
  workshop: 'WORKSHOP',
  hackathon: 'HACKATHON',
  conference: 'CONFERENCE',
  online: 'ONLINE',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} · ${time}`;
}

function speakersLine(speakers: EventSpeaker[]): string {
  const confirmed = speakers.filter((s) => s.status === 'confirmed' && s.displayName);
  if (confirmed.length === 0) return '';
  const max = 4;
  const head = confirmed
    .slice(0, max)
    .map((s) => s.displayName)
    .join(' · ');
  const tail = confirmed.length > max ? ` +${confirmed.length - max} more` : '';
  return `Speakers: ${head}${tail}`;
}

export function renderOgCard(event: ApiEvent, speakers: EventSpeaker[]): React.ReactNode {
  const venue = event.venue ?? event.location;
  const speakers_str = speakersLine(speakers);
  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        background: BG,
        color: FG,
        padding: '64px 72px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: 'Geist',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{
            fontSize: 18,
            letterSpacing: '0.12em',
            color: PRIMARY,
            fontWeight: 600,
            border: `1px solid ${PRIMARY}`,
            borderRadius: 6,
            padding: '6px 14px',
          }}
        >
          {FORMAT_LABEL[event.format] ?? event.format.toUpperCase()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>AI Qadam</span>
          <span style={{ fontSize: 18, color: MUTED }}>· {event.countryCode.toLowerCase()}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            display: 'flex',
          }}
        >
          {event.title}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 28, color: FG, display: 'flex' }}>{formatDate(event.startsAt)}</div>
        {venue && <div style={{ fontSize: 22, color: MUTED, display: 'flex' }}>{venue}</div>}
        {speakers_str && (
          <div style={{ fontSize: 22, color: MUTED, marginTop: 8, display: 'flex' }}>
            {speakers_str}
          </div>
        )}
      </div>
    </div>
  );
}
