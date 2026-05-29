// L1 hooks — /v1/workspace/events (operator event control panel).
//
// Backs the Events cabinet: list (PR 2.7a) + per-event detail/edit
// (M2.2a — metadata PATCH; followups + regen-card land in M2.2b).

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { UpdateEventBody, WorkspaceEventDetail, WorkspaceEventListItem } from './types';

const WORKSPACE_EVENTS_BASE_KEY = ['workspace', 'events'] as const;

export function useWorkspaceEvents(): UseQueryResult<{ events: WorkspaceEventListItem[] }, Error> {
  return useQuery<{ events: WorkspaceEventListItem[] }, Error>({
    queryKey: [...WORKSPACE_EVENTS_BASE_KEY, 'list'] as const,
    queryFn: async () => apiClient<{ events: WorkspaceEventListItem[] }>('/v1/workspace/events'),
  });
}

export function useWorkspaceEvent(
  id: string,
): UseQueryResult<{ event: WorkspaceEventDetail }, Error> {
  return useQuery<{ event: WorkspaceEventDetail }, Error>({
    queryKey: [...WORKSPACE_EVENTS_BASE_KEY, 'detail', id] as const,
    queryFn: async () =>
      apiClient<{ event: WorkspaceEventDetail }>(`/v1/workspace/events/${encodeURIComponent(id)}`),
    enabled: id.length > 0,
  });
}

export function useUpdateEvent(
  id: string,
): UseMutationResult<{ event: WorkspaceEventDetail }, Error, UpdateEventBody> {
  const qc = useQueryClient();
  return useMutation<{ event: WorkspaceEventDetail }, Error, UpdateEventBody>({
    mutationFn: async (body) =>
      apiClient<{ event: WorkspaceEventDetail }>(`/v1/workspace/events/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: WORKSPACE_EVENTS_BASE_KEY });
    },
  });
}
