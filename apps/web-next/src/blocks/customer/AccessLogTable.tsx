// L3 block — <AccessLogTable>.
//
// FR-MIG-018 — table of auth events on /me/access-log.
// Columns: event type, timestamp, severity badge. No IP column — the
// API strips it for self-view per ADR-0033 (IP only visible to super-admin).
//
// Data-in at the React boundary: receives no props, reads from
// useMyAccessLog(). Lives under blocks/customer/ per ADR-0038.
//
// Wiring: docs/04-development/architecture/wiring-map.md → member_access_log.

import { Badge } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type { AccessLogEvent, AuditSeverity } from '@/lib/types';
import { useMyAccessLog } from '@/lib/use-access-log';
import { type ReactElement } from 'react';

// Event type labels — matches the dot-namespaced values stored in audit_events.event
const EVENT_LABELS: Record<string, string> = {
  'auth.sign_in': 'Sign in',
  'auth.token_refresh': 'Token refresh',
  'auth.sign_out': 'Sign out',
  'profile.updated': 'Profile updated',
  'consent.toggled': 'Consent changed',
};

function formatEventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event;
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const SEVERITY_VARIANT: Record<AuditSeverity, 'default' | 'secondary' | 'destructive'> = {
  info: 'default',
  high: 'secondary',
  critical: 'destructive',
};

function EventRow({ event }: { event: AccessLogEvent }): ReactElement {
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-foreground">{formatEventLabel(event.event)}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-xs text-muted-foreground font-mono">{formatTs(event.ts)}</p>
      </td>
      <td className="px-4 py-3">
        <Badge variant={SEVERITY_VARIANT[event.severity]} className="capitalize">
          {event.severity}
        </Badge>
      </td>
    </tr>
  );
}

function AccessLogTableInner(): ReactElement {
  const { data, isPending, error } = useMyAccessLog();

  if (isPending) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-xs text-muted-foreground">Loading access log...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive bg-card p-6 text-center">
        <p className="text-xs text-destructive">
          Unable to load access log. Reload the page to retry.
        </p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground mb-1">No access events yet.</p>
        <p className="text-xs text-muted-foreground">
          Events appear here when you sign in or refresh your session.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Event
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              When
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Severity
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccessLogTable(): ReactElement {
  return (
    <IslandRoot>
      <AccessLogTableInner />
    </IslandRoot>
  );
}

export default AccessLogTable;
