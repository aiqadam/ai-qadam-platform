// L1 hooks — /v1/workspace/sponsors (sponsor record management).
//
// FR-MIG-025 — backs the sponsors cabinet at /workspace/sponsors.
// Operators create/edit sponsor records (name, logo, tier, website,
// event associations). Logo upload goes to MinIO via /v1/admin/uploads.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type {
  CreateSponsorBody,
  SponsorDetail,
  SponsorSummary,
  UpdateSponsorBody,
} from './types';

const SPONSORS_BASE_KEY = ['workspace', 'sponsors'] as const;

export function useSponsors(): UseQueryResult<{ sponsors: SponsorSummary[] }, Error> {
  return useQuery<{ sponsors: SponsorSummary[] }, Error>({
    queryKey: [...SPONSORS_BASE_KEY, 'list'] as const,
    queryFn: async () => apiClient<{ sponsors: SponsorSummary[] }>('/v1/workspace/sponsors'),
  });
}

export function useSponsorDetail(id: string): UseQueryResult<SponsorDetail, Error> {
  return useQuery<SponsorDetail, Error>({
    queryKey: [...SPONSORS_BASE_KEY, 'detail', id] as const,
    queryFn: async () => apiClient<SponsorDetail>(`/v1/workspace/sponsors/${encodeURIComponent(id)}`),
    enabled: id.length > 0,
  });
}

export function useCreateSponsor(): UseMutationResult<SponsorDetail, Error, CreateSponsorBody> {
  const qc = useQueryClient();
  return useMutation<SponsorDetail, Error, CreateSponsorBody>({
    mutationFn: async (body) =>
      apiClient<SponsorDetail>('/v1/workspace/sponsors', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...SPONSORS_BASE_KEY, 'list'] });
    },
  });
}

export interface UpdateSponsorVars {
  id: string;
  body: UpdateSponsorBody;
}

export function useUpdateSponsor(): UseMutationResult<SponsorDetail, Error, UpdateSponsorVars> {
  const qc = useQueryClient();
  return useMutation<SponsorDetail, Error, UpdateSponsorVars>({
    mutationFn: async ({ id, body }) =>
      apiClient<SponsorDetail>(`/v1/workspace/sponsors/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...SPONSORS_BASE_KEY, 'list'] });
      qc.invalidateQueries({ queryKey: [...SPONSORS_BASE_KEY, 'detail', vars.id] });
    },
  });
}

export interface UploadLogoResult {
  url: string;
}

export function useUploadLogo(): UseMutationResult<UploadLogoResult, Error, File> {
  return useMutation<UploadLogoResult, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      return apiClient<UploadLogoResult>('/v1/admin/uploads', {
        method: 'POST',
        body: form,
      });
    },
  });
}
