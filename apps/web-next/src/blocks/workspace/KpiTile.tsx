// L3 workspace block — <KpiTile>.
//
// Single-metric card used across the operator dashboard. Pure
// presentation: label + value (+ optional unit / hint / pending
// placeholder). Trend + delta-vs-previous-window land when the API
// surfaces them.
//
// Usage:
//   <KpiTile label="Events" value={42} unit="events" />
//   <KpiTile label="CSAT" value={4.2} unit="/5" hint="123 ratings" />
//   <KpiTile label="Registrations" isPending />

import type { ReactElement, ReactNode } from 'react';

interface Props {
  label: string;
  value?: ReactNode | undefined;
  unit?: string | undefined;
  hint?: string | undefined;
  isPending?: boolean | undefined;
  // Visual emphasis: 'default' (muted card) or 'accent' (primary tint).
  tone?: 'default' | 'accent' | undefined;
}

const TONE_CLASS: Record<NonNullable<Props['tone']>, string> = {
  default: 'border-border bg-card',
  accent: 'border-primary/30 bg-primary/[0.06]',
};

export function KpiTile({
  label,
  value,
  unit,
  hint,
  isPending = false,
  tone = 'default',
}: Props): ReactElement {
  return (
    <div className={`rounded-xl border ${TONE_CLASS[tone]} px-4 py-4 flex flex-col gap-1.5`}>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground m-0">
        {label}
      </p>
      {isPending ? (
        <p className="font-display text-3xl font-semibold text-muted-foreground m-0">…</p>
      ) : (
        <p className="font-display text-3xl font-semibold text-foreground m-0">
          {value ?? '—'}
          {unit && <span className="font-mono text-xs text-muted-foreground ml-1.5">{unit}</span>}
        </p>
      )}
      {hint && <p className="text-xs text-muted-foreground m-0">{hint}</p>}
    </div>
  );
}

export default KpiTile;
