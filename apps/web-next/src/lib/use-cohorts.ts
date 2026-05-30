// L1 hooks — /v1/workspace/cohorts (operator-saved member-filter sets).
//
// Backs the SAVED COHORTS panel inside the /workspace/members cabinet.
// M2.3b-i ships the read-only list; M2.3b-ii adds save/load/delete.
//
// Lives under `lib/use-*` per the convention so L3 blocks can import
// the hook without tripping ADR-0038 §Locks #1.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { CohortRow } from './types';

const COHORTS_BASE_KEY = ['workspace', 'cohorts'] as const;

interface CohortsListResponse {
  cohorts: CohortRow[];
}

export function useCohorts(): UseQueryResult<CohortRow[], Error> {
  return useQuery<CohortRow[], Error>({
    queryKey: COHORTS_BASE_KEY,
    queryFn: async () => {
      const { cohorts } = await apiClient<CohortsListResponse>('/v1/workspace/cohorts');
      return cohorts;
    },
  });
}
