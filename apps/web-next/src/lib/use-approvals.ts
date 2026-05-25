// L1 hooks — /v1/workspace/approvals (operator approval queue).
//
// Backs the Approvals cabinet at /workspace/approvals. F-S3.7 ships
// the queue framework + three planned source kinds. PR 2.5c surfaces
// the framework on the operator side; each source flips `ready` as
// its loader lands.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { ApprovalsResult } from './types';

const APPROVALS_BASE_KEY = ['workspace', 'approvals'] as const;

export function useApprovals(): UseQueryResult<ApprovalsResult, Error> {
  return useQuery<ApprovalsResult, Error>({
    queryKey: [...APPROVALS_BASE_KEY, 'list'] as const,
    queryFn: async () => apiClient<ApprovalsResult>('/v1/workspace/approvals'),
  });
}
