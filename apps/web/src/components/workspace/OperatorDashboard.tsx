import { type ReactElement, useEffect, useState } from 'react';

// F-S2.4 — country-scoped operator dashboard + F-S2.6 cross-country
// comparison. Single component because the cross-country view is just
// the per-country card × N with the same data shape.

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/dashboard'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

type Country = 'uz' | 'kz' | 'tj' | 'xx';
const COUNTRIES: Country[] = ['uz', 'kz', 'tj', 'xx'];
const COUNTRY_LABEL: Record<Country, string> = {
  uz: 'Uzbekistan',
  kz: 'Kazakhstan',
  tj: 'Tajikistan',
  xx: 'Cross-country / demo',
};

interface Metrics {
  country: Country;
  range_days: number;
  events_count: number;
  registrations_count: number;
  attended_count: number;
  csat_avg: number | null;
  csat_count: number;
}

type Range = 7 | 30 | 90;

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; accessToken: string; metrics: Metrics[]; range: Range };

async function bootstrap(range: Range): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const res = await fetch(`/api/v1/workspace/dashboard/cross-country?days=${range}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { phase: 'anon' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };
  const { metrics } = (await res.json()) as { metrics: Metrics[] };
  return { phase: 'ready', accessToken, metrics, range };
}

export default function OperatorDashboard(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });

  useEffect(() => {
    bootstrap(30).then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon') window.location.replace(signInUrl());
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon') return <p style={muted()}>Loading…</p>;
  if (state.phase === 'probe_error')
    return <p style={muted()}>Backend error (HTTP {state.httpStatus}).</p>;

  async function setRange(range: Range): Promise<void> {
    setState({ phase: 'bootstrap' });
    setState(await bootstrap(range));
  }

  const totals = state.metrics.reduce(
    (acc, m) => ({
      events_count: acc.events_count + m.events_count,
      registrations_count: acc.registrations_count + m.registrations_count,
      attended_count: acc.attended_count + m.attended_count,
      csat_n: acc.csat_n + m.csat_count,
      csat_sum: acc.csat_sum + (m.csat_avg ?? 0) * m.csat_count,
    }),
    { events_count: 0, registrations_count: 0, attended_count: 0, csat_n: 0, csat_sum: 0 },
  );
  const totalCsatAvg =
    totals.csat_n > 0 ? Math.round((totals.csat_sum / totals.csat_n) * 10) / 10 : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {([7, 30, 90] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={state.range === r ? 'btn btn-primary' : 'btn'}
            style={{ padding: '6px 12px', fontSize: 14 }}
          >
            Last {r} days
          </button>
        ))}
      </div>

      <h2 style={h2Style()}>All countries</h2>
      <div style={gridStyle()}>
        <Stat label="Events" value={totals.events_count} />
        <Stat label="Registrations" value={totals.registrations_count} />
        <Stat label="Attended" value={totals.attended_count} />
        <Stat
          label="CSAT avg"
          value={totalCsatAvg !== null ? `${totalCsatAvg} / 10` : '—'}
          sub={totals.csat_n > 0 ? `(${totals.csat_n} responses)` : 'no responses'}
        />
      </div>

      <h2 style={{ ...h2Style(), marginTop: 32 }}>By country</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {COUNTRIES.map((c) => {
          const m = state.metrics.find((x) => x.country === c);
          return <CountryCard key={c} country={c} metrics={m} />;
        })}
      </div>
    </div>
  );
}

function CountryCard({
  country,
  metrics,
}: {
  country: Country;
  metrics: Metrics | undefined;
}): ReactElement {
  const m = metrics ?? {
    country,
    range_days: 0,
    events_count: 0,
    registrations_count: 0,
    attended_count: 0,
    csat_avg: null,
    csat_count: 0,
  };
  const attendanceRate =
    m.registrations_count > 0 ? Math.round((m.attended_count / m.registrations_count) * 100) : null;
  return (
    <div
      style={{
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>
        {country.toUpperCase()}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
        {COUNTRY_LABEL[country]}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
        <Cell label="Events" value={m.events_count} />
        <Cell label="Regs" value={m.registrations_count} />
        <Cell
          label="Attended"
          value={`${m.attended_count}${attendanceRate !== null ? ` (${attendanceRate}%)` : ''}`}
        />
        <Cell
          label="CSAT"
          value={m.csat_avg !== null ? `${m.csat_avg}` : '—'}
          sub={m.csat_count > 0 ? `${m.csat_count} resp` : ''}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}): ReactElement {
  return (
    <div
      style={{
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{label}</div>
      <div
        style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 600, marginTop: 4 }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}): ReactElement {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{label}</div>
      <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{sub}</div>}
    </div>
  );
}

function h2Style(): React.CSSProperties {
  return { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, margin: '0 0 12px' };
}

function gridStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
  };
}

function muted(): React.CSSProperties {
  return { fontSize: 15, color: 'var(--muted-foreground)' };
}
