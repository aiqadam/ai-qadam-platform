// L1 hooks — /v1/me/access-log (member-facing auth event log).
//
// FR-MIG-018 — backs <AccessLogTable> on /me/access-log.
// Data is self-only (MeAccessLogController filters by req.user.sub).
// Lives under lib/use-* per ADR-0038 §Locks #1.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { AccessLogEvent } from './types';

const ACCESS_LOG_KEY = ['me', 'access-log'] as const;

export function useMyAccessLog(): UseQueryResult<AccessLogEvent[], Error> {
  return useQuery<AccessLogEvent[], Error>({
    queryKey: ACCESS_LOG_KEY,
    queryFn: async () => {
      const body = await apiClient<{ events: AccessLogEvent[] }>('/v1/me/access-log');
      return body.events;
    },
  });
}
