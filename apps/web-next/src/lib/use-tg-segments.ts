// L1 hooks — /v1/workspace/tg-segments (Telegram audience segments).
//
// FR-MIG-014 — backs TgSegmentsList (GET list, DELETE) and
// SegmentEditor (POST/PATCH preview + save).

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type {
  CreateSegmentBody,
  SegmentDetail,
  SegmentDraftPreview,
  SegmentPreview,
  SegmentSummary,
  UpdateSegmentBody,
} from './types';

const SEGMENTS_KEY = ['workspace', 'tg-segments'] as const;

// GET /v1/workspace/tg-segments
export function useTgSegments(): UseQueryResult<{ items: SegmentSummary[] }, Error> {
  return useQuery<{ items: SegmentSummary[] }, Error>({
    queryKey: SEGMENTS_KEY,
    queryFn: () => apiClient<{ items: SegmentSummary[] }>('/v1/workspace/tg-segments'),
  });
}

// GET /v1/workspace/tg-segments/:id
export function useTgSegmentDetail(id: string): UseQueryResult<SegmentDetail, Error> {
  return useQuery<SegmentDetail, Error>({
    queryKey: [...SEGMENTS_KEY, 'detail', id] as const,
    queryFn: async () =>
      apiClient<SegmentDetail>(`/v1/workspace/tg-segments/${encodeURIComponent(id)}`),
    enabled: id.length > 0,
  });
}

// GET /v1/workspace/tg-segments/:id/preview
export function useTgSegmentPreview(id: string): UseQueryResult<SegmentPreview, Error> {
  return useQuery<SegmentPreview, Error>({
    queryKey: [...SEGMENTS_KEY, 'preview', id] as const,
    queryFn: async () =>
      apiClient<SegmentPreview>(`/v1/workspace/tg-segments/${encodeURIComponent(id)}/preview`),
    enabled: id.length > 0,
  });
}

// POST /v1/workspace/tg-segments/preview — live preview of draft criteria
export function useTgSegmentDraftPreview(): UseMutationResult<
  SegmentDraftPreview,
  Error,
  { country: string; criteria: unknown }
> {
  return useMutation<SegmentDraftPreview, Error, { country: string; criteria: unknown }>({
    mutationFn: async ({ country, criteria }) =>
      apiClient<SegmentDraftPreview>('/v1/workspace/tg-segments/preview', {
        method: 'POST',
        body: { country, criteria } as Record<string, unknown>,
      }),
  });
}

// POST /v1/workspace/tg-segments — create segment
export function useCreateTgSegment(): UseMutationResult<SegmentDetail, Error, CreateSegmentBody> {
  const qc = useQueryClient();
  return useMutation<SegmentDetail, Error, CreateSegmentBody>({
    mutationFn: async (body) =>
      apiClient<SegmentDetail>('/v1/workspace/tg-segments', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SEGMENTS_KEY });
    },
  });
}

// PATCH /v1/workspace/tg-segments/:id — update segment
export function useUpdateTgSegment(
  id: string,
): UseMutationResult<SegmentDetail, Error, UpdateSegmentBody> {
  const qc = useQueryClient();
  return useMutation<SegmentDetail, Error, UpdateSegmentBody>({
    mutationFn: async (body) =>
      apiClient<SegmentDetail>(`/v1/workspace/tg-segments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SEGMENTS_KEY });
      void qc.invalidateQueries({ queryKey: [...SEGMENTS_KEY, 'detail', id] });
    },
  });
}

// DELETE /v1/workspace/tg-segments/:id
export function useDeleteTgSegment(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) =>
      apiClient<void>(`/v1/workspace/tg-segments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SEGMENTS_KEY });
    },
  });
}
