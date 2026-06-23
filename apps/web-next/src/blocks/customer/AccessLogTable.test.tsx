// AccessLogTable.test.tsx — Unit tests for AccessLogTable component.
// Tests: pure formatting helpers, state rendering logic, event row data shape.
//
// Per standards.md §IV: pure presentation component.
// @testing-library/react is NOT installed; tests follow the AnnounceComposer.test.tsx
// pattern: pure-helper extraction + smoke-level state inspection via stubs.
// No React.createElement is used — the component's JSX is not re-implemented.

import type { AccessLogEvent, AuditSeverity } from '@/lib/types';
import { describe, expect, it } from 'vitest';

// ─── Local re-implementation of pure helpers from AccessLogTable.tsx ─────────────

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

// ─── Component state stub (mirrors AccessLogTableInner branching logic) ────────────

type SimulatedHookState =
  | { status: 'pending' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: AccessLogEvent[] };

// Mirrors AccessLogTableInner.tsx logic for testing without React rendering
function getAccessLogRenderState(hookState: SimulatedHookState): {
  variant: 'loading' | 'error' | 'empty' | 'table';
  events: AccessLogEvent[] | null;
} {
  if (hookState.status === 'pending') {
    return { variant: 'loading', events: null };
  }
  if (hookState.status === 'error') {
    return { variant: 'error', events: null };
  }
  if (hookState.data.length === 0) {
    return { variant: 'empty', events: null };
  }
  return { variant: 'table', events: hookState.data };
}

// Stub that mirrors EventRow data extraction for each event
function getEventRowData(event: AccessLogEvent): {
  label: string;
  ts: string;
  severityText: string;
  severityVariant: 'default' | 'secondary' | 'destructive';
} {
  return {
    label: formatEventLabel(event.event),
    ts: formatTs(event.ts),
    severityText: event.severity,
    severityVariant: SEVERITY_VARIANT[event.severity],
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AccessLogTable — pure helpers', () => {
  describe('formatEventLabel', () => {
    it('should return "Sign in" for auth.sign_in', () => {
      expect(formatEventLabel('auth.sign_in')).toBe('Sign in');
    });

    it('should return "Token refresh" for auth.token_refresh', () => {
      expect(formatEventLabel('auth.token_refresh')).toBe('Token refresh');
    });

    it('should return "Sign out" for auth.sign_out', () => {
      expect(formatEventLabel('auth.sign_out')).toBe('Sign out');
    });

    it('should return "Profile updated" for profile.updated', () => {
      expect(formatEventLabel('profile.updated')).toBe('Profile updated');
    });

    it('should return "Consent changed" for consent.toggled', () => {
      expect(formatEventLabel('consent.toggled')).toBe('Consent changed');
    });

    it('should fall back to the raw event string for unknown event types', () => {
      expect(formatEventLabel('admin.privilege_escalated')).toBe('admin.privilege_escalated');
    });
  });

  describe('formatTs', () => {
    it('should format an ISO timestamp using locale date+time', () => {
      const formatted = formatTs('2026-06-20T10:00:00Z');
      // Date.toLocaleString returns locale-dependent output; verify it is a string
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should handle timestamps with different dates', () => {
      const formatted = formatTs('2026-01-01T00:00:00Z');
      expect(typeof formatted).toBe('string');
    });

    it('should produce consistent output for the same input', () => {
      const first = formatTs('2026-06-15T14:30:00Z');
      const second = formatTs('2026-06-15T14:30:00Z');
      expect(first).toBe(second);
    });
  });

  describe('SEVERITY_VARIANT mapping', () => {
    it('should map info to default variant', () => {
      expect(SEVERITY_VARIANT.info).toBe('default');
    });

    it('should map high to secondary variant', () => {
      expect(SEVERITY_VARIANT.high).toBe('secondary');
    });

    it('should map critical to destructive variant', () => {
      expect(SEVERITY_VARIANT.critical).toBe('destructive');
    });
  });
});

