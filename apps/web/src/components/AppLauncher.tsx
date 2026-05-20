import type { ReactElement } from 'react';

// /workspace app launcher per ADR-0032: every operator-facing surface
// lives behind one of these cards. Operators only have one URL to
// bookmark — this one. Tool URLs change over time; cards stay.
//
// Placeholder RBAC: every logged-in viewer sees every card. When S2.2
// RBAC sync ships, gate per `visibility` field per card (and add
// per-card sign-in hints — e.g. "engineers only" stays in the card
// so it's discoverable even when filtered out).

interface AppCard {
  slug: string;
  title: string;
  description: string;
  url: string;
  scope: 'operator' | 'engineer';
  // Phase 2 = embed in workspace (iframe at /workspace/<slug>);
  // phase 1 = open the tool directly in a new tab. We start with
  // phase 1 for every card, then promote to phase 2 per the ADR-0032
  // sequencing.
  status: 'open-in-new-tab' | 'embedded';
}

const CARDS: AppCard[] = [
  {
    slug: 'status',
    title: 'Uptime · Gatus',
    description: 'Probes every public AI Qadam surface. Telegram alerts on outage.',
    url: 'https://status.aiqadam.org',
    scope: 'operator',
    status: 'open-in-new-tab',
  },
  {
    slug: 'analytics',
    title: 'Analytics · Plausible',
    description: 'Cookieless web analytics for aiqadam.org and per-country subdomains.',
    url: 'https://analytics.aiqadam.org',
    scope: 'engineer',
    status: 'open-in-new-tab',
  },
  {
    slug: 'cms',
    title: 'Content · Directus',
    description: 'Edit homepage hero, partners, sponsors, speakers, events.',
    url: 'https://cms.aiqadam.org',
    scope: 'operator',
    status: 'open-in-new-tab',
  },
  {
    slug: 'identity',
    title: 'Identity · Authentik',
    description: 'OIDC IdP. Manage users, groups, applications, OAuth providers.',
    url: 'https://auth.aiqadam.org',
    scope: 'engineer',
    status: 'open-in-new-tab',
  },
];

export default function AppLauncher(): ReactElement {
  return (
    <section style={{ marginTop: 32 }}>
      <header style={{ marginBottom: 16 }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 6px',
          }}
        >
          App launcher
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>
          Per-role visibility lands with S2.2 RBAC sync. Until then every signed-in viewer sees
          every card; engineer-only tools are marked.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {CARDS.map((card) => (
          <Card key={card.slug} card={card} />
        ))}
      </div>
    </section>
  );
}

function Card({ card }: { card: AppCard }): ReactElement {
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 16,
            margin: 0,
          }}
        >
          {card.title}
        </h3>
        {card.scope === 'engineer' && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'color-mix(in oklch, var(--muted-foreground) 12%, transparent)',
              color: 'var(--muted-foreground)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Engineer
          </span>
        )}
      </div>
      <p
        style={{
          fontSize: 13,
          color: 'var(--muted-foreground)',
          lineHeight: 1.5,
          margin: '0 0 12px',
        }}
      >
        {card.description}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--muted-foreground)',
          margin: 0,
        }}
      >
        {new URL(card.url).host} ↗
      </p>
    </a>
  );
}
