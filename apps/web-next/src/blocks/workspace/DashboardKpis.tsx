// L3 workspace block — <DashboardKpis>.
//
// /workspace/dashboard island. Renders a KpiTile grid for the
// selected country + days window, plus a cross-country strip
// underneath so country leads can spot relative differences without
// switching the picker.
//
// Cabinet is operator-only (page-level AuthGate). Per ADR-0033 Part 3
// the country lead sees their own country first; super-admin can
// flip via the picker.

import { COUNTRY_CODES, type CountryCode, type CountryMetrics } from '@/lib/types';
import { useCountryMetrics, useCrossCountryMetrics } from '@/lib/use-dashboard';
import { type ReactElement, type ReactNode, useState } from 'react';
import { KpiTile } from './KpiTile';

const RANGE_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '1y' },
] as const;

function PickerButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-muted-foreground border-border hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  );
}

function ControlsRow({
  country,
  setCountry,
  days,
  setDays,
}: {
  country: CountryCode;
  setCountry: (c: CountryCode) => void;
  days: number;
  setDays: (d: number) => void;
}): ReactElement {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 mb-6">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Country
        </span>
        <div className="flex flex-wrap gap-1.5">
          {COUNTRY_CODES.map((c) => (
            <PickerButton key={c} active={c === country} onClick={() => setCountry(c)}>
              {c}
            </PickerButton>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Range
        </span>
        <div className="flex flex-wrap gap-1.5">
          {RANGE_OPTIONS.map((opt) => (
            <PickerButton
              key={opt.value}
              active={opt.value === days}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </PickerButton>
          ))}
        </div>
      </div>
    </div>
  );
}

function CountryTiles({
  metrics,
  isPending,
  errorMessage,
}: {
  metrics: CountryMetrics | undefined;
  isPending: boolean;
  errorMessage: string | null;
}): ReactElement {
  if (errorMessage) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {errorMessage}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiTile
        label="Events"
        value={metrics?.events_count.toLocaleString()}
        isPending={isPending && !metrics}
        tone="accent"
      />
      <KpiTile
        label="Registrations"
        value={metrics?.registrations_count.toLocaleString()}
        isPending={isPending && !metrics}
      />
      <KpiTile
        label="Attended"
        value={metrics?.attended_count.toLocaleString()}
        isPending={isPending && !metrics}
      />
      <KpiTile
        label="CSAT"
        value={metrics?.csat_avg != null ? metrics.csat_avg.toFixed(1) : metrics ? '—' : undefined}
        unit={metrics?.csat_avg != null ? '/5' : undefined}
        hint={metrics ? `${metrics.csat_count} ratings` : undefined}
        isPending={isPending && !metrics}
      />
    </div>
  );
}

function CrossCountryStrip({ days }: { days: number }): ReactElement {
  const query = useCrossCountryMetrics(days);
  if (query.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {query.error.message}
      </div>
    );
  }
  const rows = query.data ?? [];
  return (
    <section className="space-y-3">
      <header>
        <h2 className="font-display text-lg font-semibold text-foreground m-0">Across countries</h2>
        <p className="text-xs text-muted-foreground mt-1 m-0">
          All four tenants for the same range. Updates when the range picker changes.
        </p>
      </header>
      {query.isPending && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rows.map((m) => (
            <div key={m.country} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground m-0">
                {m.country}
              </p>
              <p className="text-xs text-muted-foreground m-0">
                {m.events_count} events · {m.registrations_count} regs · {m.attended_count} attended
              </p>
              <p className="text-xs text-muted-foreground m-0">
                CSAT {m.csat_avg != null ? `${m.csat_avg.toFixed(1)} (${m.csat_count})` : '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function DashboardKpis(): ReactElement {
  const [country, setCountry] = useState<CountryCode>('uz');
  const [days, setDays] = useState<number>(30);
  const main = useCountryMetrics({ country, days });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <ControlsRow country={country} setCountry={setCountry} days={days} setDays={setDays} />
        <CountryTiles
          metrics={main.data}
          isPending={main.isPending}
          errorMessage={main.error?.message ?? null}
        />
      </section>
      <CrossCountryStrip days={days} />
    </div>
  );
}

export default DashboardKpis;
