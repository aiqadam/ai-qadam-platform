import { type ReactElement, useEffect, useState } from 'react';

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/partners'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

interface PartnerSummary {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  industry: string | null;
  website: string | null;
  is_sponsor: boolean;
  is_employer: boolean;
  is_product_partner: boolean;
  status: 'active' | 'pending' | 'archived';
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; partners: PartnerSummary[] };

async function bootstrap(): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const res = await fetch('/api/v1/workspace/partners', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { phase: 'anon' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };
  const { partners } = (await res.json()) as { partners: PartnerSummary[] };
  return { phase: 'ready', partners };
}

function roleChips(p: PartnerSummary): ReactElement[] {
  const chips: ReactElement[] = [];
  const tag = (label: string, bg: string): ReactElement => (
    <span
      key={label}
      style={{
        background: bg,
        color: 'white',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        marginRight: 4,
      }}
    >
      {label}
    </span>
  );
  if (p.is_sponsor) chips.push(tag('sponsor', '#0ea5e9'));
  if (p.is_employer) chips.push(tag('employer', '#10b981'));
  if (p.is_product_partner) chips.push(tag('product', '#a78bfa'));
  return chips;
}

export default function PartnersList(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });

  useEffect(() => {
    bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon') window.location.replace(signInUrl());
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon') return <p style={muted()}>Loading…</p>;
  if (state.phase === 'probe_error')
    return <p style={muted()}>Backend error (HTTP {state.httpStatus}).</p>;
  if (state.partners.length === 0) return <p style={muted()}>No active partners yet.</p>;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
      }}
    >
      {state.partners.map((p) => (
        <a
          key={p.id}
          href={`/workspace/partners/${p.slug}`}
          style={{
            padding: 20,
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: 'var(--card)',
            textDecoration: 'none',
            color: 'var(--foreground)',
            display: 'block',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
            {p.name}
          </div>
          <div style={{ marginTop: 8 }}>{roleChips(p)}</div>
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: 'var(--muted-foreground)',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {p.country && <span>{p.country.toUpperCase()}</span>}
            {p.industry && <span>· {p.industry}</span>}
          </div>
        </a>
      ))}
    </div>
  );
}

function muted(): React.CSSProperties {
  return { fontSize: 15, color: 'var(--muted-foreground)' };
}
