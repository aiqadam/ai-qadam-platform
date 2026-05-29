// L1 hooks — /v1/workspace/partners (sponsor / employer / product-partner directory).
//
// Backs the Partners cabinet at /workspace/partners (list, PR 2.5b) +
// the per-partner detail page at /workspace/partners/[slug] (audiences
// + kit assets, M2.1). Both read-only — the API exposes no partner
// write endpoint (onboarding stays in Directus).

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { PartnerDetail, PartnerSummary } from './types';

const PARTNERS_BASE_KEY = ['workspace', 'partners'] as const;

export function usePartners(): UseQueryResult<{ partners: PartnerSummary[] }, Error> {
  return useQuery<{ partners: PartnerSummary[] }, Error>({
    queryKey: [...PARTNERS_BASE_KEY, 'list'] as const,
    queryFn: async () => apiClient<{ partners: PartnerSummary[] }>('/v1/workspace/partners'),
  });
}

export function usePartnerDetail(slug: string): UseQueryResult<PartnerDetail, Error> {
  return useQuery<PartnerDetail, Error>({
    queryKey: [...PARTNERS_BASE_KEY, 'detail', slug] as const,
    queryFn: async () =>
      apiClient<PartnerDetail>(`/v1/workspace/partners/${encodeURIComponent(slug)}`),
    enabled: slug.length > 0,
  });
}
