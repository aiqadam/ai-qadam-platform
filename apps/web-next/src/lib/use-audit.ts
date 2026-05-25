// L1 hooks — /v1/admin/audit/events (super-admin audit log).
//
// Backs the Audit cabinet at /workspace/admin/audit. Filters:
// severity, event prefix (e.g. "invite."), country, and limit. The
// API endpoint is super-admin only (AuthGuard + SuperAdminGuard);
// the page also renders <AuthGate role="aiqadam-super-admin"> as a
// UX short-circuit.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { AuditEventSummary, AuditSeverity, CountryCode } from './types';

const AUDIT_BASE_KEY = ['admin', 'audit'] as const;

export interface AuditQueryArgs {
  severity?: AuditSeverity;
  eventPrefix?: string;
  country?: CountryCode;
  limit?: number;
}

export function useAuditEvents(
  args: AuditQueryArgs = {},
): UseQueryResult<{ events: AuditEventSummary[] }, Error> {
  return useQuery<{ events: AuditEventSummary[] }, Error>({
    queryKey: [...AUDIT_BASE_KEY, args] as const,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (args.severity) params.set('severity', args.severity);
      if (args.eventPrefix) params.set('event_prefix', args.eventPrefix);
      if (args.country) params.set('country', args.country);
      if (args.limit) params.set('limit', String(args.limit));
      const suffix = params.toString();
      return apiClient<{ events: AuditEventSummary[] }>(
        suffix ? `/v1/admin/audit/events?${suffix}` : '/v1/admin/audit/events',
      );
    },
  });
}
