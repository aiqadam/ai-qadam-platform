// L1 hooks — /v1/workspace/cohorts (operator-saved member-filter sets).
//
// Backs the SAVED COHORTS panel + Save modal inside the /workspace/members
// cabinet. M2.3b-i shipped the read-only list; M2.3b-ii added save;
// M2.3b-iii added click-to-load. M2.3b-iv adds delete. Edit cohort
// name is parked until an operator asks for it.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { CohortRow } from './types';

const COHORTS_BASE_KEY = ['workspace', 'cohorts'] as const;

interface CohortsListResponse {
  cohorts: CohortRow[];
}

interface CohortCreateResponse {
  cohort: CohortRow;
}

export interface SaveCohortBody {
  name: string;
  description?: string;
  filter_query: Record<string, unknown>;
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

export function useSaveCohort(): UseMutationResult<CohortRow, Error, SaveCohortBody> {
  const qc = useQueryClient();
  return useMutation<CohortRow, Error, SaveCohortBody>({
    mutationFn: async (body) => {
      // Cast to Record<string, unknown> for apiClient's body type —
      // optional `description` doesn't satisfy the index signature
      // under exactOptionalPropertyTypes. Runtime JSON shape identical.
      const { cohort } = await apiClient<CohortCreateResponse>('/v1/workspace/cohorts', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      });
      return cohort;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: COHORTS_BASE_KEY });
    },
  });
}

export function useDeleteCohort(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (cohortId) => {
      await apiClient<void>(`/v1/workspace/cohorts/${encodeURIComponent(cohortId)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: COHORTS_BASE_KEY });
    },
  });
}
