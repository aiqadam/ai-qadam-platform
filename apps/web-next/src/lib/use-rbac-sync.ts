// L1 hook — /v1/admin/rbac-sync/jobs (super-admin RBAC sync cabinet).
//
// FR-MIG-016 — backs the RBAC sync cabinet at /workspace/admin/rbac-sync.
// Supports filter by status and manual trigger via POST /v1/admin/rbac-sync.

import { type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { RbacSyncFilter, RbacSyncResult } from './types';

const RBAC_SYNC_BASE_KEY = ['admin', 'rbac-sync'] as const;

export function useRbacSyncJobs(
  filter: RbacSyncFilter = 'all',
): UseQueryResult<RbacSyncResult, Error> {
  return useQuery<RbacSyncResult, Error>({
    queryKey: [...RBAC_SYNC_BASE_KEY, 'jobs', filter] as const,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter === 'failed') {
        params.set('only_failed', 'true');
      } else if (filter !== 'all') {
        params.set('status', filter);
      }
      const suffix = params.toString();
      return apiClient<RbacSyncResult>(
        suffix ? `/v1/admin/rbac-sync/jobs?${suffix}` : '/v1/admin/rbac-sync/jobs',
      );
    },
  });
}

export function useTriggerRbacSync(): {
  trigger: () => Promise<void>;
  isPending: boolean;
} {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      await apiClient('/v1/admin/rbac-sync', { method: 'POST' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RBAC_SYNC_BASE_KEY });
    },
  });

  return {
    trigger: async () => {
      await mutation.mutateAsync();
    },
    isPending: mutation.isPending,
  };
}

export function useRetryRbacSyncJob(onSuccess?: () => void): {
  retry: (jobId: string) => Promise<void>;
  isPending: boolean;
} {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiClient(`/v1/admin/rbac-sync/jobs/${encodeURIComponent(jobId)}/retry`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RBAC_SYNC_BASE_KEY });
      onSuccess?.();
    },
  });

  return {
    retry: async (jobId: string) => {
      await mutation.mutateAsync(jobId);
    },
    isPending: mutation.isPending,
  };
}
