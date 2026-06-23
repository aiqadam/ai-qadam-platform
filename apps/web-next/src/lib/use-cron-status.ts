// L1 hook — /v1/workspace/internal-cron/status (super-admin cron health).
//
// FR-MIG-016 — backs the cron health cabinet at /workspace/admin/cron.
// Read-only; refresh is triggered by re-mounting or explicit user action.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { CronStatusResult } from './types';

export function useCronStatus(): UseQueryResult<CronStatusResult, Error> {
  return useQuery<CronStatusResult, Error>({
    queryKey: ['workspace', 'internal-cron', 'status'] as const,
    queryFn: () => apiClient<CronStatusResult>('/v1/workspace/internal-cron/status'),
  });
}
