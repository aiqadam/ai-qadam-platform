// L1 hooks — /v1/admin/invites (operator onboarding cabinet).
//
// Backs the Operator Invites cabinet at /workspace/admin/users. ADR-0035
// invite-link flow: super-admin creates an invite → token returned once
// in the UI → operator consumes via /onboard/accept. This file wraps
// the three endpoints: list, create, revoke.
//
// Endpoints are gated by AuthGuard + SuperAdminGuard on the API side;
// the page renders <AuthGate role="aiqadam-super-admin"> as a UX
// short-circuit so non-super-admins see a "no access" surface instead
// of fetching + 403-ing in the island.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { CreateInviteBody, CreateInviteResult, InviteStatus, InviteSummary } from './types';

const INVITES_BASE_KEY = ['admin', 'invites'] as const;

export interface UseInvitesArgs {
  status?: InviteStatus;
}

export function useInvites(
  args: UseInvitesArgs = {},
): UseQueryResult<{ invites: InviteSummary[] }, Error> {
  return useQuery<{ invites: InviteSummary[] }, Error>({
    queryKey: [...INVITES_BASE_KEY, args] as const,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (args.status) params.set('status', args.status);
      const suffix = params.toString();
      return apiClient<{ invites: InviteSummary[] }>(
        suffix ? `/v1/admin/invites?${suffix}` : '/v1/admin/invites',
      );
    },
  });
}

export function useCreateInvite(): UseMutationResult<CreateInviteResult, Error, CreateInviteBody> {
  const qc = useQueryClient();
  return useMutation<CreateInviteResult, Error, CreateInviteBody>({
    mutationFn: async (body) => {
      // Cast to Record<string, unknown> for apiClient's body type —
      // optional fields on CreateInviteBody don't satisfy the index
      // signature under exactOptionalPropertyTypes. Runtime JSON
      // shape is identical.
      return apiClient<CreateInviteResult>('/v1/admin/invites', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVITES_BASE_KEY });
    },
  });
}

export function useRevokeInvite(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (inviteId) => {
      await apiClient<void>(`/v1/admin/invites/${encodeURIComponent(inviteId)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVITES_BASE_KEY });
    },
  });
}
