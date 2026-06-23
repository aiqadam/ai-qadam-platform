// L1 hooks — /v1/workspace/events (operator event control panel).
//
// Backs the Events cabinet: list (PR 2.7a) + per-event detail/edit
// (M2.2a metadata PATCH; M2.2b followups checklist + social-card regen).

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type {
  EventFollowupKind,
  UpdateEventBody,
  WorkspaceEventDetail,
  WorkspaceEventFollowup,
  WorkspaceEventListItem,
} from './types';

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

export interface UpsertFollowupVars {
  kind: EventFollowupKind;
  body_md?: string | null;
  completed?: boolean;
}

export function useUpsertFollowup(
  eventId: string,
): UseMutationResult<{ followup: WorkspaceEventFollowup }, Error, UpsertFollowupVars> {
  const qc = useQueryClient();
  return useMutation<{ followup: WorkspaceEventFollowup }, Error, UpsertFollowupVars>({
    mutationFn: async ({ kind, ...rest }) =>
      apiClient<{ followup: WorkspaceEventFollowup }>(
        `/v1/workspace/events/${encodeURIComponent(eventId)}/followups/${encodeURIComponent(kind)}`,
        { method: 'PUT', body: rest as unknown as Record<string, unknown> },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...WORKSPACE_EVENTS_BASE_KEY, 'detail', eventId] });
    },
  });
}

export function useRegenerateSocialCard(
  eventId: string,
): UseMutationResult<{ regenerated: true }, Error, void> {
  return useMutation<{ regenerated: true }, Error, void>({
    mutationFn: async () =>
      apiClient<{ regenerated: true }>(
        `/v1/workspace/events/${encodeURIComponent(eventId)}/regenerate-social-card`,
        { method: 'POST' },
      ),
  });
}

export function useCancelEvent(
  eventId: string,
): UseMutationResult<{ event: WorkspaceEventDetail }, Error, void> {
  const qc = useQueryClient();
  return useMutation<{ event: WorkspaceEventDetail }, Error, void>({
    mutationFn: async () =>
      apiClient<{ event: WorkspaceEventDetail }>(
        `/v1/workspace/events/${encodeURIComponent(eventId)}`,
        { method: 'PATCH', body: { status: 'cancelled' } as unknown as Record<string, unknown> },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: WORKSPACE_EVENTS_BASE_KEY });
    },
  });
}
