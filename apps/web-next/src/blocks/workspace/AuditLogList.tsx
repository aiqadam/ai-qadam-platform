// L3 workspace block — <AuditLogList>.
//
// Super-admin audit cabinet island. Reads /v1/admin/audit/events
// (gated by AuthGuard + SuperAdminGuard) and renders the timeline
// via DataTable. Filter chips for severity + event-namespace prefix
// + country let the operator narrow the firehose without leaving the
// page.

import { COUNTRY_CODES, type CountryCode } from '@/lib/types';
import { AUDIT_SEVERITIES, type AuditEventSummary, type AuditSeverity } from '@/lib/types';
import { useAuditEvents } from '@/lib/use-audit';
import { type ReactElement, type ReactNode, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

const EVENT_PREFIXES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'all' },
  { value: 'invite.', label: 'invite.*' },
  { value: 'rbac.', label: 'rbac.*' },
  { value: 'event.', label: 'event.*' },
  { value: 'registration.', label: 'registration.*' },
];

const SEVERITY_TONE: Record<AuditSeverity, string> = {
  info: 'border-border text-muted-foreground bg-card',
  high: 'border-primary/30 text-primary bg-primary/10',
  critical: 'border-destructive/30 text-destructive bg-destructive/10',
};

function SeverityBadge({ severity }: { severity: AuditSeverity }): ReactElement {
  return (
    <span
      className={`inline-block font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEVERITY_TONE[severity]}`}
    >
      {severity}
    </span>
  );
}

function FilterChip({
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

const COLUMNS: ReadonlyArray<DataTableColumn<AuditEventSummary>> = [
  {
    key: 'ts',
    label: 'When',
    width: 'sm',
    render: (r) => (
      <time
        dateTime={r.ts}
        className="font-mono text-[10px] text-muted-foreground whitespace-nowrap"
      >
        {new Date(r.ts).toISOString().replace('T', ' ').slice(0, 19)}Z
      </time>
    ),
  },
  {
    key: 'severity',
    label: 'Sev',
    width: 'sm',
    render: (r) => <SeverityBadge severity={r.severity} />,
  },
  {
    key: 'event',
    label: 'Event',
    width: 'md',
    render: (r) => <span className="font-mono text-xs text-foreground">{r.event}</span>,
  },
  {
    key: 'actor',
    label: 'Actor',
    render: (r) =>
      r.actor_email ? (
        <span className="text-xs text-foreground">{r.actor_email}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'target',
    label: 'Target',
    render: (r) =>
      r.target_kind ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          {r.target_kind}
          {r.target_id ? `:${r.target_id.slice(0, 8)}…` : ''}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'country',
    label: 'CC',
    width: 'sm',
    render: (r) =>
      r.country ? (
        <span className="font-mono text-[10px] uppercase text-muted-foreground">{r.country}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

function FilterRow({
  severity,
  setSeverity,
  prefix,
  setPrefix,
  country,
  setCountry,
}: {
  severity: AuditSeverity | '';
  setSeverity: (v: AuditSeverity | '') => void;
  prefix: string;
  setPrefix: (v: string) => void;
  country: CountryCode | '';
  setCountry: (v: CountryCode | '') => void;
}): ReactElement {
  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 mb-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Severity
        </span>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={severity === ''} onClick={() => setSeverity('')}>
            all
          </FilterChip>
          {AUDIT_SEVERITIES.map((s) => (
            <FilterChip key={s} active={severity === s} onClick={() => setSeverity(s)}>
              {s}
            </FilterChip>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Event
        </span>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_PREFIXES.map((p) => (
            <FilterChip
              key={p.value}
              active={prefix === p.value}
              onClick={() => setPrefix(p.value)}
            >
              {p.label}
            </FilterChip>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Country
        </span>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={country === ''} onClick={() => setCountry('')}>
            all
          </FilterChip>
          {COUNTRY_CODES.map((c) => (
            <FilterChip key={c} active={country === c} onClick={() => setCountry(c)}>
              {c}
            </FilterChip>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuditLogList(): ReactElement {
  const [severity, setSeverity] = useState<AuditSeverity | ''>('');
  const [prefix, setPrefix] = useState<string>('');
  const [country, setCountry] = useState<CountryCode | ''>('');

  const query = useAuditEvents({
    ...(severity ? { severity } : {}),
    ...(prefix ? { eventPrefix: prefix } : {}),
    ...(country ? { country } : {}),
    limit: 200,
  });

  return (
    <div className="space-y-4">
      <FilterRow
        severity={severity}
        setSeverity={setSeverity}
        prefix={prefix}
        setPrefix={setPrefix}
        country={country}
        setCountry={setCountry}
      />
      <DataTable
        columns={COLUMNS}
        rows={query.data?.events ?? []}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        errorMessage={query.error?.message ?? null}
        emptyHeading="No matching events"
        emptyDescription="Adjust the filters or wait — audit events arrive on every operator action."
      />
      {query.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {query.data.events.length} events shown · capped at 200
        </p>
      )}
    </div>
  );
}

export default AuditLogList;
