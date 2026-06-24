// L1 hooks — /v1/admin/segments (unified audience segment store).
//
// FR-MIG-029 — backs the segment builder integrated into the Members
// filter panel. Unified model covers both announcement and Telegram
// broadcast audiences; `segment_type` drives which downstream pickers
// consume each entry.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { CreateSegmentPayload, SegmentRow, SegmentType } from './types';

const SEGMENTS_KEY = ['admin', 'segments'] as const;

interface SegmentsListResponse {
  segments: SegmentRow[];
}

interface SegmentCreateResponse {
  segment: SegmentRow;
}

export function useSegments(type?: SegmentType): UseQueryResult<SegmentRow[], Error> {
  return useQuery<SegmentRow[], Error>({
    queryKey: type ? ([...SEGMENTS_KEY, type] as const) : SEGMENTS_KEY,
    queryFn: async () => {
      const url = type
        ? `/v1/admin/segments?type=${encodeURIComponent(type)}`
        : '/v1/admin/segments';
      const { segments } = await apiClient<SegmentsListResponse>(url);
      return segments;
    },
  });
}

export function useCreateSegment(): UseMutationResult<SegmentRow, Error, CreateSegmentPayload> {
  const qc = useQueryClient();
  return useMutation<SegmentRow, Error, CreateSegmentPayload>({
    mutationFn: async (body) => {
      const { segment } = await apiClient<SegmentCreateResponse>('/v1/admin/segments', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      });
      return segment;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SEGMENTS_KEY });
    },
  });
}

export function useDeleteSegment(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiClient<void>(`/v1/admin/segments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SEGMENTS_KEY });
    },
  });
}
