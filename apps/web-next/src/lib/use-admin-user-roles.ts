// L1 hooks — /v1/admin/users (FR-ADM-011 admin user/role management
// cabinet). Backs the "Manage users" view at /workspace/admin/users,
// alongside use-invites.ts's "Invites" view. Mirrors that file's
// structure: apiClient wrapper, query-key arrays, invalidate-on-mutate.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { AdminUserRoles, AdminUserSummary, GrantRevokeRoleBody } from './types';

const ADMIN_USERS_BASE_KEY = ['admin', 'users'] as const;

export function useUserSearch(query: string): UseQueryResult<{ users: AdminUserSummary[] }, Error> {
  const trimmed = query.trim();
  return useQuery<{ users: AdminUserSummary[] }, Error>({
    queryKey: [...ADMIN_USERS_BASE_KEY, 'search', trimmed] as const,
    queryFn: async () =>
      apiClient<{ users: AdminUserSummary[] }>(`/v1/admin/users?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length > 0,
  });
}

export function useUserRoles(userId: number | null): UseQueryResult<AdminUserRoles, Error> {
  return useQuery<AdminUserRoles, Error>({
    queryKey: [...ADMIN_USERS_BASE_KEY, userId, 'roles'] as const,
    queryFn: async () => apiClient<AdminUserRoles>(`/v1/admin/users/${userId}/roles`),
    enabled: userId !== null,
  });
}

export function useChangeUserRole(): UseMutationResult<
  AdminUserRoles,
  Error,
  { userId: number; body: GrantRevokeRoleBody }
> {
  const qc = useQueryClient();
  return useMutation<AdminUserRoles, Error, { userId: number; body: GrantRevokeRoleBody }>({
    mutationFn: async ({ userId, body }) =>
      apiClient<AdminUserRoles>(`/v1/admin/users/${userId}/roles`, {
        method: 'PATCH',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: (_result, { userId }) => {
      void qc.invalidateQueries({ queryKey: [...ADMIN_USERS_BASE_KEY, userId, 'roles'] });
      void qc.invalidateQueries({ queryKey: [...ADMIN_USERS_BASE_KEY, 'search'] });
    },
  });
}
