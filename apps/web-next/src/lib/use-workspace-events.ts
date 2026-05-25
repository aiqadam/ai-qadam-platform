// L1 hooks — /v1/workspace/events (operator event control panel list).
//
// Backs the Events cabinet at /workspace/events. PR 2.7 ships the
// read-only list with status filter; per-event drill-in (followups,
// PATCH metadata, regenerate OG card) lands in follow-ups when each
// downstream action surfaces a need.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { WorkspaceEventListItem } from './types';

const WORKSPACE_EVENTS_BASE_KEY = ['workspace', 'events'] as const;

export function useWorkspaceEvents(): UseQueryResult<{ events: WorkspaceEventListItem[] }, Error> {
  return useQuery<{ events: WorkspaceEventListItem[] }, Error>({
    queryKey: [...WORKSPACE_EVENTS_BASE_KEY, 'list'] as const,
    queryFn: async () => apiClient<{ events: WorkspaceEventListItem[] }>('/v1/workspace/events'),
  });
}
