import { type ReactElement, useEffect, useState } from 'react';

function signInUrl(slug: string): string {
  const next = `/workspace/partners/${slug}`;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

interface PartnerAudience {
  id: string;
  cohort_id: string;
  cohort_name: string;
  member_count: number;
  purpose: string;
  granted_at: string;
  expires_at: string | null;
}

interface KitAsset {
  id: string;
  category: string;
  title: string;
  file_url: string | null;
}

interface PartnerDetail {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  industry: string | null;
  website: string | null;
  is_sponsor: boolean;
  is_employer: boolean;
  is_product_partner: boolean;
  status: string;
  audiences: PartnerAudience[];
  kit_assets: KitAsset[];
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'not_found' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; partner: PartnerDetail };

async function bootstrap(slug: string): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const res = await fetch(`/api/v1/workspace/partners/${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { phase: 'anon' };
  if (res.status === 404) return { phase: 'not_found' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };
  const partner = (await res.json()) as PartnerDetail;
  return { phase: 'ready', partner };
}

export default function PartnerView({ slug }: { slug: string }): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });

  useEffect(() => {
    bootstrap(slug).then(setState);
  }, [slug]);

  useEffect(() => {
    if (state.phase === 'anon') window.location.replace(signInUrl(slug));
  }, [state.phase, slug]);

  if (state.phase === 'bootstrap' || state.phase === 'anon') return <p style={muted()}>Loading…</p>;
  if (state.phase === 'not_found') return <p style={muted()}>Partner not found.</p>;
  if (state.phase === 'probe_error')
    return <p style={muted()}>Backend error (HTTP {state.httpStatus}).</p>;

  const p = state.partner;

  return (
    <>
      <header style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 32,
            margin: '0 0 8px',
          }}
        >
          {p.name}
        </h1>
        <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
          {p.country && <span>{p.country.toUpperCase()}</span>}
          {p.industry && <span>· {p.industry}</span>}
          {p.website && (
            <a href={p.website} target="_blank" rel="noopener noreferrer">
              {p.website.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      </header>

      <section style={section()}>
        <h2 style={h2()}>Entitled audiences</h2>
        <p style={muted()}>
          Cohorts you're entitled to. Per the sponsor PII boundary, only counts are surfaced — never
          member rows.
        </p>
        {p.audiences.length === 0 ? (
          <p style={muted()}>No audience entitlements yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={th()}>Cohort</th>
                <th style={th()}>Members</th>
                <th style={th()}>Purpose</th>
                <th style={th()}>Granted</th>
                <th style={th()}>Expires</th>
              </tr>
            </thead>
            <tbody>
              {p.audiences.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={td()}>{a.cohort_name}</td>
                  <td style={td()}>{a.member_count}</td>
                  <td style={td()}>
                    <code style={{ fontSize: 12 }}>{a.purpose}</code>
                  </td>
                  <td style={{ ...td(), color: 'var(--muted-foreground)', fontSize: 12 }}>
                    {new Date(a.granted_at).toLocaleDateString()}
                  </td>
                  <td style={{ ...td(), color: 'var(--muted-foreground)', fontSize: 12 }}>
                    {a.expires_at ? new Date(a.expires_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={section()}>
        <h2 style={h2()}>Co-marketing kit</h2>
        <p style={muted()}>
          Approved press + brand assets visible to sponsors. Quarterly digest PDF arrives via F-S3.8
          once shipped.
        </p>
        {p.kit_assets.length === 0 ? (
          <p style={muted()}>No published kit assets yet.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {p.kit_assets.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--card)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  {a.category}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{a.title}</div>
                {a.file_url ? (
                  <a
                    href={a.file_url}
                    className="btn"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    Download
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                    No file attached
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function section(): React.CSSProperties {
  return { marginTop: 24 };
}
function h2(): React.CSSProperties {
  return {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 20,
    margin: '0 0 8px',
  };
}
function muted(): React.CSSProperties {
  return { fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 12px' };
}
function th(): React.CSSProperties {
  return { padding: '8px 12px', fontWeight: 600, fontSize: 13 };
}
function td(): React.CSSProperties {
  return { padding: '10px 12px', verticalAlign: 'top' };
}
