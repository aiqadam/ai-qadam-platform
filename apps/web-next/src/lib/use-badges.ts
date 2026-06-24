// L1 hooks — /v1/admin/badges (badge grant + award history).
//
// FR-MIG-027 — backs the badges cabinet at /workspace/badges.
// Operators list badge definitions, grant badges to members, view the
// award audit trail, and revoke awards with a reason.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type {
  BadgeAwardRow,
  BadgeDefinition,
  GrantBadgeBody,
  RevokeBadgeAwardBody,
} from './types';

const BADGES_BASE_KEY = ['admin', 'badges'] as const;

export function useBadges(): UseQueryResult<{ badges: BadgeDefinition[] }, Error> {
  return useQuery<{ badges: BadgeDefinition[] }, Error>({
    queryKey: [...BADGES_BASE_KEY, 'list'] as const,
    queryFn: async () => apiClient<{ badges: BadgeDefinition[] }>('/v1/admin/badges'),
  });
}

export function useBadgeAwards(
  badgeId?: string,
): UseQueryResult<{ awards: BadgeAwardRow[] }, Error> {
  return useQuery<{ awards: BadgeAwardRow[] }, Error>({
    queryKey: [...BADGES_BASE_KEY, 'awards', badgeId ?? 'all'] as const,
    queryFn: async () => {
      const path =
        badgeId !== undefined
          ? `/v1/admin/badges/awards?badge_id=${encodeURIComponent(badgeId)}`
          : '/v1/admin/badges/awards';
      return apiClient<{ awards: BadgeAwardRow[] }>(path);
    },
  });
}

export interface GrantBadgeResult {
  award_id: string;
}

export function useGrantBadge(): UseMutationResult<GrantBadgeResult, Error, GrantBadgeBody> {
  const qc = useQueryClient();
  return useMutation<GrantBadgeResult, Error, GrantBadgeBody>({
    mutationFn: async (body) =>
      apiClient<GrantBadgeResult>('/v1/admin/badges/grant', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...BADGES_BASE_KEY, 'list'] });
      qc.invalidateQueries({ queryKey: [...BADGES_BASE_KEY, 'awards'] });
    },
  });
}

export interface RevokeBadgeVars {
  awardId: string;
  body: RevokeBadgeAwardBody;
}

export interface MemberSearchOption {
  value: string;
  label: string;
}

export async function searchMembers(input: string): Promise<MemberSearchOption[]> {
  if (input.trim().length === 0) return [];
  const data = await apiClient<{
    members: Array<{ id: string; email: string; first_name: string | null }>;
  }>(`/v1/workspace/members?search=${encodeURIComponent(input)}&limit=20`);
  return data.members.map((m) => ({
    value: m.id,
    label: m.first_name ? `${m.first_name} (${m.email})` : m.email,
  }));
}

export function useRevokeBadgeAward(): UseMutationResult<void, Error, RevokeBadgeVars> {
  const qc = useQueryClient();
  return useMutation<void, Error, RevokeBadgeVars>({
    mutationFn: async ({ awardId, body }) =>
      apiClient<void>(
        `/v1/admin/badges/awards/${encodeURIComponent(awardId)}/revoke`,
        {
          method: 'POST',
          body: body as unknown as Record<string, unknown>,
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...BADGES_BASE_KEY, 'awards'] });
    },
  });
}
