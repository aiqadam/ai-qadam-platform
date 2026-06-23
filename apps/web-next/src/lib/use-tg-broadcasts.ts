// L1 hooks — /v1/workspace/tg-broadcasts (Telegram broadcast cabinet).
//
// FR-MIG-015 — backs TgBroadcastsList (GET list with status filter) and
// TgBroadcastComposer (GET/PATCH detail, POST create, send/cancel/duplicate).

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type {
  BroadcastDetail,
  BroadcastSummary,
  CreateBroadcastBody,
  SegmentPreview,
  UpdateBroadcastBody,
} from './types';

const BROADCASTS_KEY = ['workspace', 'tg-broadcasts'] as const;

// GET /v1/workspace/tg-broadcasts
export function useTgBroadcasts(
  status?: string,
): UseQueryResult<{ items: BroadcastSummary[] }, Error> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return useQuery<{ items: BroadcastSummary[] }, Error>({
    queryKey: [...BROADCASTS_KEY, status ?? 'all'] as const,
    queryFn: () => apiClient<{ items: BroadcastSummary[] }>(`/v1/workspace/tg-broadcasts${qs}`),
  });
}

// GET /v1/workspace/tg-broadcasts/:id
export function useTgBroadcastDetail(id: string): UseQueryResult<BroadcastDetail, Error> {
  return useQuery<BroadcastDetail, Error>({
    queryKey: [...BROADCASTS_KEY, 'detail', id] as const,
    queryFn: async () =>
      apiClient<BroadcastDetail>(`/v1/workspace/tg-broadcasts/${encodeURIComponent(id)}`),
    enabled: id.length > 0,
  });
}

// GET /v1/workspace/tg-segments/:id/preview — recipient count for send-now confirm
export function useSegmentPreview(id: string): UseQueryResult<SegmentPreview, Error> {
  return useQuery<SegmentPreview, Error>({
    queryKey: ['workspace', 'tg-segments', 'preview', id] as const,
    queryFn: async () =>
      apiClient<SegmentPreview>(`/v1/workspace/tg-segments/${encodeURIComponent(id)}/preview`),
    enabled: id.length > 0,
  });
}

// POST /v1/workspace/tg-broadcasts — create broadcast
export function useCreateBroadcast(): UseMutationResult<
  BroadcastDetail,
  Error,
  CreateBroadcastBody
> {
  const qc = useQueryClient();
  return useMutation<BroadcastDetail, Error, CreateBroadcastBody>({
    mutationFn: async (body) =>
      apiClient<BroadcastDetail>('/v1/workspace/tg-broadcasts', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BROADCASTS_KEY });
    },
  });
}

// PATCH /v1/workspace/tg-broadcasts/:id — update broadcast
export function useUpdateBroadcast(
  id: string,
): UseMutationResult<BroadcastDetail, Error, UpdateBroadcastBody> {
  const qc = useQueryClient();
  return useMutation<BroadcastDetail, Error, UpdateBroadcastBody>({
    mutationFn: async (body) =>
      apiClient<BroadcastDetail>(`/v1/workspace/tg-broadcasts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BROADCASTS_KEY });
      void qc.invalidateQueries({ queryKey: [...BROADCASTS_KEY, 'detail', id] });
    },
  });
}

// POST /v1/workspace/tg-broadcasts/:id/send-now
export function useSendBroadcast(id: string): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () =>
      apiClient<void>(`/v1/workspace/tg-broadcasts/${encodeURIComponent(id)}/send-now`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BROADCASTS_KEY });
      void qc.invalidateQueries({ queryKey: [...BROADCASTS_KEY, 'detail', id] });
    },
  });
}

// POST /v1/workspace/tg-broadcasts/:id/send-test
export function useSendBroadcastTest(id: string): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () =>
      apiClient<void>(`/v1/workspace/tg-broadcasts/${encodeURIComponent(id)}/send-test`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...BROADCASTS_KEY, 'detail', id] });
    },
  });
}

// POST /v1/workspace/tg-broadcasts/:id/cancel
export function useCancelBroadcast(id: string): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () =>
      apiClient<void>(`/v1/workspace/tg-broadcasts/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BROADCASTS_KEY });
      void qc.invalidateQueries({ queryKey: [...BROADCASTS_KEY, 'detail', id] });
    },
  });
}

// POST /v1/workspace/tg-broadcasts/:id/duplicate
export function useDuplicateBroadcast(id: string): UseMutationResult<{ id: string }, Error, void> {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, void>({
    mutationFn: async () =>
      apiClient<{ id: string }>(`/v1/workspace/tg-broadcasts/${encodeURIComponent(id)}/duplicate`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BROADCASTS_KEY });
    },
  });
}