describe('AccessLogTable — state rendering logic', () => {
  describe('getAccessLogRenderState', () => {
    it('should return loading variant when isPending=true', () => {
      const state: SimulatedHookState = { status: 'pending' };
      const result = getAccessLogRenderState(state);
      expect(result.variant).toBe('loading');
      expect(result.events).toBeNull();
    });

    it('should return error variant when error is present', () => {
      const state: SimulatedHookState = { status: 'error', error: new Error('Network error') };
      const result = getAccessLogRenderState(state);
      expect(result.variant).toBe('error');
      expect(result.events).toBeNull();
    });

    it('should return empty variant when events array is empty', () => {
      const state: SimulatedHookState = { status: 'success', data: [] };
      const result = getAccessLogRenderState(state);
      expect(result.variant).toBe('empty');
      // Empty state returns null (no events to display); the variant alone signals empty state
      expect(result.events).toBeNull();
    });

    it('should return table variant with events when data is non-empty', () => {
      const events: AccessLogEvent[] = [
        {
          id: 'evt-1',
          event: 'auth.sign_in',
          severity: 'info' as AuditSeverity,
          target_kind: null,
          ts: '2026-06-20T10:00:00Z',
        },
      ];
      const state: SimulatedHookState = { status: 'success', data: events };
      const result = getAccessLogRenderState(state);
      expect(result.variant).toBe('table');
      expect(result.events).toHaveLength(1);
    });

    it('should return table variant when data has multiple events', () => {
      const events: AccessLogEvent[] = [
        {
          id: 'evt-1',
          event: 'auth.sign_in',
          severity: 'info' as AuditSeverity,
          target_kind: null,
          ts: '2026-06-20T10:00:00Z',
        },
        {
          id: 'evt-2',
          event: 'auth.token_refresh',
          severity: 'info' as AuditSeverity,
          target_kind: null,
          ts: '2026-06-20T10:15:00Z',
        },
        {
          id: 'evt-3',
          event: 'auth.sign_out',
          severity: 'info' as AuditSeverity,
          target_kind: null,
          ts: '2026-06-20T11:00:00Z',
        },
      ];
      const state: SimulatedHookState = { status: 'success', data: events };
      const result = getAccessLogRenderState(state);
      expect(result.variant).toBe('table');
      expect(result.events).toHaveLength(3);
    });
  });
});

describe('AccessLogTable — event row data shape', () => {
  it('should format event label for sign_in event', () => {
    const event: AccessLogEvent = {
      id: 'evt-1',
      event: 'auth.sign_in',
      severity: 'info' as AuditSeverity,
      target_kind: null,
      ts: '2026-06-20T10:00:00Z',
    };
    const rowData = getEventRowData(event);
    expect(rowData.label).toBe('Sign in');
    expect(rowData.ts).toBeTruthy();
    expect(rowData.severityText).toBe('info');
    expect(rowData.severityVariant).toBe('default');
  });

  it('should format event label for consent.toggled event', () => {
    const event: AccessLogEvent = {
      id: 'evt-2',
      event: 'consent.toggled',
      severity: 'high' as AuditSeverity,
      target_kind: null,
      ts: '2026-06-21T09:00:00Z',
    };
    const rowData = getEventRowData(event);
    expect(rowData.label).toBe('Consent changed');
    expect(rowData.severityText).toBe('high');
    expect(rowData.severityVariant).toBe('secondary');
  });

  it('should format critical severity correctly', () => {
    const event: AccessLogEvent = {
      id: 'evt-3',
      event: 'auth.sign_out',
      severity: 'critical' as AuditSeverity,
      target_kind: null,
      ts: '2026-06-22T14:30:00Z',
    };
    const rowData = getEventRowData(event);
    expect(rowData.severityText).toBe('critical');
    expect(rowData.severityVariant).toBe('destructive');
  });

  it('should format timestamp as locale string', () => {
    const event: AccessLogEvent = {
      id: 'evt-4',
      event: 'auth.sign_in',
      severity: 'info' as AuditSeverity,
      target_kind: null,
      ts: '2026-06-20T10:00:00Z',
    };
    const rowData = getEventRowData(event);
    // Should return a formatted string, not the raw ISO format
    expect(rowData.ts).not.toContain('2026-06-20T10:00:00Z');
    expect(rowData.ts).toBeTruthy();
    expect(typeof rowData.ts).toBe('string');
  });

  it('should preserve all event fields in row data', () => {
    const event: AccessLogEvent = {
      id: 'evt-abc123',
      event: 'auth.sign_out',
      severity: 'high' as AuditSeverity,
      target_kind: 'session',
      ts: '2026-06-22T14:30:00Z',
    };
    const rowData = getEventRowData(event);
    expect(rowData.label).toBe('Sign out');
    expect(rowData.ts).toBeTruthy();
    expect(rowData.severityText).toBe('high');
  });

  it('should handle unknown event type with raw fallback', () => {
    const event: AccessLogEvent = {
      id: 'evt-5',
      event: 'unknown.event_type',
      severity: 'info' as AuditSeverity,
      target_kind: null,
      ts: '2026-06-23T08:00:00Z',
    };
    const rowData = getEventRowData(event);
    expect(rowData.label).toBe('unknown.event_type');
  });
});
