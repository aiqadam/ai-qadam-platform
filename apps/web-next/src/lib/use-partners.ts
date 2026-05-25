// L1 hooks — /v1/workspace/partners (sponsor / employer / product-partner directory).
//
// Backs the Partners cabinet at /workspace/partners. PR 2.5b ships
// the read-only list with role chips; the per-partner detail page
// (audiences + kit assets) lands in a follow-up.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { PartnerSummary } from './types';

const PARTNERS_BASE_KEY = ['workspace', 'partners'] as const;

export function usePartners(): UseQueryResult<{ partners: PartnerSummary[] }, Error> {
  return useQuery<{ partners: PartnerSummary[] }, Error>({
    queryKey: [...PARTNERS_BASE_KEY, 'list'] as const,
    queryFn: async () => apiClient<{ partners: PartnerSummary[] }>('/v1/workspace/partners'),
  });
}
